---
paths:
  - "packages/ai/**"
---

# LLM Pipeline Rules

- IRON LAW: the LLM NEVER modifies game numbers — it only parses intent and narrates.
- All calls go through the `LLMProvider` interface (MockProvider + real adapter); selection is config-driven.
- IntentParser uses function calling with `tool_choice: "required"` — NOT `json_schema` (measured HTTP 400 on this endpoint).
- Set `max_tokens` ≥ 1500 to avoid reasoning-token truncation; parse only `tool_calls`, ignore `reasoning`.
- LLM output takes effect only after validation against the core action whitelist; on failure retry once, then fall back to `{ rejected }`. Never let an unrecognized action through.
- Narrator streams classical-Chinese (古风) prose and NEVER emits numbers or claims authority over state.
- Period-lock has three gates: denylist + critic + post-generation narrative review.
- MockProvider is deterministic so the whole game is testable with zero real LLM calls.
- API keys live only on the Worker side — never in `packages/ai` code committed to the repo.

## Examples

**Correct** (function calling, validated):

```ts
const res = await provider.complete(msgs, { tools, tool_choice: "required", max_tokens: 1500 });
const action = res.tool_calls?.[0];           // ignore res.reasoning
if (!catalog.has(action?.name)) return { rejected: true };
```

**Incorrect**:

```ts
state.clan.koku += 500;                        // VIOLATION: LLM layer mutating state
const res = await provider.complete(msgs, { response_format: { type: "json_schema" } }); // VIOLATION: 400
```
