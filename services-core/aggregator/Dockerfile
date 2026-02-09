# -------- Build stage --------
FROM maven:3.9-eclipse-temurin-21 AS build

ARG CONTAINER_ROOT=.

WORKDIR /app/${CONTAINER_ROOT}

COPY ${CONTAINER_ROOT}/pom.xml .
RUN mvn -B dependency:go-offline

COPY ${CONTAINER_ROOT}/src ./src
RUN mvn -B package

# -------- Runtime stage --------
FROM eclipse-temurin:21-jre-jammy

ARG CONTAINER_ROOT=.
ARG CATALOG_FILE
ARG HEALTH_CHECKS_FILE

WORKDIR /app

COPY ${CATALOG_FILE} ./catalog.yaml
COPY ${HEALTH_CHECKS_FILE} ./health-checks.yaml

RUN useradd -r -u 1001 appuser
USER appuser

COPY --from=build /app/${CONTAINER_ROOT}/target/*.jar app.jar

EXPOSE 8080

ENV JAVA_OPTS="-XX:MaxRAMPercentage=75.0"

ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar app.jar"]
