// ╔══════════════════════════════════════════════════════════════════╗
// ║  LOCAL-FIRST SYNC — cross-tab convergence, dependency-free.        ║
// ║  Single writer, many tabs: last-write-wins by (version, updatedAt).║
// ║  The merge is pure + deterministic (no Date/random inside), so it  ║
// ║  unit-tests without a browser; the channel is injected, so a fake  ║
// ║  in-memory bus proves two "tabs" converge. Data stays on the client║
// ║  — this deepens the privacy moat instead of needing a backend.     ║
// ║  (For concurrent multi-USER editing, swap in a CRDT like Yjs — the ║
// ║   Versioned<T> record shape is the seam for that upgrade.)         ║
// ╚══════════════════════════════════════════════════════════════════╝

export interface Versioned<T> {
  value: T;
  version: number; // monotonic per record (bump on each local edit)
  updatedAt: number; // tiebreaker when versions are equal (ms epoch)
}
export type Store<T> = Record<string, Versioned<T>>;

/** Deterministic last-write-wins between two versions of the same record. Higher
 *  version wins; ties break on updatedAt; full ties keep `a` (stable). */
export function pickLatest<T>(a: Versioned<T>, b: Versioned<T>): Versioned<T> {
  if (b.version > a.version) return b;
  if (b.version < a.version) return a;
  return b.updatedAt > a.updatedAt ? b : a;
}

/** Merge an incoming store into the local one, key by key, via pickLatest. Pure —
 *  returns a new object, mutates nothing. */
export function mergeStores<T>(local: Store<T>, incoming: Store<T>): Store<T> {
  const out: Store<T> = { ...local };
  for (const id of Object.keys(incoming)) {
    out[id] = id in out ? pickLatest(out[id], incoming[id]) : incoming[id];
  }
  return out;
}

// ── Cross-tab wiring (channel injected so it's testable) ──────────────

export interface TabChannel {
  post(msg: unknown): void;
  onMessage(cb: (msg: unknown) => void): void;
  close(): void;
}

type SyncMsg<T> =
  | { t: "update"; id: string; v: Versioned<T> }
  | { t: "sync-req" }
  | { t: "sync-full"; store: Store<T> };

export interface TabSync<T> {
  broadcast(id: string, v: Versioned<T>): void; // announce a local edit to other tabs
  requestSync(): void; // ask other tabs to send their full store (on new-tab open)
  stop(): void;
}

/** Wire a store to a channel: incoming updates merge in (never rebroadcast → no loops);
 *  a sync request is answered with the full store; a full store merges in. `onChange`
 *  fires after any merge so the UI can re-read the store. */
export function createTabSync<T>(opts: {
  channel: TabChannel;
  getStore: () => Store<T>;
  setStore: (s: Store<T>) => void;
  onChange?: () => void;
}): TabSync<T> {
  const { channel, getStore, setStore, onChange } = opts;
  channel.onMessage((raw) => {
    const msg = raw as SyncMsg<T>;
    if (!msg || typeof msg !== "object") return;
    if (msg.t === "update") {
      setStore(mergeStores(getStore(), { [msg.id]: msg.v }));
      onChange?.();
    } else if (msg.t === "sync-req") {
      channel.post({ t: "sync-full", store: getStore() } as SyncMsg<T>);
    } else if (msg.t === "sync-full") {
      setStore(mergeStores(getStore(), msg.store));
      onChange?.();
    }
  });
  return {
    broadcast: (id, v) => channel.post({ t: "update", id, v } as SyncMsg<T>),
    requestSync: () => channel.post({ t: "sync-req" } as SyncMsg<T>),
    stop: () => channel.close(),
  };
}

/** Browser adapter over BroadcastChannel (multi-tab, same origin, no backend). Falls
 *  back to a no-op channel where BroadcastChannel is unavailable (SSR / old runtime). */
export function browserTabChannel(name: string): TabChannel {
  const BC = (globalThis as { BroadcastChannel?: typeof BroadcastChannel }).BroadcastChannel;
  if (!BC) return { post() {}, onMessage() {}, close() {} };
  const ch = new BC(name);
  return {
    post: (msg) => ch.postMessage(msg),
    onMessage: (cb) => { ch.onmessage = (e: MessageEvent) => cb(e.data); },
    close: () => ch.close(),
  };
}
