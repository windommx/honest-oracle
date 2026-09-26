// The two conversions every stage needs, in their own module.
//
// They lived in types.ts, which made the dependency graph circular the moment
// a DSP module wanted both a setting type and a conversion: types.ts imported
// multiband.ts for its defaults while multiband.ts imported types.ts for these
// two functions, so one of them evaluated with the other still undefined and
// the whole engine failed to load. Leaf modules cannot have cycles.

export const dbToGain = (db: number) => Math.pow(10, db / 20);

/** -180 rather than -Infinity for silence: the value is formatted into meters
 *  and messages, and "-Infinity dB" is not a reading anyone can use. */
export const gainToDb = (g: number) => (g <= 1e-9 ? -180 : 20 * Math.log10(g));
