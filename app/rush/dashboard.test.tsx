// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import DashboardPage from "./dashboard/page";

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
});
