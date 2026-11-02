import unittest
from forecast_input import validate_history, timeframe_ms

START = 1700000100000
STEP = 900000

def history(count=256):
    return [dict(timestamp=START + i * STEP, open=100, high=104, low=99, close=101) for i in range(count)]

class InputTests(unittest.TestCase):
    def test_retains_256_and_missing_volume(self):
        rows, quality = validate_history(history(), '15m', START + 256 * STEP)
        self.assertEqual(len(rows), 256)
        self.assertNotIn('volume', rows[0])
        self.assertEqual(quality, dict(gapCount=0, missingVolumeCount=256))

    def test_rejects_bad_temporal_and_price_inputs(self):
        for patch in [dict(timestamp=START+1), dict(timestamp=START+.5), dict(high=98), dict(volume=-1), dict(close=float('inf'))]:
            bars = history()
            bars[0].update(patch)
            with self.assertRaises(ValueError):
                validate_history(bars, '15m', START + 256 * STEP)
        for bars, tf, cutoff in [(history()[::-1], '15m', START+256*STEP),
                                 ([history()[0]]*12, '15m', START+256*STEP),
                                 (history(), '2h', START+256*STEP),
                                 (history(), '15m', START+255*STEP)]:
            with self.assertRaises(ValueError):
                validate_history(bars, tf, cutoff)

    def test_gap_is_reported_not_filled(self):
        bars = history(12)
        bars[-1]['timestamp'] += 100 * STEP
        rows, quality = validate_history(bars, '15m', START + 200 * STEP)
        self.assertEqual(len(rows), 12)
        self.assertEqual(quality['gapCount'], 1)
        self.assertEqual(timeframe_ms('1w'), 604800000)

if __name__ == '__main__':
    unittest.main()
