"use client";

import { useEffect } from "react";

/**
 * Segment-level backstop.
 *
 * ViewErrorBoundary catches anything thrown inside a view. This catches what
 * it cannot: an error in the shell itself, or in a layout above it. Without
 * one, Next renders its own error page — which in development includes a stack
 * trace, and in production is an unstyled English page in the middle of a Thai
 * product.
 */
export default function StageLabError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(
      JSON.stringify({
        level: "error",
        module: "stagelab",
        where: "segment",
        digest: error.digest,
        message: error.message,
      }),
    );
  }, [error]);

  return (
    <main className="mx-auto max-w-lg px-4 py-24 text-center">
      <h1 className="text-lg font-semibold text-zinc-100">StageLab เปิดไม่สำเร็จ</h1>
      <p className="mt-2 text-sm leading-relaxed text-zinc-300">
        เกิดข้อผิดพลาดขณะโหลดหน้านี้ ข้อมูลที่บันทึกไว้ยังอยู่ครบ
        {error.digest && (
          <>
            {" "}
            รหัสอ้างอิง <span className="font-mono text-zinc-100">{error.digest}</span>
          </>
        )}
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <button
          onClick={reset}
          className="inline-flex min-h-11 items-center rounded-lg bg-emerald-500 px-4 text-sm font-medium text-zinc-950 hover:bg-emerald-400"
        >
          ลองอีกครั้ง
        </button>
        <a
          href="/stagelab"
          className="inline-flex min-h-11 items-center rounded-lg border border-zinc-700 px-4 text-sm text-zinc-200 hover:border-zinc-600"
        >
          กลับหน้าแรก
        </a>
      </div>
    </main>
  );
}
