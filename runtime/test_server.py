import unittest
from unittest.mock import patch

import numpy as np
import pandas as pd
from kronos.kronos import KronosPredictor

from kronos import server
import test_worker
from test_worker import candles, forecast_request
from worker import validate_result


class ServerTests(unittest.TestCase):
    def test_uses_latest_256_candles_and_matching_model_context(self):
        history = candles(256)
        for bar in history:
            bar.pop('volume')

        class Predictor:
            def predict_quantiles(inner, **kwargs):
                self.assertEqual(len(kwargs['df']), 256)
                self.assertEqual(int(kwargs['x_timestamp'].iloc[0].timestamp()),
                                 history[-256]['timestamp'] // 1000)
                return pd.DataFrame([dict(open=100, high=102, low=99, close=101,
                                          q10=99, q50=101, q90=102)] * 12)

        server._cache.clear()
        try:
            with patch.object(server, 'get_predictor', return_value=Predictor()):
                request = forecast_request(count=256)
                request['payload']['candles'] = history
                messages, _, _ = test_worker.WorkerTests().run_worker([
                    dict(id=1, op='initialize', cacheDir='cache'), request], server.run_kronos_forecast)
                self.assertEqual(messages[-1]['type'], 'result', messages[-1])
                result = messages[-1]['result']
                self.assertEqual(result['contextBars'], 256)
                self.assertEqual(result['quality']['missingVolumeCount'], 256)
                self.assertEqual(result['originTimestamp'], history[-1]['timestamp'] + 900000)
                self.assertEqual(result['points'][0]['timestamp'], result['originTimestamp'])
            with patch.object(server.KronosTokenizer, 'from_pretrained'), \
                    patch.object(server.Kronos, 'from_pretrained'), \
                    patch.object(server, 'KronosPredictor') as constructor:
                server.load_predictor('model', 'tokenizer')
                self.assertEqual(constructor.call_args.kwargs['max_context'], 256)
        finally:
            server._cache.clear()
            server._predictor = None

    def test_forecast_candles_keep_one_sample_path_instead_of_averaging_bodies(self):
        class Device:
            def eval(self):
                return self

            def to(self, device):
                return self

        predictor = KronosPredictor(Device(), Device())
        history = pd.DataFrame(candles())
        history['amount'] = history['volume'] * history[predictor.price_cols].mean(axis=1)
        values = history[predictor.price_cols + ['volume', 'amount']].values.astype(np.float32)
        # Opposing bodies cancel under averaging, although neither sampled path is a doji.
        paths = np.array([[[100, 105, 99, 104, 1, 101]] * 12,
                          [[104, 105, 99, 100, 1, 101]] * 12], dtype=np.float32)
        raw = ((paths - values.mean(axis=0)) / (values.std(axis=0) + 1e-5))[None]
        times = pd.Series(pd.date_range('2026-01-01', periods=12, freq='15min'))
        with patch('kronos.kronos.auto_regressive_inference', return_value=raw):
            result = predictor.predict_quantiles(history, times, times, 12, sample_count=2)
        actual = result[predictor.price_cols].to_numpy()
        self.assertTrue(any(np.allclose(actual, path[:, :4]) for path in paths),
                        'Rendered OHLC must retain a sampled trajectory, not synthetic averaged bodies')
        np.testing.assert_allclose(result['q50'], 102)

    def test_decoded_candles_enclose_model_open_and_close(self):
        class Predictor:
            def predict_quantiles(self, **kwargs):
                return pd.DataFrame([dict(open=103, high=101, low=102, close=100,
                                          q10=99, q50=101, q90=104)] * kwargs["pred_len"])

        server._cache.clear()
        with patch.object(server, "get_predictor", return_value=Predictor()):
            result = server.run_kronos_forecast(forecast_request()['payload'])
        validate_result(result, 12)
        self.assertEqual(result["points"][0]["high"], 103)
        self.assertEqual(result["points"][0]["low"], 100)
        self.assertEqual(result["points"][0]["q50"], 101)
        self.assertEqual(result['quality']['normalizedOutputCount'], 12)
        server._cache.clear()


if __name__ == "__main__":
    unittest.main()
