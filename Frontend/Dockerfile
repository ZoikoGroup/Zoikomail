# syntax=docker/dockerfile:1
#
# Zoiko Mail frontend.
#
# NEXT_PUBLIC_API_BASE_URL is needed twice, and for different reasons:
#
#   · at BUILD time, because Next inlines NEXT_PUBLIC_* into the client bundle
#     — bake the wrong value and the browser calls the wrong host forever;
#   · at RUN time, because next.config.ts derives the CSP connect-src from it,
#     and headers() is evaluated when the server starts.
#
# The value is the address the BROWSER uses, not the container network name.
# The browser runs on the host, so it is localhost:4000 — never backend:4000.

ARG API_BASE_URL=http://localhost:4000/api/v1

# ── dependencies ────────────────────────────────────────────────
FROM node:24-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ── build ───────────────────────────────────────────────────────
FROM node:24-slim AS build
WORKDIR /app
ARG API_BASE_URL
ENV NEXT_PUBLIC_API_BASE_URL=$API_BASE_URL
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ── runtime ─────────────────────────────────────────────────────
FROM node:24-slim AS runtime
WORKDIR /app
ARG API_BASE_URL
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_PUBLIC_API_BASE_URL=$API_BASE_URL

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/next.config.ts ./next.config.ts

USER node

EXPOSE 3000

CMD ["npx", "next", "start"]
