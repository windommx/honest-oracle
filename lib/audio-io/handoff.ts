// ╔══════════════════════════════════════════════════════════════════╗
// ║  HANDOFF — send audio from one product to the next, in memory.    ║
// ║                                                                    ║
// ║  SynthPro renders a pattern; MasterPro masters a file. Between     ║
// ║  them sat a download folder: save the .wav, find it, open the      ║
// ║  file picker, load it again. Four steps that exist only because    ║
// ║  the two pages do not share a variable — and the audio makes a     ║
// ║  full round trip through 16-bit PCM on the way, so the thing       ║
// ║  being mastered is not even the thing that was rendered.           ║
// ║                                                                    ║
// ║  This hands over the float buffers themselves.                     ║
// ║                                                                    ║
// ║  WHY INDEXEDDB AND NOT A MODULE VARIABLE. A module variable        ║
// ║  survives a client-side navigation, which is the happy path, and   ║
// ║  nothing else: a reload, a middle-click into a new tab, or a       ║
// ║  browser that decides to hard-navigate all lose it, and the        ║
// ║  failure is a page that quietly opens empty. IndexedDB is the only ║
// ║  store with room for audio — localStorage is ~5MB and would need   ║
// ║  base64 on top — and Dexie is already a dependency here.           ║
// ║                                                                    ║
// ║  Two rules keep it from becoming a haunting:                       ║
// ║    · taking it DELETES it, so a reload does not silently replace   ║
// ║      whatever the operator has open now;                           ║
// ║    · it expires, so a handoff abandoned last Tuesday does not      ║
// ║      appear in an unrelated session with no explanation.           ║
// ╚══════════════════════════════════════════════════════════════════╝

import Dexie, { type Table } from "dexie";
import { MAX_SAMPLE_RATE, MIN_SAMPLE_RATE } from "./wav";

/** Long enough for a slow render and a page load, short enough that nobody
 *  meets one they have forgotten making. */
export const HANDOFF_TTL_MS = 10 * 60 * 1000;

/** The same ceiling MasterPro's render enforces. Storing something it would
 *  refuse to open only moves the refusal somewhere more confusing. */
export const MAX_HANDOFF_SECONDS = 1800;

export interface AudioHandoff {
  /** Which product sent it, for the receiving page to name. */
  from: string;
  /** What to call it — becomes the master's filename. */
  name: string;
  left: Float32Array;
  right: Float32Array;
  sampleRate: number;
  createdAt: number;
}

interface StoredHandoff extends AudioHandoff {
  id: string;
}

/** One slot. A handoff is a transient act, not a library; a list would only
 *  be a queue nobody empties. */
const SLOT = "pending";

class HandoffDB extends Dexie {
  handoff!: Table<StoredHandoff, string>;
  constructor() {
    super("audio-handoff");
    this.version(1).stores({ handoff: "id" });
  }
}

/**
 * Is this a Float32Array?
 *
 * NOT `instanceof`. A structured clone can produce a typed array belonging to
 * a different realm — another global object with its own Float32Array
 * constructor — and `x instanceof Float32Array` is false for it even though
 * every method, index and length behaves identically. That is not a
 * hypothetical: it is what the test environment's IndexedDB does, and an
 * `instanceof` guard here rejected every single handoff while reporting the
 * write as a success, which is the worst shape a bug can have.
 *
 * The brand check reads the internal tag instead, which no realm boundary
 * changes. The arrays are then used as they are rather than copied: they work
 * everywhere a same-realm one does, and copying a half-hour render to satisfy
 * an operator that should not have been used is not a trade worth making.
 */
const isFloat32 = (value: unknown): value is Float32Array =>
  Object.prototype.toString.call(value) === "[object Float32Array]";

let instance: HandoffDB | null = null;
function db(): HandoffDB | null {
  if (typeof indexedDB === "undefined") return null;
  if (!instance) instance = new HandoffDB();
  return instance;
}

/**
 * Put audio in the slot, replacing anything already there.
 *
 * Returns whether it landed. A quota failure MUST be visible: the sending
 * page navigates away on the strength of this, and a silent false would send
 * the operator to an empty page with no idea why.
 */
export async function putHandoff(
  payload: Omit<AudioHandoff, "createdAt">
): Promise<boolean> {
  const frames = Math.min(payload.left.length, payload.right.length);
  if (frames === 0) return false;
  if (frames / payload.sampleRate > MAX_HANDOFF_SECONDS) return false;
  if (!(payload.sampleRate >= MIN_SAMPLE_RATE && payload.sampleRate <= MAX_SAMPLE_RATE)) return false;

  const store = db();
  if (!store) return false;
  try {
    await store.handoff.put({ ...payload, id: SLOT, createdAt: Date.now() });
    return true;
  } catch {
    // Quota, private mode, a blocked upgrade — all the same to the caller,
    // which needs to know only that it must not navigate.
    return false;
  }
}

/**
 * Take whatever is waiting, and clear the slot.
 *
 * Read and delete rather than read: without the delete, reloading the
 * receiving page would load the handoff again on top of whatever the operator
 * had opened since, which looks exactly like the page losing their file.
 */
export async function takeHandoff(now = Date.now()): Promise<AudioHandoff | null> {
  const store = db();
  if (!store) return null;
  try {
    const found = await store.transaction("rw", store.handoff, async () => {
      const row = await store.handoff.get(SLOT);
      if (row) await store.handoff.delete(SLOT);
      return row ?? null;
    });
    if (!found) return null;
    if (now - found.createdAt > HANDOFF_TTL_MS) return null;
    // Stored by structured clone, so these come back as real typed arrays —
    // but a store written by an older version of this code, or by hand, might
    // not, and a plain object here would fail deep inside the DSP instead of
    // here where it can be reported.
    if (!isFloat32(found.left) || !isFloat32(found.right)) return null;
    return {
      from: found.from,
      name: found.name,
      left: found.left,
      right: found.right,
      sampleRate: found.sampleRate,
      createdAt: found.createdAt,
    };
  } catch {
    return null;
  }
}

/** Whether something is waiting, without consuming it. For a sending page
 *  that wants to say so, and for tests. */
export async function peekHandoff(now = Date.now()): Promise<boolean> {
  const store = db();
  if (!store) return false;
  try {
    const row = await store.handoff.get(SLOT);
    return !!row && now - row.createdAt <= HANDOFF_TTL_MS;
  } catch {
    return false;
  }
}

/** Drop anything waiting. */
export async function clearHandoff(): Promise<void> {
  try {
    await db()?.handoff.delete(SLOT);
  } catch {
    // Nothing to do about it and nothing depends on it.
  }
}
