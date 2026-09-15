// render.yaml is read by Render, never by this app, so nothing else would catch it
// drifting from reality (a renamed npm script, a secret hard-coded where it must be
// sync:false). This test parses the ACTUAL file and checks it against package.json,
// not a copy of either.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";

const doc = yaml.load(readFileSync(join(process.cwd(), "render.yaml"), "utf8")) as {
  databases: { name: string; plan?: string }[];
  services: {
    type: string; name: string; runtime: string; buildCommand: string; startCommand: string;
    preDeployCommand?: string; healthCheckPath?: string; branch?: string;
    envVars: Array<{ key: string; value?: string; sync?: boolean; generateValue?: boolean; fromDatabase?: { name: string; property: string } }>;
  }[];
};
const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as { scripts: Record<string, string> };
const web = doc.services.find((s) => s.type === "web")!;

describe("render.yaml — parses, and every command it names actually exists", () => {
  it("has exactly one database and one web service, wired to each other", () => {
    expect(doc.databases).toHaveLength(1);
    expect(doc.services).toHaveLength(1);
    const dbName = doc.databases[0].name;
    const dbEnv = web.envVars.find((e) => e.key === "DATABASE_URL");
    expect(dbEnv?.fromDatabase?.name).toBe(dbName);
    expect(dbEnv?.fromDatabase?.property).toBe("connectionString");
  });

  it("every npm script the blueprint invokes (build, db:rename, prisma db push) exists in package.json", () => {
    for (const line of [web.buildCommand, web.preDeployCommand ?? "", web.startCommand]) {
      for (const m of Array.from(line.matchAll(/npm run ([\w:-]+)/g))) {
        expect(pkg.scripts, `render.yaml runs "npm run ${m[1]}" — no such script in package.json`).toHaveProperty(m[1]);
      }
    }
    expect(pkg.scripts).toHaveProperty("db:rename");
    expect(pkg.scripts["db:rename"]).toContain("scripts/db-rename.ts");
  });

  it("startCommand binds to Render's assigned $PORT — `next start` alone ignores it", () => {
    expect(web.startCommand).toMatch(/next start .*\$PORT/);
  });

  it("the pre-deploy step runs the rename migration BEFORE db push, in that order", () => {
    const pd = web.preDeployCommand ?? "";
    expect(pd.indexOf("db:rename")).toBeGreaterThanOrEqual(0);
    expect(pd.indexOf("db:rename")).toBeLessThan(pd.indexOf("db push"));
  });

  it("secrets are never hard-coded: NEXTAUTH_SECRET is generated, NEXTAUTH_URL and every Stripe key are sync:false (dashboard-only), nothing sensitive carries a literal value", () => {
    const byKey = Object.fromEntries(web.envVars.map((e) => [e.key, e]));
    expect(byKey.NEXTAUTH_SECRET.generateValue).toBe(true);
    expect(byKey.NEXTAUTH_SECRET.value).toBeUndefined();
    for (const key of ["NEXTAUTH_URL", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_PRICE_ID_PRO"]) {
      expect(byKey[key]?.sync).toBe(false);
      expect(byKey[key]?.value).toBeUndefined();
    }
  });

  it("the health check path is a route that answers without a database or session", () => {
    // "/" is a "use client" landing page with no server-side session/DB call — see app/page.tsx.
    expect(web.healthCheckPath).toBe("/");
  });

  it("declares which branch it deploys — never silently 'whatever is default'", () => {
    expect(web.branch).toBeTruthy();
  });
});
