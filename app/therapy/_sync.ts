// Sync helpers. Each returns WHERE THE DATA ACTUALLY WENT rather than a boolean,
// because "บันทึกแล้ว" is a claim the UI should only make about a place it can
// name. A signed-out user's answers stay in this browser, and the page says so
// instead of showing a reassuring checkmark that means nothing.

export type SyncOutcome = "synced" | "local-only" | "failed";

async function post(url: string, body: unknown): Promise<SyncOutcome> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    // 401 is the ordinary signed-out path, not an error to shout about.
    if (res.status === 401) return "local-only";
    return res.ok ? "synced" : "failed";
  } catch {
    // Offline, or the request was blocked. The local write already happened.
    return "failed";
  }
}

export const syncAssessment = (body: { instrument: string; responses: number[] }) =>
  post("/api/therapy/assessments", body);

export const syncSession = (body: {
  kind: "music" | "breath";
  plannedMin: number;
  completedMin: number;
  startBpm?: number;
  targetBpm?: number;
  breathPattern?: string;
}) => post("/api/therapy/sessions", body);

export const syncNight = (body: {
  date: string;
  timeInBedMin: number;
  sleepLatencyMin: number;
  wakeAfterSleepOnsetMin: number;
  terminalWakefulnessMin: number;
  awakenings: number;
}) => post("/api/therapy/sleep", body);

/** One sentence naming where the data is now. Never "saved" without a place. */
export function outcomeMessage(outcome: SyncOutcome): string {
  switch (outcome) {
    case "synced":
      return "บันทึกในบัญชีของคุณแล้ว";
    case "local-only":
      return "เก็บไว้ในเบราว์เซอร์นี้ (ยังไม่ได้เข้าสู่ระบบ) — ล้างข้อมูลเบราว์เซอร์แล้วจะหาย";
    case "failed":
      return "ซิงก์ขึ้นเซิร์ฟเวอร์ไม่สำเร็จ — ข้อมูลยังอยู่ในเบราว์เซอร์นี้";
  }
}
