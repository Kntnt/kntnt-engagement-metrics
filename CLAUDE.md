# Kntnt Engagement Metrics — Claude Code

## Universal agent instructions

@AGENTS.md

## Detailed specifications

IMPORTANT: Before implementing any feature, read the relevant specification:

@docs/architecture.md
@docs/algorithm.md
@docs/api-contracts.md
@docs/coding-conventions.md
@docs/addon-development.md
@docs/testing-strategy.md
@docs/ci-and-hooks.md

## Claude Code specific notes

- `bun build` does NOT generate `.d.ts` files. Use `tsc --emitDeclarationOnly` for type declarations if needed for npm publishing.
- The IIFE global namespace is `window.KntntEngagementMetrics`. Add-ons attach to sub-properties (e.g., `.matomo`, `.gtag`).
