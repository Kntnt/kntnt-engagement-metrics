# Kntnt Engagement Metrics — AI Agent Instructions

This file is the single source of truth for AI coding agents working on this project. Claude Code imports this via `CLAUDE.md`; other agents (Copilot, Cursor, Codex, etc.) read it directly.

## Project summary

Lightweight TypeScript library that measures how deeply users engage with text content on web pages — distinguishing *reading* (pausing on visible content) from *scanning* (scrolling through). A plugin architecture allows analytics add-ons to consume the metrics.

## Repository structure

```
kntnt-engagement-metrics/
├── packages/
│   ├── core/       → @kntnt/engagement-metrics (zero dependencies)
│   ├── matomo/     → @kntnt/engagement-metrics-matomo
│   └── gtag/       → @kntnt/engagement-metrics-gtag
├── docs/        → Detailed specifications (READ THESE before coding)
│   ├── architecture.md       → System architecture and design principles
│   ├── algorithm.md          → Complete measurement algorithm specification
│   ├── api-contracts.md      → Public API types and contracts
│   ├── coding-conventions.md → Style guide and project conventions
│   ├── addon-development.md  → How to build analytics add-ons
│   ├── testing-strategy.md   → Test levels, scenarios, and CI setup
│   └── ci-and-hooks.md       → Git hooks (lefthook) and GitHub Actions CI
├── CLAUDE.md       → Claude Code config (imports this file + docs refs)
├── AGENTS.md       → This file
└── README.md       → Human-facing documentation
```

## Before you start coding

If you are Claude Code: the `docs/` files are already loaded via `@import` in `CLAUDE.md` — do NOT re-read them.

All other agents: read the relevant files in `docs/` before writing any code:

1. **Always read first:** `docs/architecture.md` for the overall design.
2. **For core work:** `docs/algorithm.md` + `docs/api-contracts.md`.
3. **For add-on work:** `docs/addon-development.md`.
4. **For all code:** `docs/coding-conventions.md`.
5. **For testing:** `docs/testing-strategy.md`.
6. **For CI/hooks:** `docs/ci-and-hooks.md`.

## Technology stack

| Tool | Version | Purpose |
|------|---------|---------|
| TypeScript | ^5.7 | Language (strict mode, ES2022 target) |
| Bun | latest | Package manager, bundler, test runner |
| Biome | ^1.9 | Linter and formatter (replaces ESLint + Prettier) |

## Essential commands

```bash
bun install          # Install dependencies
bun run build        # Build all packages
bun test             # Run all tests
bun run lint         # Lint all packages
bun run typecheck    # Type-check all packages
bun run test:e2e     # Integration tests (Playwright, headless Chromium)
```

## Critical constraints

1. **Zero runtime dependencies** in the core package. No exceptions.
2. **Browser-only APIs:** `IntersectionObserver`, `requestAnimationFrame`, `document.visibilityState`, `querySelectorAll`. No jQuery, no DOM abstraction libraries.
3. **No polyfills.** Target ES2022-capable browsers.
4. **Named exports only.** No default exports anywhere.
5. **Private fields:** use `#` syntax, not the `private` keyword.
6. **Passive event listeners:** all scroll/touch listeners must use `{ passive: true }`.
7. **Minimal DOM reads:** the measurement tick loop must not read from the DOM. Use `IntersectionObserver` callbacks to update visibility state asynchronously.

## Gotchas

- `bun build` does NOT generate `.d.ts` files. Use `tsc --emitDeclarationOnly` for type declarations if needed for npm publishing.
- The IIFE global namespace is `window.KntntEngagementMetrics`. Add-ons attach to sub-properties (e.g., `.matomo`, `.gtag`).

## Conventions

- **Files:** `kebab-case.ts`. **Tests:** co-located as `kebab-case.test.ts`.
- **Classes/interfaces/types:** `PascalCase`. **Functions/variables:** `camelCase`.
- **Branches:** `feat/`, `fix/`, `docs/`, `refactor/` prefixes.
- **Commits:** imperative mood, max 72 characters subject line.
- **Testing:** `bun test` (Jest-compatible API). Mock the DOM with `jsdom` for component tests.
