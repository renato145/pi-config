/**
 * Pi Config Context Extension
 *
 * Detects when the current working directory is inside the global pi
 * configuration directory and injects a brief reminder into the system prompt.
 */

import * as os from "node:os";
import * as path from "node:path";
import { CONFIG_DIR_NAME, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

function getPiConfigDir(): string {
	const envDir = process.env.PI_CONFIG_DIR;
	if (envDir) {
		return path.resolve(envDir);
	}
	return path.resolve(os.homedir(), CONFIG_DIR_NAME);
}

function isInsidePiConfig(cwd: string): boolean {
	const configDir = getPiConfigDir();
	const resolvedCwd = path.resolve(cwd);
	const relative = path.relative(configDir, resolvedCwd);
	return relative === "" || !relative.startsWith("..");
}

export default function piConfigContext(pi: ExtensionAPI) {
	let active = false;

	pi.on("session_start", async (_event, ctx) => {
		active = isInsidePiConfig(ctx.cwd);
		if (active) {
			ctx.ui.notify("Pi config context active", "info");
		}
	});

	pi.on("before_agent_start", async (event) => {
		if (!active) {
			return;
		}

		const configDir = getPiConfigDir();
		const note =
			"You are operating inside the pi configuration directory " +
			`(${configDir}). The user may be modifying pi's own settings, ` +
			"extensions, skills, themes, or prompts. Treat changes here as " +
			"changes to pi itself and be careful with destructive operations.";

		return {
			systemPrompt: `${event.systemPrompt}\n\n${note}`,
		};
	});
}
