FROM python:3.11-slim

WORKDIR /app

COPY src ./

RUN python -m venv /opt/venv \
 && /opt/venv/bin/pip install --no-cache-dir -r requirements.txt

RUN useradd -r -u 1001 appuser
USER appuser

ENV PATH="/opt/venv/bin:$PATH"

EXPOSE 8080

ENTRYPOINT ["uvicorn", "product_health_agent.app:app", "--host", "0.0.0.0", "--port", "8080"]
