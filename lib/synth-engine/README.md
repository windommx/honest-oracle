# Synth engine

The shared DSP core behind `/synth` and the `/therapy` session player. Pure,
deterministic TypeScript that renders into a buffer.

## The decision everything else follows from

**The engine renders into a `Float32Array` and knows nothing about how that
buffer reaches a speaker.**

This is what separates it from the three implementations it was fused out of. A
Web Audio graph built from live `AudioNode`s, and a C# engine driven by NAudio
device callbacks, are both untestable by construction: you cannot assert
anything about a sound that only exists inside an audio driver. Here the browser
calls `render()` from an `AudioWorkletProcessor` and the test suite calls the
same `render()` into a plain array — so the claims in this folder are checked
against the samples the instrument actually produces, not against a diagram.

Determinism falls out of the same choice: no clock is read anywhere, LFO phase
advances per sample, and noise comes from a seeded generator (`rng.ts`), so the
same notes always render the same bytes. `CONTRIBUTING.md` already forbids
`Math.random()` in an output path; here it is also the difference between a
testable engine and an untestable one.

```ts
const synth = new Synth(48000, PRESETS[1].patch);
synth.noteOn(60, 1);
const { left, right } = synth.renderSeconds(2); // …assert on the samples
```

## Modules

| File | What |
|---|---|
| `oscillator.ts` | PolyBLEP oscillators, and an O(1) morph across sine → triangle → saw → square |
| `filter.ts` | Four-pole ladder with a saturated resonance path |
| `envelope.ts` | Exponential ADSR whose stage times are exact |
| `delay-line.ts` | Circular buffer + Schroeder allpass — the primitive under every time effect |
| `effects.ts` | Saturation, chorus, ping-pong delay, plate reverb, compressor |
| `voice.ts` | One note: oscillators, unison, sub, noise, FM, ring, filter, envelopes |
| `synth.ts` | Polyphony, voice stealing, LFO routing, effects chain, `render()` |
| `presets.ts` | Factory patches |

## Four fixes the port made, rather than carried over

The source versions were read closely rather than transcribed. Each of these is
covered by a test that fails if it comes back.

**The morph was O(48) per sample.** The original computed each morphed shape as
a Fourier sum over up to 48 harmonics, per sample, per oscillator, per unison
voice — roughly 590 million `sin()` calls a second at full polyphony. Since a
crossfade between two band-limited signals is itself band-limited, morphing is
now a linear blend of two PolyBLEP outputs: O(1), same result.

**Resonance was on the wrong scale.** The knob ran 0–25 — a biquad's *Q*,
carried over when the filter was swapped for a ladder — and was multiplied by
four into the feedback gain. A ladder self-oscillates near k=4, so the "acid"
preset's 18 asked for k=72: eighteen times past the top of the range, held
together only by the saturator, with every value above ~0.06 of the knob's
travel sounding identical. Resonance is 0..1 here, mapped once.

**The reverb crashed on its first sample.** `buf[(pos - 3) % len]` is a negative
index until three samples have been written. One correctly-wrapped `DelayLine`
now backs every time-based effect.

**Envelope times were not the times.** A one-pole with a time constant of
`attack` needs about four of them to arrive, so a knob reading 10ms took 39ms.
The curve is still exponential; a sample countdown now ends each stage exactly
when the knob says.

## Testing a worklet

`worklet-harness.ts` runs any `AudioWorkletProcessor` in Node — unmodified — by
supplying the three globals its realm needs, so its output lands in an array you
can assert on. `analysis.ts` measures the properties a listener would notice
(level, pitch, aliasing, onsets, DC) rather than exact samples.

Both are dependency-free and runner-agnostic, so they drop into any project with
a worklet. See [docs/worklet-testing.md](../../docs/worklet-testing.md) for the
recipe, the four checks worth having on any worklet, and a worked example of
what it found in a third-party engine.

## Tests

```bash
npx vitest run lib/synth-engine
```

Part of the single gate: `npm run verify`.
