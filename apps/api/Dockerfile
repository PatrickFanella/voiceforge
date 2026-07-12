FROM oven/bun:1.3.14 AS build
WORKDIR /app
COPY package.json bun.lock tsconfig.base.json ./
COPY apps apps
COPY packages packages
RUN bun install --frozen-lockfile --filter @voiceforge/api
RUN bun run --cwd apps/api build
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production PORT=3000
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/packages/database/migrations ./migrations
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]
