---
description: Find and complete TODO items in source files
argument-hint: "[path ...]"
---

Search the following file(s) / path(s) for TODO items and complete them one by one (or all files if none specified):
$@

TODO items may appear in several forms depending on the language:

- **Rust**: `// TODO: <description>` or `todo!("<description>")`
- **Python**: `# TODO: <description>`
- **Bash**: `# TODO: <description>`
- **JavaScript / TypeScript**: `// TODO: <description>` or `/* TODO: <description> */`

Also watch for related placeholders such as `FIXME`, `XXX`, `HACK`, `unimplemented!()`, `pass`, `NotImplementedError`, or empty stub functions.

For each TODO found:

1. Read the surrounding context to understand what needs to be done.
2. Implement the missing functionality or fix the described issue following the language's idioms and the project's conventions.
3. Remove the TODO comment / placeholder macro / stub code once the task is completed.
4. Ensure the code compiles or parses correctly and any relevant tests pass.
