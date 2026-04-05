# CI and Git hooks

This document describes the automated quality gates that run both locally (Git hooks) and remotely (GitHub Actions CI).

## Local Git hooks (lefthook)

[Lefthook](https://github.com/evilmartians/lefthook) manages Git hooks via the config file `lefthook.yml` in the repo root. Unlike raw `.git/hooks/` scripts, lefthook's config is version-controlled and shared with all contributors.

### Setup (one-time, after cloning)

```bash
bun add -d lefthook
bunx lefthook install
```

This writes thin wrapper scripts into `.git/hooks/` that delegate to `lefthook.yml`.

### What the hooks do

| Hook | When it runs | What it checks | Blocking? |
|------|-------------|----------------|-----------|
| `pre-commit` | Before each commit is saved | Biome lint + typecheck (parallel) | Yes — commit aborts on failure |
| `pre-push` | Before `git push` sends to remote | Unit tests + build (sequential) | Yes — push aborts on failure |

### Skipping hooks (escape hatch)

If you must bypass a hook temporarily (e.g., WIP commit):

```bash
git commit --no-verify -m "WIP: work in progress"
```

Use sparingly — CI will still catch problems.

## GitHub Actions CI

The workflow file `.github/workflows/ci.yml` runs on GitHub's servers. It triggers on every push to `main` and on every pull request targeting `main`.

### Pipeline

The pipeline has two jobs. The second only runs if the first succeeds.

#### Job 1: `check` (fast, ~30 seconds)

1. Install Bun.
2. `bun install --frozen-lockfile` — install dependencies reproducibly.
3. `bun run lint` — Biome lint.
4. `bun run typecheck` — TypeScript strict checking.
5. `bun test` — unit and component tests.
6. `bun run build` — verify all packages build successfully.

#### Job 2: `e2e` (slower, ~60 seconds, depends on `check`)

1. Install Bun + dependencies.
2. `bun run build:core` — build the IIFE bundle.
3. Install Playwright with headless Chromium.
4. `bun run test:e2e` — run integration tests against real browser.

### Branch protection (manual setup on GitHub)

After creating the repository, configure branch protection for `main`:

1. Go to **Settings → Branches → Add branch ruleset**.
2. Target: `main`.
3. Enable **Require status checks to pass before merging**.
4. Add required checks: `check` and `e2e`.
5. Enable **Require branches to be up to date before merging**.

This prevents anyone (including the repo owner) from merging a PR that hasn't passed CI.

### `--frozen-lockfile`

CI uses `bun install --frozen-lockfile` instead of plain `bun install`. This means the lockfile (`bun.lockb`) must be committed and up to date. If dependencies have changed but the lockfile hasn't been regenerated, CI will fail. This ensures reproducible builds — everyone tests against the exact same dependency versions.

## How hooks and CI relate

Hooks and CI serve different purposes:

- **Hooks** are a local convenience. They catch problems early, before code leaves your machine. They reduce the feedback loop from "push → wait for CI → see failure" to "commit → instant failure".
- **CI** is the authoritative gate. It runs in a clean environment, unaffected by local machine quirks. It is what determines whether a PR can be merged.

Hooks can be skipped; CI cannot. This is by design — sometimes you need to push incomplete work to a branch. CI only blocks merging to `main`.
