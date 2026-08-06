// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { FirstRunOrientation, OnRamps, orientationDismissed, _resetOrientation } from "./_first-run";

const RUSH_DIR = join(process.cwd(), "app", "rush");

afterEach(() => { cleanup(); _resetOrientation(); });

/** Every /rush/* route that has a page.tsx. */
function rushRoutes(): string[] {
  const out: string[] = [];
  for (const name of readdirSync(RUSH_DIR)) {
    const p = join(RUSH_DIR, name);
    if (!statSync(p).isDirectory()) continue;
    if (name.startsWith("[") || name === "share") continue; // dynamic / token routes
    try {
      statSync(join(p, "page.tsx"));
      out.push(`/rush/${name}`);
    } catch { /* no page here */ }
  }
  return out;
}

describe("reachability — the measured dead end this pass fixes", () => {
  it("every /rush sub-page is linked from /rush, the most-linked page in the app", () => {
    // Before this pass: /rush had 8 inbound links and linked to /rush/start,
    // /rush/explore and /rush/fix ZERO times. Three of five rush pages were
    // unreachable from the front door — a newcomer met a bare config form with no
    // route to the wizard built for them. This is reachability, not taste.
    const page = readFileSync(join(RUSH_DIR, "page.tsx"), "utf8");
    const onRamps = readFileSync(join(RUSH_DIR, "_first-run.tsx"), "utf8");
    const reachable = page + onRamps; // the strip and the compact row are rendered by /rush
    const missing = rushRoutes().filter((r) => !reachable.includes(`"${r}"`));
    expect(missing, `unreachable from /rush: ${missing.join(", ")}`).toEqual([]);
  });
});

describe("FirstRunOrientation", () => {
  it("shows the three on-ramps to a genuine newcomer", () => {
    render(<FirstRunOrientation show />);
    expect(screen.getByRole("region", { name: "เริ่มต้นใช้งาน" })).toBeTruthy();
    expect(screen.getByText(/เพิ่งเริ่ม/)).toBeTruthy();
    expect(screen.getByText(/มีต้นฉบับแล้ว แต่ติดอยู่/)).toBeTruthy();
    expect(screen.getByText(/ทำไมถึงเชื่อตัวเลขของเราได้/)).toBeTruthy();
  });

  it("renders nothing when the caller says this is not a newcomer", () => {
    render(<FirstRunOrientation show={false} />);
    expect(screen.queryByRole("region", { name: "เริ่มต้นใช้งาน" })).toBeNull();
  });

  it("dismissal is remembered, so a returning writer is not nagged", () => {
    const { unmount } = render(<FirstRunOrientation show />);
    fireEvent.click(screen.getByRole("button", { name: "ปิดคำแนะนำเริ่มต้น" }));
    expect(screen.queryByRole("region", { name: "เริ่มต้นใช้งาน" })).toBeNull();
    expect(orientationDismissed()).toBe(true);
    unmount();
    render(<FirstRunOrientation show />);
    expect(screen.queryByRole("region", { name: "เริ่มต้นใช้งาน" })).toBeNull();
  });
});

describe("OnRamps", () => {
  it("keeps the pages reachable after the strip is dismissed", () => {
    render(<OnRamps />);
    const nav = screen.getByRole("navigation", { name: "ทางลัด" });
    const hrefs = Array.from(nav.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(expect.arrayContaining(["/rush/start", "/rush/fix", "/rush/honesty", "/rush/explore"]));
  });
});
