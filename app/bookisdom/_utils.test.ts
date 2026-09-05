import { describe, it, expect } from "vitest";
import { titleCase, slug } from "./_utils";

describe("titleCase", () => {
  it("title-cases snake_case", () => {
    expect(titleCase("self_help")).toBe("Self Help");
    expect(titleCase("thai_cuisine")).toBe("Thai Cuisine");
  });
});

describe("slug", () => {
  it("slugifies a title and strips unsafe chars", () => {
    expect(slug("The Deep Work Method")).toBe("the-deep-work-method");
  });
  it("falls back to 'book' for empty/symbol-only input", () => {
    expect(slug("")).toBe("book");
    expect(slug("!!!")).toBe("book");
  });
  it("keeps Thai titles (does not blank them)", () => {
    expect(slug("เงาในสายหมอก").length).toBeGreaterThan(0);
  });
});
