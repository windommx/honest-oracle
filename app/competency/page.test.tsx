// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { email: "head@hd.unit" } }, status: "authenticated" }),
  signOut: vi.fn(),
}));

import CompetencyPage from "./page";
import { dashboardFixture, mockFetch, nurseFixture } from "./_test-helpers";

afterEach(cleanup);

describe("/competency page shell", () => {
  it("has three real tabs and switches panels; the nav carries the account and the CSV export", async () => {
    mockFetch({
      "GET /api/competency/dashboard": { body: dashboardFixture() },
      "GET /api/competency/nurses": { body: { nurses: [nurseFixture()] } },
    });
    render(<CompetencyPage />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(3);
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");
    expect(await screen.findByText("พยาบาลทั้งหมด")).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: /บันทึกการประเมิน/ }));
    expect(screen.getByRole("tab", { name: /บันทึกการประเมิน/ }).getAttribute("aria-selected")).toBe("true");
    expect(await screen.findByText("แบบประเมิน 10 เกณฑ์")).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: /รายชื่อพยาบาล/ }));
    expect(await screen.findByText("รายชื่อพยาบาลหน่วยไตเทียม")).toBeTruthy();

    expect(screen.getByText("head@hd.unit")).toBeTruthy();
    expect(screen.getByRole("link", { name: /ส่งออก CSV/ }).getAttribute("href")).toBe("/api/competency/export");
  });

  it("'ประเมิน' from the overview lands on the form with that nurse pre-selected", async () => {
    mockFetch({
      "GET /api/competency/dashboard": { body: dashboardFixture() },
      "GET /api/competency/nurses": { body: { nurses: [nurseFixture()] } },
    });
    render(<CompetencyPage />);
    await screen.findByText("พยาบาลทั้งหมด");
    fireEvent.click(screen.getAllByRole("button", { name: "ประเมิน" })[0]);
    const select = (await screen.findByLabelText(/^พยาบาล/)) as HTMLSelectElement;
    await screen.findByRole("option", { name: /คุณจารุวรรณ/ });
    expect(select.value).toBe("n1");
  });
});
