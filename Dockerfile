# Single-stage build: compiles all workspaces, then serves the client and /ws from the Node server.
FROM node:24-alpine
WORKDIR /app
COPY . .
RUN npm ci --ignore-scripts && npm run build && npm prune --omit=dev
ENV NODE_ENV=production PORT=3000 HOST=0.0.0.0 FCM_DATA_DIR=/data
VOLUME /data
EXPOSE 3000
CMD ["node", "packages/server/dist/index.js"]
