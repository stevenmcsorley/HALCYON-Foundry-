FROM python:3.11-slim
WORKDIR /app
COPY pyproject.toml .
RUN pip install --no-cache-dir pip setuptools wheel && \
    pip install --no-cache-dir fastapi uvicorn[standard] pydantic pydantic-settings httpx asyncpg neo4j orjson redis \
    prometheus-client opentelemetry-api opentelemetry-sdk opentelemetry-instrumentation-fastapi \
    opentelemetry-instrumentation-httpx opentelemetry-exporter-otlp-proto-http
COPY app ./app
COPY db ./db
EXPOSE 8081
CMD ["uvicorn", "app.main:create_app", "--factory", "--host", "0.0.0.0", "--port", "8081"]
