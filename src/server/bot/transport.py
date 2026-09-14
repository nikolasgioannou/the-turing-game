"""Private JSON-line transport. Bun owns credentials, HTTP and request accounting."""
import asyncio
import json
import sys
import uuid
from types import SimpleNamespace

pending = {}


def emit(value):
    sys.stdout.write(json.dumps(value) + "\n")
    sys.stdout.flush()


class Client:
    def __init__(self, timeout=6.0):
        self.timeout = timeout
        self.messages = self

    def with_options(self, timeout):
        return Client(timeout)

    async def create(self, **kwargs):
        key = uuid.uuid4().hex
        future = asyncio.get_running_loop().create_future()
        pending[key] = future
        emit({"type": "request", "id": key, "timeout": self.timeout, "params": kwargs})
        try:
            result = await future
            if "error" in result:
                raise RuntimeError(result["error"])
            return SimpleNamespace(content=[SimpleNamespace(type="text", text=result["text"])])
        except asyncio.CancelledError:
            emit({"type": "cancel", "id": key})
            raise
        finally:
            pending.pop(key, None)


def get_client():
    return Client()
