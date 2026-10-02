/// <reference types="bun-types" />
// ============================================================
// รอบการทำงานประจำวันแบบ CLI — ตั้ง cron หลังตลาดปิด (ข้อมูล EOD พร้อม ~17:30 น.)
//
//   bun scripts/daily-cycle.ts                                   # บันทึกสัญญาณของรอบล่าสุด + อัปเดตไม้กระดาษด้วยราคาล่าสุด
//   bun scripts/daily-cycle.ts --fetch yahoo [--universe demo] [--range 5y]
//                                                                # ดึงราคาจริง (.BK) จาก Yahoo ก่อน ผ่าน scripts/fetch-yahoo.ts --yes
//                                                                #   (backup อัตโนมัติก่อนแทนที่ · ต้องเข้าถึง query1.finance.yahoo.com ได้)
//   cron (เวลากรุงเทพ): 50 17 * * 1-5  cd /app && bun scripts/daily-cycle.ts --fetch yahoo >> data/cycle.log 2>&1
//
// exit 0 = รอบสำเร็จ · 2 = ตัวเลือกผิด · 3 = ข้อมูลค้าง/ว่าง (ไม่บันทึกสัญญาณใหม่ — ให้ cron แจ้งเตือน)
// ใช้ DB เดียวกับเซิร์ฟเวอร์ — เซิร์ฟเวอร์ที่รันอยู่เห็นข้อมูล/รายการใหม่เอง (ตรวจ data version ทุกคำขอ)
// ============================================================

import path from "node:path"
import { getWorkflow, runCycle } from "../src/lib/workflow/service"

const APP_ROOT = path.resolve(import.meta.dir, "..")

function arg(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name)
  return i >= 0 ? argv[i + 1] : undefined
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log("bun scripts/daily-cycle.ts [--fetch yahoo] [--universe demo | --symbols A,B] [--range 5y]")
    return 0
  }
  const fetchFrom = arg(argv, "--fetch")
  if (fetchFrom !== undefined && fetchFrom !== "yahoo") {
    console.error(`--fetch รองรับเฉพาะ yahoo (ได้ "${fetchFrom}")`)
    return 2
  }
  if (fetchFrom === "yahoo") {
    const symbols = arg(argv, "--symbols")
    const range = arg(argv, "--range")
    const args = ["scripts/fetch-yahoo.ts", ...(symbols ? ["--symbols", symbols] : ["--universe", arg(argv, "--universe") ?? "demo"]), ...(range ? ["--range", range] : []), "--yes"]
    console.log(`ดึงราคาจริง: bun ${args.join(" ")}`)
    const proc = Bun.spawn(["bun", ...args], { cwd: APP_ROOT, stdout: "inherit", stderr: "inherit" })
    const code = await proc.exited
    if (code !== 0) console.error(`ดึงข้อมูลไม่สำเร็จ (exit ${code}) — รันรอบต่อด้วยข้อมูลที่มีอยู่ (ข้อมูลค้าง = ไม่บันทึกสัญญาณใหม่)`)
  }
  const report = await runCycle({ actor: "cli" })
  const wf = await getWorkflow()
  console.log(
    JSON.stringify(
      {
        report,
        data: wf.data.label,
        steps: wf.steps.map((s) => `${s.status.toUpperCase().padEnd(5)} ${s.title}: ${s.summary}`),
        today: wf.today.map((r) => `${r.symbol} ${r.kind} ${r.order.type === "limit" ? `ตั้งซื้อ ≤ ${r.order.price}` : "ซื้อที่ราคาเปิด"} · stop ${r.stop} · ถึง ${r.order.validUntil}`),
        alerts: wf.alerts.map((a) => `${a.level}: ${a.text}`),
      },
      null,
      2,
    ),
  )
  return report.blocked ? 3 : 0
}

if (import.meta.main) {
  main().then((code) => process.exit(code))
}
