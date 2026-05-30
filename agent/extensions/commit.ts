import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { copyToClipboard } from "@earendil-works/pi-coding-agent";

function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const block of content) {
    if (
      block &&
      typeof block === "object" &&
      "type" in block &&
      block.type === "text" &&
      "text" in block &&
      typeof block.text === "string"
    ) {
      parts.push(block.text);
    }
  }
  return parts.join("\n");
}

function stripMarkdownCodeBlocks(text: string): string {
  // Remove triple-backtick code blocks (with optional language tag)
  text = text.replace(/^```[\w]*\n?/gm, "");
  text = text.replace(/\n?```$/gm, "");
  // Remove inline single-backtick wrapping
  text = text.replace(/^`+|`+$/g, "");
  return text.trim();
}

export default function (pi: ExtensionAPI) {
  pi.registerCommand("commit", {
    description: "Write a git commit message from staged changes",
    handler: async (args, ctx) => {
      if (!ctx.isIdle()) {
        ctx.ui.notify("Agent is busy", "warning");
        return;
      }

      // Try staged first, fall back to unstaged
      let diffResult = await pi.exec("git", ["diff", "--cached"], {
        cwd: ctx.cwd,
      });
      let source = "staged";

      if (!diffResult.stdout.trim()) {
        diffResult = await pi.exec("git", ["diff"], { cwd: ctx.cwd });
        source = "unstaged";

        if (!diffResult.stdout.trim()) {
          ctx.ui.notify("No changes to commit", "info");
          return;
        }
      }

      const scope = args.trim()
        ? `scope: ${args.trim()}`
        : "infer the scope from the changes";

      const beforeCount = ctx.sessionManager.getBranch().length;

      pi.sendUserMessage(
        `Write a concise conventional commit message for these ${source} changes.\n\n` +
          `Rules:\n` +
          `- Format: type(${scope}): subject\n` +
          `- Type: feat, fix, docs, style, refactor, perf, test, or chore\n` +
          `- Subject: imperative mood, lowercase, no period, max 50 chars\n` +
          `- Body: only if the "why" isn't obvious, wrap at 72 chars\n` +
          `- Do not include a "Signed-off-by" line unless requested\n\n` +
          `\`\`\`diff\n${diffResult.stdout}\n\`\`\``,
      );

      await ctx.waitForIdle();

      const branch = ctx.sessionManager.getBranch();
      let messageText = "";
      for (let i = branch.length - 1; i >= beforeCount; i--) {
        const entry = branch[i];
        if (entry.type === "message" && entry.message?.role === "assistant") {
          messageText = extractText(entry.message.content);
          break;
        }
      }

      if (!messageText.trim()) {
        ctx.ui.notify("No commit message generated", "warning");
        return;
      }

      const cleanMessage = stripMarkdownCodeBlocks(messageText);

      try {
        await copyToClipboard(cleanMessage);
        ctx.ui.notify("Commit message copied to clipboard", "info");
      } catch {
        ctx.ui.notify("Failed to copy commit message to clipboard", "warning");
      }
    },
  });
}
