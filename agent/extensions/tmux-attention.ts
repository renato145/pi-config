/**
 * Tmux attention marker for pi.
 *
 * Marks the tmux pane running pi when the session needs attention:
 *   - "input" — pi is blocked on a dialog (permission prompt, confirm, editor, ...)
 *   - "done"  — the agent settled and is waiting for the user
 *
 * The marker is the per-pane tmux user option `@pi_attention`, read by the
 * status-bar module in `tmux/.config/tmux/tmux.conf` and cleared by the
 * `pane-focus-in` hook (you have looked at the pane) or the next user prompt.
 * Everything is a no-op outside tmux and in non-interactive modes.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const ATTENTION_OPTION = "@pi_attention";
const COUNT_OPTION = "@pi_attention_count";

type AttentionState = "input" | "done";

export default function tmuxAttention(pi: ExtensionAPI) {
  const pane = process.env.TMUX_PANE;
  if (!pane) return;

  // State mutations run through one queue so overlapping events (a prompt
  // closing while the agent settles) land on tmux in the order they fired.
  let queue: Promise<void> = Promise.resolve();
  const enqueue = (work: () => Promise<void>) => {
    queue = queue.then(work).catch(() => {});
  };

  const runTmux = async (...args: string[]): Promise<string> => {
    const result = await pi.exec("tmux", args);
    return result.stdout ?? "";
  };

  const setPaneState = (state: AttentionState) =>
    runTmux("set-option", "-q", "-p", "-t", pane, ATTENTION_OPTION, state);

  const clearPaneState = () =>
    runTmux("set-option", "-q", "-p", "-t", pane, "-u", ATTENTION_OPTION);

  const recount = async () => {
    const out = await runTmux("list-panes", "-a", "-F", `#{${ATTENTION_OPTION}}`);
    const count = out.split("\n").filter((line) => line.trim() !== "").length;
    if (count > 0) {
      await runTmux("set-option", "-q", "-g", COUNT_OPTION, String(count));
    } else {
      await runTmux("set-option", "-q", "-g", "-u", COUNT_OPTION);
    }
  };

  const refreshStatus = () => runTmux("refresh-client", "-S");

  const mark = (state: AttentionState) =>
    enqueue(async () => {
      await setPaneState(state);
      await recount();
      await refreshStatus();
    });

  const unmark = () =>
    enqueue(async () => {
      await clearPaneState();
      await recount();
      await refreshStatus();
    });

  // A pane counts as "on screen" only when a focused client is attached to its
  // session AND its window is the session's current window AND it is the
  // window's active pane. Checking any one of these alone misfires: when the
  // user switches to another window (or session), the pi pane keeps
  // pane_active=1 while clearly not being watched.
  const isOnScreen = async () => {
    try {
      const query = async (format: string) =>
        (await runTmux("display-message", "-p", "-t", pane, format)).trim();
      if ((await query("#{window_active}")) !== "1") return false;
      if ((await query("#{pane_active}")) !== "1") return false;
      const sessionId = await query("#{session_id}");
      const clients = await runTmux("list-clients", "-F", "#{client_session}\t#{client_flags}");
      return clients.split("\n").some((line) => {
        const [clientSession, flags] = line.split("\t");
        return (
          clientSession === sessionId &&
          (flags ?? "")
            .split(",")
            .map((flag) => flag.trim())
            .includes("focused")
        );
      });
    } catch {
      // Cannot tell: prefer marking over staying silent.
      return false;
    }
  };

  pi.on("session_start", () => {
    unmark();
  });

  pi.on("before_agent_start", () => {
    // The user just submitted a prompt; the pane is attended.
    unmark();
  });

  pi.on("ui_prompt_start", () => {
    mark("input");
  });

  pi.on("ui_prompt_end", () => {
    unmark();
  });

  pi.on("agent_settled", (event) => {
    if (event.aborted) return; // The user pressed Escape, they are right here.
    enqueue(async () => {
      if (await isOnScreen()) return;
      await setPaneState("done");
      await recount();
      await refreshStatus();
    });
  });

  pi.on("session_shutdown", () => {
    unmark();
  });
}
