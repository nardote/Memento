#!/bin/sh
set -eu

PROJECT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
MEMORY_ROOT=${MEMENTO_HOME:-"$PROJECT_DIR/.memory"}
TOKEN_FILE=${MEMENTO_TOKEN_FILE:-"$PROJECT_DIR/.memento-token"}
PORT=${MEMENTO_PORT:-7337}

if ! command -v cloudflared >/dev/null 2>&1; then
  printf 'Falta cloudflared. Instalalo con: brew install cloudflared\n' >&2
  exit 1
fi

if [ ! -f "$TOKEN_FILE" ]; then
  umask 077
  openssl rand -hex 32 > "$TOKEN_FILE"
fi

MEMENTO_TOKEN=$(tr -d '\r\n' < "$TOKEN_FILE")
export MEMENTO_TOKEN

"$PROJECT_DIR/memento" serve-http --root "$MEMORY_ROOT" --port "$PORT" &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null || true' EXIT INT TERM

sleep 1
printf 'Token guardado localmente en %s (no lo compartas por canales públicos).\n' "$TOKEN_FILE" >&2
cloudflared tunnel --no-autoupdate --url "http://127.0.0.1:$PORT"
