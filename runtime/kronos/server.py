from __future__ import annotations

import collections
import hashlib
import json
import threading
import time

import pandas as pd

from forecast_input import validate_history, timeframe_ms
from .kronos import Kronos, KronosPredictor, KronosTokenizer

DEFAULT_MODEL_ID = 'NeoQuasar/Kronos-base'
DEFAULT_TOKENIZER_ID = 'NeoQuasar/Kronos-Tokenizer-base'
MAX_CONTEXT = 256
_predictor_lock = threading.Lock()
_predictor = None
_cache = collections.OrderedDict()
_CACHE_MAX = 64


def load_predictor(model_path, tokenizer_path):
    global _predictor
    tokenizer = KronosTokenizer.from_pretrained(str(tokenizer_path), local_files_only=True)
    model = Kronos.from_pretrained(str(model_path), local_files_only=True)
    _predictor = KronosPredictor(model=model, tokenizer=tokenizer, device='cpu', max_context=MAX_CONTEXT)


def get_predictor():
    if _predictor is None:
        raise RuntimeError('Initialize the local model first')
    return _predictor


def predict_history(predictor, candles, timeframe, cutoff, horizon=12, samples=6):
    rows, quality = validate_history(candles, timeframe, cutoff)
    if type(horizon) is not int or not 1 <= horizon <= 12 or samples not in (6, 12, 24):
        raise ValueError('Invalid inference configuration')
    interval = timeframe_ms(timeframe)
    origin = rows[-1]['timestamp'] + interval
    timestamps = [origin + i * interval for i in range(horizon)]
    frame = pd.DataFrame([{**row, 'volume': row.get('volume', 0)} for row in rows])
    started = time.perf_counter()
    predicted = predictor.predict_quantiles(
        df=frame, x_timestamp=pd.Series(pd.to_datetime([row['timestamp'] for row in rows], unit='ms', utc=True)),
        y_timestamp=pd.Series(pd.to_datetime(timestamps, unit='ms', utc=True)), pred_len=horizon,
        T=0.6, top_k=0, top_p=0.9, sample_count=samples, verbose=False)
    elapsed = round((time.perf_counter() - started) * 1000, 1)
    points = []
    normalized = 0
    for i, (_, row) in enumerate(predicted.iterrows()):
        high, low = max(row['high'], row['open'], row['close']), min(row['low'], row['open'], row['close'])
        normalized += high != row['high'] or low != row['low']
        points.append(dict(step=i+1, timestamp=timestamps[i], time=timestamps[i] // 1000,
                           open=float(row['open']), high=float(high), low=float(low), close=float(row['close']),
                           rawHigh=float(row['high']), rawLow=float(row['low']),
                           q10=float(row['q10']), q50=float(row['q50']), q90=float(row['q90'])))
    return dict(model=DEFAULT_MODEL_ID, tokenizer=DEFAULT_TOKENIZER_ID, device='cpu', inferenceMs=elapsed,
                timeframe=timeframe, contextBars=len(rows), sampleCount=samples, cutoffTimestamp=cutoff,
                originTimestamp=origin, originTime=origin // 1000, originPrice=rows[-1]['close'],
                stepSeconds=interval // 1000, quality={**quality, 'normalizedOutputCount': int(normalized)}, points=points)


def run_kronos_forecast(payload):
    # Validate before cache lookup; full content prevents reuse after historical corrections.
    validate_history(payload['candles'], payload['timeframe'], payload['cutoffTimestamp'])
    key = hashlib.sha256(json.dumps(payload, sort_keys=True, allow_nan=False).encode()).hexdigest()
    if key in _cache:
        _cache.move_to_end(key)
        return _cache[key]
    with _predictor_lock:
        result = predict_history(get_predictor(), payload['candles'], payload['timeframe'],
                                 payload['cutoffTimestamp'], payload.get('pred_len', 12), payload.get('sample_count', 6))
    _cache[key] = result
    while len(_cache) > _CACHE_MAX:
        _cache.popitem(last=False)
    return result
