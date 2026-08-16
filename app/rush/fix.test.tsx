// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import RushFix from "./fix/page";
import { route } from "@/lib/rush-engine/engine";

afterEach(cleanup);

/** Type into the symptom box. The component is controlled, so one change event is
 *  the whole interaction — no need for a keystroke-simulating dependency. */
function typeSymptom(text: string) {
  fireEvent.change(screen.getByLabelText("อาการที่เจอ"), { target: { value: text } });
}

describe("/rush/fix — symptom router page", () => {
  it("renders the search box and sample symptoms before any input", () => {
    render(<RushFix />);
    expect(screen.getByLabelText("อาการที่เจอ")).toBeTruthy();
    expect(screen.getByText(/หรือกดอาการที่ใกล้เคียง/)).toBeTruthy();
  });

  it("routes a typed Thai symptom to the module and shows the matched keywords", () => {
    render(<RushFix />);
    typeSymptom("จบบทแล้ววางได้");
    expect(screen.getByText("HOOK_CRAFT")).toBeTruthy();
    expect(screen.getByText(/คำที่ทำให้เข้าขั้นนี้/)).toBeTruthy();
    // the audit trail is on screen, not just in the data
    expect(screen.getByText(/“จบบท”/)).toBeTruthy();
  });

  it("shows R0 and refuses to guess when nothing matches", () => {
    render(<RushFix />);
    typeSymptom("วันนี้ฝนตก");
    expect(screen.getByText(/ไม่พบขั้นที่ตรง/)).toBeTruthy();
    expect(screen.queryByText(/เปิดตัวนี้ก่อน/)).toBeNull();
  });

  it("surfaces prerequisites when the route has one", () => {
    render(<RushFix />);
    typeSymptom("พระเอกไม่เปลี่ยนเลย");
    expect(screen.getByText("ต้องมีก่อน")).toBeTruthy();
    expect(screen.getByText(/STRUCTURE/)).toBeTruthy();
  });

  it("discloses competing rungs instead of hiding them", () => {
    render(<RushFix />);
    typeSymptom("บทมันแบน แล้วก็รู้ว่า ai เขียน");
    expect(screen.getByText("ขั้นอื่นที่ก็เข้าเงื่อนไขด้วย")).toBeTruthy();
    expect(screen.getByText("ANTI_SLOP")).toBeTruthy();
  });

  it("every sample chip routes — no chip can land the user on R0", () => {
    // Regression: chips used to be built from the first " / " segment of a rung label,
    // which the ladder never guaranteed would match. Tightening one keyword silently
    // turned a chip into a dead end. Chips now carry the whole label, and this asserts
    // that for ALL of them, not just the one that broke.
    render(<RushFix />);
    const chips = screen.getAllByRole("button");
    expect(chips.length).toBeGreaterThan(0);
    for (const chip of chips) {
      expect(route(chip.textContent ?? "").primary, `chip "${chip.textContent}" routes to R0`).not.toBeNull();
    }
  });

  it("clicking a sample chip fills the box and routes", () => {
    render(<RushFix />);
    fireEvent.click(screen.getByRole("button", { name: /ไอเดียซ้ำเดิม/ }));
    expect(screen.getByText("BRAINSTORM")).toBeTruthy();
  });

  it("states its own partial coverage rather than implying it covers everything", () => {
    render(<RushFix />);
    expect(screen.getByText(/ครอบคลุมไม่ครบ/)).toBeTruthy();
  });
});
