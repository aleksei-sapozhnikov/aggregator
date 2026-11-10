# -------- Build stage --------
FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

COPY . ./
RUN npm run build

# -------- Runtime stage --------
FROM caddy:2-alpine

RUN apk add --no-cache jq

COPY --from=build /app/dist /usr/share/caddy
COPY --from=build /app/Caddyfile /etc/caddy/Caddyfile

COPY ui-entrypoint.sh /usr/local/bin/ui-entrypoint.sh
RUN chmod +x /usr/local/bin/ui-entrypoint.sh

EXPOSE 3000
ENTRYPOINT ["/usr/local/bin/ui-entrypoint.sh"]
