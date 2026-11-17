FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache ffmpeg espeak-ng
COPY services/render/package.json ./package.json
COPY services/render/src ./src
ENV NODE_ENV=production
ENV PORT=4200
ENV UPLOAD_DIR=/app/server/uploads
EXPOSE 4200
HEALTHCHECK --interval=20s --timeout=5s --start-period=10s --retries=3 \
 CMD node -e "fetch('http://127.0.0.1:4200/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/server.js"]
