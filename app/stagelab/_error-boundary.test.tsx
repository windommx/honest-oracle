// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { useState } from "react";
import { ViewErrorBoundary } from "./_error-boundary";

// React logs caught errors to console.error; silence it so a passing run is
// readable, and so the assertions below can inspect what WE logged.
// Typed explicitly: the spy's inferred signature loses the argument types,
// which then makes every callback below an implicit any.
let logged: ReturnType<typeof vi.fn<(...args: unknown[]) => void>>;
beforeEach(() => {
  logged = vi.spyOn(console, "error").mockImplementation(() => {}) as typeof logged;
});
afterEach(() => {
  logged.mockRestore();
  cleanup();
});

function Boom({ explode }: { explode: boolean }): JSX.Element {
  if (explode) throw new Error("undefined is not an object (reading 'stats')");
  return <p>เนื้อหาปกติ</p>;
}

describe("ViewErrorBoundary", () => {
  it("renders children when nothing throws", () => {
    render(
      <ViewErrorBoundary resetKey="quant" label="Quant Lab">
        <Boom explode={false} />
      </ViewErrorBoundary>,
    );
    expect(screen.getByText("เนื้อหาปกติ")).toBeTruthy();
  });

  it("catches a render error and names the surface that failed", () => {
    render(
      <ViewErrorBoundary resetKey="quant" label="Quant Lab">
        <Boom explode />
      </ViewErrorBoundary>,
    );
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("Quant Lab");
  });

  it("tells the customer their data is intact, because it is", () => {
    // The boundary only ever catches a render, never a write — saying so is
    // the difference between "the screen broke" and "I lost my portfolio".
    render(
      <ViewErrorBoundary resetKey="quant" label="Quant Lab">
        <Boom explode />
      </ViewErrorBoundary>,
    );
    expect(screen.getByRole("alert").textContent).toContain("ข้อมูลของคุณไม่ได้รับผลกระทบ");
  });

  it("logs the failure in the same structured shape the server uses", () => {
    render(
      <ViewErrorBoundary resetKey="quant" label="Quant Lab">
        <Boom explode />
      </ViewErrorBoundary>,
    );
    const ours = logged.mock.calls
      .map((call: unknown[]) => call[0])
      .filter((arg: unknown): arg is string => typeof arg === "string" && arg.startsWith("{"))
      .map((json: string) => JSON.parse(json) as Record<string, string>);
    const entry = ours.find((e: Record<string, string>) => e.module === "stagelab");
    expect(entry).toBeTruthy();
    expect(entry!.where).toBe("view:quant");
    expect(entry!.level).toBe("error");
  });

  it("clears the error when the customer navigates to another view", () => {
    function Harness() {
      const [view, setView] = useState("quant");
      return (
        <>
          <button onClick={() => setView("watchlist")}>ไป Watchlist</button>
          <ViewErrorBoundary resetKey={view} label={view}>
            <Boom explode={view === "quant"} />
          </ViewErrorBoundary>
        </>
      );
    }
    render(<Harness />);
    expect(screen.getByRole("alert")).toBeTruthy();
    // Switching views is the first thing anyone tries, and it should work.
    fireEvent.click(screen.getByText("ไป Watchlist"));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("เนื้อหาปกติ")).toBeTruthy();
  });

  it("offers a retry that re-renders the same view", () => {
    function Harness() {
      const [explode, setExplode] = useState(true);
      return (
        <>
          <button onClick={() => setExplode(false)}>ซ่อม</button>
          <ViewErrorBoundary resetKey="quant" label="Quant Lab">
            <Boom explode={explode} />
          </ViewErrorBoundary>
        </>
      );
    }
    render(<Harness />);
    fireEvent.click(screen.getByText("ซ่อม"));
    fireEvent.click(screen.getByRole("button", { name: /ลองแสดงผลใหม่/ }));
    expect(screen.getByText("เนื้อหาปกติ")).toBeTruthy();
  });

  it("keeps the technical detail available but collapsed", () => {
    render(
      <ViewErrorBoundary resetKey="quant" label="Quant Lab">
        <Boom explode />
      </ViewErrorBoundary>,
    );
    const details = screen.getByText(/รายละเอียดทางเทคนิค/).closest("details");
    expect(details?.hasAttribute("open")).toBe(false);
    expect(details?.textContent).toContain("reading 'stats'");
  });
});
