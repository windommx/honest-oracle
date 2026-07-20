import { describe, it, expect } from "vitest";
import { runCli } from "./cli";

describe("runCli", () => {
  it("prints help with no args", () => {
    const r = runCli([]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("rush — deterministic");
    expect(r.stdout).toContain("prompts");
  });

  it("generates a prompt pack for a book config", () => {
    const r = runCli(["prompts", "--type", "novel", "--genre", "romance", "--chapters", "6"]);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/# \d+ prompts · novel\/romance/);
    expect(r.stdout).toContain("MASTER");
    expect(r.stdout).toContain("CH_1");
  });

  it("errors on an unknown type", () => {
    const r = runCli(["prompts", "--type", "bogus"]);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("unknown --type");
  });

  it("analyzes a Thai manuscript from an injected reader", () => {
    const text =
      "## บทที่ 1\nแสงอาทิตย์สาดจ้าเป็นประกาย เสียงลมหวีดดังก้อง กลิ่นดินหอมกรุ่นอบอวล " +
      "มะลิยืนนิ่งริมหน้าผา มองเงาทอดยาว ผิวหินเย็นเฉียบใต้ฝ่ามือ\n" +
      "## บทที่ 2\nรุ่งเช้ามะลิเดินเข้าเมือง ผู้คนพลุกพล่าน เธอสูดลมหายใจลึกแล้วก้าวเดินจากไป";
    const r = runCli(["analyze", "book.md"], { read: () => text });
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("rush analyze");
    expect(r.stdout).toContain("(th)");
    expect(r.stdout).toContain("sensory density");
  });

  it("errors when analyze has no file", () => {
    expect(runCli(["analyze"]).code).toBe(2);
  });

  it("reports a bad command", () => {
    const r = runCli(["frobnicate"]);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("unknown command");
  });

  it("renames a character and prints a per-chapter audit", () => {
    const text = "## บทที่ 1\nวิกกี้เดินมา วิกกี้ยิ้ม\n## บทที่ 2\nเธอเรียกวิกกี้";
    const r = runCli(["rename", "b.md", "--from", "วิกกี้", "--to", "อาโน่"], { read: () => text });
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("3 hit");
    expect(r.stdout).toContain("chapter 1: 2");
  });

  it("rename --write outputs the rewritten manuscript", () => {
    const r = runCli(["rename", "b.md", "--from", "วิกกี้", "--to", "อาโน่", "--write"], { read: () => "วิกกี้" });
    expect(r.stdout).toBe("อาโน่");
  });

  it("errors when rename lacks --from/--to", () => {
    expect(runCli(["rename", "b.md"], { read: () => "x" }).code).toBe(2);
  });

  it("prints a relationship graph from --names", () => {
    const text = "## 1\nเอิ่มกับลีอาห์เดินทาง\n## 2\nเอิ่มกับลีอาห์พัก";
    const r = runCli(["relations", "b.md", "--names", "เอิ่ม,ลีอาห์"], { read: () => text });
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("เอิ่ม ↔ ลีอาห์");
  });

  it("radar flags an off-canon name against the declared cast", () => {
    const text = "## บทที่ 1\nกรรณเดินมา กรรณยิ้ม กรรณพูดกับริน";
    const r = runCli(["radar", "b.md", "--canon", "เดนโอ,ริน"], { read: () => text });
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("off-canon");
    expect(r.stdout).toContain("กรรณ");
    expect(r.stdout).toContain("เดนโอ"); // unused canon name
  });

  it("codex audits a draft against a declared story bible", () => {
    const bible = "[ตัวละคร]\nอนันต์: นักสืบ\nมาลี: น้องสาว\nเสือ: ตัวร้าย";
    const draft = "## บทที่ 1\nอนันต์ เดินไปหา มาลี ที่บ้าน";
    const files: Record<string, string> = { "bible.md": bible, "draft.md": draft };
    const r = runCli(["codex", "draft.md", "--bible", "bible.md"], { read: (p) => files[p] });
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("codex audit");
    expect(r.stdout).toContain("ปรากฏในดราฟต์"); // Thai draft → Thai report
    expect(r.stdout).toContain("อนันต์");
    expect(r.stdout).toContain("เสือ"); // declared but not referenced
  });

  it("codex requires --bible", () => {
    const r = runCli(["codex", "draft.md"], { read: () => "x" });
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("--bible");
  });

  it("scene readout prints measured signals and no fake 0–100 vibe score", () => {
    const text =
      "แสงอาทิตย์สาดจ้าเป็นประกาย เสียงลมหวีดดังก้อง กลิ่นดินหอมกรุ่นอบอวล " +
      '"เธอมาทำไม" เขาถาม เธอเงียบ รู้สึกกลัวจับใจ ผิวหินเย็นเฉียบใต้ฝ่ามือ';
    const r = runCli(["scene", "b.md"], { read: () => text });
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("scene readout");
    expect(r.stdout).toContain("words");
    expect(r.stdout).toContain("rhythm cv");
    // no invented panel scores — the readout disclaims them by name
    expect(r.stdout).not.toMatch(/momentum\s+\d/i);
    expect(r.stdout).not.toMatch(/\bclarity\s+\d/i);
    expect(r.stdout).toContain("no subjective momentum/clarity/tension");
  });

  it("scene readout refuses a non-Thai manuscript", () => {
    const r = runCli(["scene", "b.md"], { read: () => "The sun rose over the hills." });
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("Thai-only");
  });

  it("narrative prints deterministic presence + pacing, no 0–100 score", () => {
    const text =
      "## บทที่ 1\nเดนโอเดินทางกับริน แสงจ้าเป็นประกาย\n" +
      "## บทที่ 2\nรินอยู่คนเดียว เธอคิดถึงบ้าน\n" +
      "## บทที่ 3\nเดนโอกลับมา ทั้งคู่เดินต่อ";
    const r = runCli(["narrative", "b.md", "--names", "เดนโอ,ริน", "--motifs", "แสง"], { read: () => text });
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("character presence");
    expect(r.stdout).toContain("pacing by act");
    expect(r.stdout).toContain("no invented arc/pacing/resonance score");
  });

  it("narrative refuses a non-Thai manuscript for now", () => {
    const r = runCli(["narrative", "b.md"], { read: () => "The sun rose over the quiet hills again." });
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("Thai-only");
  });

  it("register suggestions appear in a Thai analyze", () => {
    const text = "## บท 1\n" + "เขาจะอัพเดทข้อมูลแล้วเช็คอีเมล์ทุกวัน ".repeat(3);
    const r = runCli(["analyze", "b.md"], { read: () => text });
    expect(r.stdout).toContain("word/spelling suggestions");
    expect(r.stdout).toContain("อัปเดต");
  });
});
