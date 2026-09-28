# ============================================================
# Omniscient Quant Engine — image โปรดักชัน (multi-stage) · build context = โฟลเดอร์ omniscient-quant-engine/
#
#   docker build -t omniscient-quant-engine .
#   ใช้งานจริงผ่าน docker compose — ดู docker-compose.yml และ README.md
#
# stage
#   base     node 22 (bookworm-slim) + bun 1.3.11 + openssl (Prisma engine) + tini
#   deps     bun install --frozen-lockfile (ตาม bun.lock ทุกเวอร์ชัน)
#   build    prisma generate + next build (standalone) + ไฟล์ seed (demo DB, DB เปล่ามีแค่ schema)
#   runtime  node server.js (standalone) · ผู้ใช้ non-root uid 10001 · volume /data · HEALTHCHECK /api/health
#
# server รันด้วย node (ไม่ใช่ bun) เหมือน `bun run start` และ CI — ตรวจแล้วว่า standalone ของ Next 16 ผ่านครบทุก route บน node 22
# หมายเหตุ: image นี้ยังไม่ได้ build ทดสอบใน session ที่สร้างไฟล์ (sandbox ไม่มีเครือข่ายสำหรับ docker) — ตรวจครั้งแรกบนเครื่องที่มี Docker
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
 && groupadd --gid 10001 oqe \
 && useradd --uid 10001 --gid oqe --no-create-home --home-dir /app --shell /usr/sbin/nologin oqe
ENV NEXT_TELEMETRY_DISABLED=1 \
    PRISMA_HIDE_UPDATE_MESSAGE=1
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
 && mkdir -p /opt/oqe-seed \
 && cp db/custom.db /opt/oqe-seed/custom.db \
 && DATABASE_URL=file:/opt/oqe-seed/empty.db bunx prisma db push --skip-generate \
 && chmod 0444 /opt/oqe-seed/*.db

# ---------- runtime ----------
FROM base AS runtime
ARG OQE_GIT_SHA=""
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATABASE_URL=file:/data/app.db \
    OQE_GIT_SHA=${OQE_GIT_SHA}
# standalone = server.js + node_modules ที่ trace แล้ว (รวม Prisma engine) · bun run build คัดลอก .next/static และ public เข้าไปแล้ว
COPY --from=build /app/.next/standalone ./
COPY --from=build /opt/oqe-seed /opt/oqe-seed
COPY deploy/docker-entrypoint.sh /usr/local/bin/oqe-entrypoint
RUN chmod 0755 /usr/local/bin/oqe-entrypoint \
 && mkdir -p /app/.next/cache /data \
 && chown oqe:oqe /data /app/.next/cache
USER oqe
VOLUME ["/data"]
EXPOSE 3000
# /api/health เป็น public path ในโหมด auth — ไม่ต้องใช้ credential
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.status===200?0:1),()=>process.exit(1))"]
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/oqe-entrypoint"]
CMD ["node", "server.js"]
