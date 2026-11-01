# -------- Build stage --------
FROM eclipse-temurin:25-jdk-jammy AS build

WORKDIR /app

COPY DummyService.java .
RUN javac DummyService.java \
    && printf "Main-Class: DummyService\n" > manifest.mf \
    && jar cfm dummy-service.jar manifest.mf DummyService*.class

# -------- Runtime stage --------
FROM eclipse-temurin:25-jre-jammy

WORKDIR /app

RUN useradd -r -u 1001 appuser
USER appuser

COPY --from=build /app/dummy-service.jar app.jar

EXPOSE 8080

ENTRYPOINT ["java", "-jar", "app.jar"]
