---
description: Turn the questions in your previous reply into an ask_user_question dialog
argument-hint: "[extra instructions]"
---

Convert the questions in your last assistant message into one `ask_user_question` call. Do not redo the original work.

- Source: last assistant message only, including questions before the final one. Drop rhetorical ones, ones you answered, and ones the message already resolved. Keep each question's wording.
- Choices: reuse any choices the message listed, same order, descriptions from the message. For open questions, invent 2–4 options using only facts already in this session — no new tools, files, or requirements. The dialog adds a free-text row, so partial sets are fine.
- Schema: `header` ≤16 chars, `label` 1–5 words ≤60 chars, 2–4 options. Never label an option `Other`, `Type something.`, or `Next`. `multiSelect: true` when several answers are valid. `preview` only for concrete artifacts, single-select only.
- Cap: 4 questions max, the ones that most change the work; list extras as plain text after the call. No duplicate questions.
- No questions found: skip the tool, say so in one line, stop.
- After answers: treat them as my reply and continue what they were gating. Do not restate them or ask for confirmation.

Extra: ${@:-none}
