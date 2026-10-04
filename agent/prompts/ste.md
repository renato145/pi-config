---
description: Rewrite or explain input in ~80% ASD-STE100 Simplified Technical English
argument-hint: "<text to rewrite, or topic to explain>"
---

Rewrite or explain the input below in Simplified Technical English (ASD-STE100), at roughly 80% of the full standard's strictness. This is the sweet spot: short, unambiguous, mechanical prose — without the content loss that full-spec compliance causes.

The input may be a reference to earlier conversation content (for example "the previous answer" or "the answer about X"). In that case, take that content from the conversation history as the input; if it is ambiguous which message is meant, name the candidates and ask.

If the input is a topic or question: explain it. If the input is prose: rewrite it. Decide from the input, do not ask.

Rules to apply:

- Keep every fact. Nothing may be dropped, softened, or summarized away. Brevity comes from style, not deletion. If a fact genuinely does not fit, move it to a "Preserved facts" note at the end instead of losing it.
- One instruction or one idea per sentence. Procedural sentences: max 20 words. Descriptive sentences: max 25.
- Active voice; imperative mood for steps. Simple tenses only — no perfect, continuous, or conditional stacking.
- One word = one meaning = one part of speech. Pick one term per concept and keep it everywhere (never alternate between "folder" and "directory").
- Plain words over fancy words. No idioms, metaphors, slang, or humor.
- Max 3 nouns in a row; break up longer noun stacks with prepositions.
- Keep articles (a/an/the). No telegraphic style.
- One topic per paragraph, max 6 sentences.
- Domain-technical terms stay — as nouns, defined once if uncommon.

The 80% relaxation: apply the sentence, tense, voice, and terminology rules fully, but use whatever words the content requires even when they are not in the approved dictionary. Never compensate for a hard word by deleting its meaning.

Output: plain text only. No preamble, no commentary on what changed.

Input:
${ARGUMENTS:-<paste text to rewrite, or the topic to explain>}
