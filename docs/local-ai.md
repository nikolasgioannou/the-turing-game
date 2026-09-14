# Local inference on Apple Silicon

Model: vanch007/Huihui-Qwen3.6-35B-A3B-abliterated-mlx-4bit, revision
c527e66175ea6957964119e316ece3364a1c3627. Approximately 19 GB of model files. Runtime: MLX-VLM 0.7.0
with MLX 0.32.2, using the existing mise Python 3.14.7. Full Python dependency versions are in
scripts/local-ai-requirements.txt.

The game remains Bun/TypeScript. Python only runs the separate local inference service. All weights,
the virtual environment, and runtime caches live inside this project and are excluded from git and
Docker. No global tools or runtime versions are installed.

## Setup

Use an already installed mise Python. UV_PYTHON_DOWNLOADS=never prevents uv from downloading a
shared runtime. On another machine, confirm the installed Python is compatible before installation.

```sh
UV_CACHE_DIR=.cache/uv UV_PYTHON_DOWNLOADS=never uv venv .venv --python "$(mise which python)"
UV_CACHE_DIR=.cache/uv UV_PYTHON_DOWNLOADS=never uv pip install --python .venv/bin/python -r scripts/local-ai-requirements.txt
.venv/bin/python scripts/download-local-ai.py
```

The download is pinned and resumable. It does not execute code from the model repository.

## Run

In one terminal:

```sh
bun run ai:local
```

The model server listens only on 127.0.0.1:8080. Thinking is disabled by the installed server's
default. KV cache is capped at 8192 tokens, output at 512 tokens, and generation concurrency at one.
No remote-code trust option is enabled. Startup preloads the model; wait for /health to respond
before starting a game. Offline Hugging Face mode prevents runtime downloads.

In another terminal, using this Mac's current Wi-Fi address:

```sh
PORT=3000 APP_ORIGIN=http://192.168.1.233:3000 PGLITE_PATH=./data/wifi AI_DEVTOOLS=true bun run start:local
```

All game entrypoints use the same local model configuration. `LOCAL_AI_URL` defaults to loopback
port 8080 and `LOCAL_AI_MODEL` defaults to the downloaded Huihui model. Remote endpoints are
rejected. No provider credentials or hosted fallback exist.

DevTools continues to capture the app's AI SDK requests (`bun run devtools`). The same durable token
caps and 30-second generation timeout apply. With local concurrency set to one, simultaneous games
can queue and time out; this is a local play-test setup, not a production capacity claim. Fly
deployment remains deferred.

Prompt style-matched-chat-v8 allows identical responses to exact-word/factual requests and
explicitly forbids quotation wrappers, speaker labels and narration. It restricts the private
opening to style reference, then treats all posted messages as shared chat.

## Verified on this Mac

Model loaded and generated successfully. A local tool-call probe produced a structured
lookup_weather call with city London; no tool was executed. Two generations in a real Wi-Fi game
took about 1.3s and 1.1s, excluding intentional chat pacing. The model answered an exact profanity
request directly. It still sometimes borrows the private opening or breaks character: local
execution is functional, competitive dialogue quality is not established.
