// ============================================================
// กติกา path ของ SQLite ใน DATABASE_URL — ใช้ร่วมกันระหว่าง Prisma client ของแอป (src/lib/db.ts) และสคริปต์ ops
// pure (node:path เท่านั้น) · ไม่แตะไฟล์
// ============================================================

import path from 'node:path';

/**
 * path ไฟล์ SQLite จาก DATABASE_URL ตามกติกาของ Prisma: path สัมพัทธ์นับจากโฟลเดอร์ของ schema.prisma
 * (file:../db/custom.db → <app>/db/custom.db) · ตัด query string และ quote ที่ติดมาจาก .env · รองรับ file:///abs · ไม่ใช่ file: → null
 */
export function resolveSqliteFile(url: string | undefined, schemaDir: string): string | null {
  const u = (url ?? '').trim().replace(/^["']|["']$/g, '');
  if (!u.startsWith('file:')) return null;
  let p = u.slice('file:'.length);
  const q = p.indexOf('?');
  if (q >= 0) p = p.slice(0, q);
  if (p.startsWith('//')) p = p.slice(2); // file:///abs/path
  if (!p) return null;
  return path.isAbsolute(p) ? path.normalize(p) : path.resolve(schemaDir, p);
}

/** รากของโปรเจกต์เมื่อรันจาก standalone build (server.js chdir ไป <ราก>/.next/standalone) · ไม่ใช่ standalone → null */
export function standaloneProjectRoot(cwd: string): string | null {
  const m = cwd.match(/^(.*?)[\\/]\.next[\\/]standalone(?:[\\/]|$)/);
  return m ? m[1] : null;
}

/**
 * DATABASE_URL สำหรับ Prisma client ขณะรัน
 * - dev / สคริปต์ / test: คืนค่าเดิม — Prisma หาโฟลเดอร์ prisma/ เองได้ถูกต้อง
 * - standalone (bun run start): client ถูกคัดลอกเข้า .next/standalone จึงตีความ path สัมพัทธ์ผิดที่
 *   ("Unable to open the database file") → แปลงเป็น absolute เทียบ <ราก>/prisma/ ให้ใช้ .env เดียวกันได้ทุกโหมด
 */
export function runtimeDatabaseUrl(url: string | undefined, cwd: string = process.cwd()): string | undefined {
  const root = standaloneProjectRoot(cwd);
  if (!root || !url) return url;
  const u = url.trim().replace(/^["']|["']$/g, '');
  if (!u.startsWith('file:')) return url;
  if (path.isAbsolute(u.slice('file:'.length).split('?')[0])) return url;
  const file = resolveSqliteFile(u, path.join(root, 'prisma'));
  if (!file) return url;
  const q = u.indexOf('?');
  return `file:${file}${q >= 0 ? u.slice(q) : ''}`;
}
