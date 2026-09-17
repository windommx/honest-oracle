import { vi } from "vitest";

// Route-keyed fetch mock for the jsdom component tests: "METHOD /path" → response.
// Query strings are ignored for matching; the calls are recorded for assertions.

export interface RouteResponse {
  status?: number;
  body?: unknown;
}

export type RouteHandler = RouteResponse | ((init: RequestInit | undefined, url: URL) => RouteResponse);

/** A recorded request; `body` is the parsed JSON, loosely typed so assertions can index into it. */
export interface RecordedCall {
  method: string;
  path: string;
  body: any;
}

export interface FetchMock {
  fn: ReturnType<typeof vi.fn>;
  calls: RecordedCall[];
}

export function mockFetch(routes: Record<string, RouteHandler>): FetchMock {
  const calls: FetchMock["calls"] = [];
  const fn = vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://localhost");
    const method = (init?.method ?? "GET").toUpperCase();
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    calls.push({ method, path: url.pathname, body });
    const handler = routes[`${method} ${url.pathname}`];
    const res: RouteResponse = handler ? (typeof handler === "function" ? handler(init, url) : handler) : { status: 404, body: { error: `no mock for ${method} ${url.pathname}` } };
    const status = res.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => res.body ?? {},
    } as unknown as Response;
  });
  global.fetch = fn as unknown as typeof fetch;
  return { fn, calls };
}

export const FULL_SCORES = (point: number) => Object.fromEntries(Array.from({ length: 10 }, (_, i) => [String(i + 1), point]));

export const nurseFixture = (over: Record<string, unknown> = {}) => ({
  id: "n1",
  fullName: "คุณจารุวรรณ พันธ์ยาง",
  nickname: "ตั๊ก",
  position: "พยาบาลวิชาชีพ",
  mgmtLevel: null,
  createdAt: "2019-12-01T00:00:00.000Z",
  updatedAt: "2019-12-01T00:00:00.000Z",
  assessmentCount: 1,
  latest: assessmentFixture(),
  ...over,
});

export const assessmentFixture = (over: Record<string, unknown> = {}) => ({
  id: "a1",
  nurseId: "n1",
  assessDate: "2019-12-20T00:00:00.000Z",
  assessor: "หัวหน้าหน่วย",
  note: null,
  scores: { "1": 3, "2": 4, "3": 3, "4": 3, "5": 2, "6": 3, "7": 4, "8": 4, "9": 4, "10": 4 },
  totalScore: 68,
  level: 3,
  createdAt: "2019-12-20T00:00:00.000Z",
  updatedAt: "2019-12-20T00:00:00.000Z",
  ...over,
});

export const dashboardFixture = () => ({
  summary: {
    totalNurses: 2,
    assessedCount: 1,
    notAssessed: 1,
    totalAssessments: 1,
    averageScore: 68,
    competentRate: 100,
    competentCount: 1,
    managementCount: 0,
    latestAssessDate: "2019-12-20T00:00:00.000Z",
  },
  levelDistribution: [1, 2, 3, 4, 5].map((level) => ({ level, count: level === 3 ? 1 : 0 })),
  criteriaAverages: Array.from({ length: 10 }, (_, i) => ({
    criterionId: i + 1,
    name: `เกณฑ์ ${i + 1}`,
    shortName: `เกณฑ์${i + 1}`,
    average: 6,
    averagePoint: 3,
  })),
  weakestCriteria: [
    { criterionId: 5, name: "Skill การดูแลระบบน้ำ RO", shortName: "ระบบน้ำ RO", average: 4, averagePoint: 2 },
    { criterionId: 1, name: "วุฒิบัตร", shortName: "วุฒิบัตร", average: 6, averagePoint: 3 },
    { criterionId: 3, name: "Skill การแทงเส้น", shortName: "แทงเส้น", average: 6, averagePoint: 3 },
  ],
  ranking: [
    {
      nurseId: "n1",
      fullName: "คุณจารุวรรณ พันธ์ยาง",
      nickname: "ตั๊ก",
      position: "พยาบาลวิชาชีพ",
      mgmtLevel: null,
      assessmentCount: 1,
      latest: { id: "a1", assessDate: "2019-12-20T00:00:00.000Z", totalScore: 68, level: 3 },
    },
    { nurseId: "n2", fullName: "คุณใหม่ ยังไม่ประเมิน", nickname: null, position: "พยาบาลวิชาชีพ", mgmtLevel: 6, assessmentCount: 0, latest: null },
  ],
});
