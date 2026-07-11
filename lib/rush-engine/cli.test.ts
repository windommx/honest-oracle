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
});
