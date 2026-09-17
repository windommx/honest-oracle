// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { HBarChart, LevelDistributionChart, RadarChart, TrendChart } from "./_charts";

afterEach(cleanup);

describe("LevelDistributionChart", () => {
  it("draws one bar per level and states the counts in its accessible name", () => {
    const data = [1, 2, 3, 4, 5].map((level) => ({ level, count: level === 3 ? 4 : 1 }));
    const { container } = render(<LevelDistributionChart data={data} />);
    const svg = screen.getByRole("img");
    expect(svg.getAttribute("aria-label")).toContain("LEVEL 3 ผู้ปฏิบัติ 4 คน");
    expect(container.querySelectorAll("rect")).toHaveLength(5);
    // the tallest bar belongs to the level with the most nurses, and every count is written as text
    const heights = Array.from(container.querySelectorAll("rect")).map((r) => Number(r.getAttribute("height")));
    expect(Math.max(...heights)).toBe(heights[2]);
    expect(screen.getAllByText("4")).toHaveLength(1);
  });
});

describe("HBarChart", () => {
  it("scales bars against max and writes the display value beside each", () => {
    const { container } = render(
      <HBarChart ariaLabel="ทดสอบ" max={10} items={[{ key: "a", label: "A", value: 5, display: "5.0" }, { key: "b", label: "B", value: 10 }]} />
    );
    const [a, b] = Array.from(container.querySelectorAll("rect")).map((r) => Number(r.getAttribute("width")));
    expect(a).toBeCloseTo(b / 2, 5);
    expect(screen.getByText("5.0")).toBeTruthy();
    expect(screen.getByText("10")).toBeTruthy();
    expect(screen.getByRole("img").getAttribute("aria-label")).toBe("ทดสอบ: A 5.0, B 10");
  });

  it("never draws past the plot for an out-of-range value", () => {
    const { container } = render(<HBarChart ariaLabel="x" max={10} items={[{ key: "a", label: "A", value: 40 }, { key: "b", label: "B", value: 10 }]} />);
    const [a, b] = Array.from(container.querySelectorAll("rect")).map((r) => Number(r.getAttribute("width")));
    expect(a).toBe(b);
  });
});

describe("RadarChart", () => {
  it("draws max rings, one axis per label and one polygon per series", () => {
    const axes = ["ก", "ข", "ค", "ง", "จ"];
    const { container } = render(
      <RadarChart axes={axes} series={[{ name: "ทีม", values: [3, 3, 3, 3, 3], color: "#b45309" }, { name: "ฉัน", values: [5, 1, 2, 4, 3], color: "#0f766e" }]} />
    );
    expect(container.querySelectorAll("polygon")).toHaveLength(5 + 2);
    expect(container.querySelectorAll("line")).toHaveLength(5);
    expect(screen.getByRole("img").getAttribute("aria-label")).toContain("ฉัน: ก 5, ข 1");
  });
});

describe("TrendChart", () => {
  it("a single assessment is a dot without a line; two or more get the line", () => {
    const one = render(<TrendChart points={[{ label: "20 ธ.ค. 2562", value: 68, level: 3 }]} />);
    expect(one.container.querySelector("polyline")).toBeNull();
    expect(one.container.querySelectorAll("circle")).toHaveLength(1);
    cleanup();
    const two = render(
      <TrendChart points={[{ label: "20 ธ.ค. 2562", value: 48, level: 1 }, { label: "1 มิ.ย. 2563", value: 68, level: 3 }]} />
    );
    expect(two.container.querySelector("polyline")).not.toBeNull();
    expect(screen.getByRole("img").getAttribute("aria-label")).toBe("แนวโน้มคะแนนรวม: 20 ธ.ค. 2562 48, 1 มิ.ย. 2563 68");
  });

  it("labels the band floors so the reader can see which line a score crossed", () => {
    render(<TrendChart points={[{ label: "x", value: 10, level: 1 }]} />);
    for (const t of ["L2 ≥ 51", "L3 ≥ 61", "L4 ≥ 71", "L5 ≥ 81"]) expect(screen.getByText(t)).toBeTruthy();
  });
});
