# -------- Build stage --------
FROM maven:3.9-eclipse-temurin-25 AS build

ARG CONTAINER_ROOT=.

WORKDIR /app

COPY ${CONTAINER_ROOT}/pom.xml ./
RUN mvn -B dependency:go-offline

COPY ${CONTAINER_ROOT}/src ./src
RUN mvn -B package -DskipTests

# -------- Runtime stage --------
FROM eclipse-temurin:25-jre-jammy

ARG CATALOG_ITEMS_FILE
ARG CATALOG_DEPENDENCIES_FILE
ARG SIGNALS_HTTP_POLL_FILE
ARG CATALOG_ITEMS_SCHEMA_FILE
ARG CATALOG_DEPENDENCIES_SCHEMA_FILE
ARG SIGNALS_HTTP_POLL_SCHEMA_FILE

WORKDIR /app

COPY --from=build /app/target/*.jar ./app.jar
COPY ${CATALOG_ITEMS_FILE} ./catalog-items.yaml
COPY ${CATALOG_DEPENDENCIES_FILE} ./catalog-dependencies.yaml
COPY ${SIGNALS_HTTP_POLL_FILE} ./signals-http-poll.yaml
COPY ${CATALOG_ITEMS_SCHEMA_FILE} ./schemas/catalog-items.schema.yaml
COPY ${CATALOG_DEPENDENCIES_SCHEMA_FILE} ./schemas/catalog-dependencies.schema.yaml
COPY ${SIGNALS_HTTP_POLL_SCHEMA_FILE} ./schemas/signals-http-poll.schema.yaml

RUN useradd --system --uid 1001 --create-home appuser \
  && mkdir -p /home/appuser/feedback \
  && chown -R appuser:appuser /app /home/appuser
USER appuser

EXPOSE 8080

ENV JAVA_OPTS="-XX:MaxRAMPercentage=75.0"

ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar /app/app.jar"]
