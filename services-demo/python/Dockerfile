# -------- Build stage --------
FROM python:3.11-slim AS build

WORKDIR /app

RUN python -m venv /opt/venv

# -------- Runtime stage --------
FROM python:3.11-slim

WORKDIR /app

RUN useradd -r -u 1001 appuser
USER appuser

COPY --from=build /opt/venv /opt/venv
COPY app.py ./app.py

ENV PATH="/opt/venv/bin:$PATH"

EXPOSE 8080

ENTRYPOINT ["python", "app.py"]
