# ============================================================
# Thai Momentum Platform — image โปรดักชัน (multi-stage) · build context = โฟลเดอร์ thai-momentum-platform/
#
#   docker build -t thai-momentum-platform .                         # stage สุดท้าย = runtime (เว็บอย่างเดียว)
#   docker build --target tools -t thai-momentum-platform-tools .    # scheduler + สคริปต์ ops (bun scripts/*.ts)
#   docker build --target aio   -t thai-momentum-platform-aio .      # all-in-one: เว็บ + scheduler ใน container เดียว
#                                                                    #   (Fly.io / Render ที่ disk ผูกกับ service เดียว)
#   ใช้งานจริงผ่าน docker compose (app = runtime, scheduler = tools) — ดู docker-compose.yml และ docs/ops.md
#
# stage
#   base      node 22 (bookworm-slim) + bun 1.3.11 + openssl (Prisma engine debian-openssl-3.0.x) + tini
#   deps      bun install --frozen-lockfile (ตาม bun.lock ทุกเวอร์ชัน)
#   build     prisma generate + next build (standalone) + ไฟล์ seed (demo DB, DB เปล่ามีแค่ schema, panel GTAA)
#   prod-deps dependencies เฉพาะ production + prisma client (สำหรับ tools/aio)
#   tools     bun + source + prod node_modules — CMD: scheduler (daily 18:30 จ.–ศ. / backup 02:30 เวลาไทย)
#   aio       tools + standalone server — CMD: scheduler --with-server
#   runtime   node server.js (standalone) · ผู้ใช้ non-root uid 10001 · volume /data · HEALTHCHECK /api/health
#
# ทำไม server รันด้วย node ไม่ใช่ bun: Next 16.3.6 (Turbopack) + Bun 1.3.11 ล้มทุก route ด้วย
#   "Expected CommonJS module to have a function wrapper" (ตรวจ 2026-09-23) — node 22 ผ่านครบทุก GET route
# ============================================================

ARG NODE_IMAGE=node:22-bookworm-slim
ARG BUN_IMAGE=oven/bun:1.3.11-slim

FROM ${BUN_IMAGE} AS bun

# ---------- base ----------
FROM ${NODE_IMAGE} AS base
RUN apt-get update -y \
 && apt-get install -y --no-install-recommends openssl ca-certificates tini \
 && rm -rf /var/lib/apt/lists/*
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
RUN ln -sf /usr/local/bin/bun /usr/local/bin/bunx \
 && bun --version && node --version \
 && groupadd --gid 10001 tmp \
 && useradd --uid 10001 --gid tmp --no-create-home --home-dir /app --shell /usr/sbin/nologin tmp
ENV NEXT_TELEMETRY_DISABLED=1 \
    PRISMA_HIDE_UPDATE_MESSAGE=1 \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
WORKDIR /app

# ---------- deps ----------
FROM base AS deps
COPY package.json bun.lock bunfig.toml ./
COPY prisma ./prisma
RUN bun install --frozen-lockfile

# ---------- build ----------
FROM deps AS build
COPY . .
# build ไม่ต่อฐานข้อมูล (route ทั้งหมดเป็น dynamic) — ชี้ไฟล์ชั่วคราว ถ้ามีอะไรเรียก DB ตอน build จะล้มให้เห็นทันที
ENV DATABASE_URL=file:/tmp/build.db
RUN bunx prisma generate \
 && bun run build \
 && test -f .next/standalone/server.js \
 && mkdir -p /opt/tmp-seed/gtaa \
 && cp db/custom.db /opt/tmp-seed/custom.db \
 && cp data/gtaa/panel.json /opt/tmp-seed/gtaa/panel.json \
 && DATABASE_URL=file:/opt/tmp-seed/empty.db bunx prisma db push --skip-generate \
 && chmod 0444 /opt/tmp-seed/*.db /opt/tmp-seed/gtaa/panel.json

# ---------- prod-deps ----------
FROM base AS prod-deps
COPY package.json bun.lock bunfig.toml ./
COPY prisma ./prisma
RUN bun install --frozen-lockfile --production && bunx prisma generate

# ---------- tools (scheduler + สคริปต์ ops) ----------
FROM base AS tools
ARG TMP_GIT_SHA=""
ENV NODE_ENV=production \
    DATABASE_URL=file:/data/app.db \
    TMP_BACKUP_DIR=/data/backups \
    TMP_GIT_SHA=${TMP_GIT_SHA}
COPY --from=prod-deps --chown=tmp:tmp /app/node_modules ./node_modules
COPY --from=build --chown=tmp:tmp /app/package.json /app/bun.lock /app/bunfig.toml /app/tsconfig.json ./
COPY --from=build --chown=tmp:tmp /app/prisma ./prisma
COPY --from=build --chown=tmp:tmp /app/src ./src
COPY --from=build --chown=tmp:tmp /app/scripts ./scripts
COPY --from=build --chown=tmp:tmp /app/deploy ./deploy
COPY --from=build /opt/tmp-seed /opt/tmp-seed
COPY deploy/docker-entrypoint.sh /usr/local/bin/tmp-entrypoint
# data/* ที่แอป/สคริปต์เขียน (GTAA panel, backup, run log, inbox) → symlink เข้า volume /data
RUN chmod 0755 /usr/local/bin/tmp-entrypoint \
 && mkdir -p /app/data /data \
 && for d in gtaa backups runs feed; do rm -rf "/app/data/$d"; ln -s "/data/$d" "/app/data/$d"; done \
 && chown tmp:tmp /data /app/data
USER tmp
VOLUME ["/data"]
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/tmp-entrypoint"]
CMD ["bun", "deploy/scheduler.ts"]

# ---------- aio (เว็บ + scheduler ใน container เดียว) ----------
FROM tools AS aio
ENV PORT=3000 \
    HOSTNAME=0.0.0.0 \
    TMP_APP_URL=http://127.0.0.1:3000 \
    TMP_SCHEDULER_HEARTBEAT=/tmp/scheduler.alive
USER root
COPY --from=build /app/.next/standalone /app/.next/standalone
# server.js chdir ไปโฟลเดอร์ของตัวเอง → data/* ของ standalone ต้องชี้เข้า volume เช่นกัน
RUN mkdir -p /app/.next/standalone/data /app/.next/standalone/.next/cache \
 && for d in gtaa backups runs feed; do rm -rf "/app/.next/standalone/data/$d"; ln -s "/data/$d" "/app/.next/standalone/data/$d"; done \
 && chown tmp:tmp /app/.next/standalone/.next/cache
USER tmp
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.status===200?0:1),()=>process.exit(1))"]
CMD ["bun", "deploy/scheduler.ts", "--with-server"]

# ---------- runtime (เว็บ) — stage สุดท้าย = target ค่าเริ่มต้นของ docker build ----------
FROM base AS runtime
ARG TMP_GIT_SHA=""
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATABASE_URL=file:/data/app.db \
    TMP_BACKUP_DIR=/data/backups \
    TMP_GIT_SHA=${TMP_GIT_SHA}
# standalone = server.js + node_modules ที่ trace แล้ว (รวม Prisma engine) · bun run build คัดลอก .next/static และ public เข้าไปแล้ว
# ไฟล์แอปเป็นของ root (ผู้ใช้ tmp อ่านได้อย่างเดียว) — เขียนได้เฉพาะ /data และ .next/cache
COPY --from=build /app/.next/standalone ./
COPY --from=build /opt/tmp-seed /opt/tmp-seed
COPY deploy/docker-entrypoint.sh /usr/local/bin/tmp-entrypoint
RUN chmod 0755 /usr/local/bin/tmp-entrypoint \
 && mkdir -p /app/data /app/.next/cache /data \
 && for d in gtaa backups runs feed; do rm -rf "/app/data/$d"; ln -s "/data/$d" "/app/data/$d"; done \
 && chown tmp:tmp /data /app/.next/cache
USER tmp
VOLUME ["/data"]
EXPOSE 3000
# /api/health เป็น public path ในโหมด auth และมาจาก loopback ในโหมด local — ไม่ต้องใช้ credential
# timeout 10s: คำขอแรกหลังข้อมูลเปลี่ยนของรายงานหนัก (importance ~6 วินาที) บล็อก event loop ชั่วคราวได้
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.status===200?0:1),()=>process.exit(1))"]
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/tmp-entrypoint"]
CMD ["node", "server.js"]
