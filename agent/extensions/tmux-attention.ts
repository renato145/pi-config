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
 * Everything is a no-op outside tmux and without a UI (scripted runs).
 *
 * Set PI_TMUX_ATTENTION_DEBUG to a file path to log every decision
 * (events, marks, suppressions, failures).
 */

import { appendFileSync } from "node:fs";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const ATTENTION_OPTION = "@pi_attention";
const COUNT_OPTION = "@pi_attention_count";

type AttentionState = "input" | "done";

export default function tmuxAttention(pi: ExtensionAPI) {
  const pane = process.env.TMUX_PANE;
  if (!pane) return;

  const debug = (message: string) => {
    const path = process.env.PI_TMUX_ATTENTION_DEBUG;
    if (!path) return;
    try {
      appendFileSync(path, `${new Date().toISOString()} ${message}\n`);
    } catch {
      // Debug logging is best-effort; never let it disrupt the agent.
    }
  };

  // State mutations run through one queue so overlapping events (a prompt
  // closing while the agent settles) land on tmux in the order they fired.
  let queue: Promise<void> = Promise.resolve();
  const enqueue = (work: () => Promise<void>) => {
    queue = queue.then(work).catch((error: unknown) => {
      debug(`queue error: ${error instanceof Error ? error.message : error}`);
    });
  };

  // pi.exec never rejects (it resolves {code, stdout, stderr}), so treat a
  // nonzero exit as failure: the queue keeps the last known state instead of
  // acting on empty output (which would, for example, zero a valid count).
  const runTmux = async (...args: string[]): Promise<string> => {
    const result = await pi.exec("tmux", args, { timeout: 2000 });
    if (result.code !== 0) {
      throw new Error(`tmux ${args[0]} failed: ${result.stderr.trim()}`);
    }
    return result.stdout;
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

  const finalize = async (state?: AttentionState) => {
    if (state) await setPaneState(state);
    else await clearPaneState();
    await recount();
    await refreshStatus();
  };

  // A pane counts as "on screen" only when a focused client is attached to its
  // session AND its window is the session's current window AND it is the
  // window's active pane. Checking any one of these alone misfires: when the
  // user switches to another window (or session), the pi pane keeps
  // pane_active=1 while clearly not being watched.
  const isOnScreen = async () => {
    try {
      const [windowActive, paneActive, sessionId] = (
        await runTmux(
          "display-message",
          "-p",
          "-t",
          pane,
          "#{window_active} #{pane_active} #{session_id}",
        )
      )
        .trim()
        .split(/\s+/);
      if (windowActive !== "1" || paneActive !== "1" || !sessionId) return false;
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

  pi.on("session_start", (_event, ctx) => {
    if (!ctx.hasUI) return;
    debug("session_start; clearing");
    enqueue(() => finalize());
  });

  pi.on("before_agent_start", (_event, ctx) => {
    if (!ctx.hasUI) return;
    debug("before_agent_start; user engaged, clearing");
    enqueue(() => finalize());
  });

  pi.on("ui_prompt_start", (_event, ctx) => {
    if (!ctx.hasUI) return;
    debug("ui_prompt_start; marking input");
    enqueue(() => finalize("input"));
  });

  pi.on("ui_prompt_end", (_event, ctx) => {
    if (!ctx.hasUI) return;
    debug("ui_prompt_end; clearing");
    enqueue(() => finalize());
  });

  pi.on("agent_settled", (event, ctx) => {
    if (!ctx.hasUI) return;
    if (event.aborted) {
      debug("settled aborted; user is right here");
      return;
    }
    enqueue(async () => {
      if (await isOnScreen()) {
        debug("settled on screen; suppressed");
        return;
      }
      debug("settled off screen; marking done");
      await finalize("done");
    });
  });

  pi.on("session_shutdown", (_event, ctx) => {
    if (!ctx.hasUI) return;
    debug("session_shutdown; clearing");
    enqueue(() => finalize());
  });
}
