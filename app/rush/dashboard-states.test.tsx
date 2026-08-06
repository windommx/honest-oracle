// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import DashboardPage from "./dashboard/page";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("./_manuscript-store", () => ({
  listManuscripts: async () => [],
  deleteManuscript: async () => {},
}));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("dashboard load states (maturity pass 2)", () => {
  it("a failed load says 'could not load', NOT 'you have no books'", async () => {
    // The honesty bug this fixes: a network failure fell through to the empty state,
    // telling the writer they have no saved books when we simply could not reach the
    // server. Same class as the persistence bug — do not assert what you do not know.
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    render(<DashboardPage />);
    await waitFor(() => expect(screen.getByText(/โหลดรายการหนังสือไม่สำเร็จ/)).toBeTruthy());
    expect(screen.queryByText(/ยังไม่มีหนังสือที่บันทึกไว้/)).toBeNull();
    expect(screen.getByRole("button", { name: /ลองอีกครั้ง/ })).toBeTruthy();
    // and it explicitly corrects the wrong inference
    expect(screen.getByText(/แปลว่าคุณไม่มีหนังสือ/)).toBeTruthy();
  });

  it("a genuinely empty shelf still shows the empty state, not an error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true, status: 200, json: async () => ({ projects: [], plan: "free" }),
    }));
    render(<DashboardPage />);
    await waitFor(() => expect(screen.getByText(/ยังไม่มีหนังสือที่บันทึกไว้/)).toBeTruthy());
    expect(screen.queryByText(/โหลดรายการหนังสือไม่สำเร็จ/)).toBeNull();
  });

  it("a non-OK response is treated as a failed load, not an empty shelf", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }));
    render(<DashboardPage />);
    await waitFor(() => expect(screen.getByText(/โหลดรายการหนังสือไม่สำเร็จ/)).toBeTruthy());
  });
});
