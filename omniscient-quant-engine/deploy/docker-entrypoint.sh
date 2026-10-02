#!/bin/sh
# ============================================================
# entrypoint ของ image omniscient-quant-engine — เตรียม volume /data ก่อน exec คำสั่งหลัก
#   /data/app.db   ฐานข้อมูล — สร้างจากไฟล์ seed ใน image "เฉพาะเมื่อยังไม่มี" (ไม่ทับข้อมูลเดิมเด็ดขาด)
#                  OQE_SEED_DB=demo (ค่าเริ่มต้น: snapshot จำลอง 22 หุ้น × 750 วัน + ตัวอย่าง journal/synthesis)
#                             | empty (schema เปล่า — API แรกที่ถูกเรียกจะ seed ข้อมูลจำลองเอง) | none
# ============================================================
set -eu

SEED_DIR="${OQE_SEED_DIR:-/opt/oqe-seed}"
DATA_DIR="${OQE_DATA_DIR:-/data}"

log() { echo "[entrypoint] $*"; }
die() { echo "[entrypoint] $*" >&2; exit 1; }

if ! mkdir -p "$DATA_DIR" 2>/dev/null || [ ! -w "$DATA_DIR" ]; then
  die "เขียน $DATA_DIR ไม่ได้ (uid $(id -u)) — named volume ใช้ได้ทันที · bind mount ต้อง chown -R $(id -u):$(id -g) บนเครื่อง host ก่อน"
fi

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
    case "${OQE_SEED_DB:-demo}" in
      demo) SEED="$SEED_DIR/custom.db" ;;
      empty) SEED="$SEED_DIR/empty.db" ;;
      none) SEED="" ;;
      *) die "OQE_SEED_DB ต้องเป็น demo | empty | none — ได้ \"${OQE_SEED_DB}\"" ;;
    esac
    if [ -n "$SEED" ]; then
      [ -f "$SEED" ] || die "ไม่พบไฟล์ seed $SEED ใน image"
      mkdir -p "$(dirname "$DB_FILE")"
      [ -e "$DB_FILE" ] && [ ! -s "$DB_FILE" ] && rm -f "$DB_FILE"
      tmp="$DB_FILE.seed.$$"
      cp "$SEED" "$tmp"
      chmod 600 "$tmp"
      if ln "$tmp" "$DB_FILE" 2>/dev/null; then
        log "สร้าง $DB_FILE จาก seed \"${OQE_SEED_DB:-demo}\" (ข้อมูลจำลองเพื่อการสาธิต — ไม่ใช่ราคาตลาดจริง)"
      fi
      rm -f "$tmp"
    else
      log "ยังไม่มี $DB_FILE (OQE_SEED_DB=none) — /api/health จะตอบ 503 จนกว่าจะ prisma db push"
    fi
  fi
fi

exec "$@"
