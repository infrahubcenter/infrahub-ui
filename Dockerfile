# syntax=docker/dockerfile:1

# Production image for the Infra Hub Center Next.js frontend. Local
# development does not use this file (see README.md's "Start the Next.js
# frontend" -- `npm run dev`); this exists purely for deploying the built
# app, see docs/deployment.md.

# --- Dependencies stage (cached separately from source) ---
FROM --platform=$BUILDPLATFORM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# --- Build stage ---
FROM --platform=$BUILDPLATFORM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_* variables are inlined into the client JavaScript bundle at
# build time, not read at container start. Leave NEXT_PUBLIC_API_BASE_URL
# empty (the published image does) so the console calls /api/* on its own
# origin -- serve it behind a reverse proxy that routes /api/* to the
# backend (docker.io/infrahubcenter/infrahub-gateway). Only pass
# --build-arg NEXT_PUBLIC_API_BASE_URL=https://api.example.com when the
# API lives on a genuinely different origin. Plan and marketing URL are
# runtime settings instead (INFRAHUB_PLAN, INFRAHUB_MARKETING_URL).
ARG NEXT_PUBLIC_API_BASE_URL
ARG NEXT_PUBLIC_MONITORING_REFRESH=30s
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_MONITORING_REFRESH=$NEXT_PUBLIC_MONITORING_REFRESH
RUN npm run build

# --- Runtime stage ---
# Plain Alpine plus only the node binary (and the two C++ runtime libs it
# links against) -- none of node:22-alpine's npm, npx, corepack and yarn,
# which a standalone Next.js server never uses. Pinned to the same Alpine
# release as node:22-alpine so the musl build of node matches.
FROM node:22-alpine AS node
FROM alpine:3.24 AS runtime
RUN apk add --no-cache libstdc++ libgcc && \
    addgroup -g 1001 -S app && adduser -S app -u 1001 -G app
COPY --from=node /usr/local/bin/node /usr/local/bin/node
WORKDIR /app
ENV NODE_ENV=production

# next.config.ts's output:"standalone" (Step 20) traces only the files a
# production server actually needs into .next/standalone, including a
# minimal server.js -- see node_modules/next/dist/docs/.../output.md. The
# standalone bundle deliberately excludes public/ and .next/static (meant
# to be served from a CDN); both are copied in manually here instead, per
# that same doc.
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/public ./public
COPY --from=build --chown=app:app /app/.next/static ./.next/static

USER app
EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0
CMD ["node", "server.js"]
