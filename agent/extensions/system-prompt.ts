/**
 * System Prompt Dump Extension
 *
 * Provides a /system-prompt command to inspect the full system prompt
 * that Pi sends to the LLM, including any extensions' modifications.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
	pi.registerCommand("system-prompt", {
		description: "Dump the current system prompt as seen by the LLM",
		handler: async (_args, ctx) => {
			const prompt = ctx.getSystemPrompt();
			pi.sendMessage(
				{
					customType: "system-prompt-dump",
					content: `**System Prompt** (${prompt.length} chars)\n\n\`\`\`\n${prompt}\n\`\`\``,
					display: true,
				},
				{ triggerTurn: false },
			);
		},
	});
}
