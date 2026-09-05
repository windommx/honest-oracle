// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

const sessionFn = vi.fn();
vi.mock("next-auth", () => ({ getServerSession: (...a: unknown[]) => sessionFn(...a) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import LifemapLandingPage from "./page";

afterEach(() => { cleanup(); sessionFn.mockReset(); });

describe("LifemapLandingPage — public marketing page must survive a broken auth subsystem", () => {
  it("renders the logged-out view when getServerSession throws (e.g. NEXTAUTH_SECRET unset)", async () => {
    // Reproduced crash: this Server Component called getServerSession directly and let
    // it throw straight out, 500ing the entire public landing page over a personalization
    // detail (which nav link to show) — the same class of bug fixed for /bookisdom earlier,
    // never applied here since /oracle wasn't in that pass's scope.
    sessionFn.mockRejectedValue(new Error("There is a problem with the server configuration."));
    const el = await LifemapLandingPage();
    render(el);
    expect(screen.getByText("เข้าสู่ระบบ")).toBeTruthy();
    expect(screen.queryByText("เข้าใช้งาน")).toBeNull();
  });

  it("renders the logged-in view when a real session resolves", async () => {
    sessionFn.mockResolvedValue({ user: { id: "u1" } });
    const el = await LifemapLandingPage();
    render(el);
    expect(screen.getByText("เข้าใช้งาน")).toBeTruthy();
    expect(screen.queryByText("เข้าสู่ระบบ")).toBeNull();
  });
});
