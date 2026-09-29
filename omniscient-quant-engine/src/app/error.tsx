'use client';

import Link from 'next/link';
import { useEffect } from 'react';

/** ข้อผิดพลาดที่ไม่คาดคิดระหว่างแสดงผล — ไม่แสดงรายละเอียดภายใน (มีแค่ digest ให้ค้นใน log ของ server) */
export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main role="alert" className="flex min-h-screen items-center justify-center bg-zinc-950 px-4 text-zinc-200">
      <div className="max-w-md space-y-3 text-center">
        <h1 className="text-xl font-semibold text-zinc-50">เกิดข้อผิดพลาดที่ไม่คาดคิด</h1>
        <p className="text-sm text-zinc-300">หน้านี้แสดงผลไม่สำเร็จ ข้อมูลของคุณไม่ได้รับผลกระทบ — ลองใหม่อีกครั้ง ถ้ายังเกิดซ้ำให้แจ้งผู้ดูแลพร้อมรหัสด้านล่าง</p>
        {error.digest && <p className="font-mono text-xs text-zinc-400">รหัส: {error.digest}</p>}
        <div className="flex justify-center gap-2">
          <button type="button" onClick={reset} className="rounded-md border border-zinc-600 px-3 py-1.5 text-sm text-zinc-100 hover:bg-zinc-800">
            ลองอีกครั้ง
          </button>
          <Link href="/" className="rounded-md px-3 py-1.5 text-sm text-zinc-300 underline underline-offset-2 hover:text-zinc-100">
            กลับหน้าหลัก
          </Link>
        </div>
      </div>
    </main>
  );
}
