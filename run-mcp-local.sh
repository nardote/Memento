#!/bin/sh
set -eu

PROJECT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
MEMORY_ROOT=${MEMENTO_HOME:-"$PROJECT_DIR/.memory"}
TOKEN_FILE=${MEMENTO_TOKEN_FILE:-"$PROJECT_DIR/.memento-token"}

if [ ! -r "$TOKEN_FILE" ]; then
  printf 'No se puede leer el token de Memento: %s\n' "$TOKEN_FILE" >&2
  exit 1
fi

MEMENTO_TOKEN=$(tr -d '\r\n' < "$TOKEN_FILE")
export MEMENTO_TOKEN
exec "$PROJECT_DIR/memento" mcp --root "$MEMORY_ROOT"
