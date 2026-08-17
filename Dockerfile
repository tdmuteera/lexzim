# LexZim production image for Railway.
# Deterministic build: pinned Node 20, npm install (avoids cross-platform
# `npm ci` lockfile failures caused by Linux-only optional deps), then next build.
FROM node:20-slim

# ca-certificates is required for TLS to Supabase (Postgres + REST).
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies first for better layer caching.
COPY package.json package-lock.json .npmrc ./
RUN npm install --include=dev --no-audit --no-fund

# Copy the rest of the source and build the Next.js app.
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1

# NEXT_PUBLIC_* vars are inlined into the client bundle at build time, and the
# app shell reads Supabase config while collecting page data. Railway supplies
# service variables to the build as build args; expose them as ENV for `build`.
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}
ENV NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY}

RUN npm run build

# Runtime settings. Railway injects PORT; Next.js binds to it automatically.
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
EXPOSE 3000

CMD ["npm", "run", "start"]
