# ─────────────────────────────────────────────────────────────
# سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
# نسخهٔ سلف‌هاست — اجرای کامل بدون Cloudflare روی Node.js + SQLite
# معماری: docs/DOCKERIZE.md · راهنما: docs/SELF-HOST.fa.md
# ─────────────────────────────────────────────────────────────

# ---- مرحلهٔ ۱: بیلد (esbuild + deps کامل) ----
FROM node:24-bookworm-slim AS build
WORKDIR /app

# اول مانیفست‌ها برای لایهٔ کشABLE
COPY package.json package-lock.json ./
RUN npm ci

# سورس لایهٔ سرور و اپ
COPY tsconfig.json ./tsconfig.json
COPY src ./src
COPY server ./server

RUN node scripts/build-selfhost.mjs

# ---- مرحلهٔ ۲: ران‌تایم (بدون node_modules — همه‌چیز داخل باندل) ----
FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production \
    DATA_DIR=/data \
    PORT=3000 \
    HOST=0.0.0.0

COPY --from=build /app/dist/server.js ./dist/server.js
COPY --from=build /app/dist/cli.js ./dist/cli.js
COPY public ./public
COPY migrations ./migrations
COPY scripts/bootstrap.sql ./scripts/bootstrap.sql

# کاربر غیر-root + volume دائمی دیتابیس
RUN groupadd -r app && useradd -r -g app app \
    && mkdir -p /data && chown app:app /data
VOLUME /data
USER app

EXPOSE 3000

# healthcheck بدون وابستگی خارجی (fetch داخلی Node)
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>r.text()).then(t=>{if(!t.includes('\"ok\":true'))process.exit(1)}).catch(()=>process.exit(1))"

# بوت: مهاجرت‌ها خودکارِ idempotent + شروع سرور + کرون‌ها
CMD ["node", "dist/server.js"]
