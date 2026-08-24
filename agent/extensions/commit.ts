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

type PendingCommit = { cwd: string } | null;

export default function (pi: ExtensionAPI) {
  let pendingCommit: PendingCommit = null;

  pi.on("agent_settled", async (_event, ctx) => {
    if (!pendingCommit) return;
    const { cwd } = pendingCommit;
    pendingCommit = null;

    try {
      const entries = ctx.sessionManager.getEntries();
      let messageText = "";
      for (let i = entries.length - 1; i >= 0; i--) {
        const entry = entries[i];
        if (entry.type === "message" && entry.message.role === "assistant") {
          messageText = extractText(entry.message.content);
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

      const commitResult = await pi.exec("git", ["commit", "-m", trimmedMessage], {
        cwd,
      });

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

  pi.registerCommand("commit", {
    description: "Write a commit message for the latest changes you made",
    handler: async (_args, ctx) => {
      if (!ctx.isIdle()) {
        ctx.ui.notify("Agent is busy", "warning");
        return;
      }

      const prompt =
        `Write a concise conventional commit message for the latest changes you made.\n\n` +
        `Rules:\n` +
        `- Format: type: subject\n` +
        `- Type: feat, fix, docs, style, refactor, perf, test, or chore\n` +
        `- Subject: imperative mood, lowercase, no period, max 50 chars\n` +
        `- Body: only if the "why" isn't obvious, wrap at 72 chars`;

      pendingCommit = { cwd: ctx.cwd };
      pi.sendUserMessage(prompt);
    },
  });
}
