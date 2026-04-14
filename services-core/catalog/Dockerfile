# -------- Build stage --------
FROM golang:1.23-alpine AS build

WORKDIR /app

COPY go.mod ./
COPY main.go ./

RUN go mod download
RUN CGO_ENABLED=0 GOOS=linux go build -mod=mod -trimpath -ldflags="-s -w" -o /out/catalog-service .

# -------- Runtime stage --------
FROM alpine:3.21

WORKDIR /app

RUN adduser -D -u 1001 appuser
USER appuser

COPY --from=build /out/catalog-service /usr/local/bin/catalog-service
COPY catalog ./catalog
COPY schemas ./schemas

ENV CATALOG_DIR=./catalog/empty
ENV PORT=8080

EXPOSE 8080

ENTRYPOINT ["catalog-service"]
