import { describe, it, expect } from "vitest";
import { inspectEnv } from "./env";

const VALID = {
  DATABASE_URL: "postgresql://user:pw@host:5432/db?schema=public",
  NEXTAUTH_SECRET: "a".repeat(44),
  NEXTAUTH_URL: "https://example.com",
};

describe("environment inspection", () => {
  it("passes a complete configuration with nothing to say", () => {
    const report = inspectEnv(VALID);
    expect(report.ok).toBe(true);
    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual([]);
  });

  it("names every problem, not just the first", () => {
    // The old message was nine identical words whatever was wrong. An operator
    // watching a deploy fail needs to know which variable.
    const report = inspectEnv({});
    expect(report.ok).toBe(false);
    expect(report.errors.length).toBeGreaterThanOrEqual(3);
    const joined = report.errors.join("\n");
    expect(joined).toContain("DATABASE_URL");
    expect(joined).toContain("NEXTAUTH_SECRET");
    expect(joined).toContain("NEXTAUTH_URL");
  });

  it("rejects a database URL that is not Postgres", () => {
    const report = inspectEnv({ ...VALID, DATABASE_URL: "mysql://host/db" });
    expect(report.ok).toBe(false);
    expect(report.errors.join()).toContain("postgres");
  });

  it("rejects a NEXTAUTH_URL that is not absolute", () => {
    expect(inspectEnv({ ...VALID, NEXTAUTH_URL: "/stagelab" }).ok).toBe(false);
  });

  it("warns about a weak secret without refusing to boot", () => {
    // Failing here would take a running deployment down at upgrade time over
    // something that was already true yesterday.
    const report = inspectEnv({ ...VALID, NEXTAUTH_SECRET: "short" });
    expect(report.ok).toBe(true);
    expect(report.warnings.join()).toContain("NEXTAUTH_SECRET");
    expect(report.warnings.join()).toContain("openssl rand");
  });

  it("warns about half-configured billing", () => {
    // Checkout 501s while the webhook accepts nothing, and the first symptom
    // is a customer who paid and did not get their plan.
    const report = inspectEnv({ ...VALID, STRIPE_SECRET_KEY: "sk_test_x" });
    expect(report.ok).toBe(true);
    expect(report.warnings.join()).toContain("STRIPE_WEBHOOK_SECRET");
    expect(report.warnings.join()).toContain("STRIPE_PRICE_ID_PRO");
  });

  it("says nothing about billing when it is fully configured or fully absent", () => {
    expect(inspectEnv(VALID).warnings).toEqual([]);
    const full = inspectEnv({
      ...VALID,
      STRIPE_SECRET_KEY: "sk",
      STRIPE_WEBHOOK_SECRET: "whsec",
      STRIPE_PRICE_ID_PRO: "price",
    });
    expect(full.warnings).toEqual([]);
  });

  it("warns about http in production, where cookies cannot be Secure", () => {
    const report = inspectEnv({
      ...VALID,
      NODE_ENV: "production",
      NEXTAUTH_URL: "http://example.com",
    });
    expect(report.warnings.join()).toContain("https");
  });

  it("does not warn about http outside production", () => {
    const report = inspectEnv({ ...VALID, NEXTAUTH_URL: "http://localhost:3000" });
    expect(report.warnings).toEqual([]);
  });
});
