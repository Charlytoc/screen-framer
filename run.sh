#!/usr/bin/env bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "[run] Starting server..."
cd "$ROOT/server"
./venv/Scripts/python -m uvicorn main:app --host 0.0.0.0 --port 8000 &
SERVER_PID=$!

# Give the server a moment to bind before the agent tries to register
sleep 1

echo "[run] Starting agent..."
cd "$ROOT/agent"
./venv/Scripts/python main.py &
AGENT_PID=$!

echo "[run] Starting Next.js..."
cd "$ROOT/web"
npm run dev -- -H 0.0.0.0 &
WEB_PID=$!

echo "[run] Server PID=$SERVER_PID  Agent PID=$AGENT_PID  Web PID=$WEB_PID"
echo "[run] Press Ctrl+C to stop all."

trap "echo '[run] Stopping...'; kill $SERVER_PID $AGENT_PID $WEB_PID 2>/dev/null; exit 0" INT TERM
wait
