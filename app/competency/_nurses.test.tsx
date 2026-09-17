// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react";
import { NursesTab } from "./_nurses";
import { _getToasts, _resetToasts } from "./_toast";
import { assessmentFixture, dashboardFixture, mockFetch, nurseFixture } from "./_test-helpers";

beforeEach(_resetToasts);
afterEach(cleanup);

const noop = () => {};
const roster = () => [nurseFixture(), nurseFixture({ id: "n2", fullName: "คุณใหม่ ยังไม่ประเมิน", nickname: null, latest: null, assessmentCount: 0 })];

describe("NursesTab", () => {
  it("lists the roster with search and hands 'ประเมิน' back to the page", async () => {
    mockFetch({ "GET /api/competency/nurses": { body: { nurses: roster() } } });
    const onAssess = vi.fn();
    render(<NursesTab refreshKey={0} onDataChanged={noop} onAssess={onAssess} onEditAssessment={noop} />);
    expect(await screen.findByText("คุณจารุวรรณ พันธ์ยาง")).toBeTruthy();
    expect(screen.getByText("คุณใหม่ ยังไม่ประเมิน")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("ค้นหาพยาบาล"), { target: { value: "ตั๊ก" } });
    expect(screen.queryByText("คุณใหม่ ยังไม่ประเมิน")).toBeNull();
    fireEvent.change(screen.getByLabelText("ค้นหาพยาบาล"), { target: { value: "ไม่มีคนนี้" } });
    expect(screen.getByText("ไม่พบพยาบาลที่ค้นหา")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("ค้นหาพยาบาล"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "ประเมิน คุณจารุวรรณ พันธ์ยาง" }));
    expect(onAssess).toHaveBeenCalledWith("n1");
  });

  it("opens the profile with radar, per-criterion scores, the development plan and history", async () => {
    const older = assessmentFixture({ id: "a0", assessDate: "2019-06-01T00:00:00.000Z", totalScore: 40, level: 1, scores: { ...assessmentFixture().scores, "1": 1, "7": 1 } });
    mockFetch({
      "GET /api/competency/nurses": { body: { nurses: roster() } },
      "GET /api/competency/nurses/n1": { body: { nurse: { ...nurseFixture(), assessmentCount: 2, assessments: [assessmentFixture(), older] } } },
      "GET /api/competency/dashboard": { body: dashboardFixture() },
    });
    const onEdit = vi.fn();
    render(<NursesTab refreshKey={0} onDataChanged={noop} onAssess={noop} onEditAssessment={onEdit} />);
    fireEvent.click(await screen.findByRole("button", { name: "ดูรายละเอียดของ คุณจารุวรรณ พันธ์ยาง" }));
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByText("คะแนนรวมล่าสุด (เต็ม 100)");
    expect(within(dialog).getByText("คะแนนรวมล่าสุด (เต็ม 100)").nextElementSibling?.textContent).toBe("68");
    expect(dialog.textContent).toContain("คะแนนถึง LEVEL 4 ผู้ชำนาญ"); // 68 → 71 needs 3
    expect(dialog.textContent).toMatch(/อีก\s*3\s*คะแนนถึง/);
    // radar: two series (team + nurse) named in the legend
    expect(within(dialog).getByText("ค่าเฉลี่ยทีม")).toBeTruthy();
    // development plan leads with the weakest criterion (RO at point 2) and quotes the next rung
    expect(within(dialog).getByText(/5\. Skill การดูแลระบบน้ำ RO — ตอนนี้ระดับ 2/)).toBeTruthy();
    expect(within(dialog).getByText(/→ ระดับ 3:/).parentElement?.textContent).toContain("ดูแลเครื่อง RO ประจำวันได้");
    // trend appears once there are two assessments
    expect(within(dialog).getByText("แนวโน้มคะแนนรวม")).toBeTruthy();
    // history: newest first, edit hands the target to the page
    const items = within(dialog).getAllByRole("listitem").filter((li) => /ผู้ประเมิน:/.test(li.textContent ?? ""));
    expect(items[0].textContent).toContain("20 ธ.ค. 2562");
    expect(items[1].textContent).toContain("1 มิ.ย. 2562");
    fireEvent.click(within(dialog).getByRole("button", { name: "แก้ไขผลประเมินวันที่ 1 มิ.ย. 2562" }));
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ nurse: expect.objectContaining({ id: "n1" }), assessment: expect.objectContaining({ id: "a0" }) }));
  });

  it("deleting a nurse goes through a confirmation and reports the cascade", async () => {
    const fetch = mockFetch({
      "GET /api/competency/nurses": { body: { nurses: roster() } },
      "DELETE /api/competency/nurses/n1": { body: { ok: true, deletedAssessments: 1 } },
    });
    const onDataChanged = vi.fn();
    render(<NursesTab refreshKey={0} onDataChanged={onDataChanged} onAssess={noop} onEditAssessment={noop} />);
    fireEvent.click(await screen.findByRole("button", { name: "ลบ คุณจารุวรรณ พันธ์ยาง" }));
    const dialog = screen.getByRole("dialog", { name: "ยืนยันการลบพยาบาล" });
    expect(dialog.textContent).toContain("1 ครั้งจะถูกลบด้วย");
    expect(fetch.calls.filter((c) => c.method === "DELETE")).toHaveLength(0);
    fireEvent.click(within(dialog).getByRole("button", { name: "ลบ" }));
    await waitFor(() => expect(fetch.calls.some((c) => c.method === "DELETE" && c.path === "/api/competency/nurses/n1")).toBe(true));
    await waitFor(() => expect(onDataChanged).toHaveBeenCalled());
    expect(_getToasts()[0].message).toContain("ลบ \"คุณจารุวรรณ พันธ์ยาง\"");
  });

  it("adds a nurse through the dialog", async () => {
    const fetch = mockFetch({
      "GET /api/competency/nurses": { body: { nurses: [] } },
      "POST /api/competency/nurses": { status: 201, body: { nurse: nurseFixture({ id: "n3", fullName: "คุณเพิ่มใหม่" }) } },
    });
    render(<NursesTab refreshKey={0} onDataChanged={noop} onAssess={noop} onEditAssessment={noop} />);
    fireEvent.click(await screen.findByRole("button", { name: /เพิ่มพยาบาล/ }));
    const dialog = screen.getByRole("dialog", { name: "เพิ่มพยาบาลใหม่" });
    fireEvent.click(within(dialog).getByRole("button", { name: "เพิ่มพยาบาล" }));
    expect(_getToasts()[0].message).toBe("กรุณาระบุชื่อ-นามสกุล");
    fireEvent.change(within(dialog).getByLabelText(/ชื่อ-นามสกุล/), { target: { value: "คุณเพิ่มใหม่" } });
    fireEvent.change(within(dialog).getByLabelText(/ระดับบริหาร/), { target: { value: "7" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "เพิ่มพยาบาล" }));
    await waitFor(() => expect(fetch.calls.some((c) => c.method === "POST")).toBe(true));
    expect(fetch.calls.find((c) => c.method === "POST")!.body).toEqual({ fullName: "คุณเพิ่มใหม่", nickname: null, position: "พยาบาลวิชาชีพ", mgmtLevel: 7 });
  });

  it("a failed roster load shows the failure, not an empty list", async () => {
    mockFetch({ "GET /api/competency/nurses": { status: 500, body: { error: "ล่ม" } } });
    render(<NursesTab refreshKey={0} onDataChanged={noop} onAssess={noop} onEditAssessment={noop} />);
    expect((await screen.findByRole("alert")).textContent).toContain("ล่ม");
    expect(screen.queryByText(/ยังไม่มีรายชื่อพยาบาล/)).toBeNull();
  });
});
