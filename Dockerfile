# syntax=docker/dockerfile:1

# Multi-stage build for Next.js (standalone output) on Cloud Run.
# See DEPLOYMENT.md for the full deployment guide.

# Pin to the Node major the project targets. node:26-slim keeps the image
# small while still providing a glibc base (works with Next's native deps).
ARG NODE_VERSION=26
ARG PNPM_VERSION=12.21.0

# ---- deps: install production + dev deps (dev needed to build) ----
FROM node:${NODE_VERSION}-slim AS deps
ARG PNPM_VERSION
WORKDIR /app
# Enable the pinned pnpm via corepack (matches package.json "packageManager").
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
# Copy only the manifests first so this layer is cached unless deps change.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# ---- builder: build the standalone server ----
FROM node:${NODE_VERSION}-slim AS builder
ARG PNPM_VERSION
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Telemetry is noise in container builds.
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

# ---- runner: tiny runtime image with just the standalone output ----
FROM node:${NODE_VERSION}-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Cloud Run sets PORT; Next's standalone server.js honors PORT and HOSTNAME.
ENV PORT=8080
ENV HOSTNAME=0.0.0.0

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
CMD ["node", "server.js"]
