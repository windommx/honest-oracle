import { describe, it, expect } from "vitest";
import { pickLatest, mergeStores, createTabSync, type TabChannel, type Store, type Versioned } from "./sync";

const v = <T>(value: T, version: number, updatedAt: number): Versioned<T> => ({ value, version, updatedAt });

describe("pickLatest / mergeStores (LWW)", () => {
  it("higher version wins; updatedAt breaks ties; full tie keeps local", () => {
    expect(pickLatest(v("a", 1, 100), v("b", 2, 50)).value).toBe("b"); // version
    expect(pickLatest(v("a", 2, 100), v("b", 2, 200)).value).toBe("b"); // updatedAt
    expect(pickLatest(v("a", 2, 100), v("b", 2, 100)).value).toBe("a"); // stable
  });

  it("merges keyed stores without mutating inputs", () => {
    const local: Store<string> = { p1: v("local", 1, 10), p2: v("only-local", 1, 10) };
    const incoming: Store<string> = { p1: v("newer", 2, 5), p3: v("only-incoming", 1, 10) };
    const merged = mergeStores(local, incoming);
    expect(merged.p1.value).toBe("newer");
    expect(merged.p2.value).toBe("only-local");
    expect(merged.p3.value).toBe("only-incoming");
    expect(local.p1.value).toBe("local"); // unchanged
  });
});

// A fake two-tab bus: each channel delivers posts to the OTHER's listener.
function makePair(): [TabChannel, TabChannel] {
  let a: ((m: unknown) => void) | null = null;
  let b: ((m: unknown) => void) | null = null;
  return [
    { post: (m) => b?.(m), onMessage: (cb) => { a = cb; }, close: () => { a = null; } },
    { post: (m) => a?.(m), onMessage: (cb) => { b = cb; }, close: () => { b = null; } },
  ];
}

describe("createTabSync — two tabs converge", () => {
  it("propagates an edit from one tab to another", () => {
    const [chA, chB] = makePair();
    let storeA: Store<string> = {};
    let storeB: Store<string> = {};
    createTabSync<string>({ channel: chA, getStore: () => storeA, setStore: (s) => { storeA = s; } });
    const syncB = createTabSync<string>({ channel: chB, getStore: () => storeB, setStore: (s) => { storeB = s; } });

    // Tab B edits p1 and broadcasts → Tab A should receive it.
    storeB = { p1: v("from-B", 1, 100) };
    syncB.broadcast("p1", storeB.p1);
    expect(storeA.p1.value).toBe("from-B");
  });

  it("a new tab requests a full sync and receives the store", () => {
    const [chA, chB] = makePair();
    let storeA: Store<string> = { p1: v("existing", 3, 100), p2: v("more", 1, 100) };
    let storeB: Store<string> = {};
    createTabSync<string>({ channel: chA, getStore: () => storeA, setStore: (s) => { storeA = s; } });
    const syncB = createTabSync<string>({ channel: chB, getStore: () => storeB, setStore: (s) => { storeB = s; } });

    syncB.requestSync(); // B (fresh) asks; A answers with its full store
    expect(storeB.p1.value).toBe("existing");
    expect(storeB.p2.value).toBe("more");
  });
});
