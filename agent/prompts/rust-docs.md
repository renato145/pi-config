---
description: Add and update Rust rustdoc documentation
argument-hint: "[path ...]"
---

Focus on the following file(s) / path(s), or the whole project if none are specified:
$@

Add and update Rust documentation (`///` and `//!` doc comments) wherever it is missing or out of date. In particular:

- Ensure all public items (modules, structs, enums, traits, functions, methods, fields, constants, type aliases, macros) have doc comments.
- Follow rustdoc conventions: start with a concise summary sentence, then add detail if needed.
- Add `# Examples` sections with runnable doc-test code for non-trivial public APIs.
- For `unsafe` functions or blocks, add `# Safety` sections explaining preconditions and invariants.
- Update existing docs that no longer match the implementation, signature, or behavior.
- Remove or rewrite redundant docs that just restate the item name.
- Keep documentation concise and useful; do not add noise to trivial getters/setters.
- If the crate uses `#![warn(missing_docs)]` or `#![deny(missing_docs)]`, aim to satisfy it.
