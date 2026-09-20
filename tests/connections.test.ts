import { expect, test } from 'bun:test';
import { clientIP, ConnectionLimiter, normalizeIP } from '../src/server/connections';

test('only private Fly ingress may supply the client address', () => {
  const headers = new Headers({
    'fly-client-ip': '203.0.113.7',
    'x-forwarded-for': '198.51.100.1',
  });

  expect(clientIP(headers, 'fdaa:1::3', true)).toBe('203.0.113.7');
  expect(clientIP(headers, '172.16.1.234', true)).toBe('203.0.113.7');
  expect(clientIP(headers, '172.16.1.234', false)).toBe('172.16.1.234');
  expect(clientIP(headers, '172.15.1.1', true)).toBe('172.15.1.1');
  expect(clientIP(headers, '127.0.0.1', false)).toBe('127.0.0.1');
  expect(clientIP(headers, '198.51.100.5', true)).toBe('198.51.100.5');
  headers.set('fly-client-ip', '203.0.113.7, 198.51.100.1');
  expect(clientIP(headers, 'fdaa:1::3', true)).toBe('fdaa:1::3');
  expect(clientIP(new Headers(), undefined, true)).toBe('unknown');
});

test('equivalent IPv6 and mapped IPv4 cannot split a limit', () => {
  expect(normalizeIP('2001:0db8:0000::1')).toBe('2001:db8::1');
  expect(normalizeIP('::ffff:192.0.2.1')).toBe('192.0.2.1');
  expect(normalizeIP('garbage')).toBeNull();
});

test('clients have independent limits; shared networks allow reconnect bursts and recover', () => {
  let now = 0;
  const limit = new ConnectionLimiter(() => now);

  for (let i = 0; i < 60; i++) expect(limit.take('203.0.113.1')).toBe(true);

  expect(limit.take('203.0.113.1')).toBe(false);
  expect(limit.take('203.0.113.2')).toBe(true);
  now = 60_000;
  expect(limit.take('203.0.113.1')).toBe(true);
});
