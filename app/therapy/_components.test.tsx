// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { CitationLine, CrisisBanner, Disclaimer, GradeBadge, SeverityScale } from "./_components";
import { assessSafety } from "@/lib/therapy-engine/safety";
import { bandFor, score } from "@/lib/therapy-engine/scoring";

afterEach(cleanup);

const phq9 = (...r: number[]) => score("phq9", r);
const gad7 = (...r: number[]) => score("gad7", r);

describe("CrisisBanner", () => {
  it("renders nothing when no rule fired", () => {
    const { container } = render(<CrisisBanner safety={assessSafety([gad7(0, 0, 0, 0, 0, 0, 0)])} />);
    expect(container.firstChild).toBeNull();
  });

  it("shows dialable hotlines when item 9 is endorsed at a minimal total", () => {
    // The whole point of the safety design, checked at the render layer: a score
    // of 1/27 still surfaces the phone numbers.
    const safety = assessSafety([phq9(0, 0, 0, 0, 0, 0, 0, 0, 1)]);
    render(<CrisisBanner safety={safety} />);

    const line = screen.getByText("1323");
    expect(line.getAttribute("href")).toBe("tel:1323");
    expect(screen.getByText(/ติดต่อขอความช่วยเหลือตอนนี้/)).toBeTruthy();
  });

  it("strips the dash from a number before dialling it", () => {
    render(<CrisisBanner safety={assessSafety([phq9(0, 0, 0, 0, 0, 0, 0, 0, 1)])} />);
    expect(screen.getByText("02-113-6789").getAttribute("href")).toBe("tel:021136789");
  });

  it("announces itself — it appears after a submit, not on first paint", () => {
    // Without a live region a screen-reader user discovers the most important
    // element on the page by accident, further down.
    const { container } = render(<CrisisBanner safety={assessSafety([phq9(0, 0, 0, 0, 0, 0, 0, 0, 2)])} />);
    const alert = container.querySelector('[role="alert"]');
    expect(alert).toBeTruthy();
    expect(alert!.getAttribute("aria-live")).toBe("assertive");
  });

  it("names the rule that fired", () => {
    render(<CrisisBanner safety={assessSafety([phq9(0, 0, 0, 0, 0, 0, 0, 0, 1)])} />);
    expect(screen.getByText(/ข้อ 9/)).toBeTruthy();
  });

  it("carries the never-says-you-are-safe caveat", () => {
    render(<CrisisBanner safety={assessSafety([gad7(2, 2, 2, 2, 2, 0, 0)])} />);
    expect(screen.getByText(/ไม่ได้แปลว่าปลอดภัย/)).toBeTruthy();
  });

  it("renders at the lower 'advised' level too, with a softer heading", () => {
    render(<CrisisBanner safety={assessSafety([gad7(2, 2, 2, 2, 2, 0, 0)])} />);
    expect(screen.getByRole("heading", { name: /แนะนำให้ปรึกษาผู้ให้บริการสุขภาพ/ })).toBeTruthy();
    // Not the crisis wording — the level below crisis must not shout.
    expect(screen.queryByText(/ติดต่อขอความช่วยเหลือตอนนี้/)).toBeNull();
  });
});

describe("GradeBadge", () => {
  it("gives a screen reader the grade in words, not just stars", () => {
    render(<GradeBadge grade="strong" />);
    expect(screen.getByText(/ระดับหลักฐาน: หลักฐานแข็งแรง \(5 จาก 5\)/)).toBeTruthy();
  });

  it("renders fewer filled stars for a weaker grade", () => {
    render(<GradeBadge grade="emerging" />);
    expect(screen.getByText(/\(2 จาก 5\)/)).toBeTruthy();
  });
});

describe("SeverityScale", () => {
  it("labels every segment with the published score range that opens it", () => {
    // The meter shows the actual cut-points rather than an abstract gradient, so
    // a reader can see where the boundaries are and check them.
    render(<SeverityScale instrument="gad7" band={bandFor("gad7", 12)} />);
    expect(screen.getByText("0–4")).toBeTruthy();
    expect(screen.getByText("10–14")).toBeTruthy();
    expect(screen.getByText("15–21")).toBeTruthy();
  });

  it("renders one more segment for PHQ-9, which has five bands", () => {
    render(<SeverityScale instrument="phq9" band={bandFor("phq9", 22)} />);
    expect(screen.getByText("15–19")).toBeTruthy();
    expect(screen.getByText("20–27")).toBeTruthy();
  });
});

describe("CitationLine", () => {
  it("renders authors, year, title and venue so the source can be looked up", () => {
    render(
      <ul>
        <CitationLine
          c={{
            authors: "Bradt J, Dileo C",
            year: 2021,
            title: "Music interventions",
            venue: "Cochrane Database Syst Rev",
            pooled: { trials: 81, participants: 5576 },
            effect: { metric: "mean difference (STAI)", value: -7.73, unit: "STAI units" },
          }}
        />
      </ul>
    );
    expect(screen.getByText(/Bradt J, Dileo C \(2021\)/)).toBeTruthy();
    expect(screen.getByText(/Cochrane Database Syst Rev/)).toBeTruthy();
    expect(screen.getByText(/81 trials · 5,576 participants/)).toBeTruthy();
  });

  it("shows the metric beside the number — never a bare effect size", () => {
    render(
      <ul>
        <CitationLine
          c={{ authors: "X", year: 2020, title: "T", venue: "V", effect: { metric: "Hedges' g", value: 0.73 } }}
        />
      </ul>
    );
    expect(screen.getByText(/Hedges' g: 0.73/)).toBeTruthy();
  });

  it("renders a citation with no effect at all, rather than inventing one", () => {
    render(<ul><CitationLine c={{ authors: "X", year: 2020, title: "T", venue: "V", effect: null }} /></ul>);
    expect(screen.getByText(/X \(2020\)/)).toBeTruthy();
  });
});

describe("Disclaimer", () => {
  it("renders its text", () => {
    render(<Disclaimer>ไม่ใช่การวินิจฉัย</Disclaimer>);
    expect(screen.getByText("ไม่ใช่การวินิจฉัย")).toBeTruthy();
  });
});
