---
description: Analyze codebase and create or improve AGENTS.md
argument-hint: "[path]"
---

Analyze the codebase at ${1:-.} and create or update its AGENTS.md file.

Start by exploring the project structure, config files, and existing docs before writing anything.

The AGENTS.md should contain:

1. **Project summary** — what it is, main language/framework, entry points
2. **Commands** — build, lint, test (especially how to run a single test)
3. **Code style** — imports, formatting, types, naming conventions, error handling
4. **Architecture** — key directories, main abstractions, data flow

This file will be consumed by coding agents working in this repo. Keep it under
150 lines, focus on what an agent needs to make correct edits, not general
documentation.

If an AGENTS.md already exists, preserve what's accurate and improve what's missing or outdated.
