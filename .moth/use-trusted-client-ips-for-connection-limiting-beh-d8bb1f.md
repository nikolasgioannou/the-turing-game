---
id: 'd8bb1f'
title: Use trusted client IPs for connection limiting behind Fly
status: in-progress
priority: urgent
labels:
  - security
created_at: 2026-09-19T23:51:16.212Z
updated_at: 2026-09-20T00:37:20.347Z
---

src/server/index.ts uses server.requestIP(req) for the 60-connections-per-minute limiter. Behind Fly this may identify a proxy and group unrelated visitors. This is a deployment concern that needs verification, not a confirmed observation of production IP values.

Acceptance criteria:

- Verify the address seen through the deployed proxy and use trusted Fly-Client-IP handling for production traffic.
- Keep an appropriate direct-address fallback for local development; define the proxy trust boundary and reject spoofable forwarding assumptions.
- Test independent clients, shared networks, IPv6, reconnect bursts and exhausted limits.
- Ensure ordinary users do not receive another visitor’s connection limit.
