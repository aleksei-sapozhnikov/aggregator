FROM python:3.11-slim

WORKDIR /app

RUN python -m venv /opt/venv \
 && /opt/venv/bin/pip install --no-cache-dir \
    requests \
    pyyaml

RUN useradd -r -u 1001 appuser
USER appuser

COPY chaos_maker.py ./chaos_maker.py

ENV PATH="/opt/venv/bin:$PATH"

ENTRYPOINT ["python", "chaos_maker.py"]
