# -------- Build stage --------
FROM node:20-alpine AS build

ARG CONTAINER_ROOT=.
ARG VITE_APP_TITLE

WORKDIR /app

ENV VITE_APP_TITLE=${VITE_APP_TITLE:-}

COPY ${CONTAINER_ROOT}/package.json ${CONTAINER_ROOT}/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

COPY ${CONTAINER_ROOT}/ ./
RUN npm run build

# -------- Runtime stage --------
FROM caddy:2-alpine

ARG CATALOG_FILE

COPY --from=build /app/dist /usr/share/caddy
COPY --from=build /app/Caddyfile /etc/caddy/Caddyfile
COPY ${CATALOG_FILE} /usr/share/caddy/catalog.yaml

EXPOSE 3000
ENTRYPOINT ["caddy", "run", "--config", "/etc/caddy/Caddyfile"]
