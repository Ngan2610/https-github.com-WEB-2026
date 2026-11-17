#!/usr/bin/env bash
# E2E smoke test cho Dubchef (sau khi docker compose up -d --build)
# Cách chạy:  bash scripts/e2e-smoke.sh
set -euo pipefail

API="${API_URL:-http://127.0.0.1:3000}"
WEB="${WEB_URL:-http://127.0.0.1:5173}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@dubchef.vn}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-}"

echo "==> 1. Health API"
curl -sf "$API/api/health" | grep -q '"ok":true' && echo "   API ok" || { echo "API health failed"; exit 1; }

echo "==> 2. Health Render (qua mạng Docker, kiểm từ api container)"
docker compose exec -T api node -e "
  fetch('http://render:4200/health')
    .then(r => r.json())
    .then(j => { if (!j.ok) process.exit(1); console.log('   Render ok', j); })
    .catch(e => { console.error(e); process.exit(1); });
" || { echo "Render health failed"; exit 1; }

echo "==> 3. Health Translation"
docker compose exec -T api node -e "
  fetch('http://translation:4100/health')
    .then(r => r.json())
    .then(j => { if (!j.ok) process.exit(1); console.log('   Translation ok'); })
    .catch(e => { console.error(e); process.exit(1); });
" || { echo "Translation health failed"; exit 1; }

echo "==> 4. Redis ping"
docker compose exec -T redis redis-cli ping | grep -q PONG && echo "   Redis ok" || { echo "Redis failed"; exit 1; }

echo "==> 5. Web frontend reachable"
curl -sf -o /dev/null "$WEB/" && echo "   Web ok" || { echo "Web failed"; exit 1; }

if [[ -n "$ADMIN_PASSWORD" ]]; then
  echo "==> 6. Login admin (optional)"
  TOKEN=$(curl -sf -X POST "$API/api/auth/login" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}" \
    | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(JSON.parse(d).token||'')}catch{}})")
  if [[ -n "$TOKEN" ]]; then
    echo "   Login ok, token length=${#TOKEN}"
    echo "==> 7. Enqueue dummy job"
    JOB=$(curl -sf -X POST "$API/api/jobs/process-video" \
      -H "Authorization: Bearer $TOKEN" \
      -H 'Content-Type: application/json' \
      -d '{
        "videoId": "e2e-smoke-video",
        "languages": ["vi"],
        "formats": ["mp3"],
        "narrationByLang": {
          "vi": [{"text":"Xin chào, đây là kiểm thử tự động.","start":0,"end":3}]
        }
      }')
    JOB_ID=$(echo "$JOB" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(JSON.parse(d).jobId||'')}catch{}})")
    echo "   Job id: $JOB_ID"
    if [[ -n "$JOB_ID" ]]; then
      echo "==> 8. Poll progress (tối đa 60s)"
      for i in $(seq 1 30); do
        PROG=$(curl -sf -H "Authorization: Bearer $TOKEN" "$API/api/jobs/$JOB_ID")
        STATUS=$(echo "$PROG" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const j=JSON.parse(d).job||{};console.log(j.status||'')}catch{}})")
        PCT=$(echo "$PROG" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const j=JSON.parse(d).job||{};console.log(j.progress||0)}catch{}})")
        echo "   [$i] status=$STATUS progress=$PCT%"
        if [[ "$STATUS" == "completed" || "$STATUS" == "failed" ]]; then
          break
        fi
        sleep 2
      done
    fi
  else
    echo "   Login failed (bỏ qua bước job)"
  fi
else
  echo "==> 6-8. Bỏ qua login/job (chưa set ADMIN_PASSWORD)"
fi

echo ""
echo "✅ E2E smoke hoàn tất."
echo "   Mở Web: $WEB"
echo "   API health: $API/api/health"
