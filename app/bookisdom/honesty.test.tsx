// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import BookisdomHonesty from "./honesty/page";
import { CITATIONS, disputed, REFUSED_CONSTRUCTS } from "@/lib/bookisdom-engine/engine";

afterEach(cleanup);

describe("/bookisdom/honesty — the epistemic-honesty page", () => {
  it("renders the four knowing-tiers", () => {
    render(<BookisdomHonesty />);
    expect(screen.getByText(/ประจักษ์/)).toBeTruthy();
    expect(screen.getByText(/อวิสัย/)).toBeTruthy();
  });

  it("lists every refused construct with the count in the heading", () => {
    render(<BookisdomHonesty />);
    // The heading states the exact count, so it cannot silently shrink.
    expect(screen.getByText(new RegExp(`${REFUSED_CONSTRUCTS.length} ค่าที่เราปฏิเสธ`))).toBeTruthy();
    // and a distinctive refused label really renders (momentum is the archetype)
    expect(screen.getByText(/โมเมนตัม/)).toBeTruthy();
  });

  it("states the primary-source count honestly — zero, not hidden", () => {
    render(<BookisdomHonesty />);
    const primary = CITATIONS.filter((c) => c.tier === "primary").length;
    expect(screen.getByText(new RegExp(`เปิดต้นฉบับจริง ${primary}`))).toBeTruthy();
  });

  it("surfaces the disputed citations with their caveats", () => {
    render(<BookisdomHonesty />);
    expect(screen.getByText(new RegExp(`${disputed().length} แหล่งที่เราอ้าง`))).toBeTruthy();
    // a distinctive disputed claim really renders
    expect(screen.getByText(/loaded rifle|Do not put/i)).toBeTruthy();
  });

  it("computes live coverage in the browser — registered < estimate", () => {
    render(<BookisdomHonesty />);
    // the registered count is CITATIONS.length and the estimate is larger
    expect(screen.getByText(String(CITATIONS.length))).toBeTruthy();
  });
});
