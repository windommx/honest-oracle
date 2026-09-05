// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, waitFor, fireEvent, act } from "@testing-library/react";
import DashboardPage from "./dashboard/page";
import BookisdomError from "./error";
import { Toaster } from "./_toast";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("./_manuscript-store", () => ({
  listManuscripts: async () => [
    { id: "m1", title: "ต้นฉบับว่าง", lang: "th", text: "   \n  ", updatedAt: Date.now() },
  ],
  deleteManuscript: async () => {},
}));

const PROJECT = {
  id: "p1", title: "เงาในสายหมอก", type: "novel", subGenre: "thriller",
  visibility: "private", updatedAt: new Date().toISOString(),
};

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

function fetchByUrl(handler: (url: string, init?: RequestInit) => { status: number; body?: unknown }) {
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    const r = handler(url, init);
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body ?? {} };
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("deleting is a two-step action (production hardening)", () => {
  it("one click ARMS the button — nothing is deleted until the second click", async () => {
    const fetchFn = fetchByUrl((url, init) => {
      if (url === "/api/bookisdom/projects") return { status: 200, body: { projects: [PROJECT], plan: "free" } };
      if (init?.method === "DELETE") return { status: 200 };
      return { status: 404 };
    });
    render(<DashboardPage />);
    await screen.findByText("เงาในสายหมอก");

    fireEvent.click(screen.getByRole("button", { name: "ลบหนังสือ" }));
    // armed, not deleted: the book is still there and no DELETE has been sent
    expect(screen.getByRole("button", { name: "ยืนยันลบหนังสือ" })).toBeTruthy();
    expect(screen.getByText("เงาในสายหมอก")).toBeTruthy();
    expect(fetchFn.mock.calls.some(([, init]) => (init as RequestInit)?.method === "DELETE")).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "ยืนยันลบหนังสือ" }));
    await waitFor(() =>
      expect(fetchFn.mock.calls.some(([, init]) => (init as RequestInit)?.method === "DELETE")).toBe(true));
    await waitFor(() => expect(screen.queryByText("เงาในสายหมอก")).toBeNull());
  });

  it("an armed button disarms by itself after 4s — walking away never deletes", async () => {
    const fetchFn = fetchByUrl((url) =>
      url === "/api/bookisdom/projects" ? { status: 200, body: { projects: [PROJECT], plan: "free" } } : { status: 404 });
    render(<DashboardPage />);
    await screen.findByText("เงาในสายหมอก");

    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: "ลบหนังสือ" }));
    expect(screen.getByRole("button", { name: "ยืนยันลบหนังสือ" })).toBeTruthy();
    act(() => { vi.advanceTimersByTime(4100); });
    expect(screen.queryByRole("button", { name: "ยืนยันลบหนังสือ" })).toBeNull();
    expect(screen.getByRole("button", { name: "ลบหนังสือ" })).toBeTruthy();
    expect(fetchFn.mock.calls.some(([, init]) => (init as RequestInit)?.method === "DELETE")).toBe(false);
  });
});

describe("state exclusivity", () => {
  it("the login prompt and the project grid never render together", async () => {
    // Regression: a 401 from the billing endpoint set needLogin while projects were
    // already on screen — both the login card AND the grid rendered at once.
    fetchByUrl((url) => {
      if (url === "/api/bookisdom/projects") return { status: 200, body: { projects: [PROJECT], plan: "free" } };
      if (url === "/api/billing/checkout") return { status: 401 };
      return { status: 404 };
    });
    render(<DashboardPage />);
    await screen.findByText("เงาในสายหมอก");
    fireEvent.click(screen.getByRole("button", { name: /อัปเกรด Pro/ }));
    await screen.findByText(/เข้าสู่ระบบเพื่อบันทึก/);
    expect(screen.queryByText("เงาในสายหมอก")).toBeNull();
  });

  it("a failed REFRESH keeps the books on screen instead of swapping in an error card", async () => {
    let calls = 0;
    fetchByUrl((url) => {
      if (url !== "/api/bookisdom/projects") return { status: 404 };
      calls += 1;
      return calls === 1 ? { status: 200, body: { projects: [PROJECT], plan: "free" } } : { status: 500 };
    });
    render(<><DashboardPage /><Toaster /></>);
    await screen.findByText("เงาในสายหมอก");
    fireEvent.click(screen.getByRole("button", { name: "รีเฟรชรายการ" }));
    await screen.findByText(/รีเฟรชไม่สำเร็จ/);
    // the last good list is still visible; the full-page error card is not
    expect(screen.getByText("เงาในสายหมอก")).toBeTruthy();
    expect(screen.queryByText(/โหลดรายการหนังสือไม่สำเร็จ/)).toBeNull();
  });
});

describe("server not configured (self-host truth)", () => {
  it("a 503 shows the server's own setup detail — not a login lie, not a generic error", async () => {
    // Reproduced crash: NEXTAUTH_SECRET missing → the API used to 500 and the
    // dashboard showed the generic "could not load" card. The operator needs the
    // server's detail line; ordinary users need to know local tools still work.
    fetchByUrl(() => ({ status: 503, body: { error: "server_not_configured",
      detail: "เซิร์ฟเวอร์ยังตั้งค่าไม่เสร็จ (NEXTAUTH_SECRET is not set) — ดูตัวแปรที่ต้องตั้งใน .env.example" } }));
    render(<DashboardPage />);
    await screen.findByText("เซิร์ฟเวอร์ยังตั้งค่าไม่เสร็จ");
    expect(screen.getByText(/NEXTAUTH_SECRET/)).toBeTruthy();
    expect(screen.queryByText(/เข้าสู่ระบบเพื่อบันทึก/)).toBeNull();      // not the login card
    expect(screen.queryByText(/โหลดรายการหนังสือไม่สำเร็จ/)).toBeNull(); // not the generic error card
    expect(screen.queryByText(/ยังไม่มีหนังสือที่บันทึกไว้/)).toBeNull(); // and never "empty shelf"
    expect(screen.getByText(/ทำงานได้โดยไม่ต้องมีเซิร์ฟเวอร์/)).toBeTruthy();
  });
});

describe("no silent buttons", () => {
  it("exporting an empty manuscript explains why nothing downloaded", async () => {
    fetchByUrl(() => ({ status: 200, body: { projects: [], plan: "free" } }));
    render(<><DashboardPage /><Toaster /></>);
    await screen.findByText("ต้นฉบับว่าง");
    fireEvent.click(screen.getByRole("button", { name: "Export EPUB" }));
    await screen.findByText(/ยังไม่มีเนื้อหาให้ส่งออก/);
  });
});

describe("error boundary", () => {
  it("offers retry and does not lie about local data", () => {
    const reset = vi.fn();
    render(<BookisdomError error={Object.assign(new Error("boom"), { digest: "abc123" })} reset={reset} />);
    expect(screen.getByText(/หน้านี้ทำงานผิดพลาด/)).toBeTruthy();
    expect(screen.getByText(/ต้นฉบับที่บันทึกไว้ในเครื่องยังอยู่ครบ/)).toBeTruthy();
    expect(screen.getByText(/abc123/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "ลองใหม่" }));
    expect(reset).toHaveBeenCalled();
  });
});
