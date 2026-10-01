---
description: Write a handoff document so a fresh agent can continue this session's work
argument-hint: [what the next session will focus on]
---

Write a handoff document summarising the current conversation so a fresh agent can continue the work. Save it to the OS temporary directory — not the current workspace — and print the full path when done.

Do not duplicate content already captured in other artifacts (specs, plans, ADRs, issues, commits, diffs). Reference them by path or URL instead.

Redact sensitive information such as API keys, passwords, or personally identifiable information.

Next session focus: ${@:-not specified — write a general handoff.}
