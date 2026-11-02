"""Build the current-target CPU runtime; never install packages at app startup."""
import importlib.metadata
import json
from pathlib import Path
import platform
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parent
OUTPUT = ROOT.parent / 'src-tauri' / 'resources' / 'kronos-runtime'


def validate_target(system, machine, version):
    if tuple(version[:2]) != (3, 11) or (system, machine.lower()) not in {
        ('Windows', 'amd64'), ('Linux', 'x86_64'), ('Darwin', 'arm64')
    }:
        raise ValueError('Kronos bundles require Python 3.11 and Windows/Linux x64 or macOS arm64')


def validate_bundle(root):
    executable = root / ('kronos-worker.exe' if sys.platform == 'win32' else 'kronos-worker')
    if not executable.is_file() or not (root / '_internal').is_dir():
        raise ValueError('Bundled Kronos executable or dependency directory is missing')
    if not (root / '_internal' / 'model-manifest.json').is_file():
        raise ValueError('Bundled pinned model manifest is missing')


def collect_licenses(destination):
    destination.mkdir(parents=True, exist_ok=True)
    shutil.copytree(ROOT / 'LICENSES', destination, dirs_exist_ok=True)
    records = []
    for distribution in importlib.metadata.distributions():
        name = distribution.metadata['Name']
        records.append(f'{name}=={distribution.version}')
        for file in distribution.files or []:
            if any(word in str(file).lower() for word in ('license', 'notice', 'copying')):
                source = Path(distribution.locate_file(file))
                if source.is_file():
                    target = destination / name / str(file).replace('..', '_').replace(':', '_')
                    target.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(source, target)
    (destination / 'PACKAGES.txt').write_text('\n'.join(sorted(records)) + '\n', encoding='utf-8')


def main():
    validate_target(platform.system(), platform.machine(), sys.version_info)
    import torch
    if torch.version.cuda is not None:
        raise ValueError('Only CPU-only PyTorch may be packaged')
    work = ROOT.parent / '.superpowers' / 'kronos-build'
    subprocess.run([sys.executable, '-m', 'PyInstaller', '--noconfirm', '--clean',
                    '--distpath', str(OUTPUT.parent), '--workpath', str(work),
                    str(ROOT / 'kronos.spec')], cwd=ROOT.parent, check=True)
    validate_bundle(OUTPUT)
    collect_licenses(OUTPUT / 'LICENSES')
    (OUTPUT / 'build-target.json').write_text(json.dumps(dict(system=platform.system(), architecture=platform.machine(),
                                                         python=platform.python_version(), torch=torch.__version__)), encoding='utf-8')
    print(f'Runtime bytes: {sum(p.stat().st_size for p in OUTPUT.rglob("*") if p.is_file())}', flush=True)


if __name__ == '__main__':
    main()
