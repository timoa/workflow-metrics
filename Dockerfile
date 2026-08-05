# syntax=docker/dockerfile:1.7
ARG NODE_VERSION=24-alpine

# ============================================================================
# Stage 1 — install all dependencies (dev + prod) using the frozen lockfile
# ============================================================================
FROM node:${NODE_VERSION} AS deps
WORKDIR /app

# Corepack ships with Node 16+; pin the exact pnpm version from package.json
# so the lockfile interpretation matches local dev and CI.
RUN corepack enable && corepack prepare pnpm@10.30.3 --activate

# Copy only the manifests so this layer is reused across source-only changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm config set store-dir /pnpm/store && \
    pnpm install --frozen-lockfile

# ============================================================================
# Stage 2 — build the SvelteKit Node bundle and prune dev dependencies
# ============================================================================
FROM node:${NODE_VERSION} AS build
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.30.3 --activate

# Reuse node_modules from the deps stage and copy the rest of the source.
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# SvelteKit's `$env/static/public` requires PUBLIC_* vars at build time.
# The Supabase wiring still imports them (Stage 4 will remove it). Provide
# placeholders so `pnpm build` succeeds without a `.env` in the image. Real
# values come from runtime env_file in docker-compose.yml / the Helm chart.
ENV PUBLIC_SUPABASE_URL=https://placeholder.supabase.co \
    PUBLIC_SUPABASE_ANON_KEY=placeholder-anon-key \
    PUBLIC_APP_URL=http://localhost:3000

# Build the Node adapter output to ./build and drop dev-only deps.
# CI=1 lets `pnpm prune --prod` run non-interactively inside the build.
RUN CI=1 pnpm build && CI=1 pnpm prune --prod

# ============================================================================
# Stage 3 — runtime image (small, non-root, healthchecked)
# ============================================================================
FROM node:${NODE_VERSION} AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0

# wget is used by the HEALTHCHECK below. node:alpine does not ship it.
# The base image already provides a non-root `node` user (uid/gid 1000), so we
# reuse it instead of creating a duplicate account.
RUN apk add --no-cache wget

# Copy only what we need to run the app: the built bundle, pruned node_modules,
# and the package.json so any runtime introspection (engines, etc.) still works.
COPY --from=build --chown=node:node /app/build ./build
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package.json ./package.json

USER node

EXPOSE 3000

# Liveness/readiness probe target. Intentionally unauthenticated and DB-free
# — see src/routes/healthz/+server.ts. The Node process binds to HOST:PORT,
# so we probe via 127.0.0.1 to avoid any DNS surprises.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/healthz || exit 1

# Default SvelteKit adapter-node entry point. PORT and HOST above are honoured.
CMD ["node", "build/index.js"]