// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import DividendPage from "./page";

afterEach(cleanup);

describe("/dividend", () => {
  it("starts empty, loads the demo universe, screens it, and shows counts + portfolio + reasons", () => {
    render(<DividendPage />);
    expect(screen.getByText(/ยังไม่มีผล/)).toBeTruthy();

    fireEvent.click(screen.getByText("โหลดชุดสาธิต"));
    expect(screen.getByText(/ชุดสาธิตสังเคราะห์/)).toBeTruthy();

    fireEvent.click(screen.getByText(/Screen \+ stability gate/));
    expect(screen.getByText("บริษัท").previousSibling?.textContent).toBe("30");
    expect(screen.getByText(/^พอร์ต — \d+ ชื่อ/)).toBeTruthy();
    expect(screen.getByText(/เรียงตาม:/)).toBeTruthy();
    // every ticker row is rendered, and the verdict column only uses the four finals
    const finals = screen.getAllByTitle(/^(sustain|watch|at-risk|avisaya) — /);
    expect(finals.length).toBe(30);
    // no fake 0–100 score anywhere
    expect(screen.queryByText(/\/100/)).toBeNull();
  });

  it("rejects a malformed paste with a named error and keeps the run button disabled", () => {
    render(<DividendPage />);
    fireEvent.change(screen.getByLabelText("วางข้อมูล CSV หรือ JSON"), { target: { value: "ticker,fiscalYear\nA,2020" } });
    expect(screen.getByText(/missing required columns/)).toBeTruthy();
    const btn = screen.getByText(/Screen \+ stability gate/).closest("button")!;
    expect(btn.disabled).toBe(true);
  });

  it("runs the validation harness on the demo and reports adequacy honestly", () => {
    render(<DividendPage />);
    fireEvent.click(screen.getByText("โหลดชุดสาธิต"));
    fireEvent.click(screen.getByText(/Validation harness/));
    expect(screen.getByText(/^Validation harness — \d+ cases/)).toBeTruthy();
    expect(screen.getByText("verdict(at-risk)")).toBeTruthy();
    expect(screen.getByText("verdict(at-risk|watch)")).toBeTruthy();
    expect(screen.getAllByText(/never-cut/).length).toBe(2);
  });
});
