#!/bin/sh
set -eu

PROJECT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
SECRETS_DIR="$PROJECT_DIR/.memento-docker-secrets"

if ! command -v docker >/dev/null 2>&1; then
  printf 'Docker no está instalado o no está disponible.\n' >&2
  exit 1
fi
if ! docker compose version >/dev/null 2>&1; then
  printf 'Falta Docker Compose v2.\n' >&2
  exit 1
fi

umask 077
mkdir -p "$SECRETS_DIR"
for name in a-admin a-peer-b b-admin b-peer-a; do
  token_file="$SECRETS_DIR/$name.token"
  if [ ! -s "$token_file" ]; then
    openssl rand -hex 32 > "$token_file"
  fi
done

docker compose -f "$PROJECT_DIR/docker-compose.two-nodes.yml" up --build -d
printf 'Memento A: http://127.0.0.1:8781 (admin token: %s/a-admin.token)\n' "$SECRETS_DIR"
printf 'Memento B: http://127.0.0.1:8782 (admin token: %s/b-admin.token)\n' "$SECRETS_DIR"
