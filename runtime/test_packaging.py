import json
from pathlib import Path
import tempfile
import unittest

from build import validate_bundle, validate_target
from smoke import close_child
from unittest.mock import Mock
import subprocess


class PackagingTests(unittest.TestCase):
    def test_stalled_smoke_child_is_killed_and_reported(self):
        child = Mock()
        child.wait.side_effect = [subprocess.TimeoutExpired('worker', .01), 0]
        with self.assertRaisesRegex(AssertionError, 'did not terminate'):
            close_child(child, timeout=.01)
        child.kill.assert_called_once()


    def test_parent_exit_smoke_is_a_release_gate(self):
        from smoke import parent_exit_smoke
        workflow = Path(__file__).resolve().parents[1] / '.github/workflows/release.yml'
        self.assertIn('--parent-exit', workflow.read_text())
        self.assertTrue(callable(parent_exit_smoke))

    def test_missing_runtime_or_dependencies_prevents_packaging(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with self.assertRaises(ValueError):
                validate_bundle(root)
            (root / 'kronos-worker.exe').touch()
            (root / 'kronos-worker').touch()
            with self.assertRaises(ValueError):
                validate_bundle(root)

    def test_wrong_architecture_is_rejected(self):
        with self.assertRaises(ValueError):
            validate_target('Linux', 'aarch64', (3, 11))
        with self.assertRaises(ValueError):
            validate_target('Windows', 'AMD64', (3, 12))
        validate_target('Windows', 'AMD64', (3, 11))
        validate_target('Darwin', 'arm64', (3, 11))

    def test_bundled_manifest_has_only_immutable_revisions(self):
        manifest = json.loads(Path(__file__).with_name('model-manifest.json').read_text())
        repos = {asset['repo'] for asset in manifest['assets']}
        self.assertEqual(repos, {'NeoQuasar/Kronos-base', 'NeoQuasar/Kronos-Tokenizer-base'})
        for asset in manifest['assets']:
            self.assertRegex(asset['revision'], r'^[0-9a-f]{40}$')
            self.assertRegex(asset['sha256'], r'^[0-9a-f]{64}$')
            self.assertIn(asset['file'], ('config.json', 'model.safetensors'))

    def test_smoke_contract_requires_256_aligned_bars_and_rejects_64_bar_truncation(self):
        from smoke import make_smoke_payload, verify_smoke_result
        from worker import validate_payload
        payload = make_smoke_payload(0)
        validated = validate_payload(payload)
        self.assertEqual(len(validated['candles']), 256)
        self.assertEqual(validated['timeframe'], '15m')
        origin = payload['candles'][-1]['timestamp'] + 900000
        good = dict(
            device='cpu',
            inferenceMs=12.5,
            timeframe='15m',
            contextBars=256,
            sampleCount=6,
            cutoffTimestamp=payload['cutoffTimestamp'],
            originTimestamp=origin,
            originPrice=payload['candles'][-1]['close'],
            quality=dict(gapCount=1, missingVolumeCount=1, normalizedOutputCount=0),
            points=[
                dict(step=i + 1, timestamp=origin + i * 900000,
                     open=2000.0, high=2002.0, low=1999.0, close=2001.0,
                     q10=1999.0, q50=2001.0, q90=2002.0)
                for i in range(12)
            ]
        )
        verify_smoke_result(payload, good)
        with self.assertRaises((AssertionError, ValueError)):
            verify_smoke_result(payload, {**good, 'contextBars': 64})


if __name__ == '__main__':
    unittest.main()
