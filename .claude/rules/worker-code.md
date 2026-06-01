---
paths:
  - "apps/worker/**"
---

# Cloudflare Worker Code Rules

- API keys come only from `env` (CF Secret / `.dev.vars`) — never hardcoded, never sent to the frontend.
- LLM proxy: pass the upstream SSE through unbuffered — `return new Response(upstream.body, { headers: { "Content-Type": "text/event-stream" } })`.
- `GameSession` Durable Object: one game = one DO; requests to a DO are serialized so `advanceTurn` has no races; `rngState` is persisted with the state for deterministic replay.
- Do NOT modify `packages/core` logic — import data + `buildState` to bypass Node `fs`.
- Error contract: 404 unknown route/game, 400 invalid body, 405 method mismatch.
- Waiting on the LLM does not count toward CPU time — avoid heavy synchronous compute on the request path.
- Serve `/api` same-origin (Workers Static Assets) to avoid CORS.

## Examples

**Correct** (key from env, stream pass-through):

```ts
const upstream = await fetch(LLM_URL, { headers: { Authorization: `Bearer ${env.LLM_KEY}` }, body });
return new Response(upstream.body, { headers: { "Content-Type": "text/event-stream" } });
```

**Incorrect**:

```ts
const KEY = "gc_live_...";            // VIOLATION: hardcoded key
const text = await upstream.text();   // VIOLATION: buffers the whole stream, kills streaming
```
