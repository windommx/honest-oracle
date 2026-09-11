# Testing an AudioWorklet

An `AudioWorkletProcessor` is normally untestable, and not by accident. The
browser fetches the module into its own realm, hands it a real-time thread, and
gives you back no way to observe what it produced. So worklet DSP tends to be
verified by listening — which catches *no sound at all* and misses everything
else: aliasing, a filter that never opens, a clock that drifts, a `NaN` that
poisons a reverb tank, a block that overruns its deadline, a constructor that
stalls the audio thread for seconds.

The realm is small, though. A processor file needs exactly three globals —
`AudioWorkletProcessor`, `registerProcessor`, `sampleRate` — and a `process()`
call. Supply those and the file runs anywhere, **unmodified**, with its output in
an array you can assert on.

That is all `lib/synth-engine/worklet-harness.ts` is.

## Using it

```ts
import { loadWorkletFile } from "@/lib/synth-engine/worklet-harness";
import { rms, peak, allFinite, onsetIntervals } from "@/lib/synth-engine/analysis";

const w = loadWorkletFile("public/synth-worklet.js", { sampleRate: 48000 });

w.send({ type: "noteOn", note: 60, velocity: 1 });   // as the main thread would
const { left, right } = w.render(0.5);               // seconds of real samples

expect(rms(left)).toBeGreaterThan(0.01);
expect(allFinite(left)).toBe(true);
expect(peak(left)).toBeLessThanOrEqual(1);
expect(w.outbox).toContainEqual(expect.objectContaining({ type: "status" }));
```

`analysis.ts` deliberately measures **properties a listener would notice** rather
than exact samples. A test that asserts on sample values becomes a
change-detector nobody can read: any filter-coefficient change rewrites every
number. `rms`, `peak`, `dominantFrequency`, `inharmonicEnergy`, `onsets`,
`dcOffset` and `levelVariation` survive an implementation change and still say
something when they fail.

## Dropping it into another project

Both files are dependency-free and runner-agnostic — no vitest, no jest, only
`node:fs` and `node:vm` (which Bun implements too). Copy these two:

```
lib/synth-engine/worklet-harness.ts
lib/synth-engine/analysis.ts
```

Then, with any runner (`vitest`, `bun test`, `node:test`), or as a plain script:

```bash
bun add -d vitest && bunx vitest run
```

The harness never patches the processor. `countCalls()` is the one exception and
it inserts a single counter increment at the top of one named function, leaving
the body untouched — verified by a test that the instrumented and uninstrumented
renders are bit-identical.

## Four checks worth having on any worklet

These are the ones a browser cannot make for you.

**1. A block renders inside its deadline.** A processor gets
`blockSize / sampleRate` — 2.67ms at 128 frames and 48kHz — to fill a block. Over
that, the audio thread drops out.

```ts
const w = loadWorkletFile(FILE);
for (let n = 0; n < 8; n++) w.send({ type: "noteOn", note: 48 + n * 3, velocity: 1 });
expect(w.measureBlockMs(200)).toBeLessThan(w.realtimeBudgetMs);
```

**2. Construction does not stall the thread.** Charged to the audio thread the
moment the node is created, and invisible to every other kind of test: the
instrument works, it just takes seconds to appear.

```ts
const { evalMs, constructMs } = measureConstruction(readFileSync(FILE, "utf8"));
expect(constructMs).toBeLessThan(250);
```

**3. Nothing goes non-finite.** One `NaN` in a feedback path poisons everything
downstream of it forever, and silence is how it presents.

```ts
expect(allFinite(w.render(2).left)).toBe(true);
```

**4. Every knob's range does something.** A parameter whose top half sounds
identical is a range mismatch, usually from porting a value between two filter
topologies that scale it differently.

## Worked example — what this found in SynthPro v7

Run against `public/worklets/synthpro-processor.js` from the v7 platform,
unmodified:

```
loaded "synthpro-processor"
  module eval      : 0.7ms
  construct one    : 6888.9ms   <- charged to the audio thread
  buildMorphTable(): 384 calls just to construct
  idle block       : 0.477ms  (budget 2.67ms)
  8-note block     : 3.547ms = 133% of budget
```

**Construction is seconds, and all of it is one function.** `PolyOsc`'s
constructor calls `buildMorphTable(2, 32)`, and there are 24 voices × 8 unison ×
2 oscillators of them — 384 calls, every one computing the *same* default saw
table, 2048 entries × 32 harmonics each. The timing depends on the machine; the
call count does not, which is why `countCalls()` exists.

Memoising the table fixes it. The 0.004 threshold is the one `setTable()` already
uses to decide a rebuild is needed, so quantising to 1/250 matches it exactly:

```js
const _tblCache = new Map();
function buildMorphTable(waveIdx, maxH) {
  maxH = Math.max(1, Math.min(32, maxH | 0));
  const key = Math.round(waveIdx * 250) + ':' + maxH;
  let t = _tblCache.get(key);
  if (t) return t;
  /* …existing body, unchanged… */
  if (_tblCache.size > 256) _tblCache.clear();  // bound it: an LFO sweeping morph would grow it forever
  _tblCache.set(key, tbl);
  return tbl;
}
```

Safe because the tables are read-only at playback (bilinear interpolation reads
them), and the user-drawn wavetable takes a separate `userMode` path.

**Eight notes exceeded the real-time budget in Node.** 3.547ms against 2.67ms.
Node in a VM context is slower than a browser's worklet thread, so this is *not*
a browser measurement and should not be reported as one — but a 24-voice engine
spending 133% of its deadline on eight notes is worth measuring where it runs.

**The resonance range is non-monotonic and flat at the top.** `PARAM_META` gives
`fRes` a range of `0..25`; the filter uses `k = fRes * 0.4`, and a ladder
self-oscillates near `k = 4`. Sweeping it:

| `fRes` | 0 | 2 | 6 | 10 | 14 | 20 | 25 |
|---|---|---|---|---|---|---|---|
| rms | .0317 | .0262 | .0213 | .0331 | .0457 | .0488 | .0487 |

Level *falls* to about 6 (the ladder's feedback loses low-frequency gain before
the resonant peak takes over), then rises, then stops changing above ~20. A knob
whose first quarter does the opposite of what the user expects and whose last
fifth does nothing is a mapping problem, not a taste one.
