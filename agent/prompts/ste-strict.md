---
description: Attempt full ASD-STE100 compliance rewrite, with honest compliance notes
argument-hint: "<text to rewrite>"
---

The input may be a reference to earlier conversation content (for example "the previous answer" or "the answer about X"). In that case, take that content from the conversation history as the input; if it is ambiguous which message is meant, name the candidates and ask.

Rewrite the input in ASD-STE100 Simplified Technical English (Issue 9), as close to full compliance as possible. Treat this as an attempt, never a certification.

Apply all of these rules:

- Words: plain, common vocabulary only. Each word carries exactly one meaning and one part of speech in this document. No slang, jargon, idioms, metaphors, or humor. Domain-technical names stay, as nouns or verbs.
- Verbs: simple present, simple past, or simple future only. Active voice in procedures (imperative). Passive only in descriptions, when the doer is unknown or unimportant. No -ing forms except as gerunds or technical nouns. Use approved verb forms; no made-up compounds ("paint up", "repairment").
- Sentences: max 20 words in procedures, max 25 in descriptions. One instruction per procedural sentence, one topic per descriptive sentence. Keep articles; no telegraphic style.
- Noun phrases: max 3 nouns in a cluster. Hyphenate compound adjectives that work together ("low-pressure pump").
- Paragraphs: one topic, max 6 sentences.
- Procedures: each step contains one action. Warnings and cautions come before the step they apply to. Use vertical numbered lists for steps.

After the rewrite, add a section:

COMPLIANCE NOTES

- Likely unapproved words: list every word you used that is probably not in the approved dictionary or is probably used in a non-approved sense, each with the approved alternative if you know one. You do not have the official dictionary in context, so this list is a candidate list, not a verdict.
- Unresolved: words you cannot evaluate at all — mark them "needs dictionary check".
- Unsatisfiable rules: any rule you could not obey without losing required content, and why.
- Judgment calls: places where an STE decision needs a human (approved company term, signal-word fit).

Output: rewritten text first, then COMPLIANCE NOTES. No other commentary.

Input:
${ARGUMENTS:-<paste text to rewrite>}
