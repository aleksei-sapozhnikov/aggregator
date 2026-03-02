FROM python:3.11-slim

ARG CONTAINER_ROOT=.
ARG HTTP_POLL_SIGNALS_FILE

WORKDIR /app

COPY ${CONTAINER_ROOT}/src ./
COPY ${HTTP_POLL_SIGNALS_FILE} ./http-poll-signals.yaml

RUN python -m venv /opt/venv \
 && /opt/venv/bin/pip install --no-cache-dir -r requirements.txt

RUN useradd -r -u 1001 appuser
USER appuser

ENV PATH="/opt/venv/bin:$PATH"

ENTRYPOINT ["python", "chaos_maker.py"]
