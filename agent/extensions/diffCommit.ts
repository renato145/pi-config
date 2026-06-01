import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

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
  text = text.replace(/^```[\w]*\n?/gm, "");
  text = text.replace(/\n?```$/gm, "");
  text = text.replace(/^`+|`+$/g, "");
  return text.trim();
}

export default function (pi: ExtensionAPI) {
  pi.registerCommand("diff-commit", {
    description: "Write a git commit message from staged changes",
    handler: async (args, ctx) => {
      if (!ctx.isIdle()) {
        ctx.ui.notify("Agent is busy", "warning");
        return;
      }

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

      const prompt =
        `Write a concise conventional commit message for these ${source} changes.\n\n` +
        `Rules:\n` +
        `- Format: type(${scope}): subject\n` +
        `- Type: feat, fix, docs, style, refactor, perf, test, or chore\n` +
        `- Subject: imperative mood, lowercase, no period, max 50 chars\n` +
        `- Body: only if the "why" isn't obvious, wrap at 72 chars\n` +
        `- Do not include a "Signed-off-by" line unless requested\n\n` +
        `\`\`\`diff\n${diffResult.stdout}\n\`\`\``;

      let handled = false;
      pi.on("agent_end", async (event, ctx) => {
        if (handled) return;
        handled = true;

        try {
          let messageText = "";
          for (let i = event.messages.length - 1; i >= 0; i--) {
            const msg = event.messages[i];
            if (msg.role === "assistant") {
              messageText = extractText(msg.content);
              break;
            }
          }

          if (!messageText.trim()) {
            ctx.ui.notify("No commit message generated", "warning");
            return;
          }

          const cleanMessage = stripMarkdownCodeBlocks(messageText);

          const editedMessage = await ctx.ui.editor(
            "Edit commit message",
            cleanMessage,
          );

          if (editedMessage === undefined) {
            ctx.ui.notify("Commit cancelled", "info");
            return;
          }

          const trimmedMessage = editedMessage.trim();
          if (!trimmedMessage) {
            ctx.ui.notify("Commit cancelled — empty message", "warning");
            return;
          }

          const commitResult = await pi.exec(
            "git",
            ["commit", "-m", trimmedMessage],
            { cwd: ctx.cwd },
          );

          if (commitResult.code === 0) {
            ctx.ui.notify("Committed successfully", "info");
          } else {
            const err =
              commitResult.stderr.trim() ||
              commitResult.stdout.trim() ||
              "git commit failed";
            ctx.ui.notify(err, "error");
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          ctx.ui.notify(msg, "error");
        }
      });

      pi.sendUserMessage(prompt);
    },
  });
}
