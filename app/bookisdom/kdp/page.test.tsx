// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import KdpPage from "./page";
import { countManuscriptWords } from "../_word-count";

afterEach(cleanup);

describe("/bookisdom/kdp — the screen over kdp.ts", () => {
  it("shows nothing computed until a word count exists — no spec is invented from zero", () => {
    render(<KdpPage />);
    expect(screen.queryByTestId("print-specs")).toBeNull();
    expect(screen.getByText(/ใส่จำนวนคำก่อน/)).toBeTruthy();
  });

  it("with no word count the checklist never shows NaN — print rules wait, metadata rules still judge", () => {
    const { container } = render(<KdpPage />);
    const list = screen.getByLabelText("เช็กลิสต์ KDP");
    expect(list.textContent).not.toContain("NaN");
    expect(list.textContent).not.toContain("Word count present");
    expect(list.textContent).toContain("Title ≤ 200 chars"); // metadata is judgeable now
    expect(container.textContent).toContain("จะปรากฏเมื่อใส่จำนวนคำ");
    fireEvent.change(screen.getByLabelText("จำนวนคำ"), { target: { value: "60000" } });
    expect(screen.getByLabelText("เช็กลิสต์ KDP").textContent).toContain("Word count present");
  });

  it("60,000 words on 6x9 / 60 lb cream → 200 estimated pages and a 0.5\" spine (pages ÷ 400 PPI)", () => {
    render(<KdpPage />);
    fireEvent.change(screen.getByLabelText("จำนวนคำ"), { target: { value: "60000" } });
    const specs = screen.getByTestId("print-specs");
    expect(specs.textContent).toContain("200");
    expect(specs.textContent).toContain('0.5"');
    expect(specs.textContent).toContain("12.7 มม.");
    // full wrap: 6*2 + 0.5 + 0.25 = 12.75 wide, 9 + 0.25 = 9.25 tall
    expect(specs.textContent).toContain('12.75" × 9.25"');
  });

  it("the checklist reports metadata as NOT passing until supplied — a missing field is never silently OK", () => {
    render(<KdpPage />);
    fireEvent.change(screen.getByLabelText("จำนวนคำ"), { target: { value: "60000" } });
    const summary = screen.getByTestId("checklist-summary");
    expect(summary.textContent).toMatch(/ยังไม่ผ่าน/);
    // supply everything Amazon requires
    fireEvent.change(screen.getByLabelText("ชื่อเรื่อง"), { target: { value: "แม่น้ำสายที่สาม" } });
    fireEvent.change(screen.getByLabelText("คำโปรย"), { target: { value: "ก".repeat(120) } });
    fireEvent.change(screen.getByLabelText("คีย์เวิร์ด"), { target: { value: "นิยายไทย, อีสาน, ครอบครัว" } });
    fireEvent.change(screen.getByLabelText("หมวดหมู่"), { target: { value: "Fiction / Family Life" } });
    expect(screen.getByTestId("checklist-summary").textContent).toMatch(/ผ่านทั้ง/);
  });

  it("copies a package whose numbers match the screen (same kdp.ts call, not a second computation)", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<KdpPage />);
    fireEvent.change(screen.getByLabelText("จำนวนคำ"), { target: { value: "60000" } });
    fireEvent.click(screen.getByText("คัดลอก KDP package (Markdown)"));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const md = writeText.mock.calls[0][0] as string;
    expect(md).toContain("# KDP Submission Package");
    expect(md).toContain("Est. pages: 200");
    expect(md).toContain('Spine: 0.5" (12.7 mm)');
    expect(md).toContain("ยังไม่พร้อม"); // metadata not supplied → honest verdict in the paste too
  });

  it("the copy button is disabled with no word count — there is nothing truthful to paste", () => {
    render(<KdpPage />);
    expect((screen.getByText("คัดลอก KDP package (Markdown)").closest("button") as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("countManuscriptWords — reuses the analyzers' own counters", () => {
  it("counts English by the prose tokenizer and Thai by the dictionary segmenter", async () => {
    expect(await countManuscriptWords({ lang: "en", text: "The river ran east, past the mill." })).toBe(7);
    const th = await countManuscriptWords({ lang: "th", text: "แม่น้ำไหลไปทางตะวันออก" });
    expect(th).toBeGreaterThan(1); // segmented into several words, not one blob
  });
});
