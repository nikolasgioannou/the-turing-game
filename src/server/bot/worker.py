"""One isolated bot per match; no credentials or persisted draft text."""
import asyncio
import json
import sys
from transport import emit, pending
from brain import Game
import re

# Bot diagnostics contain drafts/output. Never retain those logs.
import brain
brain.print = lambda *args, **kwargs: None


class Bot(Game):
    async def broadcast(self):
        emit({"type": "state", "phase": self.phase, "messages": self.messages,
              "startedAt": self.live_started, "endsAt": self.ends_at})


async def main():
    bot = None
    while True:
        line = await asyncio.to_thread(sys.stdin.readline)
        if not line:
            break
        command = json.loads(line)
        kind = command["type"]
        if kind == "result":
            future = pending.get(command["id"])
            if future and not future.done():
                future.set_result(command)
        elif kind == "start":
            bot = Bot(command["id"])
            bot.human_label = command["humanLabel"]
            bot.ai_label = "B" if bot.human_label == "A" else "A"
            bot.phase = "opening"
            bot.task = asyncio.create_task(bot.ai_loop())
        elif kind == "message" and bot:
            await bot.on_message(command["role"], command["text"])
        elif kind == "draft" and bot:
            await bot.on_draft(command["text"])
        elif kind == "context" and bot:
            name = re.sub(r"[^\w \-'.]", "", command["name"])[:24].strip()
            if name:
                bot.names[command["role"]] = name
            if command["role"] == "player" and "hints" in command:
                bot.hints = command["hints"]
        elif kind == "stop":
            break
    for task in asyncio.all_tasks():
        if task is not asyncio.current_task():
            task.cancel()


if __name__ == "__main__":
    asyncio.run(main())
