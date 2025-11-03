FROM python:3.11-slim
WORKDIR /app
COPY pyproject.toml .
RUN pip install --no-cache-dir fastapi uvicorn[standard] ariadne httpx pydantic pydantic-settings orjson
COPY app ./app
EXPOSE 8088
CMD ["uvicorn", "app.main:create_app", "--factory", "--host", "0.0.0.0", "--port", "8088"]
