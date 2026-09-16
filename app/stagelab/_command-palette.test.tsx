// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { CommandPalette } from "./_command-palette";
import { STAGE_PLANS } from "@/lib/stagelab/plans";

afterEach(cleanup);

const FREE = [...STAGE_PLANS.free.features];
const PRO = [...STAGE_PLANS.pro.features];

function open(features = PRO, onNavigate = vi.fn()) {
  render(
    <CommandPalette open onClose={vi.fn()} onNavigate={onNavigate} features={features} />,
  );
  return { input: screen.getByLabelText("ค้นหาหน้า"), onNavigate };
}

describe("command palette", () => {
  it("renders nothing when closed", () => {
    render(<CommandPalette open={false} onClose={vi.fn()} onNavigate={vi.fn()} features={PRO} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("is a labelled modal listbox", () => {
    open();
    expect(screen.getByRole("dialog").getAttribute("aria-modal")).toBe("true");
    expect(screen.getByRole("listbox")).toBeTruthy();
  });

  it("lists every view before any filtering", () => {
    open();
    expect(screen.getAllByRole("option").length).toBeGreaterThanOrEqual(13);
  });

  it("matches on subsequence, the way an editor does", () => {
    const { input } = open();
    fireEvent.change(input, { target: { value: "quant" } });
    const labels = screen.getAllByRole("option").map((o) => o.textContent ?? "");
    expect(labels.some((l) => l.includes("Quant Lab"))).toBe(true);
  });

  it("reports no match rather than showing everything", () => {
    const { input } = open();
    fireEvent.change(input, { target: { value: "zzzqqqxxx" } });
    expect(screen.queryAllByRole("option")).toHaveLength(0);
    expect(screen.getByText(/ไม่พบหน้า/)).toBeTruthy();
  });

  it("keeps locked views visible but marked", () => {
    // Hiding them means the only people who discover the paid tier are the
    // ones who already went looking for it.
    open(FREE);
    const badges = screen.getAllByText("PRO");
    expect(badges.length).toBeGreaterThan(0);
  });

  it("puts an unlocked view under the cursor, not a locked one", () => {
    open(FREE);
    const first = screen.getAllByRole("option")[0];
    expect(first.textContent).not.toContain("PRO");
  });

  it("moves the selection with the arrow keys", () => {
    const { input } = open();
    const before = screen.getAllByRole("option").findIndex((o) => o.getAttribute("aria-selected") === "true");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    const after = screen.getAllByRole("option").findIndex((o) => o.getAttribute("aria-selected") === "true");
    expect(after).toBe(before + 1);
  });

  it("wraps at the ends instead of dead-ending", () => {
    const { input } = open();
    fireEvent.keyDown(input, { key: "ArrowUp" });
    const options = screen.getAllByRole("option");
    expect(options[options.length - 1].getAttribute("aria-selected")).toBe("true");
  });

  it("navigates on Enter", () => {
    const { input, onNavigate } = open();
    fireEvent.change(input, { target: { value: "watchlist" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onNavigate).toHaveBeenCalledWith("watchlist");
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(<CommandPalette open onClose={onClose} onNavigate={vi.fn()} features={PRO} />);
    fireEvent.keyDown(screen.getByLabelText("ค้นหาหน้า"), { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("points aria-activedescendant at the highlighted row", () => {
    const { input } = open();
    const id = input.getAttribute("aria-activedescendant");
    expect(id).toBeTruthy();
    expect(document.getElementById(id!)?.getAttribute("aria-selected")).toBe("true");
  });
});
