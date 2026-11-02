import hashlib
import http.client
import json
import os
from pathlib import Path
import re
import tempfile
import urllib.error
import urllib.request

MANIFEST = Path(__file__).with_name('model-manifest.json')
REPOS = {'NeoQuasar/Kronos-base': 'model', 'NeoQuasar/Kronos-Tokenizer-base': 'tokenizer'}
CHUNK = 128 * 1024


class AssetError(Exception):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


def asset_url(asset):
    return f"https://huggingface.co/{asset['repo']}/resolve/{asset['revision']}/{asset['file']}"


def verified(path, asset):
    if not path.is_file() or path.stat().st_size != asset['size']:
        return False
    digest = hashlib.sha256()
    with path.open('rb') as file:
        for chunk in iter(lambda: file.read(CHUNK), b''):
            digest.update(chunk)
    return digest.hexdigest() == asset['sha256']


def ensure_model_assets(cache_dir: Path, emit) -> dict[str, Path]:
    paths = {}
    temporary = None
    try:
        assets = json.loads(MANIFEST.read_text(encoding='utf-8'))['assets']
        if not isinstance(assets, list) or not assets:
            raise ValueError('Empty model manifest')
        for asset in assets:
            if (asset.get('repo') not in REPOS or
                    not re.fullmatch(r'[0-9a-f]{40}', asset.get('revision', '')) or
                    asset.get('file') not in ('config.json', 'model.safetensors') or
                    not re.fullmatch(r'[0-9a-f]{64}', asset.get('sha256', '')) or
                    type(asset.get('size')) is not int or not 0 < asset['size'] <= 512 * 1024 * 1024):
                raise ValueError('Invalid pinned model manifest')
        total = sum(a['size'] for a in assets)
        completed = 0
        for asset in assets:
            directory = cache_dir / asset['repo'].split('/')[1] / asset['revision']
            directory.mkdir(parents=True, exist_ok=True)
            path = directory / asset['file']
            paths[REPOS[asset['repo']]] = directory
            if verified(path, asset):
                completed += asset['size']
                continue
            emit(dict(status='downloading', downloadedBytes=completed, totalBytes=total))
            with tempfile.NamedTemporaryFile(dir=directory, suffix='.part', delete=False) as file:
                temporary = Path(file.name)
                digest, written = hashlib.sha256(), 0
                try:
                    with urllib.request.urlopen(asset_url(asset), timeout=30) as response:
                        while True:
                            chunk = response.read(CHUNK)
                            if not chunk:
                                break
                            written += len(chunk)
                            if written > asset['size']:
                                raise AssetError('integrity', 'Model asset exceeds pinned size')
                            file.write(chunk)
                            digest.update(chunk)
                            emit(dict(status='downloading', downloadedBytes=completed + written, totalBytes=total))
                except (urllib.error.URLError, TimeoutError, http.client.HTTPException, ConnectionError) as exc:
                    raise AssetError('download', 'Model download interrupted; retry when connected') from exc
                file.flush()
                os.fsync(file.fileno())
            if written != asset['size'] or digest.hexdigest() != asset['sha256']:
                raise AssetError('integrity', 'Model checksum or size mismatch; retry download')
            os.replace(temporary, path)
            temporary = None
            completed += written
        return paths
    except AssetError:
        raise
    except (ValueError, KeyError, TypeError) as exc:
        raise AssetError('manifest', 'Bundled model manifest is invalid') from exc
    except OSError as exc:
        raise AssetError('disk', 'Cannot read or write the local model cache') from exc
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)
