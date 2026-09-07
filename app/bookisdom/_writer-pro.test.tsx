// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { ChapterAnalysis } from "./_writer-pro";
import type { WritingNote } from "./_writing-types";

afterEach(cleanup);
const note = (o: Partial<WritingNote>): WritingNote => ({ id: o.id ?? Math.random().toString(36), bookId: "b", type: "IDEA", title: "", content: "", pinned: false, createdAt: 0, updatedAt: 0, ...o });

describe("ChapterAnalysis — the engine's codex audit on the chapter, from the same notes the Codex is built from", () => {
  it("reports a near-miss spelling, a missing entity, a forbidden word and an untraced thread — as signals with counts, not errors", async () => {
    const notes = [
      note({ type: "CHARACTER", title: "มะลิ", content: "นักข่าว\nคำต้องห้าม: จ้ะ" }),
      note({ type: "PLACE", title: "ซอยทับทิม", content: "ซอยเก่า" }),
      note({ type: "CHARACTER", title: "ลุงชิต", content: "ช่างซ่อมนาฬิกา" }),
      note({ type: "THREAD", title: "ใครฉีกแฟ้มประวัติเด็กหาย", content: "สูง" }),
    ];
    // Names at word boundaries: the engine matches presence as whole words and variants by
    // tone-mark skeleton on TOKENS (codex.ts contract), so an unspaced "มะลีเดิน…" is not a
    // token the dictionary segmenter yields — that limit is the engine's, stated there.
    render(<ChapterAnalysis text="มะลี เดินเข้า ซอยทับทิม แล้วพูดว่า จ้ะ ฉันมาแล้ว" lang="th" notes={notes} />);
    fireEvent.click(screen.getByText("นับสัญญาณ"));
    await waitFor(() => expect(screen.getByTestId("codex-audit")).toBeTruthy(), { timeout: 5000 });
    const t = screen.getByTestId("codex-audit").textContent!;
    expect(t).toContain("มะลิ → พบสะกด \"มะลี\"");   // variant
    expect(t).toContain("ลุงชิต");                    // missing
    expect(t).toContain("\"จ้ะ\" ×1");                 // forbidden word occurs
    expect(t).toContain("ใครฉีกแฟ้มประวัติเด็กหาย");   // thread with no trace
    expect(t).toContain("พบในบท 1/3 รายการ");         // ซอยทับทิม present; canon = 3 entities (threads are not entities)
    expect(t).not.toMatch(/คะแนน|เกรด/);
  });

  it("with no codex-type notes there is no audit block at all — nothing is invented", async () => {
    render(<ChapterAnalysis text="ข้อความ" lang="th" notes={[note({ type: "IDEA", title: "x" })]} />);
    fireEvent.click(screen.getByText("นับสัญญาณ"));
    await waitFor(() => expect(screen.getByText("นับใหม่")).toBeTruthy(), { timeout: 5000 });
    expect(screen.queryByTestId("codex-audit")).toBeNull();
  });
});
