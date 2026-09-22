// ============================================================
// ทะเบียนแหล่ง feed ที่แพลตฟอร์มรองรับ — ป้ายความจริงของแต่ละแหล่งแสดงบน UI เสมอ
// รายละเอียดเปรียบเทียบ/ข้อจำกัด: docs/research/market-feed.md
// ============================================================

import type { FeedRange, FeedSourceInfo } from "@/lib/momentum/contracts"

export const DEFAULT_FEED_RANGE: FeedRange = "2y"

export const FEED_SOURCES: FeedSourceInfo[] = [
  {
    id: "yahoo",
    label: "Yahoo Finance (.BK)",
    serverSide: true,
    dataNote:
      "OHLCV รายวัน ปรับปันผล/สปลิตได้ · มูลค่าซื้อขาย = close×volume โดยประมาณ · ไม่มีองค์ประกอบดัชนี/sector · ไม่เป็นทางการ (chart API สาธารณะ อาจถูกจำกัดอัตรา)",
    howTo: "กดปุ่มดึงข้อมูลในการ์ดนี้ หรือ CLI: bun run fetch:th -- --symbols SET50 --range 2y",
  },
  {
    id: "set",
    label: "SET (set.or.th) ผ่าน settfex",
    serverSide: false,
    dataNote:
      "ราคาปิด + volume + มูลค่าซื้อขายจริง (บาท) + องค์ประกอบดัชนี/sector จาก SET โดยตรง · ไม่มี OHLC ย้อนหลัง (ผสาน OHLC จาก Yahoo ได้) · เว็บ SET มี bot protection จึงต้องรัน Python + curl_cffi บนเครื่องผู้ใช้ · ไม่เป็นทางการ",
    howTo: "pip install settfex แล้วรัน python lab/fetch_set_feed.py --index SET50 --post http://localhost:3000",
  },
  {
    id: "settrade",
    label: "Settrade Open API (ทางการ)",
    serverSide: false,
    dataNote:
      "ข้อมูลตลาดทางการทั้ง SET และ TFEX (real-time + ย้อนหลัง) · ต้องมีบัญชีกับโบรกเกอร์ที่รองรับและสร้าง app key · ใช้ SDK settrade-v2 บนเครื่องผู้ใช้ แล้วส่งเข้า /api/feed/ingest",
    howTo: "ดูตัวอย่างใน docs/research/market-feed.md §4 (เทมเพลต lab/fetch_settrade_feed.py)",
  },
  {
    id: "csv",
    label: "CSV (AmiBroker / อื่น ๆ)",
    serverSide: true,
    dataNote: "ข้อมูลจากเครื่องผู้ใช้เอง — รับผิดชอบความถูกต้องเอง · รองรับ open/high/low/close/val หรือ volume",
    howTo: "การ์ด 'นำเข้า CSV จาก AmiBroker' ด้านบน",
  },
]
