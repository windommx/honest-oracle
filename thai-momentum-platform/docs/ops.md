# คู่มือปฏิบัติการ (Runbook) — Thai Momentum Platform

เอกสารนี้สำหรับคนที่ติดตั้ง ดูแล และแก้เหตุขัดข้องของแพลตฟอร์ม ทุกคำสั่งรันจากโฟลเดอร์ `thai-momentum-platform/` เว้นแต่ระบุไว้

| หัวข้อ | ไปที่ |
|---|---|
| ภาพรวมระบบ | [1](#1-ภาพรวม) |
| ติดตั้ง (Docker Compose / systemd / Fly / Render) | [2](#2-ติดตั้ง) |
| ตัวแปรแวดล้อม | [3](#3-ตัวแปรแวดล้อม) |
| เริ่มใช้งานครั้งแรก + เปลี่ยนจาก demo เป็นข้อมูลจริง | [4](#4-เริ่มใช้งานครั้งแรก) |
| การยืนยันตัวตนและการเปิดให้เครื่องอื่นใช้ | [5](#5-การยืนยันตัวตนและการเปิดให้เครื่องอื่นใช้) |
| งานประจำวัน (daily) | [6](#6-งานประจำวัน-daily) |
| สำรองและกู้คืน | [7](#7-สำรองและกู้คืนข้อมูล) |
| อัปเกรด / ย้อนเวอร์ชัน | [8](#8-อัปเกรด--ย้อนเวอร์ชัน) |
| เฝ้าระวัง (`/api/health`) | [9](#9-เฝ้าระวัง) |
| เช็กลิสต์เหตุขัดข้อง | [10](#10-เช็กลิสต์เหตุขัดข้อง) |
| ความจุและตัวเลขที่วัดจริง | [11](#11-ความจุและตัวเลขที่วัดจริง) |
| CI | [12](#12-ci) |

---

## 1. ภาพรวม

```
browser ──TLS──▶ reverse proxy ──▶ app  (node .next/standalone/server.js :3000)
                                     │  proxy.ts: auth / CSRF / rate limit
                                     ▼
                              /data/app.db  (SQLite — ไฟล์เดียว, instance เดียว)
                                     ▲
scheduler (bun deploy/scheduler.ts) ─┘  daily 18:30 จ.–ศ. · backup 02:30 · อุ่น cache หลัง daily
```

- **app** — Next.js 16 standalone รันด้วย **node 22** (ไม่ใช่ bun: Next 16.3.6 + Bun 1.3.11 ล้มทุก route ด้วย `Expected CommonJS module to have a function wrapper` — ตรวจแล้ว 2026-09-23 · `bun deploy/smoke.ts --runtime bun` ใช้ตรวจซ้ำเมื่ออัปเกรด Bun)
- **ฐานข้อมูล** — SQLite ไฟล์เดียว (`DATABASE_URL=file:/abs/path.db`) → รันได้ **instance เดียว** ห้าม scale แนวนอน
- **scheduler** — ตัวตั้งเวลาไม่มี dependency เวลาไทยตายตัว (UTC+7) รันสคริปต์ด้วย bun: `scripts/daily.ts` (สายพานปิดตลาด) และ `scripts/backup-db.ts`
- **ไฟล์ที่ระบบเขียน** — `app.db`, `backups/`, `gtaa/panel.json`, `runs/` (run log ของ daily), `feed/inbox/` (ไฟล์จาก settfex/Settrade) — ใน Docker อยู่ใน volume `/data` ทั้งหมด
- ทุกอย่างเป็น **PAPER MODE** ไม่มีการส่งคำสั่งซื้อขายจริง

## 2. ติดตั้ง

### 2.1 Docker Compose (แนะนำ)

ต้องมี Docker Engine 24+ และ Compose v2.24+

```bash
cd thai-momentum-platform
cp .env.example .env
# บังคับ 3 ค่า (compose ไม่ยอมเริ่มถ้าไม่ตั้ง):
#   TMP_AUTH_PASSWORD=<รหัสสุ่มยาว ≥ 12 ตัว>   TMP_AUTH_SECRET=$(openssl rand -hex 32)   TMP_API_TOKEN=$(openssl rand -hex 32)
docker compose up -d --build
docker compose ps                                  # app ต้องเป็น (healthy) ภายใน ~40 วินาที
curl -s http://127.0.0.1:3000/api/health           # {"ok":true,"status":"ok",...}
```

- `app` (target `runtime`): ฟังที่ `127.0.0.1:3000` ของ host เท่านั้น (เปลี่ยนพอร์ตด้วย `TMP_HOST_PORT`) · ผู้ใช้ non-root uid **10001** · `HEALTHCHECK` เรียก `/api/health` ทุก 30 วินาที
- `scheduler` (target `tools`): เริ่มหลัง app healthy · heartbeat ทุก ≤ 60 วินาที → healthcheck ของ compose
- volume `tmp-data` → `/data` · ครั้งแรก entrypoint สร้าง `/data/app.db` จาก demo DB ที่แนบมากับ image **เฉพาะเมื่อยังไม่มีไฟล์** (ไม่ทับข้อมูลเดิมเด็ดขาด และไม่แตะ `db/custom.db` ของ repo) · ต้องการเริ่มจากฐานเปล่า (ข้อมูลจริงล้วน) ตั้ง `TMP_SEED_DB=empty` ก่อน `up` ครั้งแรก
- bind mount แทน named volume ได้ แต่ต้อง `chown -R 10001:10001 <โฟลเดอร์>` ก่อน
- ติด commit ลง `/api/health`: `TMP_GIT_SHA=$(git rev-parse --short HEAD) docker compose build`

### 2.2 systemd (เครื่อง Linux ไม่ใช้ Docker)

ต้องมี node 22, bun 1.3.11, systemd ≥ 239 (timezone ใน `OnCalendar`)

```bash
sudo useradd --system --home /opt/thai-momentum-platform --shell /usr/sbin/nologin tmp
sudo mkdir -p /opt/thai-momentum-platform && sudo chown tmp:tmp /opt/thai-momentum-platform
# วางโค้ดที่ /opt/thai-momentum-platform (เนื้อหาของโฟลเดอร์ thai-momentum-platform/)
sudo -u tmp bash -c 'cd /opt/thai-momentum-platform && bun install --frozen-lockfile && bunx prisma generate && bun run build \
  && rm -rf .next/standalone/data && ln -s ../../data .next/standalone/data'

# ฐานข้อมูล + backup อยู่นอกโฟลเดอร์โค้ด (StateDirectory ของ systemd)
sudo install -d -o tmp -g tmp -m 750 /var/lib/thai-momentum-platform
sudo -u tmp cp /opt/thai-momentum-platform/db/custom.db /var/lib/thai-momentum-platform/app.db   # หรือกู้จาก backup / ฐานเปล่า

# env (สิทธิ์ 600) — เขียนด้วย editor: sudo install -m 600 /dev/null /etc/thai-momentum-platform.env && sudoedit /etc/thai-momentum-platform.env
#   DATABASE_URL=file:/var/lib/thai-momentum-platform/app.db
#   TMP_BACKUP_DIR=/var/lib/thai-momentum-platform/backups
#   TMP_AUTH_PASSWORD=<รหัสสุ่มยาว>
#   TMP_AUTH_SECRET=<openssl rand -hex 32>
#   TMP_API_TOKEN=<openssl rand -hex 32>

sudo cp deploy/systemd/thai-momentum*.service deploy/systemd/thai-momentum*.timer /etc/systemd/system/
# ตรวจ path ของ node/bun ใน ExecStart ให้ตรงเครื่อง: which node bun
sudo systemctl daemon-reload
sudo systemctl enable --now thai-momentum.service thai-momentum-daily.timer thai-momentum-backup.timer
systemctl list-timers 'thai-momentum*'
```

- ไฟล์ที่แอป/สคริปต์เขียน (`data/gtaa/panel.json`, `data/runs/`, `data/feed/inbox/`) อยู่ที่ `/opt/thai-momentum-platform/data/` ที่เดียว — server.js ของ standalone `chdir` ไป `.next/standalone/` จึงต้องมี symlink `.next/standalone/data → ../../data` **ทำใหม่ทุกครั้งหลัง `bun run build`** (build สร้าง `.next/` ใหม่)
- unit ใช้ `ProtectSystem=strict`: เขียนได้เฉพาะ `/var/lib/thai-momentum-platform` และ `/opt/thai-momentum-platform/data`
- ไม่มี systemd: ใช้ `deploy/crontab.example`

### 2.3 Fly.io / Render (PaaS ที่ disk ผูกกับ service เดียว)

SQLite ต้องอยู่บน disk ของ instance เดียว → ใช้ image target **`aio`** (เว็บ + scheduler ใน container เดียว: `bun deploy/scheduler.ts --with-server` — server ตาย = container ออกให้แพลตฟอร์ม restart)

- **Fly.io**: `cp deploy/fly.toml.example fly.toml` แล้วทำตามหัวไฟล์ (volume `tmp_data` → `/data`, `build-target = "aio"`, health check `/api/health`, `auto_stop_machines = "off"`, 1 machine, RAM 2 GB)
- **Render**: Render build target ของ multi-stage ไม่ได้ → build แล้ว push image เอง
  `docker build --target aio -t ghcr.io/<owner>/thai-momentum-platform-aio:<sha> . && docker push ...`
  แล้วสร้าง Web Service แบบ "Existing Image" + Disk mount `/data` + Health Check Path `/api/health` + env ตามหัวข้อ 3 (instance เดียว, ปิด auto-scaling) · ไฟล์ `render.yaml` ที่ราก repo เป็นของแอปอื่น **อย่าแก้**

### 2.4 เครื่องนักพัฒนา

ดู README (`bun install --frozen-lockfile && bun run db:generate && bun run dev`) — โหมด local ไม่ต้องตั้งรหัสผ่าน เปิดได้เฉพาะเครื่องตัวเอง

## 3. ตัวแปรแวดล้อม

ความลับ (รหัส/secret/token) อยู่ใน `.env` หรือ `/etc/thai-momentum-platform.env` (สิทธิ์ 600) เท่านั้น — ไม่ commit ไม่ใส่ใน image (`.dockerignore` ตัด `.env` ออก) และ logger ของงาน ops ปิดบัง field ที่ชื่อเหมือนความลับให้อัตโนมัติ

| ตัวแปร | ค่าเริ่มต้น | ใช้ทำอะไร |
|---|---|---|
| `DATABASE_URL` | `file:../db/custom.db` (dev) · `file:/data/app.db` (Docker) | SQLite — โปรดักชันใช้ **absolute path** เสมอ (path สัมพัทธ์นับจากโฟลเดอร์ `prisma/`) |
| `PORT` / `HOSTNAME` | `3000` / `0.0.0.0` (Docker) | พอร์ต/ที่อยู่ที่ server ฟัง — นอก Docker ใช้ `HOSTNAME=127.0.0.1` |
| `TMP_AUTH_PASSWORD` | – | รหัสผู้ดูแล → โหมด auth (บังคับใน compose) |
| `TMP_VIEWER_PASSWORD` | – | รหัสผู้ชม (อ่านอย่างเดียว) ต้องไม่ซ้ำรหัสผู้ดูแล |
| `TMP_AUTH_SECRET` | อนุพันธ์จากรหัสผ่าน | คีย์ลงนาม session cookie (≥ 32 ตัว) — หมุน = ออกจากระบบทุกคน |
| `TMP_API_TOKEN` | – | Bearer token ของสคริปต์/cron/scheduler (`Authorization: Bearer …`, เฉพาะ `/api/*`) |
| `TMP_ALLOW_REMOTE_NOAUTH` | `0` | ⚠️ ให้เครื่องอื่นเข้าโดยไม่มีรหัส — ใช้เฉพาะหลัง reverse proxy ที่ทำ auth แล้ว |
| `TMP_ALLOWED_ORIGINS` | – | origin สาธารณะ เช่น `https://tmp.example.com` เมื่อ reverse proxy เปลี่ยน Host |
| `TMP_HSTS` | `0` | ส่ง HSTS เมื่อคำขอมาทาง https (เปิดเมื่ออยู่หลัง TLS ที่ใบรับรองถูกต้อง) |
| `TMP_BACKUP_DIR` | `<app>/data/backups` · `/data/backups` (Docker) | ที่เก็บ backup |
| `TMP_BACKUP_KEEP` | `14` | จำนวน backup อัตโนมัติที่เก็บ (`tmp-backup-*.db`) |
| `TMP_BACKUP_MIRROR_DIR` | – | สำเนา backup ไปอีกดิสก์/NAS ทุกครั้ง (แนะนำ) |
| `TMP_SEED_DB` | `demo` | Docker: seed `/data/app.db` ครั้งแรก — `demo` · `empty` (schema เปล่า) · `none` |
| `TMP_GIT_SHA` | – | commit ที่ build (แสดงใน `/api/health` → `commit`) |
| `TMP_DAILY_AT` / `TMP_DAILY_DAYS` | `18:30` / `1-5` | เวลา/วัน (เวลาไทย, 0 = อาทิตย์) ของ daily |
| `TMP_BACKUP_AT` / `TMP_BACKUP_DAYS` | `02:30` / `0-6` | เวลา/วันของ backup |
| `TMP_DAILY_CMD` / `TMP_BACKUP_CMD` | `bun scripts/daily.ts` / `bun scripts/backup-db.ts --reason nightly` | คำสั่งของงาน (แยกด้วยช่องว่าง ไม่ผ่าน shell) |
| `TMP_JOB_RETRIES` / `TMP_JOB_RETRY_DELAY_MIN` / `TMP_JOB_TIMEOUT_MIN` | `2` / `20` / `90` | การลองใหม่และ timeout ของงาน |
| `TMP_DAILY_RETRY_CODES` | `1,3,5,124` | exit code ของ daily ที่ลองใหม่ (ชั่วคราว) |
| `TMP_APP_URL` / `TMP_WARM_PATHS` | `http://app:3000` (compose) / รายงานหนัก 6 เส้น | อุ่น cache ของ app หลัง daily สำเร็จ |
| `TMP_PING_DAILY_URL` / `TMP_PING_BACKUP_URL` | – | dead-man's switch (เช่น healthchecks.io): สำเร็จ GET url · ล้ม GET url/fail |
| `TMP_SCHEDULER_HEARTBEAT` | `/tmp/scheduler.alive` (compose) | ไฟล์ heartbeat ของ scheduler |
| `SET_HOLIDAYS_FILE` | – | วันหยุด SET เพิ่มเติม `["2027-01-01", …]` สำหรับ daily |
| `LOG_LEVEL` | `info` | ระดับ log JSON ของงาน ops (`debug`/`info`/`warn`/`error`) |

## 4. เริ่มใช้งานครั้งแรก

1. เปิด `http://127.0.0.1:3000` (หรือโดเมนหลัง reverse proxy) → เข้าสู่ระบบที่ `/login` ด้วย `TMP_AUTH_PASSWORD`
2. `curl -s http://127.0.0.1:3000/api/health` → `status: "ok"` (demo จะกลายเป็น `degraded` เมื่อข้อมูลเก่ากว่า 4 วันทำการ — ปกติของ demo)
3. **ข้อมูลที่แนบมาเป็น demo (synthetic)** — `scripts/daily.ts` ปฏิเสธการนำข้อมูลจริงมาปนกับหุ้นจำลอง (exit 4) จึงต้องเปลี่ยนเป็นข้อมูลจริงครั้งแรกด้วยวิธีใดวิธีหนึ่ง:
   - **แทนที่ demo ด้วยประวัติจริง** (สำรอง DB ให้อัตโนมัติก่อนลบ):
     ```bash
     docker compose run --rm scheduler bun scripts/fetch-th.ts --symbols SET50 --range 5y --replace-demo
     # systemd: sudo -u tmp bash -c 'cd /opt/thai-momentum-platform && bun scripts/fetch-th.ts --symbols SET50 --range 5y --replace-demo'
     ```
   - **หรือเริ่มจากฐานเปล่า**: ติดตั้งใหม่ด้วย `TMP_SEED_DB=empty` แล้วรัน daily ครั้งแรก (DB ว่าง → ดึงย้อนหลัง 5 ปี universe CORE)
     `docker compose run --rm scheduler bun scripts/daily.ts --force`
   - ผ่าน API (ต้องมี token): `POST /api/feed/fetch` หรือ `POST /api/feed/ingest` พร้อม `"replaceDemo": true` **และ** `"confirm": "REPLACE"` เมื่อ DB มีข้อมูลอยู่แล้ว (ไม่มี confirm = 409) · `POST /api/seed` (ล้างทั้งหมดแล้วสร้าง demo ใหม่) ต้องส่ง `"confirm": "RESET"` เมื่อ DB มีข้อมูล · `POST /api/ingest` (CSV) ไม่ต้อง confirm แต่ระบบสำรอง DB ให้เองเมื่อวันที่นำเข้าทับข้อมูลเดิม
4. ตรวจผล: แท็บข้อมูลแสดงป้าย `REAL (feed: yahoo)` และ `/api/health` → `data.latestDate` เป็นวันทำการล่าสุด
5. ตั้ง monitor ตามหัวข้อ 9 และทดลองกู้ข้อมูลตามหัวข้อ 7.4 หนึ่งครั้ง

## 5. การยืนยันตัวตนและการเปิดให้เครื่องอื่นใช้

- **โหมด local** (ไม่ตั้ง `TMP_AUTH_PASSWORD`): รับเฉพาะคำขอจากเครื่องเดียวกัน (Host และทุก IP ใน X-Forwarded-For ต้องเป็น loopback) — เหมาะกับเครื่องนักพัฒนา
- **โหมด auth** (ตั้ง `TMP_AUTH_PASSWORD`): ทุกหน้า/ทุก API ต้องมี session (`/login`) หรือ `Authorization: Bearer $TMP_API_TOKEN` ยกเว้น `/login`, `/terms`, `/api/auth/*`, **`/api/health`** และไฟล์ static
- **Docker ต้องใช้โหมด auth เสมอ**: คำขอจาก browser บน host ผ่าน docker bridge (X-Forwarded-For = 172.x) โหมด local จึงตอบ 403 `local_only` — `docker-compose.yml` บังคับ `TMP_AUTH_PASSWORD`/`TMP_AUTH_SECRET`/`TMP_API_TOKEN`
- สคริปต์/cron ที่เรียก HTTP API: ส่ง `Authorization: Bearer $TMP_API_TOKEN` และ `Content-Type: application/json` ทุกคำขอที่มี body (POST/PUT/PATCH/DELETE ที่ไม่ใช่ JSON = 415)
- งานหนักถูกจำกัดความถี่ต่อ client (429 + `Retry-After`): รายงาน GET หนัก 20/นาที (burst 12), POST วิจัย 6/นาที, ดึงข้อมูลภายนอก 2/นาที, LLM 3/นาที, Jev 6/นาที

### เปิดให้เครื่องอื่นใช้ (reverse proxy + TLS)

app ฟังเฉพาะ `127.0.0.1` — ให้ reverse proxy บนเครื่องเดียวกันทำ TLS แล้วส่งต่อ ตัวอย่าง Caddy (ออกใบรับรองให้อัตโนมัติ):

```
tmp.example.com {
    reverse_proxy 127.0.0.1:3000
}
```

nginx:

```nginx
server {
    listen 443 ssl http2;
    server_name tmp.example.com;
    ssl_certificate     /etc/letsencrypt/live/tmp.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/tmp.example.com/privkey.pem;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 300s;   # รายงานวิจัยหนัก (maxDuration 300 วินาที)
    }
}
```

แล้วตั้งใน `.env`: `TMP_ALLOWED_ORIGINS=https://tmp.example.com` (จำเป็นเมื่อ proxy ไม่ส่ง Host เดิม) และ `TMP_HSTS=1` (เมื่อใบรับรองถูกต้องแล้วเท่านั้น) → `docker compose up -d`

### หมุนความลับ

| เหตุการณ์ | ทำ |
|---|---|
| ลืมรหัส / รหัสรั่ว | แก้ `TMP_AUTH_PASSWORD` ใน `.env` → `docker compose up -d` (session ของบทบาทนั้นใช้ไม่ได้ทันที) |
| token รั่ว | สร้าง `TMP_API_TOKEN` ใหม่ (`openssl rand -hex 32`) → `docker compose up -d` (scheduler ได้ค่าใหม่พร้อมกัน) → อัปเดตสคริปต์ภายนอก |
| ต้องการเตะทุก session | หมุน `TMP_AUTH_SECRET` |

## 6. งานประจำวัน (daily)

| งาน | เวลา (ไทย) | คำสั่ง | log |
|---|---|---|---|
| daily — สายพานปิดตลาด | 18:30 จ.–ศ. | `bun scripts/daily.ts` | `docker compose logs scheduler` · `/data/runs/YYYY-MM-DD.json` · EventLog `daily_run` |
| backup — สำรองฐานข้อมูล | 02:30 ทุกวัน | `bun scripts/backup-db.ts --reason nightly` | `docker compose logs scheduler` (JSON: `"msg":"backup ok"`) |

- daily: ปฏิทิน SET (ข้ามวันหยุดเอง exit 0) → ดึงข้อมูล (inbox ถ้ามีไฟล์ ไม่งั้น Yahoo .BK) → reconcile/corporate action → ingest → freshness + DQ → สมอง Jev → verify → snapshot → backup → run log (รายละเอียด: หัวไฟล์ `scripts/daily.ts`)
- ข้อมูล EOD ถือว่าพร้อม 17:30 · รันก่อนเวลานั้นประมวลผลรอบวันทำการก่อนหน้า
- หลัง daily สำเร็จ scheduler เรียก `/api/overview`, `/api/signals`, `/api/sniper`, `/api/flagship`, `/api/research/importance` ล่วงหน้า (cache ของ server อุ่น — ผู้ใช้คนแรกหลังข้อมูลเปลี่ยนไม่ต้องรอ ~6 วินาที)

**exit code ของ daily และสิ่งที่ scheduler ทำ**

| code | ความหมาย | scheduler | คนต้องทำ |
|---|---|---|---|
| 0 | สำเร็จ / ไม่มีอะไรเปลี่ยน / วันหยุด | – | – |
| 1 | error ไม่คาดคิด | ลองใหม่ทุก 20 นาที ×2 | ดู stack ใน log |
| 2 | argument ผิด | ไม่ลองซ้ำ | แก้ `TMP_DAILY_CMD` |
| 3 | ดึงข้อมูลไม่ได้ (เน็ต/Yahoo บล็อก/inbox ว่าง) | ลองใหม่ ×2 | ถ้ายังล้ม: ใช้ inbox (settfex/Settrade) หรือ `POST /api/feed/ingest` |
| 4 | คุณภาพข้อมูลวิกฤต (หุ้นหาย/แหล่งขัดกัน/corporate action/DB จำลอง) | ไม่ลองซ้ำ | อ่าน run log → ตรวจกับประกาศ SET → รันเองด้วย `--allow-corporate-actions` เมื่อยืนยันแล้ว |
| 5 | ข้อมูลไม่ขยับถึงรอบที่ควรมี | ลองใหม่ ×2 | วันหยุดพิเศษ → เพิ่มใน `SET_HOLIDAYS_FILE` · feed ช้า → รันเองภายหลัง |
| 6 | สมอง Jev / verify ล้ม | ไม่ลองซ้ำ | ดู log ของ app (`docker compose logs app`) |
| 124 | เกิน `TMP_JOB_TIMEOUT_MIN` | ลองใหม่ ×2 | ตรวจเน็ต/ขนาด universe |

**รันเอง**

```bash
docker compose run --rm scheduler bun deploy/scheduler.ts --plan          # รอบถัดไปของทุกงาน
docker compose exec scheduler bun deploy/scheduler.ts --once daily        # รันทันที (log JSON เหมือนรอบอัตโนมัติ)
docker compose exec scheduler bun scripts/daily.ts --dry-run --json       # ตรวจอย่างเดียว ไม่เขียน DB
```

ไฟล์จาก `lab/fetch_set_feed.py` / `lab/fetch_settrade_feed.py` บนเครื่องอื่น: ส่งตรงเข้า API ด้วย `--post https://tmp.example.com` + env `TMP_API_TOKEN` (สะดวกสุดกับ Docker) หรือวางไฟล์ใน `/data/feed/inbox/` (`docker compose cp file.csv scheduler:/data/feed/inbox/`)

## 7. สำรองและกู้คืนข้อมูล

### 7.1 สำรองอัตโนมัติ

- ทุกคืน 02:30 (scheduler / systemd timer / cron) → `TMP_BACKUP_DIR/tmp-backup-<เวลา UTC>-nightly-xxxx.db` เก็บ 14 ไฟล์ล่าสุด
- ก่อนทุกการลบข้อมูลทั้งชุด (`POST /api/seed`, replace demo, ingest ที่ทับวันที่เดิม) และทุกครั้งที่ daily ingest สำเร็จ
- วิธี: SQLite `VACUUM INTO` — snapshot ที่สมบูรณ์ในตัวขณะ server ยังรันอยู่ (ไม่ต้องหยุด) แล้วตรวจไฟล์ด้วย `PRAGMA quick_check` · สิทธิ์ไฟล์ 600
- **สำเนานอกเครื่อง** (กันดิสก์เสีย/เครื่องหาย): ตั้ง `TMP_BACKUP_MIRROR_DIR` ไปที่ดิสก์อื่น/NAS หรือ sync `/data/backups` ออกไปเป็นระยะ เช่น
  `docker run --rm -v thai-momentum_tmp-data:/data:ro -v /mnt/nas:/out alpine sh -c 'cp -n /data/backups/*.db /out/'`

### 7.2 สำรองเอง

```bash
docker compose exec scheduler bun scripts/backup-db.ts --reason pre-change        # Docker
bun scripts/backup-db.ts --reason pre-change --keep 30 --mirror /mnt/nas/tmp      # systemd / เครื่องเดียว
```

exit 0 = ไฟล์ผ่านการตรวจ · exit 1 = ล้ม (บรรทัด JSON สุดท้ายบอกเหตุผล)

### 7.3 กู้คืน

`scripts/restore-db.ts` ทับ DB ตาม `DATABASE_URL` ด้วยไฟล์ backup — ต้องมี `--yes` ปฏิเสธถ้ามี process เปิดไฟล์ DB อยู่หรือ server ตอบ `/api/health` และคัดลอก DB ปัจจุบันเก็บเป็น `pre-restore-<เวลา>.db` ก่อนเสมอ (ไฟล์นี้ไม่ถูกลบอัตโนมัติ)

```bash
# Docker
docker compose stop app scheduler
docker compose run --rm --no-deps scheduler bun scripts/restore-db.ts --list
docker compose run --rm --no-deps scheduler bun scripts/restore-db.ts --latest            # ดูแผน (exit 2 ไม่เขียนอะไร)
docker compose run --rm --no-deps scheduler bun scripts/restore-db.ts /data/backups/tmp-backup-....db --yes
docker compose start app scheduler
curl -s http://127.0.0.1:3000/api/health     # ตรวจ data.latestDate / rawRows ตรงกับ backup

# systemd
sudo systemctl stop thai-momentum.service thai-momentum-daily.timer thai-momentum-backup.timer
sudo -u tmp bash -c 'cd /opt/thai-momentum-platform && set -a && . /etc/thai-momentum-platform.env && set +a && bun scripts/restore-db.ts --latest --yes'
sudo systemctl start thai-momentum.service thai-momentum-daily.timer thai-momentum-backup.timer
```

exit code: 0 สำเร็จ · 1 ผิดพลาด (ไฟล์เสีย/ไม่ผ่าน integrity_check — DB ปัจจุบันไม่ถูกแตะ) · 2 ไม่มี `--yes` · 3 มี server/process ใช้ DB อยู่
(`--ignore-running-server` ข้ามการตรวจ server — ใช้เฉพาะเมื่อแน่ใจว่า server ที่ตอบเป็นของ DB อื่น)

### 7.4 ซ้อมกู้ (ทุกไตรมาส)

กู้ backup ล่าสุดลงไฟล์ชั่วคราวใน container ที่ถูกลบทิ้งทันที โดยไม่แตะระบบจริง (`TMP_SEED_DB=none` = ไม่ seed ไฟล์ปลายทาง จึงไม่มี pre-restore copy):

```bash
docker compose run --rm --no-deps -e DATABASE_URL=file:/tmp/drill.db -e TMP_SEED_DB=none scheduler \
  bun scripts/restore-db.ts --latest --yes --ignore-running-server
```

ผ่านเมื่อ exit 0 และบรรทัด JSON `"msg":"restore ok"` แสดง `rawRows` / `latestDate` ตรงกับที่คาด (restore ตรวจ `integrity_check` ของไฟล์ที่คัดลอกแล้วทุกครั้ง) — จดวันที่ซ้อมและเวลาที่ใช้ไว้

## 8. อัปเกรด / ย้อนเวอร์ชัน

```bash
git pull                                                      # หรือ checkout tag ที่ต้องการ
docker compose build                                          # image ใหม่ (app ยังรันตัวเดิม)
docker compose stop app scheduler
docker compose run --rm --no-deps scheduler bun scripts/backup-db.ts --reason pre-upgrade
docker compose run --rm --no-deps scheduler bunx prisma db push --skip-generate   # เพิ่มตาราง/คอลัมน์ใหม่ — ปฏิเสธเองถ้าจะทำข้อมูลหาย
docker compose up -d
docker compose ps && curl -s http://127.0.0.1:3000/api/health
TMP_API_TOKEN=<token> bun deploy/smoke.ts --base-url http://127.0.0.1:3000   # (จากเครื่องที่มี checkout + bun) ทุก GET route ต้อง PASS
```

- `prisma db push` ขึ้นข้อความว่าจะลบข้อมูล → หยุด อ่าน changelog ห้ามใส่ `--accept-data-loss` บนข้อมูลจริงโดยไม่มี backup
- **ย้อนเวอร์ชัน**: checkout เวอร์ชันก่อน → `docker compose build` → ถ้า schema เปลี่ยนไปแล้ว กู้ `pre-upgrade` ตามหัวข้อ 7.3 → `docker compose up -d`
- systemd: `git pull && bun install --frozen-lockfile && bunx prisma generate && bun run build` → `rm -rf .next/standalone/data && ln -s ../../data .next/standalone/data` → backup → `bunx prisma db push --skip-generate` → `sudo systemctl restart thai-momentum`
- อัปเกรด Bun/Next: รัน `bun deploy/smoke.ts --runtime bun` ก่อนเปลี่ยน runtime ของ server เป็น bun

## 9. เฝ้าระวัง

### `/api/health`

ไม่ต้องใช้ credential (public ในโหมด auth) ไม่มีความลับ (ไม่มี path/env/ข้อความ error ดิบ) · ตอบใน ~15–30 ms · ทุก query มี timeout 2.5 วินาที

```json
{
  "ok": true, "status": "ok", "version": "0.2.1", "commit": "abc1234", "uptimeSec": 5231, "time": "…",
  "db":   { "ok": true, "latencyMs": 1.4, "error": null },
  "data": { "rawRows": 124800, "latestDate": "2026-09-22", "today": "2026-09-23", "ageDays": 1,
            "weekdaysBehind": 0, "stale": false, "lastIngestAt": null },
  "checks": [ { "name": "db", "ok": true, "critical": true, "detail": "SELECT 1 ใน 1.4 ms" }, "…schema / data / gtaa_panel" ],
  "tookMs": 18
}
```

| HTTP / status | ความหมาย | ระดับแจ้งเตือน |
|---|---|---|
| 200 `ok` | ทุกอย่างปกติ | – |
| 200 `degraded` | ให้บริการได้ แต่ check ไม่ critical ล้ม: ข้อมูลเก่า (`data.stale`) / ยังไม่มีข้อมูล / ไม่มี panel GTAA | แจ้งเตือนแบบ ticket (ภายในวันทำการ) |
| 503 `down` | DB เปิดไม่ได้ / ไม่มีตาราง / ช้าเกิน timeout | เรียกคนทันที (page) |

- `data.weekdaysBehind` = วันทำการ (จ.–ศ.) หลัง `latestDate` ก่อนวันนี้ที่ยังไม่มีข้อมูล (ไม่นับเสาร์–อาทิตย์และวันนี้) · `stale = weekdaysBehind > 4` (หยุดยาวสุดปกติของ SET เช่นสงกรานต์) หรือยังไม่มีข้อมูล
- `data.lastIngestAt` = ingest ล่าสุด — ถ้าไม่ขยับหลัง 18:30 ของวันทำการ แปลว่า daily ไม่ได้รัน

### ตั้งค่าที่แนะนำ

- **Uptime monitor** (UptimeRobot / Better Stack / Grafana Synthetic ฯลฯ) → `GET https://tmp.example.com/api/health` ทุก 1 นาที: แจ้งเมื่อไม่ใช่ 200 ติดกัน 2 ครั้ง · keyword check `"stale":false` → แจ้งเตือนระดับ ticket
- **Dead-man's switch** ของงาน: สร้าง check ที่ healthchecks.io (schedule `30 18 * * 1-5`, grace 2 ชม. และ `30 2 * * *`) → ตั้ง `TMP_PING_DAILY_URL` / `TMP_PING_BACKUP_URL` → แจ้งเตือนเมื่องานล้ม **หรือไม่ได้รัน**
- **Docker**: `docker compose ps` (คอลัมน์ health) · `docker inspect --format '{{json .State.Health}}' thai-momentum-app-1`
- **log**: งาน ops พิมพ์ JSON บรรทัดละ event — `docker compose logs scheduler | grep '"level":"error"'` · log ของ container หมุนเวียน 10 MB × 5 ไฟล์
- **smoke หลัง deploy**: `bun deploy/smoke.ts --base-url https://tmp.example.com` (ต้องมี `TMP_API_TOKEN` ใน env)

## 10. เช็กลิสต์เหตุขัดข้อง

เริ่มทุกครั้งด้วย: `docker compose ps` → `curl -s http://127.0.0.1:3000/api/health` → `docker compose logs --tail 200 app scheduler`

| อาการ | ตรวจ | แก้ |
|---|---|---|
| `/api/health` 503, `db.error` = `PrismaClientInitializationError` | ไฟล์ DB มีไหม สิทธิ์ถูกไหม ดิสก์เต็มไหม (`df -h`, `docker system df`) | คืนพื้นที่ดิสก์ · `chown 10001:10001` · กู้ backup (7.3) |
| 503 + check `schema` ล้ม | เพิ่งอัปเกรด? | `bunx prisma db push --skip-generate` (หัวข้อ 8) |
| container `unhealthy` วน restart | log มี `EADDRINUSE` / `Failed to start server`? | พอร์ตชน → เปลี่ยน `TMP_HOST_PORT` |
| ทุก route 500 `Expected CommonJS module to have a function wrapper` | server รันด้วย bun | รันด้วย `node .next/standalone/server.js` |
| เปิดเว็บได้ 403 `local_only` | โหมด local แต่เข้าจากเครื่องอื่น/ผ่าน Docker | ตั้ง `TMP_AUTH_PASSWORD` (หัวข้อ 5) |
| 401 จากสคริปต์/scheduler | token ไม่ตรง | ตั้ง `TMP_API_TOKEN` เดียวกันทั้ง app และผู้เรียก |
| 429 | เรียกรายงานหนักถี่เกิน | รอ `Retry-After` · สคริปต์ให้เว้นจังหวะ |
| `data.stale: true` | `docker compose logs scheduler \| grep daily` · `/data/runs/<วัน>.json` | ทำตามตาราง exit code หัวข้อ 6 · รันเอง `--once daily` |
| daily exit 4 "DB จำลอง" | ยังเป็น demo | เปลี่ยนเป็นข้อมูลจริงครั้งแรก (หัวข้อ 4) |
| backup ล้ม | `"msg":"backup failed"` · ดิสก์/สิทธิ์ `TMP_BACKUP_DIR` | คืนพื้นที่ · รันเอง (7.2) · ตรวจว่า mirror ยัง mount อยู่ |
| หน้าเว็บช้าครั้งแรกหลังข้อมูลเปลี่ยน | ปกติ: คำนวณใหม่ครั้งแรก (importance ~6 วินาที) | scheduler อุ่นให้หลัง daily · ตรวจ `TMP_APP_URL` / token |
| ข้อมูลเสีย/ลบผิด | – | หยุดทุก service → กู้ backup ก่อนเหตุ (7.3) → ตรวจ health |
| RAM หมด / OOM kill | `docker stats` (server ใช้ ~0.9 GB หลังเปิดทุกแท็บ) | ให้เครื่อง ≥ 2 GB · ตั้ง restart policy (มีแล้ว) |

หลังแก้: เขียนบันทึกเหตุการณ์สั้น ๆ (อาการ · เวลา · สาเหตุ · แก้อย่างไร · กันซ้ำอย่างไร)

## 11. ความจุและตัวเลขที่วัดจริง

วัด 2026-09-23 บน demo DB (240 หุ้น × 520 วันทำการ = RawDaily 124,800 แถว, ไฟล์ 30.7 MB) · Linux x86-64 · node 22.22 · bun 1.3.11

| รายการ | ผล |
|---|---|
| `GET /api/health` | 15–25 ms (warm, ใน process) · 24–30 ms ผ่าน HTTP + proxy · ครั้งแรกหลังเริ่ม process 43–60 ms |
| `GET /api/research/importance` ก่อนมี cache | 6.3 วินาที ครั้งแรก · **4.6 วินาทีทุกครั้งที่เรียกซ้ำ** (`hold=10&nRepeats=2`: 3.75 วินาทีทุกครั้ง) |
| `GET /api/research/importance` หลังมี cache | ครั้งแรกต่อชุดข้อมูล 6.5 วินาที (MISS) · เรียกซ้ำ **16–21 ms** ใน process / 27–40 ms ผ่าน HTTP (`X-Cache: HIT`) · ผลเหมือนเดิมทุกไบต์ |
| GET ทุก route ครั้งแรก (37 เส้น + หน้าเว็บ) | รวม ~25 วินาที · หนักสุด: importance 6.2 · signals 2.8 · engines/global 2.4 · overview 1.6 · signals/ic 1.4 วินาที |
| RAM ของ server | ~100 MB ตอนว่าง · ~0.9 GB หลังเรียกครบทุก route (peak 0.93 GB) → เครื่อง/VM ≥ 2 GB |
| backup (`VACUUM INTO` + quick_check) | 0.25 วินาที → ไฟล์ 27.8 MB |
| restore | 0.4 วินาที |

- **event loop**: การคำนวณครั้งแรกของรายงานหนักบล็อก server ได้ ~6 วินาที (JS thread เดียว) — HEALTHCHECK จึงตั้ง timeout 10 วินาที, timeout ของ DB ใน `/api/health` รู้ตัวเมื่อ event loop ถูกบล็อก (ไม่ตอบ 503 ปลอม) และ scheduler อุ่น cache หลัง daily
- **ต้นทุนของ `/api/health`**: `COUNT(*)` บน RawDaily ~16 ms ที่ 124,800 แถว (โตเชิงเส้นตามจำนวนแถว) — ตรวจทุก 30 วินาทีได้สบาย
- **cache ของ importance**: key = ลายนิ้วมือข้อมูล (`dataFingerprint()` + จำนวน/id ล่าสุดของ Snapshot) × พารามิเตอร์ · เก็บ ≤ 32 ชุดต่อชุดข้อมูล · ข้อมูลเปลี่ยนจาก process อื่น (daily ใน scheduler) รู้ผ่าน `data_version` → คำนวณใหม่ครั้งเดียว
- **การเติบโต**: ~59 KB ต่อวันทำการต่อ 240 หุ้น (≈ 15 MB/ปี) · ทั้งตลาด ~800 หุ้น ≈ 50 MB/ปี · backup 14 ไฟล์ ≈ 14 × ขนาด DB
- **ขีดจำกัด**: SQLite + cache ในหน่วยความจำ → instance เดียว · ถ้าต้องมีหลาย instance ต้องย้ายไป Postgres และ cache ร่วม (ไม่อยู่ในขอบเขตปัจจุบัน)

## 12. CI

`.github/workflows/thai-momentum-platform.yml` รันเมื่อมีการแก้ `thai-momentum-platform/**`:

- **web**: `bun install --frozen-lockfile` → `bunx prisma generate` → `bunx tsc --noEmit --incremental false` → `bun run lint` → `bun test src` → `bun test ./scripts ./deploy` → `bun run build` → `bun deploy/smoke.ts` (เปิด standalone server ด้วย node บนสำเนา `db/custom.db` แล้ว GET ทุก route: 200 + JSON เคร่งครัด ไม่มี NaN/Infinity + importance ครั้งที่สองต้อง `X-Cache: HIT`) → `bun audit --audit-level=critical`
- **python**: Python 3.11 + numpy/pandas → `python3 -m unittest discover -s lab/tests_stops` และ `python3 lab/tests_lab/test_lab_kit.py`

รันชุดเดียวกันบนเครื่อง: คำสั่งข้างบนตามลำดับ (ทุกคำสั่งรันจาก `thai-momentum-platform/`)
