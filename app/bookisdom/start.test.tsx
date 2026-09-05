// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import BookisdomStart from "./start/page";
import { BOOTSTRAPS, BOOK_TYPES } from "@/lib/bookisdom-engine/engine";

afterEach(cleanup);

const presetLinks = () =>
  Array.from(document.querySelectorAll("a[href^='/bookisdom?']")).filter((a) =>
    (a.getAttribute("href") ?? "").includes("type=")
  );

describe("start wizard preset gallery", () => {
  it("shows every bootstrap as a deep-link card", () => {
    render(<BookisdomStart />);
    expect(presetLinks()).toHaveLength(BOOTSTRAPS.length);
    // a known preset renders name + honest tagline
    expect(screen.getByText("นิยายรักรายตอน")).toBeTruthy();
  });

  it("filters the gallery by book type via the chips", () => {
    render(<BookisdomStart />);
    const kidsCount = BOOTSTRAPS.filter((b) => b.type === "kids").length;
    fireEvent.click(screen.getByText(new RegExp(`${BOOK_TYPES.kids.label} \\(${kidsCount}\\)`)));
    expect(presetLinks()).toHaveLength(kidsCount);
    expect(screen.getByText("นิทานก่อนนอน")).toBeTruthy();
    // back to all
    fireEvent.click(screen.getByText(new RegExp(`ทั้งหมด \\(${BOOTSTRAPS.length}\\)`)));
    expect(presetLinks()).toHaveLength(BOOTSTRAPS.length);
  });
});
