// ╔══════════════════════════════════════════════════════════════════╗
// ║  WAV — re-exported from the shared codec.                         ║
// ║                                                                    ║
// ║  This started here, handling exactly the files it wrote itself:    ║
// ║  16-bit, header at 0, data at 36. When /master needed to READ      ║
// ║  files it had not written — 24-bit, float, with a LIST chunk in    ║
// ║  front of the audio — the choice was to copy it and extend the     ║
// ║  copy, or to lift it. Copying would have left two codecs to fix    ║
// ║  the next time a file shape turns up, which is the drift that      ║
// ║  lib/design/tokens.ts exists to document.                          ║
// ║                                                                    ║
// ║  The synth's own callers are unchanged: encodeWav still defaults   ║
// ║  to 16-bit stereo and decodeWav still reads it back.               ║
// ╚══════════════════════════════════════════════════════════════════╝

export { encodeWav, decodeWav, wavFilename, toStereo, type BitDepth, type DecodedWav } from "@/lib/audio-io/wav";
