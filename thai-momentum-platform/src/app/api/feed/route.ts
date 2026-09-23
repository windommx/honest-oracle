import { NextResponse } from "next/server"
import { DEFAULT_SECTOR_MAP, FEED_PRESETS } from "@/lib/feed/universe"
import { DEFAULT_FEED_RANGE, FEED_SOURCES } from "@/lib/feed/sources"
import type { FeedInfoResponse } from "@/lib/momentum/contracts"

export const dynamic = "force-dynamic"

// GET /api/feed → ทะเบียนแหล่งข้อมูล + รายชื่อตั้งต้น + sector map (สำหรับการ์ด feed และสคริปต์ภายนอก)
export async function GET() {
  return NextResponse.json<FeedInfoResponse>({
    presets: FEED_PRESETS,
    sources: FEED_SOURCES,
    defaultRange: DEFAULT_FEED_RANGE,
    sectorMap: DEFAULT_SECTOR_MAP,
  })
}
