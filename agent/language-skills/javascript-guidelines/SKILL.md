---
name: javascript-guidelines
description: JavaScript coding standards, patterns, and project conventions. Use when writing, reviewing, or refactoring JavaScript code.
---

# JavaScript Guidelines

## Style & Formatting
- Use `const` by default; `let` only when reassignment is needed. Never `var`
- Prefer `===` and `!==` over `==` and `!=`
- Use trailing commas in multiline arrays, objects, and function params
- Use semicolons explicitly; do not rely on Automatic Semicolon Insertion
- Prefer single quotes for strings unless interpolation requires backticks

## Functions
- Prefer arrow functions for callbacks and short expressions
- Use named functions for exported or recursive functions
- Default to named parameters via destructuring for options objects
- Keep functions pure when possible; avoid mutating arguments

## Async
- Use `async/await` over raw Promises or callbacks
- Always `await` inside `try/catch` blocks; do not chain `.catch()` without handling
- Use `Promise.all` for independent concurrent operations
- Avoid `Promise.all` for dependent operations; sequence them with `await`

## Types
- Use JSDoc types where practical if not using TypeScript
- Prefer explicit runtime checks (`typeof`, `Array.isArray`) for external data
- Avoid coercing types implicitly (`+val`, `!!val`); be explicit with `Number(val)`, `Boolean(val)`

## Error Handling
- Throw `Error` instances, not strings or primitives
- Validate inputs at module boundaries (API handlers, CLI entrypoints)
- Use early returns to reduce nesting; avoid deep `if/else` pyramids

## Testing
- Use a modern test runner (Vitest, Jest, or Node's built-in test runner)
- Unit test pure functions; integration test module boundaries
- Mock external HTTP calls and filesystem operations in unit tests

## Tooling
- Run `eslint` and `prettier` before committing
- Keep `package.json` dependencies sorted alphabetically
- Pin exact versions in lockfile; use caret ranges in `package.json`
