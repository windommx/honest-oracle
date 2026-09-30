// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { listBooks, listChapters, listSeries, DRAFT_KEY } from "../_writing-store";
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

describe("Pro panels — snapshots and the plot board", () => {
  it("a snapshot is a real copy; restoring swaps the editor text and keeps the pre-restore version", async () => {
    render(<WritePage />);
    await createBookViaUi("เล่ม snapshot");
    fireEvent.change(screen.getByLabelText("เนื้อหาบท"), { target: { value: "ร่างแรก" } });
    fireEvent.click(screen.getByText("บันทึกเดี๋ยวนี้"));
    await waitFor(() => expect(screen.getByText("บันทึกแล้ว")).toBeTruthy());
    fireEvent.click(screen.getByText("บันทึกเวอร์ชัน"));
    await waitFor(() => expect(screen.getByLabelText("รายการเวอร์ชัน").textContent).toContain("คำ"));
    fireEvent.change(screen.getByLabelText("เนื้อหาบท"), { target: { value: "ร่างสอง" } });
    fireEvent.click(screen.getByText("บันทึกเดี๋ยวนี้"));
    await waitFor(() => expect(screen.getByText("บันทึกแล้ว")).toBeTruthy());
    fireEvent.click(screen.getAllByLabelText(/ย้อนกลับไปเวอร์ชัน/)[0]);
    await waitFor(() => expect((screen.getByLabelText("เนื้อหาบท") as HTMLTextAreaElement).value).toBe("ร่างแรก"));
    expect(screen.getByLabelText("รายการเวอร์ชัน").textContent).toContain("ก่อนย้อนกลับ");
  });

  it("laying a template puts one card per beat on the board, and the board becomes the prompt tool's outline", async () => {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ config: { title: "คง" }, groups: [] }));
    render(<WritePage />);
    await createBookViaUi("เล่มผัง");
    fireEvent.click(screen.getAllByRole("tab", { name: /ผัง/ })[0]);
    fireEvent.change(screen.getByLabelText("เทมเพลตโครงเรื่อง"), { target: { value: "kishotenketsu" } });
    fireEvent.click(screen.getByText("วางโครง"));
    await waitFor(() => expect(screen.getByText("การพลิก (Ten)")).toBeTruthy());
    fireEvent.click(screen.getByText("ส่งผังเป็น outline"));
    const d = JSON.parse(window.localStorage.getItem(DRAFT_KEY)!);
    expect(d.config.title).toBe("คง");
    expect(d.config.outline).toContain("ฉาก 1:");
    expect(d.config.outline).toContain("การเปิด (Ki)");
  });
});

import { exportBundle } from "../_writing-store";
import { Toaster } from "../_toast";

describe("backup — export/import through the real UI", () => {
  it("importing a bundle file creates a NEW copy of the book and selects it; the original stays", async () => {
    render(<WritePage />);
    await createBookViaUi("เล่มสำรอง");
    const book = (await listBooks()).find((b) => b.title === "เล่มสำรอง")!;
    fireEvent.change(screen.getByLabelText("เนื้อหาบท"), { target: { value: "ข้อความที่ต้องรอด" } });
    fireEvent.click(screen.getByText("บันทึกเดี๋ยวนี้"));
    await waitFor(async () => expect((await listChapters(book.id))[0].content).toBe("ข้อความที่ต้องรอด"));
    const bundle = await exportBundle([book.id]);
    const file = new File([JSON.stringify(bundle)], "เล่มสำรอง.bookisdom.json", { type: "application/json" });
    fireEvent.change(screen.getByLabelText("นำเข้าไฟล์สำรอง"), { target: { files: [file] } });
    await waitFor(async () => expect((await listBooks()).some((b) => b.title === "เล่มสำรอง (นำเข้า)")).toBe(true), { timeout: 4000 });
    const copy = (await listBooks()).find((b) => b.title === "เล่มสำรอง (นำเข้า)")!;
    expect((await listChapters(copy.id))[0].content).toBe("ข้อความที่ต้องรอด");
    expect((await listChapters(book.id))[0].content).toBe("ข้อความที่ต้องรอด"); // original untouched
    await waitFor(() => expect((screen.getByLabelText("ชื่อเล่ม (แก้ไข)") as HTMLInputElement).value).toBe("เล่มสำรอง (นำเข้า)"));
  });

  it("a wrong file is refused with the reason shown, and nothing is created", async () => {
    render(<><WritePage /><Toaster /></>); // the toast stack lives in the layout, so mount it here
    const before = (await listBooks()).length;
    const file = new File(["{\"format\":\"other/9\"}"], "x.json", { type: "application/json" });
    fireEvent.change(screen.getByLabelText("นำเข้าไฟล์สำรอง"), { target: { files: [file] } });
    await waitFor(() => expect(screen.getByText(/นำเข้าไม่ได้: รูปแบบไม่ตรง/)).toBeTruthy());
    expect((await listBooks()).length).toBe(before);
  });
});

describe("Series — grouping books into a saga, through the real UI", () => {
  it("adding two books to a series computes the saga report from each book's OWN notes → codex", async () => {
    render(<WritePage />);
    await createBookViaUi("ซีรีส์เล่ม1");
    const book1 = (await listBooks()).find((b) => b.title === "ซีรีส์เล่ม1")!;
    fireEvent.change(screen.getByLabelText("ชื่อโน้ต"), { target: { value: "อนันต์" } });
    fireEvent.change(screen.getByLabelText("รายละเอียดโน้ต"), { target: { value: "นักสืบ" } });
    fireEvent.click(screen.getByText("เพิ่มโน้ต"));
    await waitFor(() => expect(screen.getByText("อนันต์")).toBeTruthy());

    await createBookViaUi("ซีรีส์เล่ม2");
    const book2 = (await listBooks()).find((b) => b.title === "ซีรีส์เล่ม2")!;
    fireEvent.change(screen.getByLabelText("ชื่อโน้ต"), { target: { value: "อนันต์" } });
    fireEvent.change(screen.getByLabelText("รายละเอียดโน้ต"), { target: { value: "นักสืบ (สืบเนื่อง)" } });
    fireEvent.click(screen.getByText("เพิ่มโน้ต"));
    fireEvent.change(screen.getByLabelText("ชื่อโน้ต"), { target: { value: "มาลี" } });
    fireEvent.change(screen.getByLabelText("รายละเอียดโน้ต"), { target: { value: "ตัวละครใหม่" } });
    fireEvent.click(screen.getByText("เพิ่มโน้ต"));
    await waitFor(() => expect(screen.getByText("มาลี")).toBeTruthy());

    fireEvent.click(screen.getAllByRole("tab", { name: "ซีรีส์" })[0]);
    fireEvent.change(screen.getByLabelText("ชื่อซีรีส์ใหม่"), { target: { value: "ไตรภาคทดสอบ" } });
    fireEvent.click(screen.getByText("สร้างซีรีส์"));
    await waitFor(() => expect((screen.getByLabelText("ชื่อซีรีส์ (แก้ไข)") as HTMLInputElement).value).toBe("ไตรภาคทดสอบ"));

    fireEvent.change(screen.getByLabelText("เลือกเล่มเพื่อเพิ่มเข้าซีรีส์"), { target: { value: book1.id } });
    fireEvent.click(screen.getByText("เพิ่ม"));
    await waitFor(() => expect(screen.getByLabelText("ลำดับเล่มในซีรีส์").textContent).toContain("ซีรีส์เล่ม1"));

    fireEvent.change(screen.getByLabelText("เลือกเล่มเพื่อเพิ่มเข้าซีรีส์"), { target: { value: book2.id } });
    fireEvent.click(screen.getByText("เพิ่ม"));
    await waitFor(() => expect(screen.getByTestId("saga-report").textContent).toContain("ซีรีส์เล่ม2"));

    const report = screen.getByTestId("saga-report").textContent!;
    expect(report).toContain("[1] ซีรีส์เล่ม1");
    expect(report).toContain("[2] ซีรีส์เล่ม2");
    expect(report).toContain("มาลี");     // introduced in book 2
    expect(report).toContain("อนันต์");   // recurring — introduced in book 1, carried into book 2
  });

  it("deleting a series removes only the grouping — the member books stay untouched", async () => {
    render(<WritePage />);
    await createBookViaUi("เล่มเดี่ยวไม่ถูกลบ");
    const book = (await listBooks()).find((b) => b.title === "เล่มเดี่ยวไม่ถูกลบ")!;
    fireEvent.click(screen.getAllByRole("tab", { name: "ซีรีส์" })[0]);
    fireEvent.change(screen.getByLabelText("ชื่อซีรีส์ใหม่"), { target: { value: "ซีรีส์จะถูกลบ" } });
    fireEvent.click(screen.getByText("สร้างซีรีส์"));
    await waitFor(() => expect((screen.getByLabelText("ชื่อซีรีส์ (แก้ไข)") as HTMLInputElement).value).toBe("ซีรีส์จะถูกลบ"));
    const seriesId = (await listSeries()).find((s) => s.name === "ซีรีส์จะถูกลบ")!.id;

    fireEvent.click(screen.getByRole("button", { name: "ลบซีรีส์ ซีรีส์จะถูกลบ" }));
    fireEvent.click(screen.getByRole("button", { name: "ยืนยันลบซีรีส์ ซีรีส์จะถูกลบ" }));
    await waitFor(async () => expect((await listSeries()).some((s) => s.id === seriesId)).toBe(false));

    expect((await listBooks()).find((b) => b.id === book.id)?.title).toBe("เล่มเดี่ยวไม่ถูกลบ");
  });
});
