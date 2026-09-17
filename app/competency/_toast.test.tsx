// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";
import { toast, dismissToast, _resetToasts, _getToasts, Toaster } from "./_toast";

afterEach(() => {
  _resetToasts();
  cleanup();
  vi.useRealTimers();
});

describe("competency toast", () => {
  it("ids are a deterministic counter and errors linger longer than info", () => {
    const a = toast("one");
    const b = toast("bad", { variant: "error" });
    expect(b).toBe(a + 1);
    const [info, err] = _getToasts();
    expect(err.duration).toBeGreaterThan(info.duration);
  });

  it("auto-dismisses, and duration 0 waits for the user", () => {
    vi.useFakeTimers();
    toast("bye", { duration: 500 });
    const sticky = toast("stay", { duration: 0 });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(_getToasts().map((t) => t.message)).toEqual(["stay"]);
    dismissToast(sticky);
    expect(_getToasts()).toHaveLength(0);
  });

  it("renders an aria-live region on a light surface and the dismiss button removes the toast", () => {
    render(<Toaster />);
    expect(screen.queryByRole("region")).toBeNull();
    act(() => {
      toast("saved", { variant: "success", duration: 0 });
    });
    expect(screen.getByRole("region", { name: "การแจ้งเตือน" })).toBeTruthy();
    expect(screen.getByRole("status").className).toContain("bg-white");
    fireEvent.click(screen.getByRole("button", { name: "ปิดการแจ้งเตือน" }));
    expect(screen.queryByText("saved")).toBeNull();
  });
});
