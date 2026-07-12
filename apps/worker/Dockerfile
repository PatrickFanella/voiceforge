FROM oven/bun:1.3.14 AS build
WORKDIR /app
COPY package.json bun.lock tsconfig.base.json ./
COPY apps apps
COPY packages packages
RUN bun install --frozen-lockfile --filter @voiceforge/worker
RUN bun run --cwd apps/worker build
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/worker/dist ./dist
USER node
CMD ["node", "dist/server.js"]
