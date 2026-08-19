"use client";

// Segment error boundary for every /rush page. Without this, one thrown render
// error white-screens the whole tool with Next's default overlay — the writer
// loses their bearings and their unsaved-work anxiety spikes. This surface is
// honest about what we know (something crashed, local manuscripts are intact,
// a digest id exists for reporting) and offers the one real remedy: retry.
//
// NOTE: uses only palette hexes from _tokens.ts — the token guard test scans
// this directory and fails on any other literal. No engine imports (bundle
// discipline: an error page must be light and cannot itself risk crashing).

export default function RushError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="min-h-screen flex items-center justify-center px-6" style={{ background: "#0a0a0f" }}>
      <div className="max-w-md w-full text-center border border-white/10 rounded-2xl p-8 bg-[#12121a]">
        <p className="text-xs tracking-[0.2em] uppercase text-[#c9a84c] font-semibold mb-3">Rush · เกิดข้อผิดพลาด</p>
        <h1 className="text-lg font-semibold text-gray-100 mb-2">หน้านี้ทำงานผิดพลาด</h1>
        <p className="text-sm text-gray-400 leading-relaxed">
          ข้อผิดพลาดเกิดในหน้าจอ ไม่ใช่ในข้อมูลของคุณ — ต้นฉบับที่บันทึกไว้ในเครื่องยังอยู่ครบ
          กดลองใหม่ได้เลย ถ้ายังพังซ้ำ รีเฟรชทั้งหน้า
        </p>
        {error.digest && (
          <p className="text-[0.65rem] text-[#828a99] mt-3 font-mono">รหัสอ้างอิง: {error.digest}</p>
        )}
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            onClick={reset}
            className="px-5 py-2.5 rounded-xl bg-[#c9a84c] text-black text-sm font-semibold hover:bg-[#e6c86a] transition-colors"
          >
            ลองใหม่
          </button>
          <a href="/rush/dashboard" className="px-5 py-2.5 rounded-xl border border-white/10 text-sm text-gray-300 hover:bg-white/5 transition-colors">
            กลับแดชบอร์ด
          </a>
        </div>
      </div>
    </main>
  );
}
