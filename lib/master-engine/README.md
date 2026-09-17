# Master engine

The mastering chain behind `/master`. Pure, deterministic TypeScript that takes
finished audio in and gives shaped audio out.

## How it differs from its sibling

`lib/synth-engine` is a **generator**: notes go in, samples come out, and there
is no input bus at all. This is a **processor**: it has an input, and every
stage is judged by what it did to a signal that already existed. They share
`DelayLine` and the seeded `Rng`, and nothing else.

Both render into a buffer and know nothing about a device, which is what makes
the browser (through an `AudioWorklet`) and the test suite run the same code.

```ts
const out = renderMaster({ left, right, sampleRate, settings: DEFAULT_MASTER });
// out.integratedLufs, out.truePeakDb, out.audit — measured on the bytes.
```

## The two claims this folder has to keep

**The curve on screen is the audio.** `eqSections()` builds the biquad list
once; `EqStage` runs it and `responseCurve()` multiplies the same sections'
analytic responses. They cannot drift because there is only one of them. Tests
sweep sine tones through the real filters and compare the measured dB against
the drawn dB to two decimals — across overlapping bands, both cuts, and the
full default master.

**Loudness is the standard, not RMS with a nicer name.** Every streaming
service normalises to a LUFS target, so a master delivered louder is turned
*down* on playback and the extra limiting is heard without the loudness it
bought. A peak meter cannot show this: two masters with identical peaks can
differ by 6 LU. The K-weighting is derived from BS.1770-4's analog prototype
rather than pasted at 48kHz, so a 44.1k file measures correctly; a test checks
the derivation reproduces the published 48k coefficients to nine decimals, and
EBU Tech 3341 test case 1 passes exactly (a stereo 1kHz sine at −23dBFS reads
−23.0 LUFS).

## The chain, and why the order is fixed

| | Stage | Why here |
|---|---|---|
| 1 | EQ + tone | shape first, so everything downstream measures the finished tone |
| 2 | De-Esser | before saturation, which would multiply an ess |
| 3 | De-Chirp | same, and before anything adds top end |
| 4 | Punch | transients intact, before they get squashed |
| 5 | Warmth | saturation wants a clean, shaped signal |
| 6 | Exciter | after saturation, or its harmonics get saturated into mud |
| 7 | Analog Life | drift applies to the finished tone |
| 8 | Tape Hiss | a noise floor sits under everything |
| 9 | Stereo | image last, so nothing can un-mono the bass afterwards |
| 10 | Volume | the operator's gain, feeding the limiter |
| 11 | Limiter | absolutely last; nothing may add level after the ceiling |

Fades are not in the chain — they need the file's length, which a block
processor does not have — so `applyFades()` runs on the finished buffer.

## What each control actually does

- **Mono Low / Mono High / Width** work on the *side* signal only and never
  touch the mid. A mono fold-down is exactly the mid, so the mono version of
  the track is guaranteed bit-identical whatever these are set to. A widener
  that modifies both channels can sound enormous in stereo and lose the bass on
  a phone, and the engineer finds out when someone plays it on one.
- **Punch** raises the crest factor — the opposite of a compressor. Two
  followers, the slow one fed from the fast one.
- **De-Esser** and **De-Chirp** detect on a band and correct with a *shelf*.
  Subtracting a filtered band from the full signal is the obvious approach and
  leaves a comb-filtered residue, because a bandpass shifts phase.
- **De-Chirp** is our own definition, not a reverse-engineering of any other
  product using the word: it finds moments where the top end spikes far above
  its own running average and pulls only those down. Sustained air does not
  spike against its own average and is left alone. A test asserts that split.
- **Console models** are distinguished by the harmonics they make, and a test
  measures every model's 2nd-to-3rd ratio. The even models run at a lower drive
  because even-dominance is a property of the moderate-drive region — push any
  curve hard enough and symmetric clipping takes over.
- **Limiter** guarantees the ceiling *per sample*, structurally rather than by
  tuning: the signal is delayed while a sliding minimum of the gain each
  upcoming sample needs runs ahead of it. It does **not** promise inter-sample
  peaks; `truePeak()` measures those separately and the audit warns.

## The face is a list of faults, not a rating

`auditMaster()` does not score whether a master is good — that is not
measurable, and a confident-looking number for it would be the exact thing
`CONTRIBUTING.md` forbids. It returns specific findings, each with the
measurement that triggered it, the threshold it crossed, and the control that
fixes it. Its "ok" state says, in words, that nothing tripped a check — a test
asserts that wording, so the claim cannot quietly get stronger.

## Tests

```bash
npx vitest run lib/master-engine
```

Part of the single gate: `npm run verify`.
