FROM node:20-alpine AS build
WORKDIR /app

# Install build deps for native modules (better-sqlite3, sharp)
RUN apk add --no-cache python3 make g++ vips-dev

COPY package.json package-lock.json* ./
COPY client/package.json ./client/
COPY server/package.json ./server/
RUN npm ci

COPY . .
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache vips tini

# Use non-root user
RUN addgroup -g 1001 -S dac && adduser -S dac -u 1001 -G dac

COPY --from=build /app/package.json /app/package-lock.json* ./
COPY --from=build /app/server/package.json ./server/
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/server/src/db/migrations ./server/dist/db/migrations
COPY --from=build /app/server/assets ./server/assets
COPY --from=build /app/client/dist ./client/dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/server/node_modules ./server/node_modules

RUN mkdir -p /app/server/data /app/server/uploads && chown -R dac:dac /app
USER dac

ENV NODE_ENV=production
ENV API_PORT=3001
EXPOSE 3001

ENTRYPOINT ["/sbin/tini","--"]
CMD ["node","server/dist/index.js"]
