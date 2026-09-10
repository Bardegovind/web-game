# Node 22 LTS. Node 18 is past end of life; the local toolchain is on 24.
# Slim rather than the full image: roughly a tenth of the size, and nothing in
# this app needs the build toolchain at runtime.
FROM node:22-slim AS deps

WORKDIR /app/backend

# Copy the manifest and the lockfile together so `npm ci` can honour it.
# The previous Dockerfile copied only package.json, which meant npm install
# ignored the lockfile entirely and every build could resolve different
# versions. It also installed into /app while the app ran from /app/backend,
# which worked only through Node's parent-directory lookup.
COPY backend/package.json backend/package-lock.json ./

RUN npm ci --omit=dev


FROM node:22-slim AS runtime

ENV NODE_ENV=production

WORKDIR /app/backend

COPY --from=deps /app/backend/node_modules ./node_modules
COPY backend ./
COPY frontend ../frontend

# Run as an unprivileged user. The base image ships `node` for exactly this.
USER node

EXPOSE 5000

# /api/health already existed but nothing consumed it.
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
