---
description: Update AGENTS.md to reflect the current repository state
argument-hint: "[path]"
---

Read the existing AGENTS.md at ${1:-.} and update it to accurately reflect the current repository state.

Steps:
1. Read the current AGENTS.md if it exists.
2. Explore the repository structure, config files, source code, and docs to understand the current state.
3. Compare the current state against what is documented in AGENTS.md.
4. Update AGENTS.md to fix any outdated, missing, or incorrect information.

The AGENTS.md should contain:

1. **Project summary** — what it is, main language/framework, entry points
2. **Commands** — build, lint, test (especially how to run a single test)
3. **Code style** — imports, formatting, types, naming conventions, error handling
4. **Architecture** — key directories, main abstractions, data flow

Keep it under 150 lines and focused on what a coding agent needs to make correct edits.
Preserve accurate sections; rewrite or add only what has changed.
