FROM python:3.11-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/*
COPY services/transcription/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY services/transcription/server.py .
ENV PORT=4300 UPLOAD_DIR=/app/server/uploads WHISPER_MODEL=small HF_HOME=/models
EXPOSE 4300
CMD ["python", "server.py"]
