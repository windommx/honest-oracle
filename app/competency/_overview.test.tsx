// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { OverviewTab } from "./_overview";
import { _getToasts, _resetToasts } from "./_toast";
import { dashboardFixture, mockFetch } from "./_test-helpers";

beforeEach(_resetToasts);
afterEach(cleanup);

const noop = () => {};

describe("OverviewTab", () => {
  it("renders the unit's numbers, the weak-spot callout, charts and the ranking table", async () => {
    mockFetch({ "GET /api/competency/dashboard": { body: dashboardFixture() } });
    render(<OverviewTab refreshKey={0} onDataChanged={noop} onNavigate={noop} onAssess={noop} />);
    expect(await screen.findByText("พยาบาลทั้งหมด")).toBeTruthy();
    expect(screen.getByText("ยังไม่ประเมิน 1 คน")).toBeTruthy();
    expect(screen.getByText(/จุดที่ทีมควรพัฒนา/)).toBeTruthy();
    expect(screen.getByText("5. ระบบน้ำ RO")).toBeTruthy();
    expect(screen.getAllByRole("img").length).toBeGreaterThanOrEqual(3);
    // ranking: the never-assessed nurse is last and says so in words; the management tier shows
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows[rows.length - 1].textContent).toContain("ยังไม่ประเมิน");
    expect(rows[rows.length - 1].textContent).toContain("หัวหน้าแผนก");
    expect(screen.getByRole("link", { name: "รายงาน" }).getAttribute("href")).toBe("/competency/report/n1");
  });

  it("an empty roster offers the first assessment and the workbook sample, which POSTs /sample", async () => {
    const fetch = mockFetch({
      "GET /api/competency/dashboard": { body: { ...dashboardFixture(), summary: { ...dashboardFixture().summary, totalNurses: 0 }, ranking: [] } },
      "POST /api/competency/sample": { status: 201, body: { imported: 7 } },
    });
    const onDataChanged = vi.fn();
    const onNavigate = vi.fn();
    render(<OverviewTab refreshKey={0} onDataChanged={onDataChanged} onNavigate={onNavigate} onAssess={noop} />);
    expect(await screen.findByText(/ยังไม่มีรายชื่อพยาบาลในหน่วยของคุณ/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /บันทึกการประเมินคนแรก/ }));
    expect(onNavigate).toHaveBeenCalledWith("assess");
    fireEvent.click(screen.getByRole("button", { name: /นำเข้าข้อมูลตัวอย่าง 7 คน/ }));
    await waitFor(() => expect(fetch.calls.some((c) => c.method === "POST" && c.path === "/api/competency/sample")).toBe(true));
    await waitFor(() => expect(onDataChanged).toHaveBeenCalled());
    expect(_getToasts()[0].message).toContain("7 คน");
  });

  it("a failed load is shown as a failure with retry — never as an empty unit", async () => {
    const fetch = mockFetch({ "GET /api/competency/dashboard": { status: 500, body: { error: "ฐานข้อมูลไม่ตอบสนอง" } } });
    render(<OverviewTab refreshKey={0} onDataChanged={noop} onNavigate={noop} onAssess={noop} />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("ฐานข้อมูลไม่ตอบสนอง");
    expect(screen.queryByText(/ยังไม่มีรายชื่อพยาบาล/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "ลองใหม่อีกครั้ง" }));
    await waitFor(() => expect(fetch.calls.filter((c) => c.path === "/api/competency/dashboard")).toHaveLength(2));
  });

  it("a 401 tells the user to sign in again", async () => {
    mockFetch({ "GET /api/competency/dashboard": { status: 401, body: { error: "Unauthorized" } } });
    render(<OverviewTab refreshKey={0} onDataChanged={noop} onNavigate={noop} onAssess={noop} />);
    expect((await screen.findByRole("alert")).textContent).toContain("เข้าสู่ระบบใหม่");
  });
});
