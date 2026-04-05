# Contributing to Kntnt Engagement Metrics

Thank you for your interest in contributing! Here's how to get started.

## Prerequisites

- [Bun](https://bun.sh/) (latest version)
- [Git](https://git-scm.com/)

## Setup

```bash
git clone https://github.com/Kntnt/kntnt-engagement-metrics.git
cd kntnt-engagement-metrics
bun install
```

## Development workflow

1. Create a feature branch: `git checkout -b feat/my-feature`
2. Make your changes.
3. Run checks: `bun run lint && bun run typecheck && bun test`
4. Commit with a clear message: `git commit -m "Add my feature"`
5. Push and open a pull request.

## Code conventions

Please read [`docs/coding-conventions.md`](../docs/coding-conventions.md) before writing code. The key points:

- TypeScript with strict mode.
- Named exports only (no default exports).
- Use `#` private fields.
- Files in `kebab-case.ts`.
- Tests co-located as `*.test.ts`.
- Biome handles linting and formatting — run `bun run lint` to check.

## Using AI coding tools

This project is designed to be developed with AI coding assistants. If you use one:

- **Claude Code:** reads `CLAUDE.md` automatically.
- **Other agents (Copilot, Cursor, Codex, etc.):** point your tool to `AGENTS.md`.
- **Detailed specs:** the `docs/` folder contains everything an AI agent needs to understand the project deeply.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](../LICENSE).
