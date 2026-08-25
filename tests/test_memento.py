import importlib.machinery
import importlib.util
import tempfile
import unittest
import json
import threading
import urllib.error
import urllib.request
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


if __name__ == "__main__":
    unittest.main()
