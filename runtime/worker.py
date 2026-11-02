"""Owned Kronos CPU worker. Stdout is reserved for bounded JSON lines."""
import argparse
import contextlib
import json
import math
import os
import sys
import threading
import time

from forecast_input import safe_timestamp, timeframe_ms, validate_history

MAX_LINE = 1024 * 1024


def finite(value):
    return type(value) in (int, float) and math.isfinite(value)


def validate_payload(payload):
    if not isinstance(payload, dict):
        raise ValueError("Forecast payload must be an object")
    symbol = payload.get("symbol")
    if not isinstance(symbol, str) or not symbol.strip() or len(symbol) > 128:
        raise ValueError("A chart symbol is required")
    bars, _ = validate_history(payload.get('candles'), payload.get('timeframe'), payload.get('cutoffTimestamp'))
    if payload['cutoffTimestamp'] > time.time() * 1000 + 60000:
        raise ValueError('Forecast cutoff exceeds current time')
    if type(payload.get("pred_len")) is not int or not 1 <= payload["pred_len"] <= 12:
        raise ValueError("Forecast horizon must be between 1 and 12")
    if payload.get("sample_count") != 6:
        raise ValueError("CPU worker requires six samples")
    # ponytail: 256 completed bars / six samples bound live CPU work; experiments stay offline.
    return {**payload, "candles": bars}


def validate_result(result, horizon, payload=None):
    if not isinstance(result, dict) or not isinstance(result.get("points"), list) or len(result["points"]) != horizon:
        raise ValueError("Model returned an invalid forecast length")
    interval = timeframe_ms(result.get("timeframe"))
    quality = result.get("quality")
    if (type(result.get("contextBars")) is not int or not 12 <= result["contextBars"] <= 256 or
            result.get("sampleCount") != 6 or not safe_timestamp(result.get("cutoffTimestamp")) or
            not safe_timestamp(result.get("originTimestamp")) or not finite(result.get("originPrice")) or
            not isinstance(quality, dict) or not all(type(quality.get(k)) is int and quality[k] >= 0
                                                     for k in ("gapCount", "missingVolumeCount", "normalizedOutputCount"))):
        raise ValueError("Model returned invalid forecast metadata")
    if payload is not None and (result["timeframe"] != payload["timeframe"] or
                                result["contextBars"] != len(payload["candles"]) or
                                result["cutoffTimestamp"] != payload["cutoffTimestamp"] or
                                result["originTimestamp"] != payload["candles"][-1]["timestamp"] + interval):
        raise ValueError("Model metadata did not match forecast request")
    for i, point in enumerate(result["points"]):
        if not isinstance(point, dict) or point.get("timestamp") != result["originTimestamp"] + i * interval:
            raise ValueError("Model returned invalid point timestamps")
        if not all(finite(point.get(k)) for k in ("open", "high", "low", "close", "q10", "q50", "q90")):
            raise ValueError("Model returned nonfinite prices")
        if not (point["q10"] <= point["q50"] <= point["q90"] and
                point["low"] <= min(point["open"], point["close"]) <= max(point["open"], point["close"]) <= point["high"]):
            raise ValueError("Model returned invalid price bounds")
    return result


def configure_stdio(reader, writer):
    reader.reconfigure(encoding="utf-8", errors="strict")
    writer.reconfigure(encoding="utf-8", errors="strict")


def serve(reader, writer, initialize, forecast):
    try:
        _serve(reader, writer, initialize, forecast)
    except (OSError, UnicodeError):
        return


def _serve(reader, writer, initialize, forecast):
    ready = False

    def send(message):
        line = json.dumps(message, allow_nan=False, separators=(",", ":")) + "\n"
        if len(line.encode("utf-8")) > MAX_LINE:
            raise ValueError("Protocol output exceeds limit")
        writer.write(line)
        writer.flush()

    while True:
        line = reader.readline(MAX_LINE + 1)
        if not line:
            return
        request_id = None
        try:
            if len(line.encode("utf-8")) > MAX_LINE:
                while line and not line.endswith("\n"):
                    line = reader.readline(MAX_LINE + 1)
                raise ValueError("Protocol input exceeds limit")
            request = json.loads(line)
            if not isinstance(request, dict) or type(request.get("id")) is not int or not 0 <= request["id"] <= 9007199254740991:
                raise ValueError("A nonnegative integer request ID is required")
            request_id = request["id"]
            with contextlib.redirect_stdout(sys.stderr):
                if request.get("op") == "initialize":
                    path = request.get("cacheDir")
                    if not isinstance(path, str) or not path or len(path) > 32768:
                        raise ValueError("A native model cache directory is required")
                    if not ready:
                        initialize(path, lambda status: send({**status, "id": request_id, "type": "status"}))
                        ready = True
                    send(dict(id=request_id, type="status", status="ready"))
                    send(dict(id=request_id, type="result", result={"ready": True}))
                elif request.get("op") == "forecast":
                    payload = validate_payload(request.get("payload"))
                    if not ready:
                        raise ValueError("Initialize the worker before forecasting")
                    result = validate_result(forecast(payload), payload["pred_len"], payload)
                    send(dict(id=request_id, type="result", result=result))
                else:
                    raise ValueError("Unknown operation")
        except (BrokenPipeError, OSError) as exc:
            if isinstance(exc, BrokenPipeError):
                return
            print(f"Kronos worker: {exc}", file=sys.stderr)
            send(dict(id=request_id, type="error", code="io", message="Model cache could not be read or written"))
        except Exception as exc:
            print(f"Kronos worker: {type(exc).__name__}: {exc}", file=sys.stderr)
            code = getattr(exc, "code", "protocol" if isinstance(exc, (ValueError, TypeError)) else "inference")
            send(dict(id=request_id, type="error", code=code,
                      message=str(exc) if code != "inference" else "Local CPU model operation failed"))


def watch_parent(pid):
    if os.name == "nt":
        import ctypes
        kernel = ctypes.WinDLL("kernel32", use_last_error=True)
        kernel.OpenProcess.restype = ctypes.c_void_p
        kernel.WaitForSingleObject.argtypes = [ctypes.c_void_p, ctypes.c_ulong]
        kernel.CloseHandle.argtypes = [ctypes.c_void_p]
        handle = kernel.OpenProcess(0x00100000, False, pid)
        if not handle:
            os._exit(0)
        kernel.WaitForSingleObject(handle, 0xFFFFFFFF)
        kernel.CloseHandle(handle)
        os._exit(0)
    while True:
        if os.getppid() != pid:
            os._exit(0)
        time.sleep(1)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--parent-pid", type=int, required=True)
    args = parser.parse_args()
    if args.parent_pid <= 0:
        parser.error("parent PID must be positive")
    threading.Thread(target=watch_parent, args=(args.parent_pid,), daemon=True).start()
    os.environ.update(OMP_NUM_THREADS="2", MKL_NUM_THREADS="2", HF_HUB_OFFLINE="1")

    def initialize(cache_dir, emit):
        from model_assets import ensure_model_assets
        from pathlib import Path
        paths = ensure_model_assets(Path(cache_dir), emit)
        emit(dict(status="loading"))
        import torch
        torch.set_num_threads(2)
        torch.set_num_interop_threads(2)
        from kronos import server
        server.load_predictor(paths["model"], paths["tokenizer"])

    def forecast(payload):
        from kronos.server import run_kronos_forecast
        return run_kronos_forecast(payload)

    configure_stdio(sys.stdin, sys.stdout)
    serve(sys.stdin, sys.stdout, initialize, forecast)


if __name__ == "__main__":
    main()
