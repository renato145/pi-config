---
name: rust-guidelines
description: Rust coding standards, patterns, and project conventions. Use when writing, reviewing, or refactoring Rust code.
---

# Rust Guidelines

## Code style

- Prefer functional coding style
- Add TODO comments for features or nuances that were deemed not important to add, support, or implement right away

## Symbol Naming

- Use `o` for an object in a iteration. Eg: `values.iter().map(|o| o*2)`
- Use `i` for an index. Eg: `values.iter().enumerate().map(|(i,o)| (i,o*2))`
- Use `k` and `v` for a key and value in structures like hashmaps. Eg: `some_hashmap.iter().map(|(k, v) ...|)`
- When mapping a single function use `x` for variables and `e` for errors. Eg: `some_result.map(|x| format!("x={x}")).map_err(|e| e.into())`

## Error Handling

- Prefer `thiserror` for library errors, `anyhow` for application code
- For tracing error always use the syntax: `tracing::error!(error.cause_chain=?e, error.message=%e, "#ERROR_MESSAGE_HERE")`

## Testing

- Prefer `nextest` for running tests
- Prefer property-based testing with `proptest` for complex logic
- If `googletest` crate is available, use it to assert tests
- If `insta` crate is available, use it for snapshot testing if necessary

## Tooling

- After making changes run `cargo clippy` and `cargo fmt`. If the repo have a justfile with a `checks`` command, run`just checks` instead.
- When adding dependencies to Rust projects, use `cargo add`
