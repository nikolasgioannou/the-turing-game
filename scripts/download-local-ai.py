"""Run with the project .venv; downloaded artifacts and caches remain local."""
import os
from pathlib import Path

root = Path(__file__).resolve().parent.parent
os.environ['HF_HOME'] = str(root / '.cache/huggingface')
os.environ['XDG_CACHE_HOME'] = str(root / '.cache')
from huggingface_hub import snapshot_download

snapshot_download(
    'vanch007/Huihui-Qwen3.6-35B-A3B-abliterated-mlx-4bit',
    revision='c527e66175ea6957964119e316ece3364a1c3627',
    local_dir=root / 'models/huihui-qwen3.6-35b-4bit',
    allow_patterns=['*.json', '*.jinja', '*.safetensors', '*.txt', 'README.md'],
    max_workers=4,
)
