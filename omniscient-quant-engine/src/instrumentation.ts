// ============================================================
// Next.js instrumentation — เรียกครั้งเดียวตอนเซิร์ฟเวอร์เริ่ม (next start / standalone / next dev)
// อุ่น cache งานหนัก (panel, backtest, board, factors, dependence) แบบไม่บล็อกการเปิดพอร์ต
// ปิดด้วย OQE_WARM_CACHE=0 · ไม่ทำงานตอน next build
// ============================================================

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.NEXT_PHASE === 'phase-production-build') return;
  const { warmCaches, warmDisabled } = await import('./lib/quant/engine/warmup');
  if (warmDisabled()) return;
  // ไม่ await: server เริ่มรับคำขอทันที — คำขอที่เข้ามาระหว่างอุ่นใช้ cache ชุดเดียวกัน
  setTimeout(() => void warmCaches(), 250);
}
