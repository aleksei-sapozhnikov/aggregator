# syntax=docker/dockerfile:1.6
FROM node:20-alpine AS build

ARG CATALOG_FILE

WORKDIR /app

COPY aggregator-ui/package.json aggregator-ui/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

COPY aggregator-ui/ ./
COPY ${CATALOG_FILE} ./public/catalog.yaml

RUN npm run build

FROM caddy:2-alpine

ARG CATALOG_FILE

COPY --from=build /app/dist /usr/share/caddy
COPY ${CATALOG_FILE} /usr/share/caddy/catalog.yaml
COPY aggregator-ui/Caddyfile /etc/caddy/Caddyfile

EXPOSE 3000
CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile"]
