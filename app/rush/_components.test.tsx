// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { GuideModal, ThaiAnalyzerModal } from "./_components";

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
});
