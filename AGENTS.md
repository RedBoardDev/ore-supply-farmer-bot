# Repository Guidelines

## Project Structure & Module Organization
- `apps/bot/`: main bot application (runtime, orchestrator, adapters). Tests live in `apps/bot/test/` and use the `test/**/*.test.ts` pattern.
- `packages/domain/`: shared domain aggregates, events, value objects.
- `packages/config/`: config and env schemas + loaders.
- `config/`: example config files (`config.json`, `.env`) for local setup.
- `docs/`: protocol and architecture documentation (source of truth for Ore protocol behavior).

## Build, Test, and Development Commands
From repo root:
- `yarn dev`: start the bot in watch mode via Turbo (`@osb/bot`).
- `yarn start`: run the bot once (`apps/bot`).
- `yarn build`: build all workspaces (Turbo).
- `yarn test`: run all tests (Turbo).
- `yarn lint:check` / `yarn lint:fix`: Biome lint checks/fixes.
- `yarn format:check` / `yarn format:fix`: Biome formatting.
- `yarn typescript:check`: typecheck all workspaces.

## Coding Style & Naming Conventions
- Language: TypeScript (ES2022). Indent 2 spaces.
- Formatting/linting: Biome (`biome.json`), single quotes in TS/JS.
- Ports/Adapters: ports are defined under `apps/bot/src/domain/services/ports/*` with `*Port` naming.
- Filenames: kebab-case, e.g. `mining-cost-strategy.service.ts`.

## Testing Guidelines
- Framework: Vitest.
- Tests live in `apps/bot/test/**` and must be named `*.test.ts`.
- Prefer deterministic tests; no RPC/HTTP. Use builders/fakes in `apps/bot/test/builders` and `apps/bot/test/fakes`.
- Run: `cd apps/bot && yarn test` or repo-wide `yarn test`.

## Commit & Pull Request Guidelines
- Commit style follows Conventional Commits (examples in history): `feat(bot): ...`, `refactor(config): ...`, `feat(docs): ...`.
- PRs should include: summary, test results, config changes (if any), and links to relevant issues/docs.

## Security & Configuration Tips
- Do not commit secrets. Use `config/.env` for local settings and keep `config/.env.example` updated.
- RPC endpoints and API keys are loaded via env + config schema validation.

## Architecture Notes
- DDD + Hexagonal: domain logic is isolated; infrastructure adapters are under `apps/bot/src/infrastructure`.
- Protocol behavior should align with `docs/` (e.g., confirmations/finality/reorg handling).
