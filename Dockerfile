FROM python:3.12-slim
WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend backend
COPY scripts scripts
COPY alembic.ini .
# .dockerignore admits only the bank and optional display metadata JSON.
COPY data/*.json data/
COPY data/assets data/assets
ENV PYTHONDONTWRITEBYTECODE=1
RUN useradd --create-home appuser && chown -R appuser /app
USER appuser
CMD ["sh", "-c", "alembic upgrade head && uvicorn backend.app:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips=*"]
