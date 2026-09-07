// Writer Room ↔ account sync client. Opt-in and explicit: nothing moves until the writer
// presses push or pull. Every outcome is a typed result the UI can say in words —
// including "you are not logged in" and "the server is not configured".
import { exportBundle, installBundleKeepingIds, parseBundle } from "./_writing-store";

export type SyncResult =
  | { ok: true; updatedAt: string; bytes: number; replaced?: boolean }
  | { ok: false; kind: "login" | "server" | "limit" | "invalid" | "notfound" | "network"; message: string };

export interface RemoteBook { bookId: string; title: string; bytes: number; updatedAt: string }

async function classify(res: Response): Promise<SyncResult & { ok: false }> {
  const j = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
  if (res.status === 401) return { ok: false, kind: "login", message: "ต้องเข้าสู่ระบบก่อนจึงจะซิงก์กับบัญชีได้" };
  if (res.status === 503) return { ok: false, kind: "server", message: j.error ?? "เซิร์ฟเวอร์ยังตั้งค่าไม่เสร็จ" };
  if (res.status === 403) return { ok: false, kind: "limit", message: j.error ?? "ถึงขีดจำกัด" };
  if (res.status === 404) return { ok: false, kind: "notfound", message: "ยังไม่มีเล่มนี้บนบัญชี" };
  return { ok: false, kind: "invalid", message: j.error ?? `ผิดพลาด (${res.status})` };
}

export async function listRemote(fetchImpl: typeof fetch = fetch): Promise<{ ok: true; books: RemoteBook[] } | (SyncResult & { ok: false })> {
  let res: Response;
  try { res = await fetchImpl("/api/bookisdom/writing"); } catch { return { ok: false, kind: "network", message: "เครือข่ายมีปัญหา" }; }
  if (!res.ok) return classify(res);
  const j = (await res.json()) as { books: RemoteBook[] };
  return { ok: true, books: j.books };
}

/** Local → account. The bundle is what exportBundle makes; the server re-validates it. */
export async function pushBook(bookId: string, fetchImpl: typeof fetch = fetch): Promise<SyncResult> {
  const bundle = await exportBundle([bookId]);
  if (!bundle.books.length) return { ok: false, kind: "notfound", message: "ไม่พบเล่มในเครื่อง" };
  let res: Response;
  try {
    res = await fetchImpl(`/api/bookisdom/writing/${encodeURIComponent(bookId)}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bundle }) });
  } catch { return { ok: false, kind: "network", message: "เครือข่ายมีปัญหา" }; }
  if (!res.ok) return classify(res);
  const j = (await res.json()) as { updatedAt: string; bytes: number };
  return { ok: true, updatedAt: j.updatedAt, bytes: j.bytes };
}

/** Account → local, ids intact, after a safety copy of the local state. */
export async function pullBook(bookId: string, fetchImpl: typeof fetch = fetch): Promise<SyncResult> {
  let res: Response;
  try { res = await fetchImpl(`/api/bookisdom/writing/${encodeURIComponent(bookId)}`); } catch { return { ok: false, kind: "network", message: "เครือข่ายมีปัญหา" }; }
  if (!res.ok) return classify(res);
  const j = (await res.json()) as { bundle: unknown; updatedAt: string; bytes: number };
  const check = parseBundle(JSON.stringify(j.bundle));
  if (!check.ok) return { ok: false, kind: "invalid", message: `ข้อมูลบนบัญชีอ่านไม่ได้: ${check.reason}` };
  if (check.bundle.books[0]?.id !== bookId) return { ok: false, kind: "invalid", message: "id ของเล่มบนบัญชีไม่ตรง" };
  const r = await installBundleKeepingIds(check.bundle);
  return { ok: true, updatedAt: j.updatedAt, bytes: j.bytes, replaced: r.replaced };
}

export async function deleteRemote(bookId: string, fetchImpl: typeof fetch = fetch): Promise<SyncResult> {
  let res: Response;
  try { res = await fetchImpl(`/api/bookisdom/writing/${encodeURIComponent(bookId)}`, { method: "DELETE" }); } catch { return { ok: false, kind: "network", message: "เครือข่ายมีปัญหา" }; }
  if (!res.ok) return classify(res);
  return { ok: true, updatedAt: "", bytes: 0 };
}
