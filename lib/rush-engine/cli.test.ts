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

  it("register suggestions appear in a Thai analyze", () => {
    const text = "## บท 1\n" + "เขาจะอัพเดทข้อมูลแล้วเช็คอีเมล์ทุกวัน ".repeat(3);
    const r = runCli(["analyze", "b.md"], { read: () => text });
    expect(r.stdout).toContain("word/spelling suggestions");
    expect(r.stdout).toContain("อัปเดต");
  });
});
