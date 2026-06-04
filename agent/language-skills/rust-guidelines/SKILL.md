---
name: rust-guidelines
description: Rust coding standards, patterns, and project conventions. Use when writing, reviewing, or refactoring Rust code.
---

# Rust Guidelines

## Error Handling
- Use `Result<T, E>` everywhere. Never `unwrap()` or `expect()` in library code
- Prefer `thiserror` for library errors, `anyhow` for application code
- Use `?` to propagate errors; avoid manual `match` boilerplate when possible
- Implement `std::error::Error` for custom error types

## Async
- Prefer `tokio` as the async runtime
- Use `?` inside async functions freely
- Prefer `tokio::sync::Mutex` over `std::sync::Mutex` across await points
- Use `tokio::spawn` for fire-and-forget tasks; `tokio::join!` for concurrent awaits

## Types & Traits
- Derive `Debug`, `Clone`, `PartialEq` by default; opt out with comments if skipped
- Use `#[derive(...)]` before manual `impl` blocks
- Prefer `&str` over `String` in function parameters when no ownership is needed
- Use `Into<String>` or `AsRef<str>` for flexible APIs only when justified

## Safety & Unsafe
- Minimize `unsafe` blocks; document every `unsafe` with a `// SAFETY:` comment
- Keep `unsafe` blocks as small as possible; never wrap entire functions
- Always assert preconditions explicitly before `unsafe` operations

## Testing
- Unit tests live in `src/` inline (`#[cfg(test)] mod tests`)
- Integration tests live in `tests/`
- Use `tokio::test` for async tests
- Prefer property-based testing with `proptest` for complex logic

## Tooling
- Run `cargo clippy` and `cargo fmt` before committing
- Keep `Cargo.toml` dependencies sorted alphabetically within sections
- Pin exact versions in `Cargo.lock`; use semver ranges in `Cargo.toml`
