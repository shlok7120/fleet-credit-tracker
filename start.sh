#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Starts all three services in one terminal. Ctrl+C stops everything.
#   ./start.sh
# ---------------------------------------------------------------------------
set -e
cd "$(dirname "$0")"
ROOT="$PWD"

# Stop every child process when this script is interrupted.
cleanup() { echo -e "\n› stopping services…"; kill 0 2>/dev/null; }
trap cleanup EXIT INT TERM

if ! pg_isready -q; then
  echo "✗ PostgreSQL is not running.  Start it with:  brew services start postgresql@17"
  exit 1
fi

echo "› starting ML service on :8000"
( cd "$ROOT/ml-service" && ./venv/bin/uvicorn main:app --port 8000 --host 127.0.0.1 2>&1 | sed 's/^/[ml]  /' ) &

echo "› starting API on :5001"
( cd "$ROOT/backend" && npm run dev 2>&1 | sed 's/^/[api] /' ) &

echo "› starting frontend on :5173"
( cd "$ROOT/frontend" && npm run dev 2>&1 | sed 's/^/[web] /' ) &

echo ""
echo "  ────────────────────────────────────────────────"
echo "   Open  http://localhost:5173"
echo "   API   http://localhost:5001/api/health"
echo "   ML    http://localhost:8000/docs"
echo "   Ctrl+C to stop everything"
echo "  ────────────────────────────────────────────────"
echo ""

wait
