// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeAll, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { CHART_COLORS, LineChart } from "./_chart";

// jsdom reports zero for every layout box and has no ResizeObserver, so the
// chart would measure 0×0 and render nothing. Both are stubbed to a realistic
// size — the component's job here is to produce correct structure at a given
// size, not to do layout.
beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, value: 640 });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, value: 200 });
});

afterEach(cleanup);

const EQUITY = [1_000_000, 1_120_000, 1_080_000, 1_340_000, 1_290_000, 1_610_000];
const BENCH = [1_000_000, 1_040_000, 1_020_000, 1_100_000, 1_090_000, 1_150_000];

function renderChart(extra: Partial<Parameters<typeof LineChart>[0]> = {}) {
  return render(
    <LineChart
      caption="มูลค่าพอร์ต"
      series={[{ label: "กลยุทธ์", values: EQUITY, color: CHART_COLORS.strategy }]}
      xLabels={["w1", "w2", "w3", "w4", "w5", "w6"]}
      {...extra}
    />,
  );
}

describe("LineChart", () => {
  it("refuses to draw a line through a single point", () => {
    render(
      <LineChart caption="x" series={[{ label: "a", values: [1], color: "#fff" }]} />,
    );
    expect(screen.getByText(/ข้อมูลไม่พอ/)).toBeTruthy();
  });

  it("describes itself with its real endpoints, not just a title", () => {
    renderChart();
    const label = screen.getByRole("img").getAttribute("aria-label") ?? "";
    expect(label).toContain("มูลค่าพอร์ต");
    // ฿1.00M → ฿1.61M; a screen reader gets the finding, not "a chart".
    expect(label).toContain("1.61M");
  });

  it("keeps the numbers as a real table for assistive tech", () => {
    renderChart();
    // Present in the DOM before anyone asks for it, and referenced by the SVG.
    const table = screen.getByRole("table", { hidden: true });
    expect(table).toBeTruthy();
    const describedBy = screen.getByRole("img").getAttribute("aria-describedby");
    expect(document.getElementById(describedBy!)?.contains(table)).toBe(true);
  });

  it("lets a sighted reader open that table too", () => {
    renderChart();
    const toggle = screen.getByRole("button", { name: /ดูเป็นตาราง/ });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: /ซ่อนตาราง/ }).getAttribute("aria-expanded")).toBe("true");
  });

  it("thins a long series rather than reading out every point", () => {
    const long = Array.from({ length: 312 }, (_, i) => 1_000_000 + i * 1000);
    render(
      <LineChart caption="ยาว" series={[{ label: "a", values: long, color: "#fff" }]} />,
    );
    const rows = screen.getAllByRole("row", { hidden: true });
    expect(rows.length).toBeLessThan(30);
    expect(rows.length).toBeGreaterThan(5);
  });

  it("always includes the final point, however it thins", () => {
    const long = Array.from({ length: 100 }, (_, i) => i);
    render(
      <LineChart
        caption="ยาว"
        valueKind="plain"
        series={[{ label: "a", values: long, color: "#fff" }]}
      />,
    );
    expect(screen.getByText("99.00")).toBeTruthy();
  });

  it("draws one path per series and legends them", () => {
    renderChart({
      series: [
        { label: "กลยุทธ์", values: EQUITY, color: CHART_COLORS.strategy },
        { label: "ดัชนี", values: BENCH, color: CHART_COLORS.benchmark, dashed: true },
      ],
    });
    expect(screen.getAllByText("กลยุทธ์").length).toBeGreaterThan(0);
    expect(screen.getAllByText("ดัชนี").length).toBeGreaterThan(0);
  });

  it("reads out the values under the pointer", () => {
    renderChart();
    const svg = screen.getByRole("img");
    svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 640, height: 200 }) as DOMRect;
    fireEvent.pointerMove(svg, { clientX: 640 });
    // Hovering the far right should surface the last value in the legend.
    expect(screen.getAllByText("฿1.61M").length).toBeGreaterThan(0);
  });

  it("handles a flat series without dividing by a zero range", () => {
    const flat = [500, 500, 500, 500];
    render(
      <LineChart caption="แบน" series={[{ label: "a", values: flat, color: "#fff" }]} />,
    );
    expect(screen.getByRole("img")).toBeTruthy();
  });
});
