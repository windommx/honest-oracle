// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BookisdomLogo, BookisdomMark } from "./_logo";
import { ALLOWED_HEX } from "./_tokens";

afterEach(cleanup);

describe("Bookisdom logo — book + wisdom", () => {
  it("the mark has an accessible name that states the origin of the word", () => {
    render(<BookisdomMark />);
    expect(screen.getByRole("img", { name: "Bookisdom — book + wisdom" })).toBeTruthy();
  });

  it("the wordmark reads 'Bookisdom' to assistive tech as one word, while showing the two parts in two colours", () => {
    const { container } = render(<BookisdomLogo />);
    expect(screen.getByLabelText("Bookisdom")).toBeTruthy();
    const parts = Array.from(container.querySelectorAll('[aria-hidden="true"]')).map((n) => n.textContent);
    expect(parts).toEqual(["Book", "isdom"]);
  });

  it("shows the tagline only when asked — nav bars have no room for it", () => {
    render(<BookisdomLogo tagline />);
    expect(screen.getByText("book + wisdom")).toBeTruthy();
    cleanup();
    render(<BookisdomLogo />);
    expect(screen.queryByText("book + wisdom")).toBeNull();
  });

  it("the segment icon (favicon) uses only palette colours and the same mark", () => {
    const svg = readFileSync(join(process.cwd(), "app", "bookisdom", "icon.svg"), "utf8");
    for (const hex of svg.match(/#[0-9a-fA-F]{6}\b/g) ?? []) {
      expect(ALLOWED_HEX.has(hex.toLowerCase()), `icon.svg uses non-palette ${hex}`).toBe(true);
    }
    expect(svg).toContain("<title>Bookisdom");
  });
});
