"""Pinned-source parity plus deterministic scheduling/transport regressions."""
import ast
import asyncio
import hashlib
import json
from pathlib import Path
import sys
import unittest
from types import SimpleNamespace
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'src/server/bot'))
import reference
from reference import Game
reference.print = lambda *args, **kwargs: None


class ReferenceTests(unittest.IsolatedAsyncioTestCase):
    def test_pinned_source_parity(self):
        folder = ROOT / 'src/server/bot'
        manifest = json.loads((folder / 'upstream.json').read_text())
        source = ast.parse((folder / 'reference.py').read_text())
        cls = next(n for n in source.body if isinstance(n, ast.ClassDef))
        members = {}
        for node in cls.body:
            key = node.name if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) else node.targets[0].id
            members[key] = hashlib.sha256(ast.dump(node, include_attributes=False).encode()).hexdigest()
        self.assertEqual(members, manifest['members'])
        self.assertEqual(hashlib.sha256(reference.SYSTEM.encode()).hexdigest(), manifest['systemSha256'])
        self.assertEqual(reference.SYSTEM, (folder / 'system.txt').read_text())
        self.assertEqual(reference.MODEL, 'anthropic/claude-haiku-4.5')
        self.assertEqual(reference.GAME_SECONDS, 90)

    def game(self):
        game = Game('test')
        game.phase = 'opening'
        game.human_label, game.ai_label = 'A', 'B'
        game.broadcasts = []
        async def broadcast():
            game.broadcasts.append(list(game.messages))
        game.broadcast = broadcast
        return game

    async def test_opening_holds_human_until_first_exchange_and_keeps_exact_order(self):
        g = self.game()
        await g.on_message('judge', 'what is love')
        await g.on_draft('caring')
        await g.on_message('player', 'caring')
        self.assertEqual(len(g.messages), 1)
        self.assertEqual(g.held_first['text'], 'caring')
        async def gen(*args, **kwargs): return ['trust']
        async def sleep(*args): pass
        g.gen = gen
        with patch.object(reference.asyncio, 'sleep', sleep):
            await g.first_exchange(False)
        self.assertEqual([m['text'] for m in g.messages], ['what is love', 'caring', 'trust'])
        self.assertEqual(g.phase, 'live')
        self.assertEqual(g.ends_at - g.live_started, 90)

    async def test_opening_attack_can_land_without_human_submission(self):
        g = self.game()
        await g.on_message('judge', 'hello')
        async def gen(*args, **kwargs): return ['hi']
        async def sleep(*args): pass
        g.gen = gen
        with patch.object(reference.asyncio, 'sleep', sleep):
            await g.first_exchange(True)
        self.assertEqual(g.phase, 'live')
        self.assertEqual([m['text'] for m in g.messages], ['hello', 'hi'])

    def test_live_question_has_both_independent_and_draft_reading_paths(self):
        g = self.game()
        g.phase = 'live'
        g.messages = [{'from':'judge','text':'what is love','ts':100}]
        with patch.object(reference.random, 'random', return_value=0.1), patch.object(reference.random, 'uniform', side_effect=lambda a,b:a):
            g.new_plan(g.messages[-1], 100)
        self.assertTrue(g.plan['blind'])
        self.assertEqual(g.plan['land_at'], 101.5)
        with patch.object(reference.random, 'random', return_value=0.9), patch.object(reference.random, 'uniform', side_effect=lambda a,b:a):
            g.new_plan(g.messages[-1], 100)
        self.assertTrue(g.plan['beat'])
        self.assertGreaterEqual(g.plan['land_at'],108)
        self.assertLessEqual(g.plan['land_at'],120)

    async def test_two_point_five_second_hedge_takes_winner_and_cancels_loser(self):
        calls, cancelled = [], []
        async def create(**kwargs):
            calls.append(kwargs)
            if len(calls) == 1:
                try: await asyncio.sleep(10)
                except asyncio.CancelledError:
                    cancelled.append(True)
                    raise
            return 'second won'
        client = SimpleNamespace(messages=SimpleNamespace(create=create))
        with patch.object(reference, 'get_client', return_value=client):
            result = await Game.hedged_create(model=reference.MODEL, max_tokens=400)
            await asyncio.sleep(0)
        self.assertEqual(result, 'second won')
        self.assertEqual(len(calls), 2)
        self.assertEqual(calls[0], calls[1])
        self.assertTrue(cancelled)

    async def test_style_analysis_uses_original_prompt_and_500_token_limit(self):
        g = self.game()
        await g.on_message('judge', 'what is love')
        await g.on_message('player', 'ur mom')
        calls = []
        class Client:
            messages = None
            def __init__(self): self.messages = self
            def with_options(self, **kwargs):
                self.timeout = kwargs['timeout']
                return self
            async def create(self, **kwargs):
                calls.append(kwargs)
                return SimpleNamespace(content=[SimpleNamespace(type='text',text='style card')])
        client=Client()
        with patch.object(reference,'get_client',return_value=client):
            await g.analyze_style()
        self.assertEqual(g.style_card,'style card')
        self.assertEqual(client.timeout,20)
        self.assertEqual(calls[0]['max_tokens'],500)
        self.assertEqual(calls[0]['system'],g.STYLE_ANALYSIS)
        self.assertIn('ur mom',calls[0]['messages'][0]['content'])

    def test_json_send_false_and_multi_bubble_parsing(self):
        g=self.game()
        self.assertEqual(g.parse('{"send": false, "messages": ["unused"]}'),[])
        self.assertEqual(g.parse('{"send": true, "messages": ["one", "two"], "draft_reveals_answer":true}'),['one','two'])
        self.assertTrue(g.last_reveals)


if __name__ == '__main__':
    unittest.main()
