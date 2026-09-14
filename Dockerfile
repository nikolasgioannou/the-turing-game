FROM oven/bun:1.4.2 AS dependencies
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM dependencies AS build
COPY index.html vite.config.ts tsconfig.json ./
COPY public ./public
COPY src ./src
RUN bun run build

FROM oven/bun:1.4.2 AS production-dependencies
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

FROM oven/bun:1.4.2-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 tzdata && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY src/server ./src/server
COPY src/shared ./src/shared
COPY scripts/ops.ts ./scripts/ops.ts
USER bun
EXPOSE 3000
CMD ["bun", "src/server/index.ts"]
