#!/usr/bin/env python3
"""Inicializa una instancia vacía de Memento y ejecuta el comando indicado."""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path


MEMENTO = "/app/memento"


def load_json(path_value: str | None) -> list[dict]:
    if not path_value:
        return []
    path = Path(path_value)
    if not path.is_file():
        raise SystemExit(f"archivo de bootstrap no encontrado: {path}")
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, list):
        raise SystemExit(f"bootstrap inválido: {path}")
    return value


def run(*args: str) -> None:
    subprocess.run([MEMENTO, *args], check=True, stdout=sys.stderr)


def main() -> None:
    root = Path(os.environ.get("MEMENTO_ROOT", "/data"))
    users_file = root / "users.json"
    root_argument = str(root)

    # Los usuarios se crean exclusivamente cuando el volumen está vacío: nunca
    # se sobrescriben tokens ni permisos existentes al reiniciar un contenedor.
    if not users_file.exists():
        for user in load_json(os.environ.get("MEMENTO_BOOTSTRAP_USERS_FILE")):
            try:
                username = user["username"]
                role = user["role"]
                projects = user["projects"]
                token_file = user["token_file"]
            except KeyError as exc:
                raise SystemExit(f"usuario de bootstrap inválido: falta {exc.args[0]}") from exc
            run("users", "add", "--root", root_argument, "--username", username, "--role", role, "--projects", projects, "--token-file", token_file)

    node_id = os.environ.get("MEMENTO_NODE_ID")
    if node_id:
        run("node", "set", node_id, "--root", root_argument)

    for peer in load_json(os.environ.get("MEMENTO_BOOTSTRAP_PEERS_FILE")):
        try:
            name = peer["name"]
            url = peer["url"]
            token_file = peer["token_file"]
        except KeyError as exc:
            raise SystemExit(f"peer de bootstrap inválido: falta {exc.args[0]}") from exc
        # Conserva el peer ya configurado para no reescribir su fecha o secreto.
        if (root / "peers" / f"{name}.json").exists():
            continue
        args = ["peers", "add", "--root", root_argument, "--name", name, "--url", url, "--token-file", token_file]
        if peer.get("allow_insecure_http"):
            args.append("--allow-insecure-http")
        run(*args)

    os.execvp(MEMENTO, [MEMENTO, *sys.argv[1:]])


if __name__ == "__main__":
    main()
