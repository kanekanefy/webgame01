---
paths:
  - "apps/web/**"
---

# React / Frontend Code Rules

- UI renders state only — it NEVER owns or mutates game numbers. Game state lives in `packages/core`, fetched via `/api`.
- The frontend NEVER touches API keys — it only calls its own `/api` (the Worker proxies to providers).
- Components are `PascalCase.tsx`; keep state light with Zustand (UI state only — game state is not duplicated into the store).
- Streaming narrative: distinguish `delta.reasoning` (discard) from `delta.content` (display).
- Web Vitals budget: INP < 200ms, LCP < 2.5s, CLS < 0.1. Virtualize long lists.
- Centralize user-facing strings for future localization — no scattered hardcoded copy.
- Mobile-first responsive + accessibility (keyboard/touch, contrast, scalable text).
- Use stable `data-testid` selectors for E2E.

## Examples

**Correct** (display-only, no key):

```tsx
const { state } = useGame();         // state came from /api
<span>{state.clan.koku}</span>
```

**Incorrect**:

```tsx
const koku = recomputeEconomy(prev);  // VIOLATION: numeric logic belongs in core
fetch("https://api.provider.com", { headers: { Authorization: `Bearer ${KEY}` } }); // VIOLATION: key in frontend
```
