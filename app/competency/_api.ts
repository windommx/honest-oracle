import type { AssessmentDTO, DashboardDTO, NurseDetailDTO, NurseDTO } from "@/lib/competency/types";
import type { Scores } from "@/lib/competency/scoring";

// ╔══════════════════════════════════════════════════════════════════╗
// ║  API CLIENT — one thin fetch wrapper so every component gets the   ║
// ║  same three behaviours: no-store (the roster changes under you),  ║
// ║  a typed result, and an ApiError whose message is the server's    ║
// ║  Thai `error` string (already user-facing) with the status kept   ║
// ║  for the 401 → "log in again" branch.                              ║
// ╚══════════════════════════════════════════════════════════════════╝

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

const BASE = "/api/competency";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { cache: "no-store", ...init });
  } catch {
    throw new ApiError(0, "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ — ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่");
  }
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      res.status === 401
        ? "หมดเวลาเข้าสู่ระบบ — กรุณาเข้าสู่ระบบใหม่"
        : (body && typeof body === "object" && typeof (body as { error?: unknown }).error === "string"
            ? (body as { error: string }).error
            : `เกิดข้อผิดพลาด (${res.status})`);
    throw new ApiError(res.status, message);
  }
  return body as T;
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export interface NurseInput {
  fullName: string;
  nickname?: string | null;
  position?: string | null;
  mgmtLevel?: 6 | 7 | null;
}

export interface AssessmentInput {
  nurseId?: string;
  nurse?: NurseInput;
  scores: Scores;
  /** "YYYY-MM-DD" */
  assessDate?: string;
  assessor?: string | null;
  note?: string | null;
}

export const api = {
  nurses: {
    list: () => request<{ nurses: NurseDTO[] }>("/nurses").then((r) => r.nurses),
    get: (id: string) => request<{ nurse: NurseDetailDTO }>(`/nurses/${id}`).then((r) => r.nurse),
    create: (input: NurseInput) => request<{ nurse: NurseDTO }>("/nurses", json("POST", input)).then((r) => r.nurse),
    update: (id: string, input: Partial<NurseInput>) =>
      request<{ nurse: NurseDetailDTO }>(`/nurses/${id}`, json("PATCH", input)).then((r) => r.nurse),
    remove: (id: string) => request<{ ok: true; deletedAssessments: number }>(`/nurses/${id}`, { method: "DELETE" }),
  },
  assessments: {
    list: (nurseId?: string) =>
      request<{ assessments: AssessmentDTO[] }>(nurseId ? `/assessments?nurseId=${encodeURIComponent(nurseId)}` : "/assessments").then(
        (r) => r.assessments
      ),
    create: (input: AssessmentInput) =>
      request<{ assessment: AssessmentDTO }>("/assessments", json("POST", input)).then((r) => r.assessment),
    update: (id: string, input: Partial<Omit<AssessmentInput, "nurseId" | "nurse">>) =>
      request<{ assessment: AssessmentDTO }>(`/assessments/${id}`, json("PATCH", input)).then((r) => r.assessment),
    remove: (id: string) => request<{ ok: true }>(`/assessments/${id}`, { method: "DELETE" }),
  },
  dashboard: () => request<DashboardDTO>("/dashboard"),
  importSample: () => request<{ imported: number }>("/sample", { method: "POST" }),
  /** Plain link — the browser downloads the attachment itself. */
  exportUrl: `${BASE}/export`,
};

export const errorMessage = (e: unknown, fallback = "เกิดข้อผิดพลาด"): string =>
  e instanceof Error && e.message ? e.message : fallback;
