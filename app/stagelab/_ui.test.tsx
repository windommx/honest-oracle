// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { useState } from "react";
import {
  Badge,
  Button,
  LockedPanel,
  Modal,
  NumberField,
  ProgressBar,
  ScorePill,
  StageBadge,
  Tabs,
  toneOfSign,
} from "./_ui";

afterEach(cleanup);

describe("StageBadge", () => {
  it("names the stage in Thai and degrades to a dash for an unknown stage", () => {
    render(<StageBadge stage={2} />);
    expect(screen.getByText(/Stage 2/)).toBeTruthy();
    cleanup();
    render(<StageBadge stage={9} />);
    expect(screen.getByText("—")).toBeTruthy();
  });

  it("uses the compact form when asked", () => {
    render(<StageBadge stage={4} short />);
    expect(screen.getByText("S4")).toBeTruthy();
  });
});

describe("ScorePill", () => {
  it("shows the score against its maximum", () => {
    render(<ScorePill label="RS" value={8} />);
    expect(screen.getByText("RS")).toBeTruthy();
    expect(screen.getByText("/10")).toBeTruthy();
  });
});

describe("ProgressBar", () => {
  it("exposes a progressbar role with a clamped percentage", () => {
    render(<ProgressBar value={150} max={100} />);
    const bar = screen.getByRole("progressbar");
    expect(bar.getAttribute("aria-valuenow")).toBe("100");
  });

  it("does not divide by a zero maximum", () => {
    render(<ProgressBar value={5} max={0} />);
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("0");
  });
});

describe("toneOfSign", () => {
  it("maps sign to tone, with zero staying neutral", () => {
    expect(toneOfSign(5)).toBe("good");
    expect(toneOfSign(-5)).toBe("bad");
    expect(toneOfSign(0)).toBe("neutral");
  });
});

describe("NumberField", () => {
  it("holds the last good value instead of writing NaN while the field is empty", () => {
    const onChange = vi.fn();
    render(<NumberField label="ราคาเข้า" value={100} onChange={onChange} />);
    const input = screen.getByLabelText("ราคาเข้า") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "" } });
    expect(onChange).toHaveBeenCalledWith(0);
    expect(onChange).not.toHaveBeenCalledWith(NaN);
  });

  it("passes through a parsed number", () => {
    const onChange = vi.fn();
    render(<NumberField label="Stop" value={100} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Stop"), { target: { value: "93.5" } });
    expect(onChange).toHaveBeenCalledWith(93.5);
  });
});

describe("Tabs", () => {
  it("marks exactly one tab selected and reports changes", () => {
    const onChange = vi.fn();
    render(
      <Tabs
        tabs={[
          { key: "a", label: "หนึ่ง" },
          { key: "b", label: "สอง" },
        ]}
        active="a"
        onChange={onChange}
      />,
    );
    const tabs = screen.getAllByRole("tab");
    expect(tabs.filter((t) => t.getAttribute("aria-selected") === "true")).toHaveLength(1);
    fireEvent.click(screen.getByText("สอง"));
    expect(onChange).toHaveBeenCalledWith("b");
  });
});

describe("Modal", () => {
  function Harness() {
    const [open, setOpen] = useState(true);
    return (
      <Modal open={open} onClose={() => setOpen(false)} title="ยืนยัน">
        <input aria-label="แรก" />
        <button>ท้าย</button>
      </Modal>
    );
  }

  it("renders nothing when closed", () => {
    render(
      <Modal open={false} onClose={() => {}} title="ซ่อน">
        <p>เนื้อหา</p>
      </Modal>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("is a labelled modal dialog", () => {
    render(<Harness />);
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    const labelledBy = dialog.getAttribute("aria-labelledby");
    expect(labelledBy).toBeTruthy();
    expect(document.getElementById(labelledBy!)?.textContent).toBe("ยืนยัน");
  });

  it("moves focus into the dialog on open", () => {
    render(<Harness />);
    expect(document.activeElement).toBe(screen.getByLabelText("แรก"));
  });

  it("closes on Escape", () => {
    render(<Harness />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("wraps Tab from the last focusable back to the first", () => {
    render(<Harness />);
    // Header close button comes first in the DOM, so it is the wrap target.
    const closeButton = screen.getByLabelText("ปิด");
    const last = screen.getByRole("button", { name: "ท้าย" });
    last.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(closeButton);
  });

  it("wraps Shift+Tab from the first focusable back to the last", () => {
    render(<Harness />);
    const closeButton = screen.getByLabelText("ปิด");
    const last = screen.getByRole("button", { name: "ท้าย" });
    closeButton.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
  });
});

describe("LockedPanel", () => {
  it("names the locked feature and links to pricing rather than dead-ending", () => {
    render(<LockedPanel feature="Quant Lab" />);
    expect(screen.getByText("Quant Lab อยู่ในแผน Pro")).toBeTruthy();
    const link = screen.getByRole("link", { name: /ดูแผนและราคา/ });
    expect(link.getAttribute("href")).toBe("/stagelab/pricing");
  });
});

describe("Button", () => {
  it("stays a real button when disabled and does not fire", () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        บันทึก
      </Button>,
    );
    fireEvent.click(screen.getByRole("button", { name: "บันทึก" }));
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe("Badge", () => {
  it("renders its children", () => {
    render(<Badge tone="good">WIN</Badge>);
    expect(screen.getByText("WIN")).toBeTruthy();
  });
});
