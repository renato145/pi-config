import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

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
    },
  });
}
