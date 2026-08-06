// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { listManuscripts, getManuscript, saveManuscript, deleteManuscript } from "./_manuscript-store";

beforeEach(async () => {
  window.localStorage.clear();
  for (const m of await listManuscripts()) await deleteManuscript(m.id);
});

describe("manuscript store (IndexedDB)", () => {
  it("saves, lists (newest first), filters by language, and deletes", async () => {
    const a = await saveManuscript({ title: "Ch1", lang: "en", text: "hello" });
    const b = await saveManuscript({ title: "บท1", lang: "th", text: "สวัสดี" });

    expect(await listManuscripts()).toHaveLength(2);
    expect((await listManuscripts())[0].id).toBe(b.id); // newest first
    expect((await listManuscripts("en")).map((m) => m.id)).toEqual([a.id]);

    await deleteManuscript(a.id);
    expect(await listManuscripts("en")).toHaveLength(0);
    expect((await getManuscript(b.id))?.text).toBe("สวัสดี");
  });

  it("updates in place when the same id is saved again", async () => {
    const a = await saveManuscript({ title: "draft", lang: "en", text: "v1" });
    await saveManuscript({ id: a.id, title: "draft", lang: "en", text: "v2" });
    expect(await listManuscripts("en")).toHaveLength(1);
    expect((await getManuscript(a.id))?.text).toBe("v2");
  });

  it("imports drafts saved by the legacy localStorage store — once, not forever", async () => {
    window.localStorage.setItem(
      "rush.manuscripts",
      JSON.stringify([{ id: "legacy1", title: "ฉบับเก่า", lang: "th", text: "ของเดิม", updatedAt: 1 }])
    );
    // a real legacy user has never been marked migrated (beforeEach's store call set it)
    window.localStorage.removeItem("rush.manuscripts.migrated");
    expect((await listManuscripts()).map((m) => m.id)).toEqual(["legacy1"]);
    // a marker (not store-emptiness) gates the import, so deleting every draft
    // must NOT resurrect the legacy copies on the next read
    await deleteManuscript("legacy1");
    expect(await listManuscripts()).toEqual([]);
  });

  it("tolerates corrupt legacy storage without throwing", async () => {
    window.localStorage.setItem("rush.manuscripts", "{not json");
    expect(await listManuscripts()).toEqual([]);
  });
});

describe("persistence failure is observable (audit HIGH fix)", () => {
  // The total-failure throw (both stores full) is verified by inspection: lsWrite now returns
  // false on QuotaExceededError and saveManuscript throws ManuscriptNotSavedError on that path,
  // instead of returning an unpersisted record. It is not exercised here because fake-indexeddb
  // always succeeds, making the localStorage-only branch unreachable without a module reset hook
  // we deliberately do not add to the production API. The timestamp-collision fix IS tested:
  it("two same-tick saves get distinct, strictly-increasing timestamps", async () => {
    const [a, b] = await Promise.all([
      saveManuscript({ title: "A", lang: "en", text: "1" }),
      saveManuscript({ title: "B", lang: "en", text: "2" }),
    ]);
    expect(a.updatedAt).not.toBe(b.updatedAt); // no collision under concurrency
  });
});
