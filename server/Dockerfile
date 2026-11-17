FROM node:22-alpine
WORKDIR /app
# Render TTS locally, including VI/EN/ZH; FFmpeg muxes true MP3/MP4 files.
RUN apk add --no-cache ffmpeg espeak-ng
COPY server/package*.json ./server/
RUN cd server && npm ci --omit=dev
COPY shared ./shared
COPY services/translation/src ./services/translation/src
COPY services/render/src ./services/render/src
COPY db ./db
# Needed by operations.test.mjs and maintenance scripts at /app/scripts.
COPY scripts ./scripts
COPY server ./server
WORKDIR /app/server
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "src/index.js"]
