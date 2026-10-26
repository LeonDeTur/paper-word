FROM node:24-bookworm-slim AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-bookworm-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3001 DB_PATH=/app/data/paperword.sqlite
WORKDIR /app
COPY package.json package-lock.json ./
COPY LICENSE NOTICE ./
RUN npm ci --omit=dev && mkdir /app/data && chown node:node /app/data
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/build ./build
USER node
EXPOSE 3001
CMD ["node", "build/server.mjs"]
