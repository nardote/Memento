#!/bin/sh
set -eu

SOURCE_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
BIN_DIR=${MEMENTO_BIN_DIR:-"$HOME/.local/bin"}

mkdir -p "$BIN_DIR"
ln -sf "$SOURCE_DIR/memento" "$BIN_DIR/memento"
printf 'Memento instalado en %s\n' "$BIN_DIR/memento"
case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *) printf 'Agregá %s a PATH para invocarlo desde cualquier directorio.\n' "$BIN_DIR" ;;
esac
