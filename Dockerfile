# syntax=docker/dockerfile:1.7
#
# The web app as a standalone Node server. In production it sits behind the
# nginx in ../pms-multi-tenant-api (docker-compose.prod.yml there), which sends
# /api/* straight to the API and everything else here.
#
#   docker build -t pms-web:$(git rev-parse --short HEAD) \
#     --build-arg VERSION=$(git describe --tags --always) \
#     --build-arg REVISION=$(git rev-parse HEAD) .

ARG NODE_VERSION=24

# -------------------------------------------------------------------- base
FROM node:${NODE_VERSION}-alpine AS base

ENV NEXT_TELEMETRY_DISABLED=1 \
    PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH

# The pnpm version pinned in package.json's `packageManager`, via corepack.
RUN corepack enable pnpm

# -------------------------------------------------------------------- deps
# Dependencies only, keyed on the lockfile, so this layer survives edits to
# the source. The store is a cache mount: it never lands in an image layer.
FROM base AS deps
WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile

# ------------------------------------------------------------------- build
FROM base AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_* values are inlined into the browser bundle at this step, so
# they are build arguments, not runtime settings. In production leave both
# unset: the API shares the clinic's own origin, and the socket is derived
# from window.location. .env* files never reach the build (.dockerignore), so
# a developer's .env.local cannot leak 127.0.0.1 into a production bundle.
ARG NEXT_PUBLIC_API_BASE
ARG NEXT_PUBLIC_API_WS_ORIGIN
ENV NEXT_PUBLIC_API_BASE=${NEXT_PUBLIC_API_BASE} \
    NEXT_PUBLIC_API_WS_ORIGIN=${NEXT_PUBLIC_API_WS_ORIGIN}

RUN --mount=type=cache,id=next-cache,target=/app/.next/cache \
    pnpm build

# ----------------------------------------------------------------- runtime
FROM node:${NODE_VERSION}-alpine AS runtime

ARG VERSION=dev
ARG REVISION=unknown
LABEL org.opencontainers.image.title="pms-multi-tenant-web" \
      org.opencontainers.image.description="Multi-tenant patient management web app" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${REVISION}"

# HOSTNAME must be set explicitly: Docker fills it with the container id, and
# server.js binds to whatever it says — which would leave it unreachable from
# nginx.
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# tini is PID 1: it forwards SIGTERM so in-flight requests finish, and reaps
# zombies.
RUN apk add --no-cache tini

WORKDIR /app

# Owned by root and read-only to the process; only .next/cache is writable,
# and compose mounts a tmpfs there.
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
RUN mkdir -p .next/cache && chown node:node .next/cache

# The image's built-in unprivileged user (uid 1000).
USER node

EXPOSE 3000

# No curl in the image — node is already here. `/` from a bare IP is the apex
# page, which needs nothing from the API, so this checks this container alone.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
