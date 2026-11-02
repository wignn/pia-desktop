from pathlib import Path
from PyInstaller.utils.hooks import collect_data_files, copy_metadata

root = Path(SPECPATH)
data = [(str(root / 'model-manifest.json'), '.')]
for package in ('torch', 'numpy', 'pandas', 'safetensors', 'huggingface_hub', 'einops', 'tqdm'):
    data += copy_metadata(package)

a = Analysis([str(root / 'worker.py')], pathex=[str(root)],
             binaries=[], datas=data, hiddenimports=['model_assets', 'kronos.server'],
             hookspath=[], hooksconfig={}, runtime_hooks=[],
             excludes=['tkinter', 'matplotlib', 'IPython', 'pytest', 'scipy', 'tensorboard'],
             noarchive=False)
pyz = PYZ(a.pure)
exe = EXE(pyz, a.scripts, [], exclude_binaries=True, name='kronos-worker',
          debug=False, bootloader_ignore_signals=False, strip=False, upx=False,
          console=True, disable_windowed_traceback=False)
coll = COLLECT(exe, a.binaries, a.datas, strip=False, upx=False, name='kronos-runtime')
