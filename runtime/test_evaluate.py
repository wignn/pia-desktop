import tempfile
import unittest
from pathlib import Path

from evaluate import (
    calibration_offsets,
    main as evaluate_main,
    make_origins,
    run_evaluation,
    score_forecast,
)

START = 1700000100000
STEP = 900000


def make_bars(count, start=START, step=STEP, close_base=100.0):
    bars = []
    for i in range(count):
        c = close_base + (i % 5) * 0.5
        bars.append({
            "timestamp": start + i * step,
            "open": c - 0.25,
            "high": c + 1.0,
            "low": c - 1.0,
            "close": c,
            "volume": 10.0 + i,
        })
    return bars


class EvaluateTests(unittest.TestCase):
    def test_hand_calculated_mae_baseline_direction_ties_and_interval_score(self):
        actual = [
            {"open": 100.0, "high": 103.0, "low": 99.5, "close": 102.0},
            {"open": 101.0, "high": 101.5, "low": 97.5, "close": 98.0},
        ]
        forecast = {
            "quality": {"normalizedOutputCount": 1},
            "points": [
                {
                    "step": 1,
                    "open": 100.0,
                    "high": 102.0,
                    "low": 99.0,
                    "close": 101.0,
                    "rawHigh": 100.5,
                    "rawLow": 99.0,
                    "q10": 99.0,
                    "q50": 101.5,
                    "q90": 101.0,
                },
                {
                    "step": 2,
                    "open": 100.0,
                    "high": 101.0,
                    "low": 98.0,
                    "close": 99.0,
                    "rawHigh": 101.0,
                    "rawLow": 98.0,
                    "q10": 97.0,
                    "q50": 98.5,
                    "q90": 99.0,
                },
            ],
        }
        metrics = score_forecast(100.0, actual, forecast, alpha=0.2)
        self.assertAlmostEqual(metrics["path_close_mae"], 1.0)
        self.assertAlmostEqual(metrics["baseline_close_mae"], 2.0)
        self.assertNotAlmostEqual(metrics["path_close_mae"], metrics["median_close_mae"])
        self.assertEqual(metrics["raw_ohlc_invalid_count"], 1)
        self.assertEqual(metrics["post_ohlc_invalid_count"], 0)

        # Single step hand calculation: raw range [99, 101], actual 102 -> miss 1, width 2, interval score 12 for alpha=0.2
        step1 = metrics["by_step"][0]
        self.assertAlmostEqual(step1["width"], 2.0)
        self.assertAlmostEqual(step1["miss"], 1.0)
        self.assertAlmostEqual(step1["interval_score"], 12.0)
        self.assertEqual(step1["covered"], 0)

        # Direction ties: actual flat and predicted flat counted separately from direction denominator
        tie_actual = [
            {"open": 100.0, "high": 101.0, "low": 99.0, "close": 100.0},
            {"open": 100.0, "high": 103.0, "low": 99.0, "close": 102.0},
            {"open": 100.0, "high": 103.0, "low": 99.0, "close": 103.0},
        ]
        tie_points = [
            {"open": 100.0, "high": 101.0, "low": 99.0, "close": 101.0, "q10": 99.0, "q50": 101.0, "q90": 102.0},
            {"open": 100.0, "high": 101.0, "low": 99.0, "close": 100.0, "q10": 99.0, "q50": 100.0, "q90": 102.0},
            {"open": 100.0, "high": 104.0, "low": 99.0, "close": 102.0, "q10": 99.0, "q50": 102.0, "q90": 104.0},
        ]
        tie_metrics = score_forecast(100.0, tie_actual, tie_points)
        self.assertEqual(tie_metrics["actual_flat_count"], 1)
        self.assertEqual(tie_metrics["predicted_flat_count"], 1)
        self.assertEqual(tie_metrics["direction_eval_count"], 1)
        self.assertAlmostEqual(tie_metrics["direction_accuracy"], 1.0)

    def test_calibration_offsets_order_statistic_and_small_sample_rejection(self):
        self.assertAlmostEqual(calibration_offsets([0.0, 0.0, 1.0, 2.0], coverage=0.8), 2.0)
        with self.assertRaises(ValueError):
            calibration_offsets([0.5], coverage=0.8)

    def test_make_origins_enforces_non_overlapping_partitions_gaps_and_minimums(self):
        bars = make_bars(256 + 12 * 62)
        # Introduce a gap inside one candidate target window
        for i in range(260, len(bars)):
            bars[i]["timestamp"] += STEP
        origins = make_origins(bars, "15m", max_origins=60, pilot=False)
        self.assertEqual(len(origins["selection"]), 20)
        self.assertEqual(len(origins["calibration"]), 20)
        self.assertEqual(len(origins["test"]), 20)
        self.assertGreaterEqual(origins["skipped"]["target_gap"], 1)

        all_origins = origins["selection"] + origins["calibration"] + origins["test"]
        seen_targets = set()
        for part_name in ("selection", "calibration", "test"):
            bounds = origins["boundaries"][part_name]
            for item in origins[part_name]:
                ctx_ts = set(item["context_timestamps"])
                tgt_ts = set(item["target_timestamps"])
                self.assertFalse(ctx_ts & tgt_ts)
                self.assertFalse(seen_targets & tgt_ts)
                seen_targets.update(tgt_ts)
                self.assertGreaterEqual(min(tgt_ts), bounds["start_timestamp"])
                self.assertLessEqual(max(tgt_ts), bounds["end_timestamp"])
        self.assertEqual(len(all_origins), 60)

        with self.assertRaises(ValueError):
            make_origins(make_bars(400), "15m", max_origins=60, pilot=False)

    def test_walk_forward_isolation_resume_and_pilot_guardrails(self):
        bars = make_bars(256 + 12 * 60)
        dataset = {"symbol": "XAUUSD", "timeframe": "15m", "candles": bars}
        call_log = []

        def stub_predict(req):
            call_log.append((req["partition"], req["origin_timestamp"], req["context_bars"], req["sample_count"], req["horizon"]))
            interval = STEP
            origin = req["origin_timestamp"]
            bias = 0.2 if (req["context_bars"] == 256 and req["sample_count"] == 6) else 2.5
            pts = []
            for i in range(req["horizon"]):
                c = req["candles"][-1]["close"] + bias
                pts.append({
                    "step": i + 1,
                    "timestamp": origin + i * interval,
                    "open": c,
                    "high": c + 0.5,
                    "low": c - 0.5,
                    "close": c,
                    "rawHigh": c + 0.5,
                    "rawLow": c - 0.5,
                    "q10": c - 0.2,
                    "q50": c,
                    "q90": c + 0.2,
                })
            return {
                "timeframe": "15m",
                "contextBars": req["context_bars"],
                "sampleCount": req["sample_count"],
                "cutoffTimestamp": req["cutoff_timestamp"],
                "originTimestamp": origin,
                "originPrice": req["candles"][-1]["close"],
                "inferenceMs": 10.0,
                "quality": {"gapCount": 0, "missingVolumeCount": 0, "normalizedOutputCount": 0},
                "points": pts,
            }

        with tempfile.TemporaryDirectory() as tmp:
            pilot_out = Path(tmp) / "pilot.json"
            pilot_res = run_evaluation(dataset, stub_predict, {"pilot": True, "output_path": pilot_out})
            self.assertEqual(pilot_res["status"], "exploratory_pilot")
            self.assertFalse(pilot_res["promotable"])
            self.assertIsNone(pilot_res["selected_config"])
            self.assertEqual(len(call_log), 6)

            # Pilot output cannot be resumed as full evaluation
            with self.assertRaises(ValueError):
                run_evaluation(dataset, stub_predict, {"pilot": False, "max_origins": 60, "output_path": pilot_out, "resume": True})

            # Interrupted full evaluation resumes remaining cases without re-running completed ones
            call_log.clear()
            full_out = Path(tmp) / "full.json"
            partial = run_evaluation(
                dataset,
                stub_predict,
                {
                    "pilot": False,
                    "max_origins": 60,
                    "configs": [(64, 6, 12), (256, 6, 12)],
                    "horizons": [12],
                    "calibrate": True,
                    "output_path": full_out,
                    "stop_after_cases": 15,
                },
            )
            self.assertEqual(partial["status"], "incomplete")
            self.assertEqual(len(call_log), 15)

            # Without --resume, existing output is rejected
            with self.assertRaises(ValueError):
                run_evaluation(
                    dataset,
                    stub_predict,
                    {
                        "pilot": False,
                        "max_origins": 60,
                        "configs": [(64, 6, 12), (256, 6, 12)],
                        "horizons": [12],
                        "calibrate": True,
                        "output_path": full_out,
                    },
                )

            resumed = run_evaluation(
                dataset,
                stub_predict,
                {
                    "pilot": False,
                    "max_origins": 60,
                    "configs": [(64, 6, 12), (256, 6, 12)],
                    "horizons": [12],
                    "calibrate": True,
                    "output_path": full_out,
                    "resume": True,
                },
            )
            self.assertEqual(resumed["status"], "complete")
            # Total calls across partial (15) + resumed (65) = 80 (2 configs * 20 selection + 1 selected * 20 calibration + 1 selected * 20 test)
            self.assertEqual(len(call_log), 80)
            self.assertEqual(len(set(call_log)), 80)
            self.assertEqual(resumed["selected_config"], {"context_bars": 256, "sample_count": 6})
            # Selection never sees calibration/test origins; calibration/test only run selected config
            non_selected_calls = [c for c in call_log if c[2] != 256]
            self.assertTrue(all(c[0] == "selection" for c in non_selected_calls))
            self.assertTrue((Path(tmp) / "full.md").is_file())

            # Case budget enforced before predict is invoked
            call_log.clear()
            with self.assertRaises(ValueError):
                run_evaluation(dataset, stub_predict, {"pilot": True, "max_cases": 5})
            self.assertEqual(len(call_log), 0)

            # Mixing symbols in dataset is rejected (no cross-symbol currency error pooling)
            mixed = {"symbol": "XAUUSD", "timeframe": "15m", "candles": [{**bars[0], "symbol": "BTCUSD"}, *bars[1:]]}
            with self.assertRaises(ValueError):
                run_evaluation(mixed, stub_predict, {"pilot": True})
            self.assertEqual(len(call_log), 0)

            # CLI preflight rejects malformed data and insufficient full history before loading model cache
            short_path = Path(tmp) / "short.json"
            import json
            short_path.write_text(json.dumps({"symbol": "XAUUSD", "timeframe": "15m", "candles": make_bars(300)}), encoding="utf-8")
            with self.assertRaises(ValueError):
                evaluate_main(["--data", str(short_path), "--cache-dir", str(Path(tmp) / "missing-cache"), "--output", str(Path(tmp) / "out.json"), "--full", "--max-origins", "60"])


if __name__ == "__main__":
    unittest.main()
