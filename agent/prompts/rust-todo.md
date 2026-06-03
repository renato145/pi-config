---
description: Find and complete TODO items in Rust source files
argument-hint: "<path> [path ...]"
---

Search the following file(s) / path(s) for TODO items and complete them one by one:
$@

TODO items may appear in two forms:

1. Comments: `// TODO: <todo task description>`
2. Rust macros: `todo!("<todo task description>")`

For each TODO found:

- Read the surrounding context to understand what needs to be done.
- Implement the missing functionality or fix the described issue.
- Remove the TODO comment or `todo!()` macro once the task is completed.
- Ensure the code compiles and any relevant tests pass.
