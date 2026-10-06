# Zodiac Blend web (Next.js standalone output)
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
# The /api rewrite target is fixed at build time (next.config.ts), and prerendered pages embed
# SITE_URL in canonical/Open Graph URLs. Override with --build-arg (compose: build.args).
ARG API_BASE_URL=http://api:8000
ARG SITE_URL=http://localhost:3000
ENV API_BASE_URL=$API_BASE_URL SITE_URL=$SITE_URL NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS run
WORKDIR /app
ARG API_BASE_URL=http://api:8000
ARG SITE_URL=http://localhost:3000
# API_BASE_URL / SITE_URL are read again at run time by Server Components; TRUSTED_PROXY_HOPS is
# the number of reverse proxies in front of this container (see src/lib/forwarded.ts).
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 \
    API_BASE_URL=$API_BASE_URL SITE_URL=$SITE_URL TRUSTED_PROXY_HOPS=0
RUN addgroup -S web && adduser -S web -G web
COPY --from=build --chown=web:web /app/.next/standalone ./
COPY --from=build --chown=web:web /app/.next/static ./.next/static
COPY --from=build --chown=web:web /app/public ./public
USER web
EXPOSE 3000
CMD ["node", "server.js"]
