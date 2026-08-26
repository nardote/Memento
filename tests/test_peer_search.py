import importlib.machinery
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


SCRIPT = Path(__file__).parents[1] / "memento"
loader = importlib.machinery.SourceFileLoader("memento_peer_search", str(SCRIPT))
spec = importlib.util.spec_from_loader("memento_peer_search", loader)
memento = importlib.util.module_from_spec(spec)
loader.exec_module(memento)


class PeerSearchTest(unittest.TestCase):
    def test_uses_configured_peer_and_returns_remote_items_without_writing_memory(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary) / ".memory"
            token_file = Path(temporary) / "peer.token"
            token_file.write_text("x" * 64, encoding="utf-8")
            memento.add_peer(root, "node-b", "http://localhost:7337", str(token_file))

            class Response:
                def __enter__(self): return self
                def __exit__(self, *_): return False
                def read(self, _):
                    return json.dumps({"result": {"content": [{"text": json.dumps([{"id": "remote", "title": "Dato B"}])}]}}).encode()

            with patch.object(memento.urllib.request, "urlopen", return_value=Response()) as opened:
                result = memento.search_peer(root, "node-b", "equipo", "dato")
            self.assertEqual(result["items"][0]["title"], "Dato B")
            self.assertFalse((root / "projects").exists())
            request = opened.call_args.args[0]
            self.assertTrue(request.full_url.endswith("/mcp"))


if __name__ == "__main__":
    unittest.main()
