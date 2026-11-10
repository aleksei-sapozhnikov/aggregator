# -------- Build stage --------
FROM node:20-alpine AS build

WORKDIR /app

COPY server.js ./server.js

# -------- Runtime stage --------
FROM node:20-alpine

WORKDIR /app

RUN adduser -D -u 1001 appuser
USER appuser

COPY --from=build /app/server.js ./server.js

EXPOSE 8080

ENTRYPOINT ["node", "server.js"]
