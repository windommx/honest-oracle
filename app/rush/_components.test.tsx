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

  it("shows the honest scene-readout card with measured signals, no 0–100 vibe score", () => {
    render(<ThaiAnalyzerModal onClose={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText(/วางข้อความภาษาไทย/), {
      target: {
        value:
          "แสงอาทิตย์สาดจ้าเป็นประกาย เสียงลมหวีดดังก้อง กลิ่นดินหอมกรุ่นอบอวล " +
          '"เธอมาทำไม" เขาถาม เธอเงียบ รู้สึกกลัวจับใจ ผิวหินเย็นเฉียบใต้ฝ่ามือ',
      },
    });
    expect(screen.getByText(/อ่านค่าฉากนี้/)).toBeTruthy();
    expect(screen.getByText(/ไม่มี momentum\/clarity\/tension/)).toBeTruthy();
  });

  it("renames a character across chapters and offers the rewritten download", () => {
    render(<ThaiAnalyzerModal onClose={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText(/วางข้อความภาษาไทย/), {
      target: { value: "## บทที่ 1\nวิกกี้เดินมา วิกกี้ยิ้ม\n## บทที่ 2\nเธอเรียกวิกกี้" },
    });
    fireEvent.change(screen.getByLabelText("ชื่อเดิม"), { target: { value: "วิกกี้" } });
    fireEvent.change(screen.getByLabelText("ชื่อใหม่"), { target: { value: "อาโน่" } });
    expect(screen.getByText(/3 จุดที่พบ/)).toBeTruthy();
    expect(screen.getByText(/ดาวน์โหลดฉบับที่เปลี่ยนชื่อแล้ว/)).toBeTruthy();
  });

  it("shows the epistemic panel: tiers of knowing and the refused constructs", () => {
    render(<ThaiAnalyzerModal onClose={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText(/วางข้อความภาษาไทย/), {
      target: { value: "แสงจ้าเป็นประกาย เสียงดังก้อง เธอเงียบ รู้สึกกลัวจับใจ เดินจากไป" },
    });
    // The honesty panel is present with the yathābhūta banner…
    expect(screen.getByText(/ญาณวิทยา/)).toBeTruthy();
    expect(screen.getByText(/ยถาภูต/)).toBeTruthy();
    // …and expands to reveal the refused 0–100 constructs by name.
    fireEvent.click(screen.getByText(/ญาณวิทยา/));
    expect(screen.getByText(/โมเมนตัม/)).toBeTruthy();
    expect(screen.getByText(/เกินวิสัยของเครื่องนี้/)).toBeTruthy();
  });

  it("suggests standard Thai spellings for informal loanwords", () => {
    render(<ThaiAnalyzerModal onClose={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText(/วางข้อความภาษาไทย/), {
      target: { value: "เขาจะอัพเดทข้อมูลแล้วเช็คอีเมล์ทุกวัน เขาจะอัพเดทข้อมูลอีกครั้ง" },
    });
    expect(screen.getByText(/คำ\/การสะกด/)).toBeTruthy();
    expect(screen.getByText(/อัปเดต/)).toBeTruthy(); // อัพเดท → อัปเดต
  });

  it("adds a sensory column to the per-chapter heatmap", () => {
    render(<ThaiAnalyzerModal onClose={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText(/วางข้อความภาษาไทย/), {
      target: {
        value:
          "## บทที่ 1\nแสงจ้าเป็นประกาย กลิ่นดินหอมกรุ่น เสียงลมหวีดดังก้อง\n" +
          "## บทที่ 2\nรุ่งเช้าเธอเดินเข้าเมือง ผู้คนพลุกพล่านเนืองแน่น",
      },
    });
    fireEvent.click(screen.getByText(/สแกนรายบท/));
    expect(screen.getByText(/ผัสสะ\/1k/)).toBeTruthy();
  });

  it("checks a Thai→English translation for per-chapter length drift", () => {
    render(<ThaiAnalyzerModal onClose={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText(/วางข้อความภาษาไทย/), {
      target: { value: "## บทที่ 1\nเธอเดินไป\n## บทที่ 2\nเขายืนรอ" },
    });
    fireEvent.click(screen.getByText(/ตรวจการแปล/));
    fireEvent.change(screen.getByPlaceholderText(/วางคำแปลภาษาอังกฤษ/), {
      target: { value: "## 1\nShe walked away slowly.\n## 2\nHe stood waiting." },
    });
    expect(screen.getByText(/ความยาวรายบท/)).toBeTruthy();
  });

  it("shows deterministic narrative intelligence — presence, pacing, motifs — never a 0–100 score", () => {
    render(<ThaiAnalyzerModal onClose={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText(/วางข้อความภาษาไทย/), {
      target: {
        value:
          "## บทที่ 1\nเดนโอเดินทางกับริน แสงจ้าเป็นประกาย กลิ่นดินหอมกรุ่น\n" +
          "## บทที่ 2\nรินอยู่คนเดียว เธอคิดถึงบ้าน ลมพัดเย็น\n" +
          "## บทที่ 3\nเดนโอกลับมา ทั้งคู่เดินต่อ เสียงน้ำไหลริน",
      },
    });
    fireEvent.change(screen.getByPlaceholderText(/ชื่อตัวละคร\/สถานที่/), { target: { value: "เดนโอ, ริน" } });
    expect(screen.getByText(/ปัญญาการเล่าเรื่อง/)).toBeTruthy();
    expect(screen.getByText(/จังหวะรายองก์/)).toBeTruthy();
    // the honesty disclaimer is present; no invented score label
    expect(screen.getByText(/ไม่มีคะแนน consistency\/arc\/resonance แบบเดา/)).toBeTruthy();
  });

  it("surfaces the continuity radar and relationship graph once the glossary is filled", () => {
    render(<ThaiAnalyzerModal onClose={() => {}} />);
    // Multi-chapter draft: เดนโอ/ริน are canon; กรรณ recurs but isn't declared.
    fireEvent.change(screen.getByPlaceholderText(/วางข้อความภาษาไทย/), {
      target: { value: "## บทที่ 1\nเดนโอเดินทางกับริน กรรณตามมา\n## บทที่ 2\nกรรณพบเดนโอ กรรณยิ้ม กรรณพูดกับเดนโอ" },
    });
    // Declare the canon in the glossary → radar has something to compare against.
    fireEvent.change(screen.getByPlaceholderText(/ชื่อตัวละคร\/สถานที่/), {
      target: { value: "เดนโอ, ริน" },
    });
    expect(screen.getByText(/เรดาร์ความต่อเนื่อง/)).toBeTruthy();
    expect(screen.getAllByText(/กรรณ/).length).toBeGreaterThan(0); // off-canon name flagged
    expect(screen.getByText(/ความสัมพันธ์ตัวละคร/)).toBeTruthy();
    expect(screen.getByText(/เดนโอ ↔ ริน/)).toBeTruthy(); // shared-chapter edge
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
