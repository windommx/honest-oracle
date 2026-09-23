/// <reference types="bun-types" />
// bun test — core data engine ส่วนที่ pure (ไม่แตะ DB): วันที่ · CSV · ตรวจช่องว่างวันที่ · ราคากระโดด
import { afterAll, describe, expect, it } from "bun:test"

import {
  bangkokDate,
  countPriceJumps,
  dateGapReport,
  detectDateOrder,
  missingWeekdays,
  normalizeDate,
  parseSnapshotCsv,
  SET_MAX_HOLIDAY_RUN,
} from "./core"

const ORIG_TZ = process.env.TZ
const TZS = ["UTC", "Asia/Bangkok", "America/Los_Angeles", "Pacific/Kiritimati"]
afterAll(() => {
  if (ORIG_TZ === undefined) delete process.env.TZ
  else process.env.TZ = ORIG_TZ
})

describe("normalizeDate", () => {
  it("รูปแบบ ISO / YYYYMMDD / เวลาต่อท้ายที่ไม่มี timezone = วันที่ตามที่เขียน", () => {
    expect(normalizeDate("2026-09-18")).toBe("2026-09-18")
    expect(normalizeDate("2026/9/8")).toBe("2026-09-08")
    expect(normalizeDate("20260918")).toBe("2026-09-18")
    expect(normalizeDate(" 2026-09-18 00:00:00 ")).toBe("2026-09-18")
    expect(normalizeDate("2026-09-18T15:30")).toBe("2026-09-18")
  })

  it("วัน/เดือน/ปี แบบไทย เป็นค่าเริ่มต้น + ปี พ.ศ.", () => {
    expect(normalizeDate("18/09/2026")).toBe("2026-09-18") // เดิม null (แถวหายเงียบ ๆ)
    expect(normalizeDate("05/09/2026")).toBe("2026-09-05") // เดิม 2026-05-09 (อ่านแบบสหรัฐ)
    expect(normalizeDate("5/9/2569")).toBe("2026-09-05") // พ.ศ. 2569 = ค.ศ. 2026
    expect(normalizeDate("2569-09-18")).toBe("2026-09-18") // เดิม "2569-09-18"
    expect(normalizeDate("09/18/2026")).toBe("2026-09-18") // ส่วนที่สอง > 12 → เดือน/วัน ชัดเจน
    expect(normalizeDate("05/09/2026", "mdy")).toBe("2026-05-09")
  })

  it("ปฏิเสธวันที่ที่ไม่มีจริง/ไม่ใช่วันที่ (เดิมเก็บลง DB เป็นขยะ เช่น 46283-01-01)", () => {
    for (const bad of ["2026-13-45", "2026-02-30", "46283", "1", "12", "2026", "2026-09", "Sep 2026", "", "abc", "31/02/2026"]) {
      expect(normalizeDate(bad)).toBeNull()
    }
  })

  it("ไม่ขึ้นกับ TZ ของ server — timezone กำกับ = วันที่ตามเวลาตลาดไทย", () => {
    for (const tz of TZS) {
      process.env.TZ = tz
      expect(normalizeDate("2026-09-18T00:00:00.000Z")).toBe("2026-09-18") // เดิม LA → 2026-09-17
      expect(normalizeDate("2026-09-17T17:00:00.000Z")).toBe("2026-09-18") // เที่ยงคืนกรุงเทพ (เดิม UTC → 09-17)
      expect(normalizeDate("2026-09-18T00:00:00+07:00")).toBe("2026-09-18")
      expect(normalizeDate("Sep 18, 2026")).toBe("2026-09-18")
      expect(normalizeDate("18 Sep 2026")).toBe("2026-09-18")
      expect(bangkokDate(new Date(Date.UTC(2026, 8, 17, 17, 0)))).toBe("2026-09-18")
    }
  })

  it("detectDateOrder เดาลำดับทั้งไฟล์จากค่าที่ไม่กำกวม", () => {
    expect(detectDateOrder(["05/09/2026", "18/09/2026"])).toBe("dmy")
    expect(detectDateOrder(["05/09/2026", "09/18/2026"])).toBe("mdy")
    expect(detectDateOrder(["05/09/2026", "06/09/2026"])).toBe("dmy") // กำกวมทั้งหมด = ธรรมเนียมไทย
    expect(detectDateOrder(["2026-09-18"])).toBe("dmy")
  })
})

describe("parseSnapshotCsv", () => {
  it("BOM + ตัวพิมพ์เล็ก + .BK ของ Yahoo", () => {
    const p = parseSnapshotCsv("﻿date,symbol,close,val\n2026-09-18,ptt.bk,30,5000000\n")
    expect(p.rows).toEqual([{ date: "2026-09-18", symbol: "PTT", close: 30, open: null, high: null, low: null, val: 5_000_000 }])
  })

  it("ช่องในเครื่องหมายคำพูด + ตัวคั่นหลักพัน (เดิม header ไม่ผ่าน / val กลายเป็น 0)", () => {
    const p = parseSnapshotCsv('"date","symbol","close","val"\n"2026-09-18","PTT","30.5","12,345,678"\n')
    expect(p.rows[0]).toMatchObject({ date: "2026-09-18", symbol: "PTT", close: 30.5, val: 12_345_678 })
  })

  it("ตัวคั่น tab (วางจาก Excel) และ ; และขึ้นบรรทัดแบบ CR", () => {
    expect(parseSnapshotCsv("date\tsymbol\tclose\tval\n2026-09-18\tPTT\t30.5\t5000000\n").rows[0].close).toBe(30.5)
    expect(parseSnapshotCsv("date;symbol;close;val\n2026-09-18;PTT;30.5;5000000\n").rows[0].val).toBe(5_000_000)
    expect(parseSnapshotCsv("date,symbol,close,val\r2026-09-18,PTT,30.5,5000000\r2026-09-19,PTT,31,5000000\r").rows.length).toBe(2)
  })

  it("tab ว่างหัว/ท้ายบรรทัดไม่ทำให้คอลัมน์เลื่อน", () => {
    const p = parseSnapshotCsv("symbol\tdate\tclose\tval\tlow\nPTT\t2026-09-18\t30.5\t5000000\t\n")
    expect(p.rows[0]).toMatchObject({ symbol: "PTT", close: 30.5, val: 5_000_000 })
  })

  it("header ของ AmiBroker Exploration (Ticker,Date/Time) + วันที่ไทย พ.ศ. ทั้งไฟล์", () => {
    const p = parseSnapshotCsv("Ticker,Date/Time,Close,Volume\nPTT,05/09/2569,30.5,100000\nPTT,18/09/2569,31,100000\n")
    expect(p.kind).toBe("history")
    expect(p.rows.map((r) => r.date)).toEqual(["2026-09-05", "2026-09-18"])
    expect(p.rows[0].val).toBe(3_050_000)
  })

  it("ไฟล์แบบสหรัฐ (เดือน/วัน) ทั้งไฟล์ อ่านค่ากำกวมตามไฟล์", () => {
    const p = parseSnapshotCsv("date,symbol,close,val\n09/05/2026,PTT,30,1\n09/18/2026,PTT,31,1\n")
    expect(p.rows.map((r) => r.date)).toEqual(["2026-09-05", "2026-09-18"])
  })

  it("ทิ้งราคาปิด 0 (ไม่มีการซื้อขาย) และ val ติดลบเป็น 0", () => {
    const p = parseSnapshotCsv("date,symbol,close,val\n2026-09-18,PTT,0,5000000\n2026-09-18,KBANK,150,-5\n")
    expect(p.rows).toHaveLength(1)
    expect(p.rows[0]).toMatchObject({ symbol: "KBANK", val: 0 })
  })

  it("ไม่มีแถวที่ใช้ได้ → error ที่บอกรูปแบบวันที่", () => {
    expect(() => parseSnapshotCsv("date,symbol,close\n46283,PTT,30\n")).toThrow("ตรวจวันที่")
    expect(() => parseSnapshotCsv("foo,bar\n1,2\n")).toThrow("ต้องมีคอลัมน์")
  })
})

describe("data quality — ช่องว่างวันที่", () => {
  it("นับเป็นวันทำการที่หายไป ไม่ใช่วันปฏิทิน และไม่ขึ้นกับ TZ", () => {
    for (const tz of TZS) {
      process.env.TZ = tz
      expect(missingWeekdays("2026-09-18", "2026-09-21")).toBe(0) // ศ. → จ.
      expect(missingWeekdays("2026-04-10", "2026-04-16")).toBe(3) // สงกรานต์ 2569 (จ.–พ.)
      expect(missingWeekdays("2025-12-30", "2026-01-05")).toBe(3) // ปีใหม่ (พ.–ศ.)
      expect(missingWeekdays("2021-04-09", "2021-04-16")).toBe(4) // สงกรานต์ 2564 + วันหยุดพิเศษ 12 เม.ย.
    }
  })

  it("วันหยุดยาวปกติของ SET ไม่ใช่ช่องว่าง แต่ข้อมูลหาย ≥ 1 สัปดาห์ถูกจับ", () => {
    const holidays = dateGapReport(["2025-12-29", "2025-12-30", "2026-01-05", "2026-01-06"])
    expect(holidays.gaps).toEqual([])
    expect(holidays.longBreaks).toEqual([{ from: "2025-12-30", to: "2026-01-05", missing: 3 }])
    const songkran2021 = dateGapReport(["2021-04-08", "2021-04-09", "2021-04-16", "2021-04-19"])
    expect(songkran2021.gaps).toEqual([])
    expect(songkran2021.longBreaks.map((b) => b.missing)).toEqual([4])
    const missingWeek = dateGapReport(["2026-06-05", "2026-06-15"]) // ศ. → จ. ถัดไป 1 สัปดาห์
    expect(missingWeek.gaps).toEqual([{ from: "2026-06-05", to: "2026-06-15", missing: 5 }])
    expect(SET_MAX_HOLIDAY_RUN).toBe(4)
  })
})

describe("data quality — ราคากระโดด", () => {
  it("เทียบกับราคาปิดล่าสุดที่มี ข้ามวันพักการซื้อขาย (NaN)", () => {
    // หุ้น 0: 10 → (พักซื้อขาย) → 20 = +100% ข้ามช่องว่าง (เดิมไม่นับ) · หุ้น 1: ปกติ
    const px = [
      [10, 50],
      [NaN, 51],
      [20, 52],
      [20.5, 53],
    ]
    expect(countPriceJumps(px, 2)).toBe(1)
  })
  it("ราคาปิด 0 ยังถูกนับเป็นความผิดปกติ และไม่ใช้เป็นฐานเทียบ", () => {
    expect(countPriceJumps([[10], [0], [10.2]], 1)).toBe(1)
  })
})
