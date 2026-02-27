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

ARG CATALOG_FILE
ARG HEALTH_CHECKS_FILE

WORKDIR /app

COPY --from=build /app/target/*.jar ./app.jar
COPY ${CATALOG_FILE} ./catalog.yaml
COPY ${HEALTH_CHECKS_FILE} ./health-checks.yaml

RUN useradd --system --uid 1001 --create-home appuser \
  && chown -R appuser:appuser /app
USER appuser

EXPOSE 8080

ENV JAVA_OPTS="-XX:MaxRAMPercentage=75.0"

ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar /app/app.jar"]
