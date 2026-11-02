"""Exercise actual packaged inference, never synthetic forecast substitution."""
import argparse
import json
import os
from pathlib import Path
import queue
import subprocess
import sys
import threading
import time

from worker import MAX_LINE, validate_result

START = 1700000100000
STEP = 900000


def make_smoke_payload(step_offset=0):
    bars = []
    for i in range(360):
        ts = START + (i + (1 if i >= 1 else 0) + step_offset) * STEP
        bar = dict(
            timestamp=ts,
            open=2000.0 + i * 0.2,
            high=2002.0 + i * 0.2,
            low=1999.0 + i * 0.2,
            close=2001.0 + i * 0.2,
        )
        if i > 0:
            bar['volume'] = 100.0 + i
        bars.append(bar)
    return dict(
        symbol='XAUUSD',
        timeframe='15m',
        cutoffTimestamp=bars[-1]['timestamp'] + STEP,
        candles=bars,
        pred_len=12,
        sample_count=6,
    )


def verify_smoke_result(payload, result):
    validate_result(result, 12, payload)
    origin = payload['candles'][-1]['timestamp'] + STEP
    assert result['device'] == 'cpu', result
    assert result['contextBars'] == 360, result
    assert result['originTimestamp'] == origin, result
    assert result['points'][0]['timestamp'] == origin, result
    assert result['points'][-1]['timestamp'] == origin + 11 * STEP, result
    assert result['quality']['gapCount'] == 1, result
    assert result['quality']['missingVolumeCount'] == 1, result


def exchange(child, messages, request, timeout=900):
    child.stdin.write(json.dumps(request) + '\n')
    child.stdin.flush()
    deadline = time.monotonic() + timeout
    statuses = []
    while True:
        line = messages.get(timeout=max(0, deadline - time.monotonic()))
        if not line or len(line.encode('utf-8')) > MAX_LINE:
            raise AssertionError('Runtime exited or exceeded protocol bounds')
        message = json.loads(line)
        assert message['id'] == request['id'], message
        if message['type'] == 'error':
            raise AssertionError(message)
        if message['type'] == 'result':
            return message['result'], statuses
        statuses.append(message['status'])
        print(json.dumps(message), flush=True)


def close_child(child, timeout=10):
    child.stdin.close()
    try:
        assert child.wait(timeout=timeout) == 0
    except subprocess.TimeoutExpired:
        child.kill()
        child.wait()
        raise AssertionError('Runtime did not terminate after stdin EOF')


def smoke(runtime, cache, offline=False):
    # Frozen executable contains Python; stripping PATH proves no system interpreter is used.
    env = {**os.environ, 'PATH': '', 'HF_HUB_OFFLINE': '1'}
    if offline:
        # Block all downloader access, not only huggingface_hub calls.
        env.update(HTTPS_PROXY='http://127.0.0.1:1', HTTP_PROXY='http://127.0.0.1:1', NO_PROXY='')
    child = subprocess.Popen([str(runtime), '--parent-pid', str(os.getpid())], stdin=subprocess.PIPE,
                             stdout=subprocess.PIPE, stderr=None, text=True, encoding='utf-8', env=env)
    messages = queue.Queue()
    def read():
        while True:
            line = child.stdout.readline(MAX_LINE + 1)
            messages.put(line)
            if not line:
                return
    threading.Thread(target=read, daemon=True).start()
    try:
        _, statuses = exchange(child, messages, dict(id=1, op='initialize', cacheDir=str(cache)))
        if offline:
            assert 'downloading' not in statuses
        for idx, id in enumerate((2, 3)):
            payload = make_smoke_payload(idx)
            result, statuses = exchange(child, messages, dict(id=id, op='forecast', payload=payload), timeout=120)
            verify_smoke_result(payload, result)
            assert not statuses, 'Forecast reinitialized model'
            print(f"Real CPU forecast: contextBars={result['contextBars']}, {len(result['points'])} points, {result['inferenceMs']}ms", flush=True)
        close_child(child)
    finally:
        if child.poll() is None:
            child.kill()
            child.wait()


def parent_exit_smoke(runtime, cache):
    # The intermediary exits abruptly during inference, without closing/reaping its worker.
    script = '''import json, os, subprocess, sys
runtime, cache = sys.argv[1:]
child = subprocess.Popen([runtime, '--parent-pid', str(os.getpid())], stdin=subprocess.PIPE,
                         stdout=subprocess.PIPE, text=True, encoding='utf-8')
child.stdin.write(json.dumps(dict(id=1, op='initialize', cacheDir=cache))+'\\n')
child.stdin.flush()
while True:
    line = child.stdout.readline()
    if not line: raise RuntimeError('Worker exited before initialization')
    message = json.loads(line)
    if message['type'] == 'error': raise RuntimeError(message)
    if message['type'] == 'result': break
print(child.pid, flush=True)
sys.stdin.readline()
bars = [dict(timestamp=1700000100000+i*900000, open=100, high=102, low=99, close=101) for i in range(64)]
cutoff = bars[-1]['timestamp'] + 900000
child.stdin.write(json.dumps(dict(id=2, op='forecast', payload=dict(symbol='XAUUSD', timeframe='15m', cutoffTimestamp=cutoff, candles=bars, pred_len=12, sample_count=6)))+'\\n')
child.stdin.flush()
os._exit(0)
'''
    parent = subprocess.Popen([sys.executable, '-I', '-c', script, str(runtime), str(cache)],
                              stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, encoding='utf-8')
    pid = None
    handle = None
    terminated = False
    try:
        messages = queue.Queue()
        threading.Thread(target=lambda: messages.put(parent.stdout.readline()), daemon=True).start()
        pid = int(messages.get(timeout=900).strip())
        if os.name == 'nt':
            import ctypes
            kernel = ctypes.WinDLL('kernel32', use_last_error=True)
            kernel.OpenProcess.restype = ctypes.c_void_p
            kernel.OpenProcess.argtypes = [ctypes.c_ulong, ctypes.c_int, ctypes.c_ulong]
            kernel.WaitForSingleObject.argtypes = [ctypes.c_void_p, ctypes.c_ulong]
            kernel.CloseHandle.argtypes = [ctypes.c_void_p]
            handle = kernel.OpenProcess(0x00100000, False, pid)
            assert handle, 'Cannot observe worker lifetime'
        parent.stdin.write('exit\n')
        parent.stdin.flush()
        assert parent.wait(timeout=10) == 0
        if handle:
            assert kernel.WaitForSingleObject(handle, 15000) == 0, 'Worker survived parent exit'
        else:
            deadline = time.monotonic() + 15
            while True:
                try:
                    os.kill(pid, 0)
                except ProcessLookupError:
                    break
                stat = Path(f'/proc/{pid}/stat')
                if stat.exists() and stat.read_text().split(') ', 1)[1].startswith('Z'):
                    break
                assert time.monotonic() < deadline, 'Worker survived parent exit'
                time.sleep(.1)
        terminated = True
        print('Worker terminated after abrupt parent exit', flush=True)
    finally:
        if handle:
            kernel.CloseHandle(handle)
        if parent.poll() is None:
            parent.kill()
            parent.wait()
        if pid and not terminated:
            try:
                import signal
                os.kill(pid, signal.SIGTERM)
            except ProcessLookupError:
                pass


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--runtime', type=Path, required=True)
    parser.add_argument('--cache-dir', type=Path, required=True)
    parser.add_argument('--offline', action='store_true')
    parser.add_argument('--parent-exit', action='store_true')
    args = parser.parse_args()
    assert args.runtime.is_absolute() and args.runtime.is_file(), 'Use an absolute bundled runtime path'
    if args.parent_exit:
        parent_exit_smoke(args.runtime, args.cache_dir.resolve())
    else:
        smoke(args.runtime, args.cache_dir.resolve(), args.offline)


if __name__ == '__main__':
    main()
