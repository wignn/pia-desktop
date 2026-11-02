from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import platform
import statistics
import sys
import tempfile

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from forecast_input import INTERVALS, numeric, safe_timestamp, timeframe_ms, validate_history
from model_assets import MANIFEST, REPOS, verified

PILOT_CONFIGS = [(64, 6, 12), (128, 6, 12), (256, 6, 12)]
FULL_CONFIGS = [
    (ctx, samples, horizon)
    for ctx in (64, 128, 256)
    for samples in (6, 12, 24)
    for horizon in (3, 6, 12)
]
SEED_POLICY = "sha256-origin-v1"


def canonical_digest(obj) -> str:
    return hashlib.sha256(json.dumps(obj, sort_keys=True, separators=(",", ":"), allow_nan=False).encode("utf-8")).hexdigest()


def deterministic_seed(symbol: str, timeframe: str, origin_timestamp: int) -> int:
    raw = f"{SEED_POLICY}:{symbol}:{timeframe}:{origin_timestamp}".encode("utf-8")
    return int.from_bytes(hashlib.sha256(raw).digest()[:4], "big")


def validate_bars(bars, timeframe: str):
    interval = timeframe_ms(timeframe)
    if not isinstance(bars, list) or not bars:
        raise ValueError("Dataset candles must be a non-empty list")
    cutoff = (bars[-1].get("timestamp") if isinstance(bars[-1], dict) else 0)
    cutoff_ts = (cutoff + interval) if safe_timestamp(cutoff) else 9007199254740991
    _, quality = validate_history(bars, timeframe, cutoff_ts, max_bars=len(bars), min_bars=1)
    for bar in bars:
        if any(float(bar[k]) <= 0 for k in ("open", "high", "low", "close")):
            raise ValueError("Candle OHLC values must be positive")
    return interval, quality["gapCount"], quality["missingVolumeCount"]


def validate_dataset(dataset):
    if not isinstance(dataset, dict):
        raise ValueError("Dataset must be a JSON object")
    symbol = dataset.get("symbol")
    timeframe = dataset.get("timeframe")
    candles = dataset.get("candles")
    if not isinstance(symbol, str) or not symbol.strip() or any(ch.isspace() for ch in symbol):
        raise ValueError("Dataset requires a single non-empty symbol")
    interval, gap_count, missing_volume_count = validate_bars(candles, timeframe)
    for bar in candles:
        if ("symbol" in bar and bar["symbol"] != symbol) or ("timeframe" in bar and bar["timeframe"] != timeframe):
            raise ValueError("Dataset candles must not mix symbols or timeframes")
    return symbol, timeframe, candles, interval, gap_count, missing_volume_count


def make_origins(bars, timeframe: str, max_origins: int = 2, pilot: bool = False):
    interval, _, _ = validate_bars(bars, timeframe)
    if type(max_origins) is not int or max_origins <= 0:
        raise ValueError("max_origins must be a positive integer")
    if not pilot and max_origins < 60:
        raise ValueError("Full evaluation requires max_origins >= 60 (at least 20 per partition)")

    eligible = []
    skipped_target_gap = 0
    idx = 255
    n_bars = len(bars)
    while idx + 12 < n_bars:
        base_ts = bars[idx]["timestamp"]
        target_slice = bars[idx + 1 : idx + 13]
        if any(target_slice[k]["timestamp"] != base_ts + (k + 1) * interval for k in range(12)):
            skipped_target_gap += 1
            idx += 1
            continue
        context_slice = bars[idx - 255 : idx + 1]
        origin_ts = base_ts + interval
        eligible.append({
            "origin_bar_idx": idx,
            "origin_timestamp": origin_ts,
            "cutoff_timestamp": origin_ts,
            "origin_close": float(bars[idx]["close"]),
            "target_end_timestamp": target_slice[-1]["timestamp"],
            "context_timestamps": [b["timestamp"] for b in context_slice],
            "target_timestamps": [b["timestamp"] for b in target_slice],
        })
        idx += 12

    selected = eligible[:max_origins]
    skipped_over_limit = max(0, len(eligible) - max_origins)

    if pilot:
        required = min(2, max_origins)
        if len(selected) < required:
            raise ValueError(f"Insufficient contiguous history for pilot evaluation (found {len(selected)}, need {required})")
        selection = selected
        calibration = []
        test = []
    else:
        total = len(selected)
        q, r = divmod(total, 3)
        n_sel = q + (1 if r >= 1 else 0)
        n_cal = q + (1 if r >= 2 else 0)
        n_test = q
        if n_sel < 20 or n_cal < 20 or n_test < 20:
            raise ValueError(
                f"Insufficient contiguous history for full evaluation: found {total} eligible origins "
                "(requires at least 20 non-overlapping 12-bar windows per partition, 60 total)"
            )
        selection = selected[:n_sel]
        calibration = selected[n_sel : n_sel + n_cal]
        test = selected[n_sel + n_cal :]

    boundaries = {}
    for name, items in (("selection", selection), ("calibration", calibration), ("test", test)):
        if items:
            boundaries[name] = {
                "start_timestamp": items[0]["origin_timestamp"],
                "end_timestamp": items[-1]["target_end_timestamp"],
                "count": len(items),
            }
        else:
            boundaries[name] = {"start_timestamp": None, "end_timestamp": None, "count": 0}

    return {
        "selection": selection,
        "calibration": calibration,
        "test": test,
        "boundaries": boundaries,
        "skipped": {
            "target_gap": skipped_target_gap,
            "over_limit": skipped_over_limit,
        },
    }


def _single_calibration_offset(scores, coverage: float) -> float:
    if not isinstance(scores, (list, tuple)) or len(scores) == 0:
        raise ValueError("Calibration scores must be non-empty")
    if not numeric(coverage) or not 0.0 < float(coverage) < 1.0:
        raise ValueError("Coverage target must be between 0 and 1")
    n = len(scores)
    rank = math.ceil((n + 1) * float(coverage))
    if rank < 1 or rank > n:
        raise ValueError(f"Insufficient calibration sample size ({n}) for finite-sample rank {rank} at coverage {coverage}")
    ordered = sorted(max(0.0, float(s)) for s in scores)
    return float(ordered[rank - 1])


def calibration_offsets(scores_by_step, coverage: float = 0.8):
    if isinstance(scores_by_step, dict):
        return {k: _single_calibration_offset(v, coverage) for k, v in scores_by_step.items()}
    if isinstance(scores_by_step, (list, tuple)) and scores_by_step and isinstance(scores_by_step[0], (list, tuple)):
        return [_single_calibration_offset(v, coverage) for v in scores_by_step]
    return _single_calibration_offset(scores_by_step, coverage)


def score_forecast(origin_close: float, actual, forecast, alpha: float = 0.2, offsets=None):
    points = forecast["points"] if isinstance(forecast, dict) else forecast
    quality = forecast.get("quality", {}) if isinstance(forecast, dict) else {}
    if not isinstance(actual, list) or not isinstance(points, list) or len(actual) != len(points) or not actual:
        raise ValueError("actual and forecast points must be non-empty lists of equal length")
    origin_close = float(origin_close)
    alpha = float(alpha)
    n = len(actual)

    by_step = []
    raw_invalid_steps = 0
    post_invalid_steps = 0
    actual_flat_count = 0
    predicted_flat_count = 0
    direction_eval_count = 0
    direction_hit_count = 0

    for i, (act, pt) in enumerate(zip(actual, points)):
        act_close = float(act["close"])
        act_open = float(act.get("open", act_close))
        act_high = float(act.get("high", max(act_open, act_close)))
        act_low = float(act.get("low", min(act_open, act_close)))

        pt_close = float(pt["close"])
        pt_open = float(pt.get("open", pt_close))
        pt_high = float(pt.get("high", max(pt_open, pt_close)))
        pt_low = float(pt.get("low", min(pt_open, pt_close)))
        q10 = float(pt.get("q10", pt_low))
        q50 = float(pt.get("q50", pt_close))
        q90 = float(pt.get("q90", pt_high))

        raw_high = float(pt.get("rawHigh", pt_high))
        raw_low = float(pt.get("rawLow", pt_low))
        if raw_low > min(pt_open, pt_close) or raw_high < max(pt_open, pt_close) or raw_low > raw_high:
            raw_invalid_steps += 1
        if pt_low > min(pt_open, pt_close) or pt_high < max(pt_open, pt_close) or pt_low > pt_high:
            post_invalid_steps += 1

        width = q90 - q10
        miss = max(q10 - act_close, act_close - q90, 0.0)
        covered = 1 if (q10 <= act_close <= q90) else 0
        interval_score = width + (2.0 / alpha) * miss

        act_delta = act_close - origin_close
        pred_delta = q50 - origin_close
        if act_delta == 0.0:
            actual_flat_count += 1
        if pred_delta == 0.0:
            predicted_flat_count += 1
        if act_delta != 0.0 and pred_delta != 0.0:
            direction_eval_count += 1
            if (act_delta > 0.0) == (pred_delta > 0.0):
                direction_hit_count += 1

        step_entry = {
            "step": i + 1,
            "path_close_abs_err": abs(pt_close - act_close),
            "median_close_abs_err": abs(q50 - act_close),
            "baseline_close_abs_err": abs(origin_close - act_close),
            "open_abs_err": abs(pt_open - act_open),
            "high_abs_err": abs(pt_high - act_high),
            "low_abs_err": abs(pt_low - act_low),
            "body_abs_err": abs(abs(pt_close - pt_open) - abs(act_close - act_open)),
            "range_abs_err": abs((pt_high - pt_low) - (act_high - act_low)),
            "width": width,
            "miss": miss,
            "covered": covered,
            "interval_score": interval_score,
        }
        if offsets is not None:
            off = float(offsets[i + 1] if isinstance(offsets, dict) else offsets[i])
            cal_q10 = q10 - off
            cal_q90 = q90 + off
            cal_width = cal_q90 - cal_q10
            cal_miss = max(cal_q10 - act_close, act_close - cal_q90, 0.0)
            step_entry["calibrated_width"] = cal_width
            step_entry["calibrated_miss"] = cal_miss
            step_entry["calibrated_covered"] = 1 if (cal_q10 <= act_close <= cal_q90) else 0
            step_entry["calibrated_interval_score"] = cal_width + (2.0 / alpha) * cal_miss
        by_step.append(step_entry)

    raw_ohlc_invalid_count = max(raw_invalid_steps, int(quality.get("normalizedOutputCount", 0) or 0))
    path_close_mae = sum(s["path_close_abs_err"] for s in by_step) / n
    median_close_mae = sum(s["median_close_abs_err"] for s in by_step) / n
    baseline_close_mae = sum(s["baseline_close_abs_err"] for s in by_step) / n

    result = {
        "steps": n,
        "path_close_mae": path_close_mae,
        "close_mae": path_close_mae,
        "median_close_mae": median_close_mae,
        "baseline_close_mae": baseline_close_mae,
        "median_vs_baseline_mae": median_close_mae - baseline_close_mae,
        "path_vs_baseline_mae": path_close_mae - baseline_close_mae,
        "open_mae": sum(s["open_abs_err"] for s in by_step) / n,
        "high_mae": sum(s["high_abs_err"] for s in by_step) / n,
        "low_mae": sum(s["low_abs_err"] for s in by_step) / n,
        "body_mae": sum(s["body_abs_err"] for s in by_step) / n,
        "range_mae": sum(s["range_abs_err"] for s in by_step) / n,
        "raw_ohlc_invalid_count": raw_ohlc_invalid_count,
        "raw_ohlc_invalid_rate": raw_ohlc_invalid_count / n,
        "post_ohlc_invalid_count": post_invalid_steps,
        "post_ohlc_invalid_rate": post_invalid_steps / n,
        "actual_flat_count": actual_flat_count,
        "predicted_flat_count": predicted_flat_count,
        "baseline_predicted_flat_count": n,
        "direction_eval_count": direction_eval_count,
        "direction_hit_count": direction_hit_count,
        "direction_accuracy": (direction_hit_count / direction_eval_count) if direction_eval_count > 0 else None,
        "coverage": sum(s["covered"] for s in by_step) / n,
        "mean_width": sum(s["width"] for s in by_step) / n,
        "mean_miss": sum(s["miss"] for s in by_step) / n,
        "interval_score": sum(s["interval_score"] for s in by_step) / n,
        "by_step": by_step,
    }
    if offsets is not None:
        result["calibrated_coverage"] = sum(s["calibrated_covered"] for s in by_step) / n
        result["calibrated_mean_width"] = sum(s["calibrated_width"] for s in by_step) / n
        result["calibrated_interval_score"] = sum(s["calibrated_interval_score"] for s in by_step) / n
    return result


def _atomic_write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, suffix=".tmp", delete=False) as handle:
        tmp = Path(handle.name)
        json.dump(payload, handle, indent=2, sort_keys=True)
        handle.write("\n")
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(tmp, path)


def _write_markdown_summary(md_path: Path, state: dict) -> None:
    lines = [
        f"# Kronos Walk-Forward Evaluation ({state['symbol']} • {state['timeframe']})",
        "",
        f"- **Status**: `{state['status']}`",
        f"- **Mode**: `{'pilot' if state['pilot'] else 'full'}`",
        f"- **Promotable**: `{state['promotable']}`",
        f"- **Dataset SHA-256**: `{state['dataset_digest']}`",
        f"- **Manifest SHA-256**: `{state['manifest_digest']}`",
        f"- **Seed Policy**: `{state['seed_policy']}`",
        f"- **Completed Cases**: `{len(state['completed_cases'])}` / `{state['planned_cases']}`",
        f"- **Dataset Diagnostics**: `{state['dataset_quality']['gapCount']}` gaps, `{state['dataset_quality']['missingVolumeCount']}` missing-volume bars",
        f"- **Skipped Origins**: `{state['origins_summary']['skipped']['target_gap']}` target-gap, `{state['origins_summary']['skipped']['over_limit']}` over-limit",
    ]
    if state.get("projected_full_cases"):
        lines.append(
            f"- **Projected Full Grid (60 origins, 27 selection configs)**: `{state['projected_full_cases']}` cases"
            + (f" (~`{state['projected_full_seconds']}s`)" if state.get("projected_full_seconds") is not None else "")
        )
    if state.get("selected_config"):
        sel = state["selected_config"]
        lines.append(f"- **Selected Configuration (selection partition only)**: `context={sel['context_bars']}, samples={sel['sample_count']}`")
    else:
        lines.append("- **Selected Configuration**: `None (exploratory pilot or incomplete run)`")
    lines.append("")
    lines.append("> Note: Pooled raw q10–q90 ensemble bounds are not calibrated 80% probability intervals. Results apply only to this symbol, timeframe, and historical period.")
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=md_path.parent, suffix=".tmp", delete=False) as handle:
        tmp = Path(handle.name)
        handle.write("\n".join(lines) + "\n")
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(tmp, md_path)


def _aggregate_partition_cases(cases: list[dict], offsets_by_horizon: dict | None = None):
    if not cases:
        return {}
    by_cfg: dict[str, list[dict]] = {}
    for case in cases:
        key = f"ctx{case['context_bars']}_s{case['sample_count']}_h{case['horizon']}"
        by_cfg.setdefault(key, []).append(case)
    summary = {}
    for key, items in sorted(by_cfg.items()):
        m_list = [item["metrics"] for item in items]
        latencies = sorted(float(item.get("inference_ms", 0.0)) for item in items)
        n = len(m_list)
        p95_idx = min(n - 1, max(0, math.ceil(0.95 * n) - 1))
        entry = {
            "cases": n,
            "context_bars": items[0]["context_bars"],
            "sample_count": items[0]["sample_count"],
            "horizon": items[0]["horizon"],
            "median_close_mae": sum(m["median_close_mae"] for m in m_list) / n,
            "path_close_mae": sum(m["path_close_mae"] for m in m_list) / n,
            "baseline_close_mae": sum(m["baseline_close_mae"] for m in m_list) / n,
            "open_mae": sum(m["open_mae"] for m in m_list) / n,
            "high_mae": sum(m["high_mae"] for m in m_list) / n,
            "low_mae": sum(m["low_mae"] for m in m_list) / n,
            "body_mae": sum(m["body_mae"] for m in m_list) / n,
            "range_mae": sum(m["range_mae"] for m in m_list) / n,
            "raw_ohlc_invalid_rate": sum(m["raw_ohlc_invalid_rate"] for m in m_list) / n,
            "post_ohlc_invalid_rate": sum(m["post_ohlc_invalid_rate"] for m in m_list) / n,
            "coverage": sum(m["coverage"] for m in m_list) / n,
            "mean_width": sum(m["mean_width"] for m in m_list) / n,
            "interval_score": sum(m["interval_score"] for m in m_list) / n,
            "mean_inference_ms": sum(latencies) / n,
            "p50_inference_ms": statistics.median(latencies),
            "p95_inference_ms": latencies[p95_idx],
        }
        if any("calibrated_coverage" in m for m in m_list):
            entry["calibrated_coverage"] = sum(m.get("calibrated_coverage", 0.0) for m in m_list) / n
            entry["calibrated_mean_width"] = sum(m.get("calibrated_mean_width", 0.0) for m in m_list) / n
            entry["calibrated_interval_score"] = sum(m.get("calibrated_interval_score", 0.0) for m in m_list) / n
        summary[key] = entry
    return summary


def run_evaluation(dataset: dict, predict, options: dict | None = None) -> dict:
    opts = dict(options or {})
    pilot = bool(opts.get("pilot", False))
    max_origins = int(opts.get("max_origins", 2 if pilot else 60))
    symbol, timeframe, candles, interval, gap_count, missing_vol_count = validate_dataset(dataset)
    origins = make_origins(candles, timeframe, max_origins=max_origins, pilot=pilot)

    configs = [tuple(c) for c in opts.get("configs", PILOT_CONFIGS if pilot else FULL_CONFIGS)]
    horizons = sorted({int(h) for h in opts.get("horizons", [c[2] for c in configs])})
    calibrate = bool(opts.get("calibrate", False)) and not pilot
    max_cases = opts.get("max_cases")
    stop_after_cases = opts.get("stop_after_cases")
    output_path = Path(opts["output_path"]) if opts.get("output_path") else None
    resume = bool(opts.get("resume", False))

    manifest_bytes = MANIFEST.read_bytes()
    manifest_digest = hashlib.sha256(manifest_bytes).hexdigest()
    dataset_digest = canonical_digest(dataset)
    settings_fingerprint = canonical_digest({
        "symbol": symbol,
        "timeframe": timeframe,
        "pilot": pilot,
        "max_origins": max_origins,
        "configs": configs,
        "horizons": horizons,
        "calibrate": calibrate,
        "boundaries": origins["boundaries"],
        "seed_policy": SEED_POLICY,
        "manifest_digest": manifest_digest,
    })

    planned_cases = (
        len(configs) * len(origins["selection"])
        if pilot
        else len(configs) * len(origins["selection"])
        + len(horizons) * len(origins["calibration"])
        + len(horizons) * len(origins["test"])
    )
    if max_cases is not None and planned_cases > int(max_cases):
        raise ValueError(f"Planned evaluation cases ({planned_cases}) exceed max_cases budget ({max_cases})")

    completed_cases: dict[str, dict] = {}
    if output_path is not None and output_path.exists():
        if not resume:
            raise ValueError("Output file already exists; pass --resume to continue a compatible run")
        prior = json.loads(output_path.read_text(encoding="utf-8"))
        if (
            prior.get("dataset_digest") != dataset_digest
            or prior.get("settings_fingerprint") != settings_fingerprint
            or prior.get("manifest_digest") != manifest_digest
            or prior.get("pilot") != pilot
            or prior.get("seed_policy") != SEED_POLICY
        ):
            raise ValueError("Existing output file is incompatible with current dataset or evaluation settings")
        completed_cases = dict(prior.get("completed_cases", {}))

    new_cases_run = 0

    def persist(status: str, selected_config=None, frozen_offsets=None):
        sel_cases = [c for c in completed_cases.values() if c["partition"] == "selection"]
        cal_cases = [c for c in completed_cases.values() if c["partition"] == "calibration"]
        test_cases = [c for c in completed_cases.values() if c["partition"] == "test"]
        all_latencies = [float(c.get("inference_ms", 0.0)) for c in completed_cases.values()]
        mean_sec = (sum(all_latencies) / len(all_latencies) / 1000.0) if all_latencies else None
        full_case_count = 27 * 20 + 3 * 20 + 3 * 20
        state = {
            "symbol": symbol,
            "timeframe": timeframe,
            "status": status,
            "pilot": pilot,
            "promotable": False,
            "calibrated": bool(calibrate and frozen_offsets and status == "complete"),
            "dataset_digest": dataset_digest,
            "manifest_digest": manifest_digest,
            "settings_fingerprint": settings_fingerprint,
            "seed_policy": SEED_POLICY,
            "runtime_python": platform.python_version(),
            "dataset_quality": {"gapCount": gap_count, "missingVolumeCount": missing_vol_count},
            "origins_summary": {
                "boundaries": origins["boundaries"],
                "skipped": origins["skipped"],
                "selection_origins": [o["origin_timestamp"] for o in origins["selection"]],
                "calibration_origins": [o["origin_timestamp"] for o in origins["calibration"]],
                "test_origins": [o["origin_timestamp"] for o in origins["test"]],
            },
            "planned_cases": planned_cases,
            "projected_full_cases": full_case_count,
            "projected_full_seconds": round(full_case_count * mean_sec, 1) if mean_sec is not None else None,
            "selected_config": selected_config,
            "frozen_calibration_offsets": frozen_offsets,
            "summaries": {
                "selection": _aggregate_partition_cases(sel_cases),
                "calibration": _aggregate_partition_cases(cal_cases),
                "test": _aggregate_partition_cases(test_cases),
            },
            "completed_cases": completed_cases,
        }
        if output_path is not None:
            _atomic_write_json(output_path, state)
            _write_markdown_summary(output_path.with_suffix(".md"), state)
        return state

    def execute_case(partition: str, origin: dict, context_bars: int, sample_count: int, horizon: int, offsets=None) -> bool:
        nonlocal new_cases_run
        case_id = f"{partition}:{origin['origin_timestamp']}:{context_bars}:{sample_count}:{horizon}"
        if case_id in completed_cases:
            if offsets is not None and "calibrated_coverage" not in completed_cases[case_id]["metrics"]:
                idx = origin["origin_bar_idx"]
                actual_slice = candles[idx + 1 : idx + 1 + horizon]
                completed_cases[case_id]["metrics"] = score_forecast(
                    origin["origin_close"], actual_slice, completed_cases[case_id]["prediction"], offsets=offsets
                )
            return True
        if stop_after_cases is not None and new_cases_run >= int(stop_after_cases):
            return False
        idx = origin["origin_bar_idx"]
        context_slice = candles[idx - context_bars + 1 : idx + 1]
        actual_slice = candles[idx + 1 : idx + 1 + horizon]
        seed = deterministic_seed(symbol, timeframe, origin["origin_timestamp"])
        pred = predict({
            "symbol": symbol,
            "timeframe": timeframe,
            "partition": partition,
            "origin_timestamp": origin["origin_timestamp"],
            "cutoff_timestamp": origin["cutoff_timestamp"],
            "context_bars": context_bars,
            "sample_count": sample_count,
            "horizon": horizon,
            "seed": seed,
            "candles": context_slice,
        })
        metrics = score_forecast(origin["origin_close"], actual_slice, pred, offsets=offsets)
        completed_cases[case_id] = {
            "case_id": case_id,
            "partition": partition,
            "origin_timestamp": origin["origin_timestamp"],
            "context_bars": context_bars,
            "sample_count": sample_count,
            "horizon": horizon,
            "seed": seed,
            "inference_ms": float(pred.get("inferenceMs", 0.0)) if isinstance(pred, dict) else 0.0,
            "prediction": pred,
            "metrics": metrics,
        }
        new_cases_run += 1
        persist("incomplete")
        return True

    for context_bars, sample_count, horizon in configs:
        for origin in origins["selection"]:
            if not execute_case("selection", origin, context_bars, sample_count, horizon):
                return persist("incomplete")

    if pilot:
        return persist("exploratory_pilot")

    # Select best (context_bars, sample_count) on selection partition ONLY (median_close_mae, tie-break mean_inference_ms)
    candidate_pairs = sorted({(c[0], c[1]) for c in configs})
    pair_scores = []
    for ctx, smp in candidate_pairs:
        pair_cases = [
            c for c in completed_cases.values()
            if c["partition"] == "selection" and c["context_bars"] == ctx and c["sample_count"] == smp
        ]
        target_h = max(c["horizon"] for c in pair_cases)
        h_cases = [c for c in pair_cases if c["horizon"] == target_h]
        med_mae = sum(c["metrics"]["median_close_mae"] for c in h_cases) / len(h_cases)
        lat = sum(c["inference_ms"] for c in h_cases) / len(h_cases)
        pair_scores.append((med_mae, lat, ctx, smp))
    pair_scores.sort()
    _, _, best_ctx, best_smp = pair_scores[0]
    selected_config = {"context_bars": best_ctx, "sample_count": best_smp}

    for horizon in horizons:
        for origin in origins["calibration"]:
            if not execute_case("calibration", origin, best_ctx, best_smp, horizon):
                return persist("incomplete", selected_config=selected_config)

    frozen_offsets = None
    if calibrate:
        frozen_offsets = {}
        for horizon in horizons:
            cal_cases = [
                c for c in completed_cases.values()
                if c["partition"] == "calibration"
                and c["context_bars"] == best_ctx
                and c["sample_count"] == best_smp
                and c["horizon"] == horizon
            ]
            scores_by_step = [
                [c["metrics"]["by_step"][step_idx]["miss"] for c in cal_cases]
                for step_idx in range(horizon)
            ]
            frozen_offsets[str(horizon)] = calibration_offsets(scores_by_step, coverage=0.8)

    for horizon in horizons:
        offsets_for_h = frozen_offsets.get(str(horizon)) if frozen_offsets else None
        for origin in origins["test"]:
            if not execute_case("test", origin, best_ctx, best_smp, horizon, offsets=offsets_for_h):
                return persist("incomplete", selected_config=selected_config, frozen_offsets=frozen_offsets)

    return persist("complete", selected_config=selected_config, frozen_offsets=frozen_offsets)


def verify_local_cache(cache_dir: Path) -> dict[str, Path]:
    assets = json.loads(MANIFEST.read_text(encoding="utf-8"))["assets"]
    paths: dict[str, Path] = {}
    for asset in assets:
        directory = cache_dir / asset["repo"].split("/")[1] / asset["revision"]
        path = directory / asset["file"]
        if not verified(path, asset):
            raise ValueError(f"Verified local model asset missing or corrupted: {path}")
        paths[REPOS[asset["repo"]]] = directory
    return paths


def make_live_predictor(cache_dir: Path):
    paths = verify_local_cache(cache_dir)
    import numpy as np
    import torch
    from kronos.server import get_predictor, load_predictor, predict_history

    torch.set_num_threads(2)
    load_predictor(paths["model"], paths["tokenizer"])
    predictor = get_predictor()

    def _predict(req: dict):
        seed = int(req["seed"])
        np.random.seed(seed)
        torch.manual_seed(seed)
        return predict_history(
            predictor,
            req["candles"],
            req["timeframe"],
            req["cutoff_timestamp"],
            horizon=req["horizon"],
            samples=req["sample_count"],
        )

    return _predict


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Offline walk-forward evaluator for local Kronos CPU forecasts")
    parser.add_argument("--data", required=True, help="Absolute path to UTF-8 JSON dataset")
    parser.add_argument("--cache-dir", required=True, help="Directory containing verified local Kronos model assets")
    parser.add_argument("--output", required=True, help="Output JSON path (Markdown summary written to same stem .md)")
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--pilot", action="store_true", help="Run bounded 6-forecast exploratory pilot (no promotion/calibration)")
    mode.add_argument("--full", action="store_true", help="Run full 3-partition walk-forward evaluation")
    parser.add_argument("--max-origins", type=int, default=None, help="Maximum origins (required >= 60 for --full)")
    parser.add_argument("--calibrate", action="store_true", help="Compute frozen empirical calibration offsets on calibration partition")
    parser.add_argument("--resume", action="store_true", help="Resume an interrupted compatible run")
    args = parser.parse_args(argv)

    data_path = Path(args.data)
    if not data_path.is_absolute():
        raise ValueError("--data must be an absolute file path")
    dataset = json.loads(data_path.read_text(encoding="utf-8"))
    max_origins = args.max_origins if args.max_origins is not None else (2 if args.pilot else 0)
    if args.full and max_origins < 60:
        raise ValueError("--full requires --max-origins >= 60")

    # Validate dataset and origins BEFORE loading model weights
    validate_dataset(dataset)
    make_origins(dataset["candles"], dataset["timeframe"], max_origins=max_origins, pilot=args.pilot)

    predict_fn = make_live_predictor(Path(args.cache_dir).resolve())
    run_evaluation(
        dataset,
        predict_fn,
        {
            "pilot": args.pilot,
            "max_origins": max_origins,
            "calibrate": args.calibrate,
            "output_path": Path(args.output).resolve(),
            "resume": args.resume,
        },
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
