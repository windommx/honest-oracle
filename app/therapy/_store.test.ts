import { describe, it, expect, beforeEach } from "vitest";
import {
  KEYS,
  addAssessment,
  addSession,
  browserStorage,
  clearAll,
  readAssessments,
  readNights,
  readSessions,
  totalMinutes,
  upsertNight,
  type StorageLike,
} from "./_store";
import type { SleepDiaryEntry } from "@/lib/therapy-engine/sleep";

/** A plain in-memory Storage, so the tests exercise the real code path. */
class MemStore implements StorageLike {
  map = new Map<string, string>();
  getItem(k: string) {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, v);
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
}

let store: MemStore;
beforeEach(() => {
  store = new MemStore();
});

const night = (date: string, over: Partial<SleepDiaryEntry> = {}): SleepDiaryEntry => ({
  date,
  timeInBedMin: 480,
  sleepLatencyMin: 20,
  wakeAfterSleepOnsetMin: 20,
  terminalWakefulnessMin: 0,
  awakenings: 1,
  ...over,
});

describe("store — every read survives a hostile environment", () => {
  it("a null store reads empty and writes nothing, instead of throwing", () => {
    // SSR, private modes, and browsers set to block site data all land here. A
    // throw would white-screen the assessment page.
    expect(readAssessments(null)).toEqual([]);
    expect(readSessions(null)).toEqual([]);
    expect(readNights(null)).toEqual([]);
    expect(() => addAssessment(null, { at: 1, instrument: "gad7", responses: [0] })).not.toThrow();
    expect(() => clearAll(null)).not.toThrow();
  });

  it("corrupt JSON reads as no data rather than crashing the page", () => {
    store.setItem(KEYS.assessments, "{not json");
    expect(readAssessments(store)).toEqual([]);
  });

  it("a non-array payload reads as no data", () => {
    store.setItem(KEYS.sessions, '{"sneaky":true}');
    expect(readSessions(store)).toEqual([]);
  });

  it("drops malformed rows instead of rendering them", () => {
    store.setItem(KEYS.assessments, JSON.stringify([{ at: "yesterday" }, { at: 5, responses: [1] }]));
    expect(readAssessments(store)).toHaveLength(1);
  });

  it("a write that throws (quota) leaves the session usable", () => {
    const failing: StorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
      removeItem: () => {},
    };
    expect(() => addSession(failing, { at: 1, kind: "music", plannedMin: 20, completedMin: 20 })).not.toThrow();
  });

  it("browserStorage returns null outside a browser", () => {
    expect(browserStorage()).toBeNull();
  });
});

describe("assessments", () => {
  it("stores responses and not a total — the score is re-derived on read", () => {
    // Same rule as the server: a stored number nobody can re-derive is the
    // problem, so only the answers are kept.
    addAssessment(store, { at: 1, instrument: "gad7", responses: [1, 2, 3, 0, 0, 1, 1] });
    const raw = JSON.parse(store.getItem(KEYS.assessments)!);
    expect(raw[0]).not.toHaveProperty("total");
    expect(raw[0].responses).toEqual([1, 2, 3, 0, 0, 1, 1]);
  });

  it("appends and returns the new list, sorted oldest first", () => {
    addAssessment(store, { at: 30, instrument: "gad7", responses: [0, 0, 0, 0, 0, 0, 0] });
    const list = addAssessment(store, { at: 10, instrument: "gad7", responses: [1, 0, 0, 0, 0, 0, 0] });
    expect(list.map((a) => a.at)).toEqual([10, 30]);
  });

  it("caps history so a stuck client cannot fill the quota", () => {
    for (let i = 0; i < 520; i++) addAssessment(store, { at: i, instrument: "gad7", responses: [0, 0, 0, 0, 0, 0, 0] });
    const list = readAssessments(store);
    expect(list).toHaveLength(500);
    expect(list[0].at).toBe(20); // oldest dropped, newest kept
  });
});

describe("sessions", () => {
  it("sums completed minutes, not planned ones", () => {
    addSession(store, { at: 1, kind: "music", plannedMin: 20, completedMin: 20 });
    addSession(store, { at: 2, kind: "breath", plannedMin: 5, completedMin: 2 });
    expect(totalMinutes(readSessions(store))).toBe(22);
  });

  it("keeps an abandoned session — zero minutes is real adherence data", () => {
    addSession(store, { at: 1, kind: "music", plannedMin: 20, completedMin: 0 });
    expect(readSessions(store)).toHaveLength(1);
    expect(totalMinutes(readSessions(store))).toBe(0);
  });
});

describe("sleep diary", () => {
  it("keeps one row per night — a correction replaces, never duplicates", () => {
    upsertNight(store, night("2026-01-01"));
    const list = upsertNight(store, night("2026-01-01", { sleepLatencyMin: 45 }));
    expect(list).toHaveLength(1);
    expect(list[0].sleepLatencyMin).toBe(45);
  });

  it("sorts by date", () => {
    upsertNight(store, night("2026-01-03"));
    upsertNight(store, night("2026-01-01"));
    const list = upsertNight(store, night("2026-01-02"));
    expect(list.map((n) => n.date)).toEqual(["2026-01-01", "2026-01-02", "2026-01-03"]);
  });

  it("keeps a year of nights at most", () => {
    for (let d = 1; d <= 370; d++) {
      upsertNight(store, night(`2026-${String(Math.ceil(d / 31)).padStart(2, "0")}-${String((d % 31) + 1).padStart(2, "0")}`));
    }
    expect(readNights(store).length).toBeLessThanOrEqual(365);
  });
});

describe("erasure", () => {
  it("clearAll removes every key this app owns", () => {
    addAssessment(store, { at: 1, instrument: "gad7", responses: [0, 0, 0, 0, 0, 0, 0] });
    addSession(store, { at: 1, kind: "music", plannedMin: 20, completedMin: 20 });
    upsertNight(store, night("2026-01-01"));
    store.setItem("unrelated.key", "keep me");

    clearAll(store);

    expect(readAssessments(store)).toEqual([]);
    expect(readSessions(store)).toEqual([]);
    expect(readNights(store)).toEqual([]);
    // Scoped: erasing MindBridge data does not touch anything else on the origin.
    expect(store.getItem("unrelated.key")).toBe("keep me");
  });
});

describe("what an add() returns matches what the next read() gives", () => {
  // The two disagreed once: add() appended without re-sorting while read()
  // sorted, so a history list rendered in one order and then re-rendered in
  // another after a refresh.
  it("holds for assessments arriving out of order", () => {
    addAssessment(store, { at: 30, instrument: "gad7", responses: [0, 0, 0, 0, 0, 0, 0] });
    const returned = addAssessment(store, { at: 10, instrument: "gad7", responses: [0, 0, 0, 0, 0, 0, 0] });
    expect(returned).toEqual(readAssessments(store));
  });

  it("holds for sessions arriving out of order", () => {
    addSession(store, { at: 30, kind: "music", plannedMin: 20, completedMin: 20 });
    const returned = addSession(store, { at: 10, kind: "breath", plannedMin: 5, completedMin: 5 });
    expect(returned).toEqual(readSessions(store));
  });

  it("holds for a corrected night", () => {
    upsertNight(store, night("2026-01-02"));
    const returned = upsertNight(store, night("2026-01-01"));
    expect(returned).toEqual(readNights(store));
  });
});
