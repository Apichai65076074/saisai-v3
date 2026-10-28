#!/usr/bin/env bash
set -euo pipefail
python -m pip install sortedcontainers
python -m pip install --no-deps --force-reinstall 'git+https://github.com/OpenBMB/VoxCPM.git@cce58a5b59303c9bd63d12f23afe6a49a4a80c59'
python - <<'PY'
import importlib.util, importlib.metadata, inspect
from voxcpm import VoxCPM
assert importlib.util.find_spec('voxcpm.model.voxcpm2') is not None
assert 'device' in inspect.signature(VoxCPM.__init__).parameters
assert 'reference_wav_path' in inspect.signature(VoxCPM._generate).parameters
print({'voxcpm_version': importlib.metadata.version('voxcpm'), 'voxcpm2_implementation': True})
PY
exec python /workspace/launch.py
