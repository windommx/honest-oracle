import { describe, it, expect } from "vitest";
import { checkThaiRegister } from "./register";

describe("checkThaiRegister", () => {
  it("flags a loanword spelling with the standard suggestion", () => {
    const f = checkThaiRegister("ฉันจะอัพเดทข้อมูลและเช็คอีเมล์");
    const up = f.find((x) => x.term === "อัพเดท");
    expect(up?.suggest).toBe("อัปเดต");
    expect(f.some((x) => x.term === "อีเมล์" && x.suggest === "อีเมล")).toBe(true);
  });

  it("skips proper nouns supplied via the glossary (a name is never wrong)", () => {
    // Treat "เช็ค" as a character name here → must not be flagged.
    const withSkip = checkThaiRegister("เช็คเดินเข้ามา เช็คยิ้ม", { skip: ["เช็ค"] });
    expect(withSkip.some((x) => x.term === "เช็ค")).toBe(false);
  });

  it("lets the writer add their own rules (extensible)", () => {
    const f = checkThaiRegister("เขาเทรนหนักมาก", { extra: [{ term: "เทรน", suggest: "ฝึก" }] });
    expect(f.some((x) => x.term === "เทรน" && x.suggest === "ฝึก")).toBe(true);
  });

  it("returns nothing for clean, standard prose", () => {
    expect(checkThaiRegister("เขาเดินเข้ามาในห้องเงียบ ๆ แล้วนั่งลง")).toHaveLength(0);
  });

  it("counts multiple occurrences and sorts by frequency", () => {
    const f = checkThaiRegister("เช็ค เช็ค เช็ค แล้วก็อัพเดท");
    expect(f[0].term).toBe("เช็ค");
    expect(f[0].count).toBe(3);
  });
});

describe("common informal loanwords are flagged (audit regression)", () => {
  it("counts single-token loanwords by substring, not exact Intl.Segmenter token", () => {
    // Passing { tokens } forced exact-token matching; Intl.Segmenter splits a loanword
    // differently inside prose than in isolation, so ไอเดีย / คอมเมนต์ silently scored 0.
    const f = checkThaiRegister("ไอเดียนี้ดีมาก เดี๋ยวจะไอเดียอีก แล้วคอมเมนต์กันได้ คอมเมนต์เลย");
    const byTerm = new Map(f.map((x) => [x.term, x.count]));
    expect(byTerm.get("ไอเดีย")).toBe(2);
    expect(byTerm.get("คอมเมนต์")).toBe(2);
  });
});
