#!/bin/sh
# ============================================================
# entrypoint ของ image thai-momentum-platform (ใช้ทั้ง target runtime และ tools)
# เตรียม volume /data ก่อน exec คำสั่งหลัก:
#   /data/app.db       ฐานข้อมูล — สร้างจากไฟล์ seed ใน image "เฉพาะเมื่อยังไม่มี" (ไม่ทับข้อมูลเดิมเด็ดขาด)
#                      TMP_SEED_DB=demo (ค่าเริ่มต้น: demo synthetic 240 หุ้น × 520 วัน) | empty (schema เปล่า สำหรับข้อมูลจริงล้วน)
#   /data/gtaa/        panel ของ GTAA (คัดลอกไฟล์ตั้งต้นครั้งแรก · อัปโหลด/ดึงใหม่แล้วอยู่ถาวร)
#   /data/backups/     ไฟล์สำรอง (TMP_BACKUP_DIR) · /data/runs/ run log ของ daily · /data/feed/inbox/ ไฟล์จาก settfex/Settrade
# /app/data/{gtaa,backups,runs,feed} ใน image เป็น symlink มาที่นี่ — โค้ดที่ใช้ path สัมพัทธ์ data/... จึงเขียนลง volume
# ============================================================
set -eu

SEED_DIR="${TMP_SEED_DIR:-/opt/tmp-seed}"
DATA_DIR="${TMP_DATA_DIR:-/data}"

log() { echo "[entrypoint] $*"; }
die() { echo "[entrypoint] $*" >&2; exit 1; }

if ! mkdir -p "$DATA_DIR/gtaa" "$DATA_DIR/backups" "$DATA_DIR/runs" "$DATA_DIR/feed/inbox" 2>/dev/null || [ ! -w "$DATA_DIR" ]; then
  die "เขียน $DATA_DIR ไม่ได้ (uid $(id -u)) — named volume ใช้ได้ทันที · bind mount ต้อง chown -R $(id -u):$(id -g) บนเครื่อง host ก่อน"
fi

# ---- ฐานข้อมูล: DATABASE_URL=file:/abs/path.db ----
DB_FILE=""
case "${DATABASE_URL:-}" in
  file:*)
    DB_FILE="${DATABASE_URL#file:}"
    DB_FILE="${DB_FILE%%\?*}"
    ;;
  *) log "DATABASE_URL ไม่ใช่ SQLite (file:...) — ข้ามการเตรียมฐานข้อมูล" ;;
esac

if [ -n "$DB_FILE" ]; then
  case "$DB_FILE" in
    /*) ;;
    *) die "DATABASE_URL ต้องเป็น absolute path ใน container (เช่น file:/data/app.db) — ได้ \"$DATABASE_URL\"" ;;
  esac
  if [ ! -s "$DB_FILE" ]; then
    case "${TMP_SEED_DB:-demo}" in
      demo) SEED="$SEED_DIR/custom.db" ;;
      empty) SEED="$SEED_DIR/empty.db" ;;
      none) SEED="" ;;
      *) die "TMP_SEED_DB ต้องเป็น demo | empty | none — ได้ \"${TMP_SEED_DB}\"" ;;
    esac
    if [ -n "$SEED" ]; then
      [ -f "$SEED" ] || die "ไม่พบไฟล์ seed $SEED ใน image"
      mkdir -p "$(dirname "$DB_FILE")"
      [ -e "$DB_FILE" ] && [ ! -s "$DB_FILE" ] && rm -f "$DB_FILE" # ไฟล์ 0 byte จากการเริ่มที่ล้มก่อนหน้า
      tmp="$DB_FILE.seed.$$"
      cp "$SEED" "$tmp"
      chmod 600 "$tmp"
      # ln ไม่ทับไฟล์ที่มีอยู่แล้ว (atomic) — container อื่นที่ seed พร้อมกันชนะก่อนก็ไม่เป็นไร
      if ln "$tmp" "$DB_FILE" 2>/dev/null; then
        log "สร้าง $DB_FILE จาก seed \"${TMP_SEED_DB:-demo}\"$( [ "${TMP_SEED_DB:-demo}" = demo ] && echo ' (ข้อมูลจำลอง — ingest ข้อมูลจริงตาม docs/ops.md)' )"
      fi
      rm -f "$tmp"
    else
      log "ยังไม่มี $DB_FILE (TMP_SEED_DB=none) — /api/health จะตอบ 503 จนกว่าจะ restore หรือ prisma db push"
    fi
  fi
fi

# ---- panel GTAA ตั้งต้น ----
if [ ! -s "$DATA_DIR/gtaa/panel.json" ] && [ -f "$SEED_DIR/gtaa/panel.json" ]; then
  cp "$SEED_DIR/gtaa/panel.json" "$DATA_DIR/gtaa/panel.json"
  chmod 644 "$DATA_DIR/gtaa/panel.json" # seed ใน image เป็น 0444 — แอปต้องเขียนทับได้ตอนอัปโหลด/ดึง panel ใหม่
  log "คัดลอก panel GTAA ตั้งต้น → $DATA_DIR/gtaa/panel.json"
fi

exec "$@"
