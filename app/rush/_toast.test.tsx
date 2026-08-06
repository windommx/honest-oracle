// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import { toast, dismissToast, _resetToasts, _getToasts, Toaster } from "./_toast";

afterEach(() => { _resetToasts(); cleanup(); vi.useRealTimers(); });

describe("toast store", () => {
  it("adds a toast with an incrementing, deterministic id (no clock/random)", () => {
    const a = toast("first");
    const b = toast("second");
    expect(b).toBe(a + 1);
    expect(_getToasts().map((t) => t.message)).toEqual(["first", "second"]);
  });

  it("defaults variant to info and gives errors a longer duration than info", () => {
    toast("info one");
    toast("bad", { variant: "error" });
    const [info, err] = _getToasts();
    expect(info.variant).toBe("info");
    expect(err.duration).toBeGreaterThan(info.duration);
  });

  it("auto-dismisses after its duration", () => {
    vi.useFakeTimers();
    toast("bye", { duration: 1000 });
    expect(_getToasts()).toHaveLength(1);
    act(() => { vi.advanceTimersByTime(1000); });
    expect(_getToasts()).toHaveLength(0);
  });

  it("duration 0 keeps the toast until dismissed", () => {
    vi.useFakeTimers();
    const id = toast("sticky", { duration: 0 });
    act(() => { vi.advanceTimersByTime(100000); });
    expect(_getToasts()).toHaveLength(1);
    dismissToast(id);
    expect(_getToasts()).toHaveLength(0);
  });
});

describe("Toaster component", () => {
  it("renders nothing when empty, then shows fired toasts with an aria-live region", () => {
    render(<Toaster />);
    expect(screen.queryByRole("region", { name: "การแจ้งเตือน" })).toBeNull();
    act(() => { toast("saved!", { variant: "success", duration: 0 }); });
    expect(screen.getByRole("region", { name: "การแจ้งเตือน" })).toBeTruthy();
    expect(screen.getByText("saved!")).toBeTruthy();
    expect(screen.getByRole("status")).toBeTruthy();
  });

  it("an error toast is announced assertively", () => {
    render(<Toaster />);
    act(() => { toast("failed", { variant: "error", duration: 0 }); });
    expect(screen.getByRole("status").getAttribute("aria-live")).toBe("assertive");
  });

  it("the dismiss button removes the toast", async () => {
    const user = (await import("@testing-library/react")).fireEvent;
    render(<Toaster />);
    act(() => { toast("close me", { duration: 0 }); });
    act(() => { user.click(screen.getByRole("button", { name: "ปิดการแจ้งเตือน" })); });
    expect(screen.queryByText("close me")).toBeNull();
  });
});
