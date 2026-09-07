// MindBridge therapy engine — the pure, deterministic half of the platform.
//
// Everything exported here is a total function over plain data: no network, no
// LLM call, no Date.now(), no Math.random() anywhere in an output path. That is
// what makes a health claim auditable — a reviewer can re-derive every number
// this app prints from the inputs and the formulas, by hand if they want to.
//
// The UI (app/therapy) and the API routes (app/api/therapy) are the only places
// that touch a clock, a database, or a user.

export * from "./types";
export * from "./instruments";
export * from "./scoring";
export * from "./sleep";
export * from "./evidence";
export * from "./safety";
export * from "./protocol";
export * from "./music";
export * from "./trend";
