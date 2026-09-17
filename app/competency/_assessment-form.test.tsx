// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { AssessmentForm } from "./_assessment-form";
import { _getToasts, _resetToasts } from "./_toast";
import { assessmentFixture, FULL_SCORES, mockFetch, nurseFixture } from "./_test-helpers";

beforeEach(_resetToasts);
afterEach(cleanup);

const pick = (criterion: number, point: number) =>
  fireEvent.click(screen.getByRole("button", { name: new RegExp(`^เกณฑ์ ${criterion} ระดับ ${point}:`) }));

describe("AssessmentForm — create", () => {
  it("lists the roster, previews the total and band as levels are chosen, and posts the scores", async () => {
    const fetch = mockFetch({
      "GET /api/competency/nurses": { body: { nurses: [nurseFixture(), nurseFixture({ id: "n2", fullName: "คุณใหม่", nickname: null, latest: null, assessmentCount: 0 })] } },
      "POST /api/competency/assessments": { status: 201, body: { assessment: assessmentFixture({ id: "a9", totalScore: 60, level: 2, scores: FULL_SCORES(3) }) } },
    });
    const onSaved = () => {};
    render(<AssessmentForm refreshKey={0} onSaved={onSaved} />);

    const select = (await screen.findByLabelText(/^พยาบาล/)) as HTMLSelectElement;
    expect(screen.getByRole("option", { name: /คุณใหม่ — ยังไม่ประเมิน/ })).toBeTruthy();
    fireEvent.change(select, { target: { value: "n1" } });

    expect(screen.getByTestId("total-score").textContent).toBe("0");
    expect(screen.getByTestId("selected-count").textContent).toBe("0/10");
    pick(1, 3);
    expect(screen.getByTestId("total-score").textContent).toBe("6");
    expect(screen.getByTestId("selected-count").textContent).toBe("1/10");
    // no band preview until every criterion is chosen
    expect(screen.queryByText("LEVEL 2")).toBeNull();
    for (let c = 2; c <= 10; c++) pick(c, 3);
    expect(screen.getByTestId("total-score").textContent).toBe("60");
    expect(screen.getByText("LEVEL 2")).toBeTruthy(); // 60 → ผู้เรียนรู้

    fireEvent.change(screen.getByLabelText(/วันที่ประเมิน/), { target: { value: "2025-01-05" } });
    fireEvent.change(screen.getByLabelText("ผู้ประเมิน"), { target: { value: " หัวหน้าหน่วย " } });
    fireEvent.click(screen.getByRole("button", { name: /บันทึกผลประเมิน/ }));

    await waitFor(() => expect(fetch.calls.some((c) => c.method === "POST")).toBe(true));
    const post = fetch.calls.find((c) => c.method === "POST")!;
    expect(post.path).toBe("/api/competency/assessments");
    expect(post.body).toEqual({ nurseId: "n1", scores: FULL_SCORES(3), assessDate: "2025-01-05", assessor: "หัวหน้าหน่วย", note: null });
    await waitFor(() => expect(_getToasts().some((t) => t.variant === "success" && /60\/100/.test(t.message))).toBe(true));
    // scores cleared for the next entry, nurse kept
    expect(screen.getByTestId("total-score").textContent).toBe("0");
    expect((screen.getByLabelText(/^พยาบาล/) as HTMLSelectElement).value).toBe("n1");
  });

  it("refuses to save an incomplete form and names what is missing, without calling the API", async () => {
    const fetch = mockFetch({ "GET /api/competency/nurses": { body: { nurses: [nurseFixture()] } } });
    render(<AssessmentForm refreshKey={0} onSaved={() => {}} />);
    await screen.findByLabelText(/^พยาบาล/);

    fireEvent.click(screen.getByRole("button", { name: /บันทึกผลประเมิน/ }));
    expect(_getToasts()[0].message).toBe("กรุณาเลือกพยาบาลที่จะประเมิน");

    fireEvent.change(screen.getByLabelText(/^พยาบาล/), { target: { value: "n1" } });
    pick(1, 5);
    fireEvent.click(screen.getByRole("button", { name: /บันทึกผลประเมิน/ }));
    const last = _getToasts()[_getToasts().length - 1];
    expect(last.variant).toBe("error");
    expect(last.message).toContain("เหลืออีก 9 เกณฑ์");
    expect(last.message).toContain("เกณฑ์ที่ 2");
    expect(fetch.calls.filter((c) => c.method === "POST")).toHaveLength(0);
  });

  it("can create the nurse inline", async () => {
    const fetch = mockFetch({
      "GET /api/competency/nurses": { body: { nurses: [] } },
      "POST /api/competency/assessments": { status: 201, body: { assessment: assessmentFixture({ nurseId: "n7" }) } },
    });
    render(<AssessmentForm refreshKey={0} onSaved={() => {}} />);
    await screen.findByText(/ยังไม่มีรายชื่อในระบบ/);
    fireEvent.click(screen.getByLabelText(/เพิ่มพยาบาลใหม่/));
    fireEvent.change(screen.getByLabelText(/ชื่อ-นามสกุล/), { target: { value: "คุณสมหญิง ใจดี" } });
    fireEvent.change(screen.getByLabelText(/ระดับบริหาร/), { target: { value: "6" } });
    for (let c = 1; c <= 10; c++) pick(c, 4);
    fireEvent.click(screen.getByRole("button", { name: /บันทึกผลประเมิน/ }));
    await waitFor(() => expect(fetch.calls.some((c) => c.method === "POST")).toBe(true));
    expect(fetch.calls.find((c) => c.method === "POST")!.body.nurse).toEqual({ fullName: "คุณสมหญิง ใจดี", nickname: null, position: "พยาบาลวิชาชีพ", mgmtLevel: 6 });
  });

  it("shows the server's Thai error when the save is rejected", async () => {
    mockFetch({
      "GET /api/competency/nurses": { body: { nurses: [nurseFixture()] } },
      "POST /api/competency/assessments": { status: 400, body: { error: "วันที่ประเมินไม่ถูกต้อง" } },
    });
    render(<AssessmentForm refreshKey={0} preselectNurseId="n1" onSaved={() => {}} />);
    await screen.findByLabelText(/^พยาบาล/);
    for (let c = 1; c <= 10; c++) pick(c, 2);
    fireEvent.click(screen.getByRole("button", { name: /บันทึกผลประเมิน/ }));
    await waitFor(() => expect(_getToasts().some((t) => t.message === "วันที่ประเมินไม่ถูกต้อง")).toBe(true));
  });
});

describe("AssessmentForm — edit", () => {
  it("prefills from the assessment, PATCHes the id, and reports wasEdit", async () => {
    const fetch = mockFetch({
      "GET /api/competency/nurses": { body: { nurses: [nurseFixture()] } },
      "PATCH /api/competency/assessments/a1": { body: { assessment: assessmentFixture({ totalScore: 70, level: 3 }) } },
    });
    let saved: [unknown, boolean] | null = null;
    render(
      <AssessmentForm
        refreshKey={0}
        editing={{ nurse: { id: "n1", fullName: "คุณจารุวรรณ พันธ์ยาง", nickname: "ตั๊ก" }, assessment: assessmentFixture() }}
        onSaved={(a, wasEdit) => {
          saved = [a, wasEdit];
        }}
      />
    );
    expect(screen.getByText(/กำลังแก้ไขผลประเมินของ/).textContent).toContain("20 ธ.ค. 2562");
    expect(screen.getByTestId("total-score").textContent).toBe("68");
    expect((screen.getByLabelText(/วันที่ประเมิน/) as HTMLInputElement).value).toBe("2019-12-20");
    expect((screen.getByLabelText("ผู้ประเมิน") as HTMLInputElement).value).toBe("หัวหน้าหน่วย");
    // the chosen rung is shown pressed
    expect(screen.getByRole("button", { name: /^เกณฑ์ 2 ระดับ 4:/ }).getAttribute("aria-pressed")).toBe("true");

    pick(5, 3); // 2 → 3 : +2
    expect(screen.getByTestId("total-score").textContent).toBe("70");
    fireEvent.click(screen.getByRole("button", { name: /บันทึกการแก้ไข/ }));
    await waitFor(() => expect(fetch.calls.some((c) => c.method === "PATCH")).toBe(true));
    const patch = fetch.calls.find((c) => c.method === "PATCH")!;
    expect(patch.path).toBe("/api/competency/assessments/a1");
    expect(patch.body.scores["5"]).toBe(3);
    await waitFor(() => expect(saved).not.toBeNull());
    expect(saved![1]).toBe(true);
  });
});
