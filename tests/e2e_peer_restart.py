#!/usr/bin/env python3
from __future__ import annotations

import importlib.machinery
import importlib.util
import json
import os
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path


PROJECT = Path(__file__).parents[1]
SCRIPT = PROJECT / "memento"
loader = importlib.machinery.SourceFileLoader("memento_e2e", str(SCRIPT))
spec = importlib.util.spec_from_loader("memento_e2e", loader)
memento = importlib.util.module_from_spec(spec)
loader.exec_module(memento)


def free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def wait_until(predicate, description: str, timeout: float = 10.0):
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            value = predicate()
            if value:
                return value
        except Exception:
            pass
        time.sleep(0.1)
    raise RuntimeError(f"timeout esperando {description}")


def wait_health(port: int) -> None:
    wait_until(lambda: urllib.request.urlopen(f"http://127.0.0.1:{port}/health", timeout=1).status == 200, f"health:{port}")


def start_server(root: Path, port: int) -> subprocess.Popen:
    environment = os.environ.copy()
    environment["MEMENTO_PEER_SYNC_INTERVAL"] = "0"
    process = subprocess.Popen(
        [sys.executable, str(SCRIPT), "serve-http", "--root", str(root), "--port", str(port)],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        text=True,
        env=environment,
    )
    wait_health(port)
    return process


def stop_server(process: subprocess.Popen | None) -> None:
    if not process or process.poll() is not None:
        return
    process.terminate()
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=5)


def mcp_call(port: int, token: str, name: str, arguments: dict) -> dict:
    payload = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": name, "arguments": arguments}}).encode()
    request = urllib.request.Request(
        f"http://127.0.0.1:{port}/mcp",
        data=payload,
        headers={"Authorization": "Bearer " + token, "Content-Type": "application/json", "Accept": "application/json, text/event-stream"},
    )
    with urllib.request.urlopen(request, timeout=5) as response:
        return json.loads(response.read())


def main() -> int:
    with tempfile.TemporaryDirectory(prefix="memento-e2e-") as temporary:
        base = Path(temporary)
        root_a = base / "a" / ".memory"
        root_b = base / "b" / ".memory"
        memento.set_node_id(root_a, "memento-a")
        memento.set_node_id(root_b, "memento-b")

        admin_a = memento.create_user(root_a, "admin-a", "admin", ["*"])
        peer_b_token = memento.create_user(root_a, "peer-b", "reader", ["equipo"])
        memento.create_user(root_b, "admin-b", "admin", ["*"])
        peer_token_file = base / "peer-a.token"
        peer_token_file.write_text(peer_b_token + "\n", encoding="utf-8")
        os.chmod(peer_token_file, 0o600)

        port_a = free_port()
        port_b = free_port()
        memento.add_peer(root_b, "memento-a", f"http://127.0.0.1:{port_a}", str(peer_token_file))
        task = memento.create_task(
            root_a,
            "admin-a",
            "memento-b",
            "equipo",
            {"type": "event", "filters": {"tags_all": ["topic:refunds"]}},
            {"type": "notify", "title": "Nueva información de refunds", "message": "Revisar el evento recibido"},
        )

        server_a = server_b = None
        try:
            server_a = start_server(root_a, port_a)
            server_b = start_server(root_b, port_b)
            wait_until(lambda: (memento.task_dirs(root_b)["specs"] / f"{task['task_id']}.json").exists(), "tarea replicada en B")

            stop_server(server_b)
            server_b = None
            memento.approve_task(root_b, task["task_id"], "admin-b")

            response = mcp_call(port_a, admin_a, "activity_add", {"project": "equipo", "action": "Refund diagnosticado", "details": "Se confirmó nueva información", "tags": ["topic:refunds"]})
            if "error" in response:
                raise RuntimeError(response["error"])
            wait_until(lambda: len(memento.load_events(root_a)) == 1, "evento durable en A")

            server_b = start_server(root_b, port_b)
            first_inbox = wait_until(lambda: memento.inbox_items(root_b), "notificación en inbox de B")
            stop_server(server_b)
            server_b = start_server(root_b, port_b)
            time.sleep(0.5)
            second_inbox = memento.inbox_items(root_b)

            if len(first_inbox) != 1 or len(second_inbox) != 1:
                raise RuntimeError("la ejecución no fue idempotente")
            result = {
                "ok": True,
                "task_id": task["task_id"],
                "notification_id": second_inbox[0]["notification_id"],
                "event_id": second_inbox[0]["event"]["event_id"],
                "b_restarts": 2,
                "notifications": len(second_inbox),
            }
            print(json.dumps(result, ensure_ascii=False, indent=2))
            return 0
        finally:
            stop_server(server_b)
            stop_server(server_a)


if __name__ == "__main__":
    raise SystemExit(main())
