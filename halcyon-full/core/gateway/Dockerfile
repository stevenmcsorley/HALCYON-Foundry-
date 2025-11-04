FROM python:3.11-slim
WORKDIR /app
COPY pyproject.toml .
RUN pip install --no-cache-dir pip setuptools wheel && \
    pip install --no-cache-dir fastapi uvicorn[standard] ariadne httpx pydantic pydantic-settings orjson redis \
    prometheus-client opentelemetry-api opentelemetry-sdk opentelemetry-instrumentation-fastapi \
    opentelemetry-instrumentation-httpx opentelemetry-exporter-otlp-proto-http python-jose[cryptography] \
    asyncpg jsonpath-ng rapidfuzz
COPY app ./app
EXPOSE 8088
CMD ["uvicorn", "app.main:create_app", "--factory", "--host", "0.0.0.0", "--port", "8088"]
