// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { GuideModal, ThaiAnalyzerModal, ProseAnalyzerModal } from "./_components";

afterEach(cleanup);
// Analyzer input and the manuscript store both use localStorage; isolate tests.
beforeEach(() => window.localStorage.clear());

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

  it("inserts text containing '$' verbatim (no replacement-pattern corruption)", () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<ProseAnalyzerModal onClose={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText(/Paste English prose/i), {
      target: { value: "The deal was worth $5 and cost $1,000 to delve into the tapestry." },
    });
    fireEvent.click(screen.getByText(/Anti-AI-Slop rewrite/i));
    const arg = writeText.mock.calls[0][0] as string;
    expect(arg).toContain("$5");
    expect(arg).toContain("$1,000");
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

  it("loads a chapter into the analyzer when its heatmap row is clicked", () => {
    render(<ProseAnalyzerModal onClose={() => {}} />);
    const ta = screen.getByPlaceholderText(/Paste English prose/i) as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: "## Chapter 1\nShe ran home.\n## Chapter 2\nHe delved into the tapestry." } });
    fireEvent.click(screen.getByText(/Per-chapter scan/i));
    // Click the row whose title cell is "Chapter 2"
    const cell = screen.getAllByText("Chapter 2").find((el) => el.tagName === "TD")!;
    fireEvent.click(cell.closest("tr")!);
    expect(ta.value).toContain("delved");
    expect(ta.value).not.toContain("She ran home");
  });

  it("saves the current text as a named manuscript and lists it for loading", () => {
    render(<ProseAnalyzerModal onClose={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText(/Paste English prose/i), {
      target: { value: "Some draft prose to keep." },
    });
    fireEvent.change(screen.getByPlaceholderText(/name…/i), { target: { value: "My chapter" } });
    fireEvent.click(screen.getByText(/Save draft/i));
    // The saved draft now appears as an <option> in the load dropdown.
    expect(screen.getByRole("option", { name: "My chapter" })).toBeTruthy();
  });
});
