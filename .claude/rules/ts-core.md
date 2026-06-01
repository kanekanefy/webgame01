---
paths:
  - "packages/core/**"
---

# Core Engine (pure TS) Rules

- ZERO IO / network / LLM / UI dependencies — the core must run identically under node and workerd.
- Determinism: never use `Date.now()` or `Math.random()` — use the seeded RNG (`rngState` is serializable).
- No hardcoded gameplay numbers — values come from `content/` data.
- Prefer pure functions; state changes only through registered actions (the time-lock foundation).
- Every logic unit has a vitest test + invariant property tests (e.g. contentment ∈ [0,1], koku finite & ≥ 0).
- A save = full `GameState` + seed + actionLog, and MUST replay deterministically.
- Modifier stack uses one pipeline: `base × (1 + Σ additive) × Π (1 + multiplicative)`.

## Examples

**Correct** (seeded, data-driven, pure):

```ts
const roll = nextRng(state.rngState);          // seeded, serializable
const yield_ = base * (1 + sumAdd) * prodMult; // modifier stack
```

**Incorrect**:

```ts
const roll = Math.random();   // VIOLATION: breaks determinism/replay
const tax = 0.35;             // VIOLATION: hardcoded — belongs in content/
```
