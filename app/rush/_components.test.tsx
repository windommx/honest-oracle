// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { GuideModal, ThaiAnalyzerModal, ProseAnalyzerModal } from "./_components";

afterEach(cleanup);

describe("GuideModal", () => {
  it("renders the workflow guide and module-disambiguation section", () => {
    render(<GuideModal onClose={() => {}} />);
    expect(screen.getByText(/เวิร์กโฟลว์แนะนำ/)).toBeTruthy();
    expect(screen.getByText(/เลือก module อันไหน/)).toBeTruthy();
  });

  it("calls onClose when the close button is clicked", () => {
    const onClose = vi.fn();
    render(<GuideModal onClose={onClose} />);
    fireEvent.click(screen.getByLabelText(/close/i));
    expect(onClose).toHaveBeenCalled();
  });
});

describe("ThaiAnalyzerModal", () => {
  it("flags AI-tell clichés as the user types Thai text", () => {
    render(<ThaiAnalyzerModal onClose={() => {}} />);
    const textarea = screen.getByPlaceholderText(/วางข้อความภาษาไทย/);
    fireEvent.change(textarea, { target: { value: "เธอยืนนิ่ง น้ำตาไหลริน" } });
    expect(screen.getAllByText(/น้ำตาไหลริน/).length).toBeGreaterThan(0);
  });

  it("reports clean prose with no AI-tells", () => {
    render(<ThaiAnalyzerModal onClose={() => {}} />);
    const textarea = screen.getByPlaceholderText(/วางข้อความภาษาไทย/);
    fireEvent.change(textarea, { target: { value: "เขาวางถ้วยกาแฟลงบนโต๊ะไม้เก่า" } });
    expect(screen.getByText(/ไม่พบคำคลิเชแบบ AI/)).toBeTruthy();
  });

  it("copies a NIS audit prompt pre-filled with the analyzed text", () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<ThaiAnalyzerModal onClose={() => {}} />);
    const textarea = screen.getByPlaceholderText(/วางข้อความภาษาไทย/);
    // 6 consecutive dialogue lines → talking-heads run trips the NIS Dialogue button
    fireEvent.change(textarea, { target: { value: '"หนึ่ง"\n"สอง"\n"สาม"\n"สี่"\n"ห้า"\n"หก"' } });
    fireEvent.click(screen.getByText(/NIS Dialogue audit/));
    expect(writeText).toHaveBeenCalledTimes(1);
    const arg = writeText.mock.calls[0][0] as string;
    expect(arg).toContain("หนึ่ง"); // the analyzed text is inlined
    expect(arg).not.toContain("[วางข้อความที่นี่]"); // placeholder was replaced
  });

  it("shows a before→after delta table when comparing a Thai revision", () => {
    render(<ThaiAnalyzerModal onClose={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText(/วางข้อความภาษาไทย/), {
      target: { value: "เธอรู้สึกเศร้า น้ำตาไหลริน" },
    });
    fireEvent.click(screen.getByText(/เทียบฉบับแก้/));
    fireEvent.change(screen.getByPlaceholderText(/วางฉบับที่แก้แล้ว/), {
      target: { value: "เธอก้มมองพื้น แล้วเดินจากไป" },
    });
    expect(screen.getByText(/ก่อน → หลัง/)).toBeTruthy();
    expect(screen.getByText(/คำคลิเช AI/)).toBeTruthy();
  });
});

describe("ProseAnalyzerModal", () => {
  it("flags AI-slop words in English prose", () => {
    render(<ProseAnalyzerModal onClose={() => {}} />);
    const textarea = screen.getByPlaceholderText(/Paste English prose/i);
    fireEvent.change(textarea, { target: { value: "Let's delve into this rich tapestry." } });
    expect(screen.getAllByText(/delve/).length).toBeGreaterThan(0);
  });

  it("copies the Anti-AI-Slop audit pre-filled with the analyzed text", () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<ProseAnalyzerModal onClose={() => {}} />);
    const textarea = screen.getByPlaceholderText(/Paste English prose/i);
    fireEvent.change(textarea, { target: { value: "Let's delve into this rich tapestry of ideas." } });
    fireEvent.click(screen.getByText(/Anti-AI-Slop rewrite/i));
    expect(writeText).toHaveBeenCalledTimes(1);
    const arg = writeText.mock.calls[0][0] as string;
    expect(arg).toContain("delve");
    expect(arg).not.toContain("[INSERT DRAFT HERE]");
  });

  it("shows a before→after delta table when comparing a revision", () => {
    render(<ProseAnalyzerModal onClose={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText(/Paste English prose/i), {
      target: { value: "She was very angry. He delved into the tapestry." },
    });
    fireEvent.click(screen.getByText(/Compare a revision/i));
    fireEvent.change(screen.getByPlaceholderText(/Paste the revised version/i), {
      target: { value: "She slammed the door. He read the report." },
    });
    expect(screen.getByText(/Before → After/i)).toBeTruthy();
    expect(screen.getByText("AI-slop terms")).toBeTruthy();
  });

  it("offers a per-chapter scan when the text has multiple chapters", () => {
    render(<ProseAnalyzerModal onClose={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText(/Paste English prose/i), {
      target: { value: "## Chapter 1\nShe ran home fast.\n## Chapter 2\nHe delved into the rich tapestry." },
    });
    fireEvent.click(screen.getByText(/Per-chapter scan/i));
    expect(screen.getByText(/Per-chapter heatmap/i)).toBeTruthy();
    // Chapter title appears as a table cell (textarea also contains it → use getAllByText)
    expect(screen.getAllByText(/Chapter 2/).length).toBeGreaterThan(1);
  });
});
