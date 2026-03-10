# CloudAGI

Agent Credit Economy — see waste, sell unused credits, buy discounted compute.

## Build & Test
```bash
cd v1
bun test        # run all tests
bun run lint    # tsc --noEmit
bun run dev     # run CLI locally
bun run build   # bundle to dist/
```

## Architecture
- `v1/src/plugins/` — provider plugins (detect → authenticate → fetchUsage)
- `v1/src/plugins/define-plugin.ts` — Guardian SDK factory for declarative plugin authoring
- `v1/src/waste.ts` — sell window calculation (paceRatio algorithm)
- `v1/src/probe.ts` — parallel orchestrator
- `v1/src/output.ts` — terminal table renderer

## Adding a Provider Plugin
1. Create `v1/src/plugins/<name>.ts` using `definePlugin()` from `define-plugin.ts`
2. Create `v1/tests/plugins/<name>.test.ts` with mocked fetch/fs
3. Register via `registerPlugin()` at module level
4. Import in `v1/src/index.ts`

## Credential Safety
Never refresh tokens. Read-only auth — use what's stored locally.
Guardian SDK seals credential files for tamper detection.

## Conventions
- TDD: tests first (RALPH loop)
- Conventional commits: `type(scope): description`
- TypeScript strict, Bun runtime
- No `--force` push without explicit approval
