# Two stages: build every workspace, then ship only the server's production deps (ws, zod) and the
# built dist folders. The client is served as static files from packages/client/dist.

# --- build -------------------------------------------------------------------------------------
FROM node:24-alpine AS build
WORKDIR /app
# Manifests first: the dependency layer is reused until a package.json or the lockfile changes.
COPY package.json package-lock.json ./
COPY packages/engine/package.json packages/engine/
COPY packages/ai/package.json packages/ai/
COPY packages/protocol/package.json packages/protocol/
COPY packages/session/package.json packages/session/
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/
RUN --mount=type=cache,target=/root/.npm npm ci --ignore-scripts --no-audit --no-fund
COPY tsconfig.base.json tsconfig.json ./
COPY packages packages
# The client bundles the rules reference (docs/rules/*.md?raw).
COPY docs/rules docs/rules
RUN npm run build

# --- runtime -----------------------------------------------------------------------------------
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOST=0.0.0.0 FCM_DATA_DIR=/data
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/packages/engine/package.json packages/engine/
COPY --from=build /app/packages/ai/package.json packages/ai/
COPY --from=build /app/packages/protocol/package.json packages/protocol/
COPY --from=build /app/packages/session/package.json packages/session/
COPY --from=build /app/packages/server/package.json packages/server/
COPY --from=build /app/packages/client/package.json packages/client/
# Only @fcm/server and the workspaces it imports: no three/preact (they are bundled into the client).
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund -w @fcm/server && npm cache clean --force
COPY --from=build /app/packages/engine/dist packages/engine/dist
COPY --from=build /app/packages/ai/dist packages/ai/dist
COPY --from=build /app/packages/protocol/dist packages/protocol/dist
COPY --from=build /app/packages/session/dist packages/session/dist
COPY --from=build /app/packages/server/dist packages/server/dist
COPY --from=build /app/packages/client/dist packages/client/dist
# Run unprivileged. /data must be created and chowned before VOLUME (later changes are discarded).
# An existing volume created by an older root image needs a one-time chown (README "Self-hosting").
RUN mkdir -p /data && chown node:node /data
VOLUME /data
USER node
# Build identity (git SHA): logged at startup, sent in welcome, saved in room files, in /healthz.
ARG GIT_SHA=
ENV FCM_BUILD_ID=$GIT_SHA
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD wget -q -O /dev/null "http://127.0.0.1:${PORT:-3000}/healthz" || exit 1
CMD ["node", "packages/server/dist/index.js"]
