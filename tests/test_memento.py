import importlib.machinery
import importlib.util
import tempfile
import unittest
import json
import threading
import urllib.error
import urllib.request
import datetime as dt
from pathlib import Path


SCRIPT = Path(__file__).parents[1] / "memento"
loader = importlib.machinery.SourceFileLoader("memento", str(SCRIPT))
spec = importlib.util.spec_from_loader("memento", loader)
memento = importlib.util.module_from_spec(spec)
loader.exec_module(memento)


class MementoTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name) / ".memory"

    def tearDown(self):
        self.temp.cleanup()

    def test_save_search_get_and_delete(self):
        saved = memento.save_memory(self.root, "demo", "Usar Markdown", "Sin base de datos", "decision", ["storage"])
        self.assertEqual(saved["project"], "demo")
        self.assertEqual(memento.search_memories(self.root, "markdown", "demo")[0]["id"], saved["id"])
        self.assertEqual(memento.find_memory(self.root, saved["id"])["title"], "Usar Markdown")
        self.assertTrue(memento.delete_memory(self.root, saved["id"]))
        self.assertIsNone(memento.find_memory(self.root, saved["id"]))
        self.assertTrue((self.root / "deleted" / saved["id"]).exists())

    def test_files_are_independent_and_ordered(self):
        first = memento.save_memory(self.root, "demo", "Primera", "alpha")
        second = memento.save_memory(self.root, "demo", "Segunda", "beta")
        self.assertNotEqual(first["path"], second["path"])
        self.assertLess(first["id"], second["id"])

    def test_mcp_tools(self):
        result = memento.mcp_call(self.root, "memory_save", {"project": "demo", "title": "MCP", "content": "Funciona"})
        found = memento.mcp_call(self.root, "memory_search", {"query": "funciona"})
        self.assertEqual(found[0]["id"], result["id"])

    def test_rpc_initialize(self):
        response = memento.rpc_response(self.root, {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2025-06-18"}})
        self.assertEqual(response["result"]["protocolVersion"], "2025-06-18")

    def test_individual_tokens_roles_and_projects(self):
        writer_token = memento.create_user(self.root, "juan", "writer", ["equipo"])
        reader_token = memento.create_user(self.root, "maria", "reader", ["equipo"])
        writer = memento.authenticate(self.root, writer_token)
        reader = memento.authenticate(self.root, reader_token)
        activity = memento.mcp_call(self.root, "activity_add", {"project": "equipo", "action": "Deploy", "details": "QA listo"}, writer)
        self.assertEqual(activity["author"], "juan")
        listed = memento.mcp_call(self.root, "activity_list", {"project": "equipo"}, reader)
        self.assertEqual(listed[0]["id"], activity["id"])
        with self.assertRaises(PermissionError):
            memento.mcp_call(self.root, "activity_add", {"project": "equipo", "action": "No", "details": "No"}, reader)
        with self.assertRaises(PermissionError):
            memento.mcp_call(self.root, "activity_list", {"project": "privado"}, writer)

    def test_tokens_are_stored_hashed(self):
        raw = memento.create_user(self.root, "adrian", "admin", ["*"])
        stored = (self.root / "users.json").read_text()
        self.assertNotIn(raw, stored)
        self.assertIn("sha256:", stored)

    def test_task_hash_is_stable_and_tampering_is_rejected(self):
        created_at = "2026-08-25T10:00:00-03:00"
        task = memento.create_task(
            self.root, "adrian", "node-b", "equipo",
            {"type": "event", "filters": {"tags_all": ["ticket:SKY-1"]}},
            {"type": "notify", "title": "Novedad"}, created_at=created_at,
        )
        other_root = Path(self.temp.name) / "other" / ".memory"
        imported = memento.import_task(other_root, task)
        self.assertEqual(imported["task_id"], task["task_id"])
        tampered = json.loads(json.dumps(task))
        tampered["spec"]["action"]["title"] = "Alterada"
        with self.assertRaises(ValueError):
            memento.import_task(other_root, tampered)

    def test_offline_event_catchup_and_idempotency_between_nodes(self):
        root_a = Path(self.temp.name) / "a" / ".memory"
        root_b = Path(self.temp.name) / "b" / ".memory"
        memento.set_node_id(root_a, "node-a")
        memento.set_node_id(root_b, "node-b")
        task = memento.create_task(
            root_a, "adrian", "node-b", "equipo",
            {"type": "event", "filters": {"tags_all": ["ticket:SKY-1"]}},
            {"type": "notify", "title": "Nueva información", "message": "Revisar SKY-1"},
            created_at="2026-08-25T10:00:00-03:00",
        )
        memento.import_task(root_b, task)
        memento.approve_task(root_b, task["task_id"], "admin-b")

        activity = memento.save_memory(root_a, "equipo", "Hallazgo", "Causa confirmada", "activity", ["ticket:SKY-1"], "adrian")
        event = memento.record_event(root_a, activity)
        self.assertTrue(memento.import_event(root_b, event))

        first = memento.run_due_tasks(root_b, "node-b", dt.datetime.fromisoformat("2026-08-25T12:00:00-03:00"))
        second = memento.run_due_tasks(root_b, "node-b", dt.datetime.fromisoformat("2026-08-25T12:01:00-03:00"))
        self.assertEqual(first["executed"], 1)
        self.assertEqual(second["executed"], 0)
        self.assertEqual(len(memento.inbox_items(root_b)), 1)
        self.assertEqual(memento.inbox_items(root_b)[0]["event"]["activity_id"], activity["id"])

    def test_temporal_task_executes_after_reconnect_once(self):
        memento.set_node_id(self.root, "node-b")
        task = memento.create_task(
            self.root, "adrian", "node-b", "equipo",
            {"type": "at", "at": "2026-08-25T09:00:00-03:00"},
            {"type": "notify", "title": "Recordatorio"}, catch_up="execute",
            created_at="2026-08-24T10:00:00-03:00",
        )
        memento.approve_task(self.root, task["task_id"], "admin-b")
        now = dt.datetime.fromisoformat("2026-08-25T11:00:00-03:00")
        self.assertEqual(memento.run_due_tasks(self.root, "node-b", now)["executed"], 1)
        self.assertEqual(memento.run_due_tasks(self.root, "node-b", now)["executed"], 0)

    def test_cancelled_task_does_not_execute(self):
        memento.set_node_id(self.root, "node-b")
        task = memento.create_task(
            self.root, "adrian", "node-b", "equipo",
            {"type": "at", "at": "2026-08-25T09:00:00-03:00"},
            {"type": "notify", "title": "No ejecutar"}, created_at="2026-08-24T10:00:00-03:00",
        )
        memento.approve_task(self.root, task["task_id"], "admin-b")
        memento.cancel_task(self.root, task["task_id"], "admin-b")
        result = memento.run_due_tasks(self.root, "node-b", dt.datetime.fromisoformat("2026-08-25T11:00:00-03:00"))
        self.assertEqual(result["executed"], 0)

    def test_remote_peer_requires_https(self):
        token_file = Path(self.temp.name) / "peer.token"
        token_file.write_text("x" * 32)
        with self.assertRaises(ValueError):
            memento.add_peer(self.root, "unsafe", "http://example.com:7337", str(token_file))


if __name__ == "__main__":
    unittest.main()
