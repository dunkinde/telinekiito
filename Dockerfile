# ---------- 1. The website: Next.js static export, built into /web/out ----------
FROM node:22-slim AS site
WORKDIR /web
ENV NEXT_TELEMETRY_DISABLED=1
COPY web/package.json ./
RUN npm install --no-audit --no-fund --loglevel=error
COPY web/ ./
# Type errors are printed in the build log but don't stop a deploy.
RUN npx tsc --noEmit -p tsconfig.json || echo "!! TypeScript reported errors above (the site still builds)"
RUN npm run build

# ---------- 2. The app server: API, office, and the website files ----------
FROM node:22-slim

ENV NODE_ENV=production \
    DATA_DIR=/data \
    PORT=3000

WORKDIR /app
COPY lib ./lib
COPY public ./public
COPY server.js package.json ./
COPY --from=site /web/out ./site

# The database lives in /data (a Docker volume). The app runs as the unprivileged "node" user.
RUN mkdir -p /data && chown node:node /data
USER node

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "--disable-warning=ExperimentalWarning", "server.js"]
