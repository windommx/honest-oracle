// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import AssessPage from "./assess/page";
import { INSTRUMENT_LIST } from "@/lib/therapy-engine/instruments";

afterEach(cleanup);
beforeEach(() => {
  window.localStorage.clear();
  // The flow syncs after the last answer. 401 is the signed-out path, which is
  // the state a first-time visitor is actually in.
  vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 401 })));
});

const TOTAL_ITEMS = INSTRUMENT_LIST.reduce((n, i) => n + i.items.length, 0);

/** Answer the item currently on screen with `value`, which auto-advances. */
function answer(value: number) {
  const buttons = screen.getAllByRole("button", { pressed: false }).filter((b) => b.textContent?.startsWith(String(value)));
  fireEvent.click(buttons[0]);
}

/** Walk the whole battery, answering `value` everywhere except the items named
 *  in `overrides` (1-based index across the concatenated battery). */
async function completeAll(value: number, overrides: Record<number, number> = {}) {
  for (let i = 1; i <= TOTAL_ITEMS; i++) answer(overrides[i] ?? value);
  await waitFor(() => expect(screen.getByText(/ผลประเมินของคุณ/)).toBeTruthy());
}

describe("the assessment flow", () => {
  it("opens on the first instrument's first item", () => {
    render(<AssessPage />);
    expect(screen.getByText(INSTRUMENT_LIST[0].items[0].th)).toBeTruthy();
    expect(screen.getByText(/ตอบแล้ว 0 \//)).toBeTruthy();
  });

  it("advances on tap and tracks progress across both instruments", () => {
    render(<AssessPage />);
    answer(0);
    expect(screen.getByText(new RegExp(`ตอบแล้ว 1 / ${TOTAL_ITEMS}`))).toBeTruthy();
    expect(screen.getByText(INSTRUMENT_LIST[0].items[1].th)).toBeTruthy();
  });

  it("moves to the second instrument after the first is finished", () => {
    render(<AssessPage />);
    for (let i = 0; i < INSTRUMENT_LIST[0].items.length; i++) answer(0);
    expect(screen.getByText(INSTRUMENT_LIST[1].items[0].th)).toBeTruthy();
    expect(screen.getByText(/ขั้นตอนที่ 2 จาก 2/)).toBeTruthy();
  });

  it("steps back into the previous instrument's last item", () => {
    render(<AssessPage />);
    for (let i = 0; i < INSTRUMENT_LIST[0].items.length; i++) answer(0);
    fireEvent.click(screen.getByText(/ย้อนกลับ/));
    const last = INSTRUMENT_LIST[0].items[INSTRUMENT_LIST[0].items.length - 1];
    expect(screen.getByText(last.th)).toBeTruthy();
  });

  it("disables Back on the very first item", () => {
    render(<AssessPage />);
    expect(screen.getByText(/ย้อนกลับ/).closest("button")!.hasAttribute("disabled")).toBe(true);
  });

  it("flags the Thai wording as our own translation while the user answers", () => {
    // Validation does not transfer across translations, and the caveat belongs
    // where the answering happens — not only in a footer.
    render(<AssessPage />);
    expect(screen.getByText(/เป็นคำแปลของเราเอง/)).toBeTruthy();
  });
});

describe("results", () => {
  it("scores an all-zero battery as minimal, with no crisis banner", async () => {
    render(<AssessPage />);
    await completeAll(0);
    expect(screen.getAllByText("0").length).toBeGreaterThan(0);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows the published cut-point caveat once a screen is positive", async () => {
    render(<AssessPage />);
    await completeAll(2); // GAD-7 = 14, PHQ-9 = 18 — both above the cut-point
    expect(screen.getAllByText(/การคัดกรองไม่ใช่การวินิจฉัย/).length).toBeGreaterThan(0);
  });

  it("raises the crisis banner from PHQ-9 item 9 alone", async () => {
    // Every other item answered 0; only the last item of the battery endorsed.
    render(<AssessPage />);
    await completeAll(0, { [TOTAL_ITEMS]: 1 });

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("ติดต่อขอความช่วยเหลือตอนนี้");
    expect(screen.getByText("1323")).toBeTruthy();
    // …and the plan leads with getting help rather than with a self-help task.
    expect(screen.getAllByText(/แอปนี้ให้บริการไม่ได้/).length).toBeGreaterThan(0);
  });

  it("ships the rules that produced the plan", async () => {
    render(<AssessPage />);
    await completeAll(0);
    expect(screen.getByText(/กฎที่ทำให้ได้แผนนี้/)).toBeTruthy();
    expect(screen.getByText(/ไม่ใช่การวินิจฉัย/)).toBeTruthy();
  });

  it("says where the answers were saved instead of a bare checkmark", async () => {
    // fetch returns 401 here, so the honest message is "this browser only".
    render(<AssessPage />);
    await completeAll(1);
    await waitFor(() => expect(screen.getByText(/เก็บไว้ในเบราว์เซอร์นี้/)).toBeTruthy());
  });

  it("writes the answers locally before the network call", async () => {
    render(<AssessPage />);
    await completeAll(1);
    const stored = JSON.parse(window.localStorage.getItem("mindbridge.assessments")!);
    expect(stored).toHaveLength(2);
    expect(stored[0].responses).toEqual(Array(INSTRUMENT_LIST[0].items.length).fill(1));
    // The total is not stored — it is re-derived from the answers on read.
    expect(stored[0]).not.toHaveProperty("total");
  });

  it("restarts to a blank battery", async () => {
    render(<AssessPage />);
    await completeAll(3);
    fireEvent.click(screen.getByText(/ทำแบบประเมินอีกครั้ง/));
    expect(screen.getByText(new RegExp(`ตอบแล้ว 0 / ${TOTAL_ITEMS}`))).toBeTruthy();
  });
});
