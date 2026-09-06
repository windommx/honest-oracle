// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { listBooks, listChapters, DRAFT_KEY } from "../_writing-store";
import { listManuscripts } from "../_manuscript-store";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import WritePage from "./page";

afterEach(() => { cleanup(); push.mockReset(); });

// IndexedDB persists across the tests in this file, so on mount the page selects an EARLIER
// book whose first chapter is also titled "บทที่ 1". Wait for the editor to be bound to the
// NEW book's chapter (by id) — otherwise typing lands in the previous book.
async function createBookViaUi(title: string) {
  fireEvent.change(screen.getByLabelText("ชื่อเล่ม"), { target: { value: title } });
  fireEvent.click(screen.getByText("สร้างเล่ม"));
  await waitFor(async () => {
    const book = (await listBooks()).find((b) => b.title === title);
    expect(book).toBeTruthy();
    const [ch] = await listChapters(book!.id);
    expect(screen.getByTestId("chapter-editor").getAttribute("data-chapter-id")).toBe(ch.id);
  });
}

describe("/bookisdom/write — ห้องเขียน", () => {
  it("creating a book lands the writer in an editor on its first chapter", async () => {
    render(<WritePage />);
    await createBookViaUi("เงาเมืองใต้");
    expect((screen.getByLabelText("ชื่อบท") as HTMLInputElement).value).toBe("บทที่ 1");
    const books = await listBooks();
    expect(books.some((b) => b.title === "เงาเมืองใต้")).toBe(true);
  });

  it("typing autosaves to IndexedDB after the pause, and the count uses the Thai segmenter", async () => {
    render(<WritePage />);
    await createBookViaUi("ทดสอบบันทึก");
    const book = (await listBooks()).find((b) => b.title === "ทดสอบบันทึก")!;
    fireEvent.change(screen.getByLabelText("เนื้อหาบท"), { target: { value: "แม่น้ำไหลไปทางตะวันออกผ่านโรงสีเก่า" } });
    expect(screen.getByText(/ยังไม่บันทึก/)).toBeTruthy();
    await waitFor(async () => {
      const [ch] = await listChapters(book.id);
      expect(ch.content).toBe("แม่น้ำไหลไปทางตะวันออกผ่านโรงสีเก่า");
    }, { timeout: 4000 });
    await waitFor(() => expect(screen.getByText("บันทึกแล้ว")).toBeTruthy());
    const counts = screen.getByTestId("chapter-counts").textContent!;
    const words = Number(counts.match(/(\d+) คำ/)?.[1]);
    expect(words).toBeGreaterThan(3); // whitespace-splitting would say 1
  });

  it("character notes reach the prompt tool's saved draft as a Story Codex section", async () => {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ config: { title: "คงไว้" }, groups: [] }));
    render(<WritePage />);
    await createBookViaUi("เล่มโน้ต");
    fireEvent.change(screen.getByLabelText("ชื่อโน้ต"), { target: { value: "มะลิ" } });
    fireEvent.change(screen.getByLabelText("รายละเอียดโน้ต"), { target: { value: "นักข่าวหญิง\nอยาก: หาความจริง" } });
    fireEvent.click(screen.getByText("เพิ่มโน้ต"));
    await waitFor(() => expect(screen.getByText("มะลิ")).toBeTruthy());
    fireEvent.click(screen.getByText("ส่งโน้ตเข้า Story Codex"));
    const d = JSON.parse(window.localStorage.getItem(DRAFT_KEY)!);
    expect(d.config.title).toBe("คงไว้");
    expect(d.config.storyBible).toContain("[ตัวละคร]");
    expect(d.config.storyBible).toContain("มะลิ: นักข่าวหญิง");
    expect(d.config.storyBible).toContain("อยาก: หาความจริง");
  });

  it("'compile → analyze' saves ONE manuscript with chapter headings and routes to the analyzer with its id", async () => {
    render(<WritePage />);
    await createBookViaUi("เล่มวิเคราะห์");
    const book = (await listBooks()).find((b) => b.title === "เล่มวิเคราะห์")!;
    fireEvent.change(screen.getByLabelText("เนื้อหาบท"), { target: { value: "ฝนตกลงมา" } });
    fireEvent.click(screen.getByText("บันทึกเดี๋ยวนี้"));
    await waitFor(async () => expect((await listChapters(book.id))[0].content).toBe("ฝนตกลงมา"));
    fireEvent.click(screen.getByText(/รวมเล่มเป็นต้นฉบับ/));
    await waitFor(() => expect(push).toHaveBeenCalledTimes(1));
    const url = push.mock.calls[0][0] as string;
    const id = decodeURIComponent(url.split("analyze=")[1]);
    const m = (await listManuscripts()).find((x) => x.id === id)!;
    expect(m.title).toBe("เล่มวิเคราะห์");
    expect(m.text).toContain("บทที่ 1");
    expect(m.text).toContain("ฝนตกลงมา");
  });
});
