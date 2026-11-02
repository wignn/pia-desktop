import math

INTERVALS = {'1m': 60000, '5m': 300000, '15m': 900000, '30m': 1800000,
             '1h': 3600000, '4h': 14400000, '1d': 86400000, '1w': 604800000}


def timeframe_ms(timeframe):
    if not isinstance(timeframe, str) or timeframe not in INTERVALS:
        raise ValueError('Unsupported Kronos timeframe')
    return INTERVALS[timeframe]


def numeric(value):
    return type(value) in (int, float) and math.isfinite(value)


def safe_timestamp(value):
    return numeric(value) and 0 < value <= 9007199254740991 and value == int(value)


def validate_history(candles, timeframe, cutoff_timestamp, max_bars=360, min_bars=12):
    interval = timeframe_ms(timeframe)
    anchor = 345600000 if timeframe == '1w' else 0
    if not safe_timestamp(cutoff_timestamp):
        raise ValueError('Invalid forecast cutoff')
    if not isinstance(candles, list) or not min_bars <= len(candles) <= max_bars:
        raise ValueError(f'Provide {min_bars} to {max_bars} OHLC candles')
    previous = None
    gaps = missing = 0
    for bar in candles:
        if not isinstance(bar, dict) or not all(numeric(bar.get(k)) for k in ('open', 'high', 'low', 'close')):
            raise ValueError('Candles must contain finite numeric OHLC')
        timestamp = bar.get('timestamp')
        if not safe_timestamp(timestamp) or (timestamp - anchor) % interval:
            raise ValueError('Candles require aligned millisecond timestamps')
        if previous is not None and timestamp <= previous:
            raise ValueError('Candles must have increasing unique timestamps')
        if timestamp + interval > cutoff_timestamp:
            raise ValueError('Unclosed candle exceeds forecast cutoff')
        if not bar['low'] <= min(bar['open'], bar['close']) <= max(bar['open'], bar['close']) <= bar['high']:
            raise ValueError('Invalid OHLC bounds')
        if 'volume' in bar and (not numeric(bar['volume']) or bar['volume'] < 0):
            raise ValueError('Volume must be finite and nonnegative')
        missing += 'volume' not in bar
        gaps += previous is not None and timestamp - previous > interval
        previous = timestamp
    return [dict(bar) for bar in candles], dict(gapCount=int(gaps), missingVolumeCount=missing)
