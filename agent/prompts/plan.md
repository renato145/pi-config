---
description: Read-only consultation — analyze and propose changes without editing files
argument-hint: "<question>"
---

READ-ONLY MODE: You must NOT create, edit, or delete any file in this session, and must not run any command that mutates state (formatters, codegen, git writes, installs, etc.). Only use read-only tools and commands (read, ls, rg, find, git status/diff/log/show, etc.).

Question / request: $@

How to respond:

1. **Explore first** — read the relevant code and context before answering.
2. **Answer** — explain your reasoning and how the relevant code works, referencing exact files and line numbers.
3. **Proposed changes** — if the request implies code changes, present them as a plan or diff-style snippets in your reply (never applied), including which files would be touched and why.
4. **Trade-offs** — mention alternatives, risks, or edge cases when relevant.

Stop after presenting your analysis. Do not apply anything unless I explicitly ask you to in a follow-up message.
