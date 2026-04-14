# -------- Build stage --------
FROM maven:3.9-eclipse-temurin-25 AS build

WORKDIR /app

COPY pom.xml ./
RUN mvn -B dependency:go-offline

COPY src ./src
RUN mvn -B package -DskipTests

# -------- Runtime stage --------
FROM eclipse-temurin:25-jre-jammy

WORKDIR /app

COPY --from=build /app/target/*.jar ./app.jar

RUN useradd --system --uid 1001 --create-home appuser \
  && mkdir -p /home/appuser/feedback \
  && chown -R appuser:appuser /app /home/appuser
USER appuser

EXPOSE 8080

ENV JAVA_OPTS="-XX:MaxRAMPercentage=75.0"

ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar /app/app.jar"]
