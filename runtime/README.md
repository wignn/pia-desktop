# Bundled Kronos CPU worker

The Desktop app owns a persistent JSON-lines child process; this is not an HTTP service.
Stdout contains protocol messages only. Diagnostics use stderr. Requests are bounded to
1 MiB, up to 256 input bars (all used), 12 output bars and six trajectories, with two CPU threads.
No cloud fallback and no system Python are used by the packaged application.

## Source provenance

Vendored from `pia-engine/services/kronos` at engine revision
`6956d1ee1bf4c3bf275029c325eab947c63052d0`.
SHA-256 of original source files:

- `__init__.py`: `64976f2c953c924379b9465e979d8bf46369e1383a89a968bea9a36c9db0e79a`
- `kronos.py`: `dae351d5c70d19ec7b3ed52a3f7a96f0d1f3740032eb5fcae44ac19cab19c2e2`
- `module.py`: `d5dd93ac6775b61dbee7fbd79ed5f1327f9336c1f962b59d91af05b0b957c6f7`
- `server.py`: `20b8a008f675ab5bc111992719ed9e185d8b31093f4cf4fc2a0d70701c3f2851`

Model/tokenizer inference is preserved. Forecast candles use the complete sampled path
whose closes are nearest the ensemble median, rather than averaging opposing candle bodies.
The q10/q50/q90 ensemble summary remains separate; six samples are not calibrated coverage.
The server adapter removes HTTP/startup entrypoints,
uses local-only safetensors loading and fixes the context ceiling at 256. Decoded candle
high/low are expanded to enclose the model's open/close; quantiles remain unchanged.
Upstream: https://github.com/shiyu-coder/Kronos; MIT notice in `LICENSES/Kronos-MIT.txt`.
The official NeoQuasar model/tokenizer cards also declare MIT.

## Checks and dependencies

`python -m unittest discover -s runtime -p 'test_*.py' -v`

Protocol tests use injected results, not model inference. Packaging uses Python 3.11.

Build: `python -m pip install -r runtime/requirements.lock.txt`, then `python runtime/build.py`.
Run `python runtime/smoke.py --runtime <absolute executable> --cache-dir <cache>` and repeat
with `--offline` and `--parent-exit`. The latter checks abrupt parent death during inference.
The smoke removes Python from the child PATH and blocks download
connections on its offline pass. Only the real bundled model can satisfy this check.
The output is `src-tauri/resources/kronos-runtime/`, mapped to installed resource
`kronos-runtime/` by Tauri; generated files are ignored. Missing resources prevent packaging.
Use a native build on Windows/Linux x64 or macOS arm64; unsupported targets fail explicitly.
All installed dependency license/notice files and a package inventory are copied to the bundle.

Earlier 64-bar baselines (`Kronos-small`): assets totaled 114,823,553 bytes. With socket connections
rejected, a source-runtime integration loaded weights in 2.75s and returned two finite
12-point CPU forecasts in 3.65s / 1.89s (and 4.18s / 2.48s in the earlier packaged smoke while
`worker.py` still sliced `bars[-64:]`) without reloading. Those timings describe 64-bar model
contexts prior to removing the worker truncation, not the 256-bar context.
On full 256-bar (`contextBars=256`, 6 samples, 12 horizon) offline packaged CPU smoke:
- `NeoQuasar/Kronos-small` (24.7M): 9.24s / 8.30s without reloading.
- `NeoQuasar/Kronos-base` (102.3M, current pinned default): 26.44s / 26.47s without reloading.
These timings are not an installer/UI test.


Direct dependencies are pinned in requirements.lock.txt. Wheel availability checked
against PyPI and the official PyTorch CPU index: Windows x64, Linux x64, macOS arm64;
safetensors uses CPython 3.8+ ABI3 wheels. Windows/Linux use explicit +cpu builds;
macOS's standard PyTorch wheel has no CUDA dependencies.

## Model provenance

Pinned official repositories (metadata: Hugging Face `/api/models/<repo>?blobs=true`):

- `NeoQuasar/Kronos-base`: `2b554741eca47781b64468546e77fef3e85130e6`
- `NeoQuasar/Kronos-Tokenizer-base`: `0e0117387f39004a9016484a186a908917e22426`

Weight digests and sizes come from upstream LFS metadata; config digests were
computed from bytes fetched at those immutable revisions. Combined weights are
425,106,376 bytes (425,106,905 bytes including configs), excluding runtime libraries. No pickle files or
remote Python code are acquired.

## Offline walk-forward evaluation (`runtime/evaluate.py`)

Developer-operated CLI for reproducible local CPU walk-forward evaluation using the same
completed-candle input rules (`forecast_input.py`) and OHLC post-processing (`kronos/server.py`)
as live inference. Live IPC remains fixed at 256 context bars, 6 samples, and up to 12 output steps.

- **Dataset format**: UTF-8 JSON object `{ "symbol": "XAUUSD", "timeframe": "15m", "candles": [...] }`
  with strictly increasing UTC-aligned millisecond `timestamp`, positive finite `open`/`high`/`low`/`close`
  (`low <= min(open, close) <= max(open, close) <= high`), and optional finite nonnegative `volume`.
  Each run evaluates a single `(symbol, timeframe)` pair; raw currency errors are never pooled across symbols.
- **Commands**:
  - Pilot (bounded 6 forecasts: contexts `64/128/256`, `samples=6`, `horizon=12` across 2 selection origins; exploratory only, never selects/promotes/calibrates):
    `python -I runtime/evaluate.py --data <absolute.json> --cache-dir <verified-model-cache> --output <new-run.json> --pilot`
  - Full walk-forward (requires `--max-origins >= 60`, at least 20 non-overlapping 12-bar target windows per chronological partition `selection` / `calibration` / `test`; 27 selection configs `64/128/256 × 6/12/24 × 3/6/12`, with only the selection winner evaluated on `calibration` and `test`):
    `python -I runtime/evaluate.py --data <absolute.json> --cache-dir <verified-model-cache> --output <new-run.json> --full --max-origins 60 [--calibrate] [--resume]`
- **Metric formulas**:
  - `path_close_mae = mean(|close_pred - close_actual|)` (sampled scenario trajectory); `median_close_mae = mean(|q50 - close_actual|)`; `baseline_close_mae = mean(|origin_close - close_actual|)`.
  - `body_mae = mean(||close_pred - open_pred| - |close_actual - open_actual||)`; `range_mae = mean(|(high_pred - low_pred) - (high_actual - low_actual)|)`.
  - `raw_ohlc_invalid_rate`: fraction of steps where raw decoded `rawLow`/`rawHigh` failed to enclose `open`/`close` prior to envelope normalization (`post_ohlc_invalid_rate` after normalization).
  - Direction accuracy vs `origin_close`: steps with `close_actual == origin_close` (`actual_flat_count`) or `q50 == origin_close` (`predicted_flat_count`) are reported separately and excluded from `direction_eval_count`.
  - Raw ensemble envelope (`q10`–`q90`) by step and overall: `width = q90 - q10`, `exceedance = max(q10 - close_actual, close_actual - q90, 0)`, `covered = 1[q10 <= close_actual <= q90]`, and `interval_score = width + (2 / alpha) * exceedance` (`alpha = 0.2`).
  - Optional empirical calibration (`--calibrate` in `--full` mode only): per-step conformity offset at 1-indexed order statistic `ceil((n + 1) * 0.8)` on calibration-partition exceedances (rejected if `rank > n`), frozen before held-out test evaluation and never applied automatically to the live UI.

