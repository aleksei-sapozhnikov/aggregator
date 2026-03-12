# -------- Build stage --------
FROM node:20-alpine AS build

ARG CONTAINER_ROOT=.
ARG VITE_APP_TITLE
ARG VITE_TIMELINE_DEFAULT_RANGE

WORKDIR /app

ENV VITE_APP_TITLE=${VITE_APP_TITLE:-}
ENV VITE_TIMELINE_DEFAULT_RANGE=${VITE_TIMELINE_DEFAULT_RANGE:-1d}

COPY ${CONTAINER_ROOT}/package.json ${CONTAINER_ROOT}/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

COPY ${CONTAINER_ROOT}/ ./
RUN test -n "$VITE_TIMELINE_DEFAULT_RANGE"
RUN npm run build

# -------- Runtime stage --------
FROM caddy:2-alpine

ARG CATALOG_ITEMS_FILE
ARG CATALOG_DEPENDENCIES_FILE

COPY --from=build /app/dist /usr/share/caddy
COPY --from=build /app/Caddyfile /etc/caddy/Caddyfile
COPY ${CATALOG_ITEMS_FILE} /usr/share/caddy/catalog-items.yaml
COPY ${CATALOG_DEPENDENCIES_FILE} /usr/share/caddy/catalog-dependencies.yaml

EXPOSE 3000
ENTRYPOINT ["caddy", "run", "--config", "/etc/caddy/Caddyfile"]
