---
description: Exit read-only mode and start executing the plan, persisting it to a tracked file
argument-hint: "[extra instructions]"
---

READ-ONLY MODE IS OVER. The plan discussed so far is now approved — begin executing it.

Before doing anything else, persist the plan so it can be tracked:

1. Generate a timestamp with `date +%Y%m%d-%H%M%S` and note it as `$TS`.
2. Create a file named `PLAN_${TS}.md` at the repository root (the working directory's git root; if there is no git repo, use the current working directory).
3. Write the plan into that file with this structure:
   - **Goal** — one-line summary of the objective.
   - **Tasks** — a numbered checklist (`- [ ] ...`) of concrete steps, one per file/operation. Order them by execution order.
   - **Files** — list of files that will be created or modified.
   - **Risks** — edge cases and load-bearing dependencies noted during planning.
   - **Notes** — any extra instructions provided below.
4. Then start executing the plan, in order. After completing each task, update its checklist entry to `- [x]` in the plan file and keep the file in sync as the plan evolves.

Do not begin code edits until the plan file has been created and populated.

Extra instructions: ${1:-none} ${@:2}