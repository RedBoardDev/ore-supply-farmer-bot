# Bot Tests

This folder hosts unit tests for the `@osb/bot` package.

## Structure

- `builders/` — small factories to build domain objects (Round, Miner, Config, ...)
- `fakes/` — minimal port/adapters used to keep tests deterministic
- `services/` — unit tests for domain services and application logic

## Conventions

- Prefer tests that assert business invariants (units, pricing, EV).
- Keep builders minimal and reusable; avoid ad‑hoc fixtures inside tests.
- Use `@osb/*` imports (enabled by `vite-tsconfig-paths`).

## Run

From repo root:

```
cd apps/bot
yarn test
```

## Add a new test

1. Create `test/<area>/<name>.test.ts`
2. Reuse builders from `test/builders/`
3. Keep tests deterministic (no network calls)
