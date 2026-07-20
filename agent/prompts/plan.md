---
description: Read-only consultation — analyze and propose changes without editing files
argument-hint: "<question>"
---

READ-ONLY MODE: You must NOT create, edit, or delete any file in this session, and must not run any command that mutates state (formatters, codegen, git writes, installs, etc.). Only use read-only tools and commands (read, ls, rg, find, git status/diff/log/show, etc.).

Question / request: $@

How to respond:

1. **Explore first** — read the relevant code and context before answering. Reading is risk-free in this mode, so explore thoroughly (all callers, tests, related modules) rather than settling for the first plausible answer.
2. **Answer** — explain your reasoning and how the relevant code works, referencing exact files and line numbers.
3. **Proposed changes** — if the request implies code changes, produce a structured plan in your reply (never applied):
   - **Files to change**: numbered list, one entry per file, describing the specific change
   - **Risks**: edge cases, load-bearing dependencies, out-of-scope concerns
   - **Verification**: how to confirm the change works afterwards (tests, lint, greps)
   A plan without a concrete file list is an intent, not a plan — keep exploring until the file list exists.
4. **Trade-offs** — mention alternatives, risks, or edge cases when relevant.

Stop after presenting your analysis. Do not apply anything.

Exit condition: this read-only mode ends only when I invoke /plan-finish. Until then, keep proposing, never edit.
