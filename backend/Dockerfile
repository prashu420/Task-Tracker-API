# Multi-stage build: compile in a fat stage, ship a lean runtime image.
# node:22-slim (Debian) is used over Alpine so Prisma engines and the argon2
# native addon resolve from prebuilt binaries without a musl toolchain.

# ---- builder ----
FROM node:22-slim AS builder
WORKDIR /app

# Prisma needs OpenSSL to fetch/use the correct query engine.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

# Generate the typed client before building so the build sees it.
COPY prisma ./prisma
RUN npx prisma generate

COPY . .
RUN npm run build

# ---- runner ----
FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

# Carry over installed deps (incl. generated Prisma client + CLI for migrations),
# the compiled output, and the schema/migrations.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY package*.json ./

EXPOSE 3000

# Apply migrations, seed idempotent demo data, then start the API.
CMD ["sh", "-c", "npx prisma migrate deploy && node prisma/seed.js && node dist/main"]
