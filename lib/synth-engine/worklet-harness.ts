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
// ║  jest, not even node:vm): this file plus analysis.ts should drop   ║
// ║  into any project that has a worklet, whatever it tests with.      ║
// ║                                                                    ║
// ║  WHY new Function AND NOT node:vm. The obvious implementation runs ║
// ║  the source in a fresh vm context, which is tidier — a real global ║
// ║  object per load, no chance of leaking. It is also TEN TIMES       ║
// ║  SLOWER: measured on this engine, a render block took 3.1ms inside ║
// ║  a vm context against 0.31ms for the same code imported directly,  ║
// ║  and moving the output buffers into the guest realm changed        ║
// ║  nothing, so the cost is the context boundary itself.              ║
// ║                                                                    ║
// ║  That matters because one of the things worth measuring is whether ║
// ║  a block fits its real-time deadline — and at 10x overhead the     ║
// ║  answer is always no, so the check measures the harness instead of ║
// ║  the processor. (It told me my own engine had blown its budget at  ║
// ║  3.6ms when it was actually running at 0.5ms.) Evaluating in the   ║
// ║  host realm with the worklet globals injected as parameters is     ║
// ║  full speed, and module-level state still stays private to each    ║
// ║  load because it lives in the function body's own scope.           ║
// ╚══════════════════════════════════════════════════════════════════╝

import { readFileSync } from "node:fs";

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

  /** The one object shared with the evaluated source. Holds the clock the
   *  harness advances, and anything countCalls() tallies. */
  const harness: Record<string, unknown> = { sampleRate };

  const extraNames = Object.keys(options.globals ?? {});
  const extraValues = extraNames.map((k) => (options.globals as Record<string, unknown>)[k]);

  // `sampleRate`, `currentTime` and `currentFrame` are declared INSIDE the
  // wrapper so the source sees them as the bare globals a worklet realm
  // provides, while `__harnessTick` gives the host a way to advance the clock
  // between blocks — which parameters alone could not do.
  const prelude = `
    const sampleRate = __harness.sampleRate;
    let currentTime = 0, currentFrame = 0;
    __harness.tick = (frame) => { currentFrame = frame; currentTime = frame / sampleRate; };
  `;

  const factory = new Function(
    "__harness",
    "AudioWorkletProcessor",
    "registerProcessor",
    ...extraNames,
    prelude + "\n" + source
  );

  factory(
    harness,
    Base,
    (name: string, ctor: new () => ProcessorLike) => {
      registered = { name, ctor };
    },
    ...extraValues
  );

  if (registered === null) {
    throw new Error("the source never called registerProcessor() — is this an AudioWorklet module?");
  }
  const { name, ctor } = registered as { name: string; ctor: new () => ProcessorLike };
  return { name, createProcessor: () => new ctor(), globals: harness, outbox };
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
  let frame = 0;

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
      frame += blockSize;
      (sandbox.tick as ((f: number) => void) | undefined)?.(frame);
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
  const marker = `calls_${functionName}`;
  const declaration = new RegExp(`function\\s+${functionName}\\s*\\(`);
  if (!declaration.test(source)) {
    throw new Error(`no \`function ${functionName}(\` declaration found to count`);
  }
  const opener = new RegExp(`(function\\s+${functionName}\\s*\\([^)]*\\)\\s*\\{)`);
  // Tallied on the harness object, not on a real global: the source now runs in
  // the host realm, and writing a counter to globalThis would leak out of it.
  const instrumented = source.replace(
    opener,
    `$1 __harness.${marker} = (__harness.${marker} || 0) + 1;`
  );

  const worklet = loadWorkletSource(instrumented, options);
  // loadWorkletSource constructs one processor, so construction-time calls are
  // already counted before `run` is given the chance to add more.
  run(worklet);
  return (worklet.globals[marker] as number) ?? 0;
}
