# AIFirstMart mock: one image with the built pages, the backend API and the web server (STANDARD.md section 8).
#   docker build -f deploy/Dockerfile -t aifirstmart-mock .          (run from the project folder)
#   docker run -p 8080:8080 --env-file .env aifirstmart-mock
ARG PYTHON=3.12-slim

# ---- Stage 1: build the pages from src/ (standard library only)
FROM python:${PYTHON} AS build
WORKDIR /src
COPY afm.py VERSION ./
COPY pipeline pipeline
COPY config config
COPY src src
ARG AFM_EDITIONS=training,platform
RUN for e in $(echo "$AFM_EDITIONS" | tr ',' ' '); do python afm.py build --edition "$e" --lang all; done

# ---- Stage 2: run the server
FROM python:${PYTHON}
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 \
    PORT=8080 AFM_ENV=production AFM_DIST=/app/dist
WORKDIR /app
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt \
 && useradd --system --uid 10001 --home /app afm \
 && mkdir -p /data && chown afm /data
COPY VERSION ./
COPY server server
COPY backend/aifirstmart_connect backend/aifirstmart_connect
COPY --from=build /src/dist dist
ARG AFM_EDITIONS=training,platform
ENV AFM_EDITIONS=${AFM_EDITIONS}
USER afm
EXPOSE 8080
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD python -c "import os,urllib.request;urllib.request.urlopen('http://127.0.0.1:%s/healthz' % os.environ.get('PORT','8080'),timeout=4)"
CMD ["sh", "-c", "exec uvicorn server.app:app --host 0.0.0.0 --port \"${PORT}\" --proxy-headers --forwarded-allow-ips='*'"]
