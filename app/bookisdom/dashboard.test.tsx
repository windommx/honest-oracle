// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import DashboardPage from "./dashboard/page";
import { saveManuscript } from "./_manuscript-store";

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function mockFetch(status: number, body: unknown) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as unknown as typeof fetch;
}

describe("Dashboard", () => {
  it("renders saved project cards", async () => {
    mockFetch(200, {
      projects: [
        { id: "p1", title: "เงาในสายหมอก", type: "novel", subGenre: "thriller", visibility: "private", updatedAt: new Date().toISOString() },
      ],
    });
    render(<DashboardPage />);
    expect(await screen.findByText("เงาในสายหมอก")).toBeTruthy();
    expect(screen.getByText(/Novel/)).toBeTruthy();
  });

  it("prompts login when unauthenticated (401)", async () => {
    mockFetch(401, {});
    render(<DashboardPage />);
    expect(await screen.findByText(/เข้าสู่ระบบเพื่อบันทึก/)).toBeTruthy();
  });

  it("shows the quick-action hub (Studio, analyzer, prompt tool)", async () => {
    mockFetch(200, { projects: [] });
    render(<DashboardPage />);
    // "Bookisdom Studio" appears as a nav tab and a quick action — at least one links to /bookisdom/studio
    const studio = await screen.findAllByText("Bookisdom Studio");
    expect(studio.some((el) => el.closest("a")?.getAttribute("href") === "/bookisdom/studio")).toBe(true);
    expect(screen.getAllByText("วิเคราะห์ร้อยแก้ว").length).toBeGreaterThan(0);
  });

  it("shows an upgrade button on the free plan and the Pro badge when paid", async () => {
    mockFetch(200, { projects: [], plan: "free" });
    const { unmount } = render(<DashboardPage />);
    expect(await screen.findByText("อัปเกรด Pro")).toBeTruthy();
    unmount();

    mockFetch(200, { projects: [], plan: "pro" });
    render(<DashboardPage />);
    expect(await screen.findByText("Pro")).toBeTruthy();
    expect(screen.queryByText("อัปเกรด Pro")).toBeNull();
  });

  it("lists locally-saved manuscripts even without login", async () => {
    mockFetch(401, {});
    await saveManuscript({ title: "ร่างบทที่หนึ่ง", lang: "th", text: "เนื้อเรื่อง" });
    render(<DashboardPage />);
    expect(await screen.findByText("ร่างบทที่หนึ่ง")).toBeTruthy();
    expect(screen.getByText(/ต้นฉบับที่บันทึก/)).toBeTruthy();
    expect(screen.getByLabelText("Export EPUB")).toBeTruthy(); // EPUB export per manuscript
  });
});
