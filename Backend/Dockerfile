# syntax=docker/dockerfile:1
#
# Zoiko Mail identity API.
#
# node:24-slim rather than alpine: @node-rs/argon2 ships prebuilt binaries per
# libc, and the glibc build is the better-tested one. Alpine would pull the musl
# variant and turn a password-hashing failure into a runtime surprise.

# ── dependencies ────────────────────────────────────────────────
FROM node:24-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ── build ───────────────────────────────────────────────────────
FROM node:24-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
# package.json is required here, not just at runtime: it carries
# "type": "module", and without it tsc treats every .ts file as CommonJS and
# rejects the top-level await in src/index.ts.
COPY package.json tsconfig.json ./
COPY src ./src
RUN npx tsc

# ── runtime ─────────────────────────────────────────────────────
FROM node:24-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Production dependencies only — tsx, typescript and the type packages have no
# business in a running container.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY db ./db

# Drop root. The node image ships an unprivileged 'node' user for this.
USER node

EXPOSE 4000

# Migrations run before the server accepts traffic, so a fresh volume comes up
# schema-complete. For production this belongs in a separate job — a replica
# set would otherwise race to apply the same migration.
CMD ["sh", "-c", "node db/migrate.mjs && node dist/index.js"]
