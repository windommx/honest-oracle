// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useParams: () => ({ id: "n1" }) }));
vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { email: "head@hd.unit" } }, status: "authenticated" }),
  signOut: vi.fn(),
}));

import ReportPage from "./report/[id]/page";
import { assessmentFixture, mockFetch, nurseFixture } from "./_test-helpers";

afterEach(cleanup);

describe("/competency/report/[id]", () => {
  it("prints the ten chosen rubric lines, the total and band, the full development plan and signature lines", async () => {
    const older = assessmentFixture({ id: "a0", assessDate: "2019-06-01T00:00:00.000Z", totalScore: 40, level: 1, note: "ติดตาม 6 เดือน" });
    mockFetch({
      "GET /api/competency/nurses/n1": { body: { nurse: { ...nurseFixture(), assessmentCount: 2, assessments: [assessmentFixture(), older] } } },
    });
    render(<ReportPage />);
    expect(await screen.findByText("แบบสรุปผลการประเมิน Competency Level")).toBeTruthy();
    expect(screen.getByText("20 ธันวาคม 2562")).toBeTruthy();
    // criterion 5 was scored 2 → the workbook's level-2 wording appears in the table
    expect(screen.getByText("เข้าใจหลักการทำงานเครื่อง RO")).toBeTruthy();
    expect(screen.getByText("68/100")).toBeTruthy();
    expect(screen.getByText("LEVEL 3")).toBeTruthy();
    // development plan lists every criterion below 5, weakest first
    const plan = screen.getByText("แผนพัฒนารายบุคคล").parentElement!;
    const items = plan.querySelectorAll("li");
    expect(items.length).toBe(10); // no criterion at point 5 in this fixture
    expect(items[0].textContent).toContain("5. Skill การดูแลระบบน้ำ RO");
    expect(screen.getByText("(ผู้ประเมิน)")).toBeTruthy();
    expect(screen.getByText("แนวโน้มคะแนนรวมทุกครั้งที่ประเมิน")).toBeTruthy();

    // switch to the earlier assessment
    fireEvent.change(screen.getByLabelText("เลือกครั้งที่ประเมิน"), { target: { value: "a0" } });
    expect(screen.getByText("40/100")).toBeTruthy();
    expect(screen.getByText("1 มิถุนายน 2562")).toBeTruthy();
    expect(screen.getByText("ติดตาม 6 เดือน")).toBeTruthy();
  });

  it("says plainly when the nurse has never been assessed", async () => {
    mockFetch({ "GET /api/competency/nurses/n1": { body: { nurse: { ...nurseFixture({ latest: null, assessmentCount: 0 }), assessments: [] } } } });
    render(<ReportPage />);
    expect(await screen.findByText("ยังไม่มีผลการประเมินสำหรับพยาบาลคนนี้")).toBeTruthy();
    expect(screen.getByRole("button", { name: /พิมพ์/ }).hasAttribute("disabled")).toBe(true);
  });
});
