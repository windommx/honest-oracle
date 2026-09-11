// ╔══════════════════════════════════════════════════════════════════╗
// ║  WORKLET HARNESS — run an AudioWorkletProcessor in Node.          ║
// ║                                                                    ║
// ║  An AudioWorklet is normally untestable, and not by accident: the  ║
// ║  browser fetches the module into its own realm, hands it a         ║
// ║  real-time thread, and gives you back no way to observe what it    ║
// ║  produced. So worklet DSP tends to be verified by listening —      ║
// ║  which catches "no sound at all" and misses everything else:       ║
// ║  aliasing, a filter that never opens, a clock that drifts, a NaN   ║
// ║  that poisons a reverb tank, a block that overruns its deadline.   ║
// ║                                                                    ║
// ║  The realm is small, though. A processor file needs exactly three  ║
// ║  globals — `AudioWorkletProcessor`, `registerProcessor` and        ║
// ║  `sampleRate` — and a `process()` call. Supply those and the file  ║
// ║  runs anywhere, UNMODIFIED, with its output in an array you can    ║
// ║  assert on.                                                        ║
// ║                                                                    ║
// ║  Deliberately dependency-free and runner-agnostic (no vitest, no   ║
// ║  jest): this file plus analysis.ts should drop into any project    ║
// ║  that has a worklet, whatever it tests with.                       ║
// ╚══════════════════════════════════════════════════════════════════╝

import { readFileSync } from "node:fs";
import vm from "node:vm";

/** The shape a processor must have; matches the real AudioWorkletProcessor. */
interface ProcessorLike {
  port: { onmessage: ((event: { data: unknown }) => void) | null };
  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>
  ): boolean;
}

export interface HarnessOptions {
  sampleRate?: number;
  /** Samples per process() call. The browser always uses 128. */
  blockSize?: number;
  /** Output channels. */
  channels?: number;
  /** Extra globals a particular processor expects beyond the standard three. */
  globals?: Record<string, unknown>;
  /** AudioParam arrays passed to process(), for processors that use them. */
  parameters?: Record<string, Float32Array>;
}

export interface RenderResult {
  channels: Float32Array[];
  /** Channel 0 — the common case. */
  left: Float32Array;
  /** Channel 1, or channel 0 again when the processor is mono. */
  right: Float32Array;
  /** True if process() ever returned false, which permanently ends a node. */
  ended: boolean;
}

export interface LoadedWorklet {
  /** The name the file passed to registerProcessor(). */
  name: string;
  processor: ProcessorLike;
  sampleRate: number;
  blockSize: number;
  /** Post a message in, as the main thread would. */
  send(message: unknown): void;
  /** Everything the processor has posted back. */
  outbox: unknown[];
  /** Render whole blocks. */
  renderBlocks(count: number): RenderResult;
  /** Render approximately this many seconds (rounded up to whole blocks). */
  render(seconds: number): RenderResult;
  /** Wall-clock milliseconds a single process() call takes, averaged.
   *  Compare against `realtimeBudgetMs`. */
  measureBlockMs(blocks?: number): number;
  /** How long one block has to render to keep up: blockSize / sampleRate. */
  realtimeBudgetMs: number;
  /** The VM context's globalThis. Reading it is how countCalls() gets its
   *  tally, and how a caller can inspect a module-level value the processor
   *  never exposes through a message. */
  globals: Record<string, unknown>;
}

class HarnessProcessorBase {
  port: {
    onmessage: ((event: { data: unknown }) => void) | null;
    postMessage: (data: unknown) => void;
  };
  constructor(outbox: unknown[]) {
    this.port = {
      onmessage: null,
      postMessage: (data: unknown) => {
        outbox.push(data);
      },
    };
  }
}

/** A worklet module that has been evaluated but not yet instantiated. Separate
 *  from LoadedWorklet because the two phases cost very different things, and
 *  timing them together hides which one is slow. */
export interface WorkletModule {
  name: string;
  createProcessor(): ProcessorLike;
  globals: Record<string, unknown>;
  outbox: unknown[];
}

/**
 * Evaluate a processor module WITHOUT constructing it.
 *
 * The source runs in a fresh VM context with the worklet globals in place. It
 * is never patched or rewritten, so what runs here is byte-for-byte what the
 * browser runs.
 */
export function evaluateWorkletSource(source: string, options: HarnessOptions = {}): WorkletModule {
  const sampleRate = options.sampleRate ?? 48000;
  const outbox: unknown[] = [];
  let registered: { name: string; ctor: new () => ProcessorLike } | null = null;

  class Base extends HarnessProcessorBase {
    constructor() {
      super(outbox);
    }
  }

  const sandbox = buildSandbox(sampleRate, Base, (name, ctor) => {
    registered = { name, ctor };
  }, options);

  vm.createContext(sandbox);
  new vm.Script(source, { filename: "worklet-processor.js" }).runInContext(sandbox);

  if (registered === null) {
    throw new Error("the source never called registerProcessor() — is this an AudioWorklet module?");
  }
  const { name, ctor } = registered as { name: string; ctor: new () => ProcessorLike };
  return { name, createProcessor: () => new ctor(), globals: sandbox, outbox };
}

function buildSandbox(
  sampleRate: number,
  Base: unknown,
  register: (name: string, ctor: new () => ProcessorLike) => void,
  options: HarnessOptions
): Record<string, unknown> {
  const sandbox: Record<string, unknown> = {
    sampleRate,
    currentTime: 0,
    currentFrame: 0,
    AudioWorkletProcessor: Base,
    registerProcessor: register,
    // A processor legitimately reaches for these; withholding them would make
    // the harness reject working code.
    console, Math, Date,
    Float32Array, Float64Array, Int32Array, Uint8Array, Uint32Array,
    Array, Object, Number, String, Boolean, Map, Set, JSON,
    isFinite, isNaN, parseFloat, parseInt,
    Error, RangeError, TypeError,
    ...options.globals,
  };
  sandbox.globalThis = sandbox;
  return sandbox;
}

/** Evaluate a processor module and construct one instance of it. */
export function loadWorkletSource(source: string, options: HarnessOptions = {}): LoadedWorklet {
  const sampleRate = options.sampleRate ?? 48000;
  const blockSize = options.blockSize ?? 128;
  const channels = options.channels ?? 2;

  const mod = evaluateWorkletSource(source, options);
  const processor = mod.createProcessor();
  const outbox = mod.outbox;
  const sandbox = mod.globals;

  const parameters = options.parameters ?? {};
  const scratch: Float32Array[] = Array.from({ length: channels }, () => new Float32Array(blockSize));
  const outputs: Float32Array[][] = [scratch];

  const renderBlocks = (count: number): RenderResult => {
    const total = Math.max(0, Math.floor(count)) * blockSize;
    const out = Array.from({ length: channels }, () => new Float32Array(total));
    let ended = false;
    for (let b = 0; b < Math.max(0, Math.floor(count)); b++) {
      // Cleared every block: a processor is expected to WRITE its output, and
      // one that only adds would otherwise accumulate stale samples and look
      // louder than it is.
      for (const ch of scratch) ch.fill(0);
      const keepAlive = processor.process([], outputs, parameters);
      if (keepAlive === false) ended = true;
      for (let c = 0; c < channels; c++) out[c].set(scratch[c], b * blockSize);
      sandbox.currentFrame = (sandbox.currentFrame as number) + blockSize;
      sandbox.currentTime = (sandbox.currentFrame as number) / sampleRate;
    }
    return { channels: out, left: out[0], right: out[Math.min(1, channels - 1)], ended };
  };

  return {
    name: mod.name,
    processor,
    sampleRate,
    blockSize,
    outbox,
    send(message: unknown) {
      processor.port.onmessage?.({ data: message });
    },
    renderBlocks,
    render(seconds: number) {
      return renderBlocks(Math.ceil((seconds * sampleRate) / blockSize));
    },
    measureBlockMs(blocks = 200) {
      // One warm-up block: the first call pays for lazy allocation and JIT, and
      // charging that to the average makes a fast processor look slow.
      renderBlocks(1);
      const started = process.hrtime.bigint();
      renderBlocks(blocks);
      return Number(process.hrtime.bigint() - started) / 1e6 / blocks;
    },
    realtimeBudgetMs: (blockSize / sampleRate) * 1000,
    globals: sandbox,
  };
}

/** Load a processor from a file on disk. */
export function loadWorkletFile(path: string, options: HarnessOptions = {}): LoadedWorklet {
  return loadWorkletSource(readFileSync(path, "utf8"), options);
}

/**
 * Time a processor's CONSTRUCTION, separately from rendering.
 *
 * Worth its own measurement because it is charged to the audio thread the
 * moment the node is created, and it is invisible to every other kind of test:
 * the instrument works, it simply takes seconds to appear. Table-building
 * constructors are the usual cause.
 */
export function measureConstruction(source: string, options: HarnessOptions = {}): {
  evalMs: number;
  constructMs: number;
} {
  // The two phases are timed separately and honestly. Evaluating the module is
  // usually trivial; constructing a processor is where a table-building
  // constructor hides, and folding them together would report the wrong cause.
  const evalStart = process.hrtime.bigint();
  const mod = evaluateWorkletSource(source, options);
  const evalMs = Number(process.hrtime.bigint() - evalStart) / 1e6;

  const ctorStart = process.hrtime.bigint();
  mod.createProcessor();
  const constructMs = Number(process.hrtime.bigint() - ctorStart) / 1e6;

  return { evalMs, constructMs };
}

/**
 * Count how often a named function runs while `run` drives the worklet.
 *
 * A timing number depends on the machine; a call count does not. When a
 * constructor is slow because it rebuilds the same table once per oscillator,
 * "384 calls producing one distinct result" is the finding — and it stays true
 * on hardware faster than yours.
 *
 * The source is instrumented with a counter increment at the top of the named
 * function and nothing else; the body is untouched.
 */
export function countCalls(
  source: string,
  functionName: string,
  run: (worklet: LoadedWorklet) => void,
  options: HarnessOptions = {}
): number {
  const marker = `__calls_${functionName}`;
  const declaration = new RegExp(`function\\s+${functionName}\\s*\\(`);
  if (!declaration.test(source)) {
    throw new Error(`no \`function ${functionName}(\` declaration found to count`);
  }
  const opener = new RegExp(`(function\\s+${functionName}\\s*\\([^)]*\\)\\s*\\{)`);
  const instrumented = source.replace(
    opener,
    `$1 globalThis.${marker} = (globalThis.${marker} || 0) + 1;`
  );

  const worklet = loadWorkletSource(instrumented, options);
  // loadWorkletSource constructs one processor, so construction-time calls are
  // already counted before `run` is given the chance to add more.
  run(worklet);
  return (worklet.globals[marker] as number) ?? 0;
}
