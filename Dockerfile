# syntax=docker/dockerfile:1

# Multi-stage build for Next.js (standalone output) on Cloud Run.
# See DEPLOYMENT.md for the full deployment guide.

# Pin to the Node major the project targets. node:26-slim keeps the image
# small while still providing a glibc base (works with Next's native deps).
#
# Pinned by digest for reproducible, tamper-resistant builds — the floating tag
# can move under you. NODE_DIGEST is the multi-arch *index* digest for
# node:26-slim (resolves per-platform: amd64 on Cloud Run, arm64 locally), so
# the tag is kept alongside it only for readability; Docker resolves by digest.
# Refresh deliberately when bumping Node:
#   docker buildx imagetools inspect node:26-slim --format '{{.Manifest.Digest}}'
ARG NODE_VERSION=26
ARG NODE_DIGEST=sha256:0c6375bcc1ee170c22bd04e11b7c1ff9afc3bb16a865a2629308ceb4b72380ff
ARG PNPM_VERSION=12.21.0

# ---- deps: install production + dev deps (dev needed to build) ----
FROM node:${NODE_VERSION}-slim@${NODE_DIGEST} AS deps
ARG PNPM_VERSION
WORKDIR /app
# Enable the pinned pnpm via corepack (matches package.json "packageManager").
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
# Copy only the manifests first so this layer is cached unless deps change.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# ---- builder: build the standalone server ----
FROM node:${NODE_VERSION}-slim@${NODE_DIGEST} AS builder
ARG PNPM_VERSION
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Telemetry is noise in container builds.
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

# ---- runner: tiny runtime image with just the standalone output ----
FROM node:${NODE_VERSION}-slim@${NODE_DIGEST} AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Cloud Run sets PORT; Next's standalone server.js honors PORT and HOSTNAME.
ENV PORT=8080
ENV HOSTNAME=0.0.0.0

# `tini` as PID 1: forwards signals (so Cloud Run's SIGTERM reaches Node for a
# graceful shutdown + in-flight request draining) and reaps zombies — neither of
# which Node does when it is itself PID 1.
RUN apt-get update \
    && apt-get install -y --no-install-recommends tini \
    && rm -rf /var/lib/apt/lists/*

# Run as an unprivileged user.
RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs nextjs

# The standalone output already contains a minimal node_modules and server.js.
# Public assets and the static chunks must be copied alongside it.
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 8080
ENTRYPOINT ["tini", "--"]
CMD ["node", "server.js"]
