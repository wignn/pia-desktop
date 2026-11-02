import copy
import io
import json
import time
import unittest

from worker import MAX_LINE, serve


def candles(count=12):
    return [dict(timestamp=1700000100000 + i * 900000, open=100, high=102,
                 low=99, close=101, volume=1) for i in range(count)]


def forecast_request(id=2, count=12):
    return dict(id=id, op="forecast", payload=dict(symbol="BTCUSD", candles=candles(count),
                                                  pred_len=12, sample_count=6, timeframe='15m',
                                                  cutoffTimestamp=1700000100000 + count * 900000))


class WorkerTests(unittest.TestCase):
    def run_worker(self, requests, forecast=None):
        initialized, received = [], []

        def initialize(path, emit):
            initialized.append(path)
            print("diagnostic must not enter protocol")
            emit(dict(status="loading"))

        def predict(payload):
            received.append(payload)
            origin = payload["candles"][-1]["timestamp"] + 900000
            return dict(device="cpu", timeframe=payload["timeframe"], contextBars=len(payload["candles"]),
                        sampleCount=6, cutoffTimestamp=payload["cutoffTimestamp"], originTimestamp=origin,
                        originPrice=101, quality=dict(gapCount=0, missingVolumeCount=0, normalizedOutputCount=0),
                        points=[dict(step=i + 1, timestamp=origin + i * 900000, open=100, high=102,
                                     low=99, close=101, q10=99, q50=101, q90=102) for i in range(12)])

        text = "".join((r if isinstance(r, str) else json.dumps(r)) + "\n" for r in requests)
        output = io.StringIO()
        serve(io.StringIO(text), output, initialize, forecast or predict)
        return [json.loads(line) for line in output.getvalue().splitlines()], initialized, received

    def test_two_requests_keep_one_initialized_model(self):
        messages, initialized, received = self.run_worker([
            dict(id=1, op="initialize", cacheDir="C:/model cache/日本"),
            dict(id=2, op="initialize", cacheDir="C:/model cache/日本"),
            forecast_request(3, 360), forecast_request(4),
        ])
        self.assertEqual(initialized, ["C:/model cache/日本"])
        self.assertEqual([m["id"] for m in messages if m["type"] == "result"], [1, 2, 3, 4])
        self.assertEqual(len(received[0]["candles"]), 360)
        self.assertEqual(received[0]["symbol"], "BTCUSD")
        for message in messages:
            for p in message.get("result", {}).get("points", []):
                self.assertLessEqual(p["q10"], p["q50"])
                self.assertLessEqual(p["q50"], p["q90"])
                self.assertLessEqual(p["low"], min(p["open"], p["close"]))
                self.assertGreaterEqual(p["high"], max(p["open"], p["close"]))

    def test_bad_json_does_not_break_next_request(self):
        messages, initialized, _ = self.run_worker(["{", dict(id=1, op="initialize", cacheDir="cache")])
        self.assertEqual(messages[0]["type"], "error")
        self.assertEqual(messages[-1]["id"], 1)
        self.assertEqual(initialized, ["cache"])

    def test_rejects_nonfinite_and_short_history(self):
        bad = [forecast_request(2, 11), forecast_request(3, 361)]
        for value in [float("nan"), float("inf"), True, "100"]:
            request = forecast_request(4)
            request["payload"]["candles"][0]["close"] = value
            bad.append(request)
        invalid_ohlc = forecast_request(5)
        invalid_ohlc["payload"]["candles"][0]["high"] = 98
        bad.append(invalid_ohlc)
        for mutate in [
            lambda p: p["candles"][1].update(timestamp=p["candles"][0]["timestamp"]),
            lambda p: p.update(candles=list(reversed(p["candles"]))),
            lambda p: p["candles"][0].update(timestamp=p["candles"][0]["timestamp"] + 1),
            lambda p: p["candles"][0].update(timestamp=p["candles"][0]["timestamp"] + 0.5),
            lambda p: p["candles"][0].update(timestamp=9007199254740992),
            lambda p: p.update(timeframe="2h"),
            lambda p: p.update(cutoffTimestamp=p["cutoffTimestamp"] - 1),
            lambda p: p.update(cutoffTimestamp=int(time.time() * 1000) + 120000),
        ]:
            req = forecast_request(6)
            mutate(req["payload"])
            bad.append(req)
        messages, _, received = self.run_worker([dict(id=1, op="initialize", cacheDir="cache"), *bad])
        self.assertEqual(len([m for m in messages if m["type"] == "error"]), len(bad))
        self.assertEqual(received, [])

    def test_oversized_line_is_drained_before_next_request(self):
        messages, initialized, _ = self.run_worker(["x" * (MAX_LINE + 1), dict(id=1, op="initialize", cacheDir="cache")])
        self.assertEqual(messages[0]["code"], "protocol")
        self.assertEqual(initialized, ["cache"])

    def test_uninitialized_forecast_and_invalid_output_are_errors(self):
        messages, _, _ = self.run_worker([forecast_request()])
        self.assertEqual(messages[-1]["type"], "error")
        req = forecast_request()
        origin = req["payload"]["candles"][-1]["timestamp"] + 900000
        invalid = dict(timeframe="15m", contextBars=12, sampleCount=6,
                       cutoffTimestamp=req["payload"]["cutoffTimestamp"], originTimestamp=origin, originPrice=101,
                       quality=dict(gapCount=0, missingVolumeCount=0, normalizedOutputCount=0),
                       points=[dict(step=i + 1, timestamp=origin + i * 900000, open=100, high=98, low=99,
                                    close=101, q10=99, q50=101, q90=102) for i in range(12)])
        messages, _, _ = self.run_worker([dict(id=1, op="initialize", cacheDir="cache"), req], lambda _: copy.deepcopy(invalid))
        self.assertEqual(messages[-1]["type"], "error")
        self.assertIn("invalid price bounds", messages[-1]["message"])
        missing_meta = dict(points=[dict(open=100, high=102, low=99, close=101, q10=99, q50=101, q90=102)] * 12)
        messages, _, _ = self.run_worker([dict(id=1, op="initialize", cacheDir="cache"), req], lambda _: copy.deepcopy(missing_meta))
        self.assertEqual(messages[-1]["type"], "error")

    def test_asset_error_code_is_preserved(self):
        from model_assets import AssetError
        output = io.StringIO()
        def fail(path, emit):
            raise AssetError('integrity', 'Model checksum mismatch')
        serve(io.StringIO(json.dumps(dict(id=1, op='initialize', cacheDir='cache')) + '\n'), output, fail, lambda _: None)
        self.assertEqual(json.loads(output.getvalue())['code'], 'integrity')

    def test_closed_output_pipe_exits_cleanly(self):
        class ClosedWriter:
            def write(self, line):
                raise OSError(22, "Invalid argument")

        serve(io.StringIO('{"id":1,"op":"unknown"}\n'), ClosedWriter(), None, None)

    def test_stdio_protocol_uses_utf8_for_non_ascii_cache_paths(self):
        from worker import configure_stdio
        reader = io.TextIOWrapper(io.BytesIO('{"cacheDir":"日本"}\n'.encode()), encoding="cp1252")
        writer = io.TextIOWrapper(io.BytesIO(), encoding="cp1252")
        configure_stdio(reader, writer)
        self.assertEqual(json.loads(reader.readline())["cacheDir"], "日本")
        self.assertEqual(writer.encoding, "utf-8")

    def test_eof_exits(self):
        messages, initialized, received = self.run_worker([])
        self.assertEqual((messages, initialized, received), ([], [], []))


if __name__ == "__main__":
    unittest.main()
