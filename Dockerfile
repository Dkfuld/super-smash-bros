# Draft Day: Disaster Dome — single-container deploy (server + built client)
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/client/package.json apps/client/
RUN npm ci
COPY . .
RUN npm run build --workspace apps/client

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app /app
# Persist match history by mounting a volume at /data
ENV DDD_DB_PATH=/data/ddd.sqlite
ENV PORT=8787
EXPOSE 8787
CMD ["npm", "start"]
