# ===== مرحلة البناء =====
FROM oven/bun:1.1 AS builder
WORKDIR /app

# انسخ ملفات التبعيات
COPY package.json bun.lock* ./
COPY prisma ./prisma

# ثبّت التبعيات
RUN bun install --frozen-lockfile

# انسخ باقي الكود
COPY . .

# ابنِ التطبيق للإنتاج
RUN bun run db:generate && bun run build

# ===== مرحلة التشغيل =====
FROM oven/bun:1.1-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# ثبّت فقط ما يلزم للتشغيل
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/package.json ./

# مجلدات البيانات الدائمة (قاعدة البيانات + المرفقات)
RUN mkdir -p /app/data /app/uploads
ENV DATABASE_URL="file:/app/data/custom.db"
ENV UPLOAD_DIR="/app/uploads"

EXPOSE 3000

# شغّل الهجرات ثم الخادم
CMD ["sh", "-c", "bun run db:push && node server.js"]
