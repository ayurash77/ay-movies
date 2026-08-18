FROM mirror.gcr.io/library/node:24-slim

WORKDIR /app

# openssl is required by Prisma engines; curl — by the platform healthcheck
RUN apt-get update -y \
    && apt-get install -y --no-install-recommends openssl curl \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# Apply pending migrations, then serve the built app
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && pnpm exec tsx scripts/merge-duplicate-movies.ts --apply && pnpm preview --port ${PORT:-3000} --host 0.0.0.0"]
