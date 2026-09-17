// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ConfirmDialog, ErrorState, LevelBadge, MgmtBadge, Modal, NotAssessedBadge } from "./_ui";

afterEach(cleanup);

describe("Modal", () => {
  it("renders nothing when closed and an aria-modal dialog labelled by its title when open", () => {
    const { rerender } = render(
      <Modal open={false} onClose={() => {}} title="หัวข้อ">
        <p>เนื้อหา</p>
      </Modal>
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    rerender(
      <Modal open onClose={() => {}} title="หัวข้อ" description="คำอธิบาย">
        <button>ปุ่มแรก</button>
      </Modal>
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(screen.getByRole("dialog", { name: "หัวข้อ" })).toBeTruthy();
    expect(dialog.getAttribute("aria-describedby")).toBeTruthy();
    // focus moved inside on open
    expect(document.activeElement?.textContent).toBe("ปุ่มแรก");
    expect(document.body.style.overflow).toBe("hidden");
  });

  it("closes on Escape and on the close button, and restores body scroll", () => {
    const onClose = vi.fn();
    const { unmount } = render(
      <Modal open onClose={onClose} title="x">
        <p>y</p>
      </Modal>
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "ปิดหน้าต่าง" }));
    expect(onClose).toHaveBeenCalledTimes(2);
    unmount();
    expect(document.body.style.overflow).toBe("");
  });

  it("wraps Tab focus inside the dialog", () => {
    render(
      <Modal open onClose={() => {}} title="x">
        <button>หนึ่ง</button>
        <button>สอง</button>
      </Modal>
    );
    const last = screen.getByRole("button", { name: "สอง" });
    last.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    // first focusable is the header close button
    expect((document.activeElement as HTMLElement).getAttribute("aria-label")).toBe("ปิดหน้าต่าง");
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
  });
});

describe("ConfirmDialog", () => {
  it("routes the two buttons to their callbacks", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<ConfirmDialog open title="ลบ?" description="แน่ใจ" danger confirmLabel="ลบ" onConfirm={onConfirm} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole("button", { name: "ลบ" }));
    fireEvent.click(screen.getByRole("button", { name: "ยกเลิก" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe("badges", () => {
  it("LevelBadge prints the level, Thai name and (optionally) the band", () => {
    render(<LevelBadge level={3} showBand />);
    expect(screen.getByText("LEVEL 3")).toBeTruthy();
    expect(screen.getByText("ผู้ปฏิบัติ")).toBeTruthy();
    expect(screen.getByText("(61 - 70 คะแนน)")).toBeTruthy();
  });

  it("MgmtBadge renders only for tiers 6/7", () => {
    const { container, rerender } = render(<MgmtBadge level={null} />);
    expect(container.textContent).toBe("");
    rerender(<MgmtBadge level={6} />);
    expect(screen.getByText(/หัวหน้าแผนก/)).toBeTruthy();
    rerender(<MgmtBadge level={3} />);
    expect(container.textContent).toBe("");
  });

  it("NotAssessedBadge says so in words, not just colour", () => {
    render(<NotAssessedBadge />);
    expect(screen.getByText("ยังไม่ประเมิน")).toBeTruthy();
  });
});

describe("ErrorState", () => {
  it("is an alert that names the failure and offers retry", () => {
    const onRetry = vi.fn();
    render(<ErrorState message="เครือข่ายล่ม" onRetry={onRetry} />);
    expect(screen.getByRole("alert").textContent).toContain("โหลดข้อมูลไม่สำเร็จ");
    fireEvent.click(screen.getByRole("button", { name: "ลองใหม่อีกครั้ง" }));
    expect(onRetry).toHaveBeenCalled();
  });
});
