// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { listManuscripts, getManuscript, saveManuscript, deleteManuscript } from "./_manuscript-store";

beforeEach(() => window.localStorage.clear());

describe("manuscript store", () => {
  it("saves, lists (newest first), filters by language, and deletes", () => {
    const a = saveManuscript({ title: "Ch1", lang: "en", text: "hello" });
    const b = saveManuscript({ title: "บท1", lang: "th", text: "สวัสดี" });

    expect(listManuscripts()).toHaveLength(2);
    expect(listManuscripts()[0].id).toBe(b.id); // newest first
    expect(listManuscripts("en").map((m) => m.id)).toEqual([a.id]);

    deleteManuscript(a.id);
    expect(listManuscripts("en")).toHaveLength(0);
    expect(getManuscript(b.id)?.text).toBe("สวัสดี");
  });

  it("updates in place when the same id is saved again", () => {
    const a = saveManuscript({ title: "draft", lang: "en", text: "v1" });
    saveManuscript({ id: a.id, title: "draft", lang: "en", text: "v2" });
    expect(listManuscripts("en")).toHaveLength(1);
    expect(getManuscript(a.id)?.text).toBe("v2");
  });

  it("tolerates corrupt storage without throwing", () => {
    window.localStorage.setItem("rush.manuscripts", "{not json");
    expect(listManuscripts()).toEqual([]);
  });
});
