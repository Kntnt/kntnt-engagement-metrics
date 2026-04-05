# Coding conventions

## Language and compilation

- All source code is TypeScript (strict mode).
- Target: ES2022. Do not use features newer than ES2022.
- No runtime dependencies in the core package. Zero. None.
- Add-on packages may only depend on the core via `peerDependencies`.

## Style

Biome enforces most style rules automatically. These are the project-specific conventions beyond what Biome handles:

### Naming

- Files: `kebab-case.ts` (e.g., `measurer.ts`, `api-contracts.ts`).
- Classes: `PascalCase` (e.g., `Measurer`, `Timer`).
- Interfaces and types: `PascalCase` (e.g., `EngagementMetrics`, `MeasurerConfig`).
- Functions and variables: `camelCase` (e.g., `createMeasurer`, `readingRatio`).
- Constants: `camelCase` for exported constants (not SCREAMING_SNAKE_CASE), unless the value is truly a compile-time constant like `DEFAULT_READING_SPEED`.
- Private fields: use the `#` private syntax (not the `private` keyword).

### Exports

- Each package has a single `index.ts` that re-exports the public API.
- Use named exports only. No default exports.
- Every public export must have a JSDoc comment.

### Types

- Prefer `interface` over `type` for object shapes.
- Use `readonly` for properties that must not be reassigned after construction.
- Avoid `any`. Use `unknown` when the type is genuinely not known.
- Use `satisfies` operator where appropriate to verify types without widening.

### Functions

- Prefer pure functions where possible.
- Functions should do one thing and be short (< 30 lines as a guideline).
- Use early returns to reduce nesting.
- Parameters: prefer a config/options object over long parameter lists (> 3 params).

### DOM interaction

- NEVER use jQuery or any DOM abstraction library.
- Use `document.querySelectorAll()` for element queries.
- Use `IntersectionObserver` for visibility detection.
- Use `requestAnimationFrame` for animation/tick loops.
- Use the `Page Visibility API` (`document.visibilityState` + `visibilitychange` event).
- All event listeners must use `{ passive: true }` where applicable.
- Minimize DOM reads. Cache geometry values where possible.

### Error handling

- Do not throw exceptions for expected conditions (e.g., no content elements found).
- Use early returns and default values instead.
- Log warnings to `console.warn()` for recoverable issues (e.g., no content elements found).

## Testing

- Test framework: `bun test` (built-in, Jest-compatible API).
- Test files: co-located with source files as `*.test.ts` (e.g., `timer.test.ts`).
- Test naming: use `describe` / `it` blocks with descriptive names.
- Focus on unit tests for Timer, Element, and metrics computation.
- Integration tests for the full Measurer lifecycle use `jsdom`.

## Git conventions

- Branch naming: `feat/description`, `fix/description`, `docs/description`, `refactor/description`.
- Commit messages: imperative mood, max 72 characters for the subject line (e.g., "Add scroll cooldown logic to measurer").
- One logical change per commit.

## Documentation

- Every public function, class, interface, and type must have a JSDoc comment.
- JSDoc comments should describe *why*, not *what* (the code shows the what).
- Use `@param` and `@returns` tags for functions.
- Use `@example` for non-obvious usage.
