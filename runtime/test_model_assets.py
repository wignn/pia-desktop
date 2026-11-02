import hashlib
import json
from pathlib import Path
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import unittest
from unittest.mock import patch

import model_assets


class AssetTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.body = b'fixture verified weights'
        self.requests = 0
        self.reply = self.body
        owner = self

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                owner.requests += 1
                self.send_response(200)
                self.send_header('Content-Length', str(len(owner.body)))
                self.end_headers()
                self.wfile.write(owner.reply)

            def log_message(self, *_):
                pass

        self.server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.addCleanup(self.server.server_close)
        self.addCleanup(self.server.shutdown)
        self.asset = dict(repo='NeoQuasar/Kronos-base', revision='a' * 40,
                          file='model.safetensors', size=len(self.body), sha256=hashlib.sha256(self.body).hexdigest())
        self.manifest = self.root / 'manifest.json'
        self.manifest.write_text(json.dumps(dict(assets=[self.asset])))
        self.cache = self.root / 'cache'
        self.events = []
        self.patches = [patch.object(model_assets, 'MANIFEST', self.manifest),
                        patch.object(model_assets, 'asset_url', lambda _: f'http://127.0.0.1:{self.server.server_port}/asset')]
        for p in self.patches:
            p.start()
            self.addCleanup(p.stop)

    def acquire(self):
        return model_assets.ensure_model_assets(self.cache, self.events.append)

    def test_verified_cache_is_offline(self):
        paths = self.acquire()
        self.assertEqual((paths['model'] / self.asset['file']).read_bytes(), self.body)
        with patch.object(model_assets.urllib.request, 'urlopen', side_effect=AssertionError('offline')):
            self.acquire()
        self.assertEqual(self.requests, 1)
        progress = [e['downloadedBytes'] for e in self.events if 'downloadedBytes' in e]
        self.assertIn(len(self.body), progress)

    def test_digest_mismatch_never_promotes_partial(self):
        self.reply = b'x' * len(self.body)
        with self.assertRaises(model_assets.AssetError) as error:
            self.acquire()
        self.assertEqual(error.exception.code, 'integrity')
        self.assertEqual(list(self.cache.rglob('*.part')), [])
        self.assertEqual(list(self.cache.rglob('model.safetensors')), [])

    def test_interrupted_download_can_retry(self):
        self.reply = self.body[:3]
        with self.assertRaises(model_assets.AssetError):
            self.acquire()
        self.reply = self.body
        self.assertTrue(self.acquire()['model'].is_dir())
        self.assertEqual(self.requests, 2)

    def test_disk_write_failure_reports_error(self):
        with patch.object(model_assets.tempfile, 'NamedTemporaryFile', side_effect=OSError('disk full')):
            with self.assertRaises(model_assets.AssetError) as error:
                self.acquire()
        self.assertEqual(error.exception.code, 'disk')
        self.assertNotIn('ready', [e['status'] for e in self.events])

    def test_path_traversal_and_unpinned_revision_are_rejected(self):
        for field, value in [('file', '../escape'), ('file', 'C:/escape'), ('revision', 'main'), ('repo', '../escape')]:
            asset = {**self.asset, field: value}
            self.manifest.write_text(json.dumps(dict(assets=[asset])))
            with self.assertRaises(model_assets.AssetError):
                self.acquire()
        self.assertEqual(self.requests, 0)

    def test_failed_new_revision_preserves_previous_valid_cache(self):
        old = self.acquire()['model'] / self.asset['file']
        self.asset['revision'] = 'b' * 40
        self.manifest.write_text(json.dumps(dict(assets=[self.asset])))
        self.reply = b'x' * len(self.body)
        with self.assertRaises(model_assets.AssetError):
            self.acquire()
        self.assertEqual(old.read_bytes(), self.body)


if __name__ == '__main__':
    unittest.main()
