FROM python:3.11-slim
WORKDIR /app
COPY pyproject.toml .
RUN pip install --no-cache-dir pip setuptools wheel && \
    pip install --no-cache-dir fastapi uvicorn[standard] pydantic pydantic-settings pyyaml httpx watchfiles \
    prometheus-client opentelemetry-api opentelemetry-sdk opentelemetry-instrumentation-fastapi \
    opentelemetry-instrumentation-httpx opentelemetry-exporter-otlp-proto-http jsonpath-ng aiokafka \
    asyncpg cryptography redis
COPY app ./app
EXPOSE 8090
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8090"]
