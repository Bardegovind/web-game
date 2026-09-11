# ---- Chamber build ----
# The React chamber is compiled here so the runtime image carries no build
# toolchain. The game and the tap detector are plain files copied through.
FROM node:22-slim AS chamber

WORKDIR /app/frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build


# ---- Backend dependencies ----
FROM node:22-slim AS deps

WORKDIR /app/backend

# Manifest and lockfile together, so `npm ci` can honour it. Installing in the
# directory the app actually runs from, rather than relying on Node's
# parent-directory lookup.
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev


# ---- Runtime ----
FROM node:22-slim AS runtime

ENV NODE_ENV=production

WORKDIR /app/backend

COPY --from=deps /app/backend/node_modules ./node_modules
COPY backend ./
COPY --from=chamber /app/frontend/dist ../frontend/dist

# The base image ships an unprivileged `node` user for exactly this.
USER node

EXPOSE 5000

# /api/health already existed but nothing consumed it.
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
