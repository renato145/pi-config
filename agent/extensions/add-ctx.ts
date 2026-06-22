/**
 * Add-Context Extension
 *
 * Adds extra reference context to the current pi session via `/add-ctx`.
 * Context sources are declared in a JSON config file mapping a short name to
 * either a local file path or an HTTP/HTTPS URL.
 *
 * Config locations (merged, project-local wins on name conflicts):
 *   - ~/.pi/agent/config/add-ctx.json   (global)
 *   - .pi/add-ctx.json                   (project-local, only if project is trusted)
 *
 * Config format:
 *   {
 *     "somelib": "somelib-ctx.txt",
 *     "python-fasthtml": "https://www.fastht.ml/docs/llms-ctx.txt"
 *   }
 *
 * Usage:
 *   /add-ctx somelib                  add the "somelib" context
 *   /add-ctx somelib python-fasthtml  add several at once
 *   /add-ctx                          pick from a selector
 *   Tab after /add-ctx                autocomplete from config keys
 *
 * The resolved content is injected as a persistent custom message that
 * participates in LLM context on subsequent turns.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

const GLOBAL_CONFIG = join(homedir(), ".pi", "agent", "config", "add-ctx.json");
const PROJECT_CONFIG = ".pi/add-ctx.json";
const CUSTOM_TYPE = "add-ctx";

function isUrl(value: string): boolean {
	return value.startsWith("http://") || value.startsWith("https://");
}

async function readJsonFile(path: string): Promise<Record<string, string>> {
	try {
		const raw = await readFile(path, "utf8");
		const parsed = JSON.parse(raw);
		if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
			const out: Record<string, string> = {};
			for (const [k, v] of Object.entries(parsed)) {
				if (typeof v === "string") out[k] = v;
			}
			return out;
		}
	} catch {
		// missing or invalid config: ignore
	}
	return {};
}

/** `isProjectTrusted` exists at runtime but is not on every ExtensionContext type revision. */
function projectTrusted(ctx: ExtensionContext): boolean {
	const fn = (ctx as { isProjectTrusted?: () => boolean }).isProjectTrusted;
	return fn ? fn() : true;
}

async function loadConfig(ctx: ExtensionContext): Promise<Record<string, string>> {
	const globalCfg = await readJsonFile(GLOBAL_CONFIG);
	const projectPath = isAbsolute(PROJECT_CONFIG) ? PROJECT_CONFIG : resolve(ctx.cwd, PROJECT_CONFIG);
	const projectCfg = projectTrusted(ctx) ? await readJsonFile(projectPath) : {};
	return { ...globalCfg, ...projectCfg };
}

/**
 * Sync cache used by getArgumentCompletions (which cannot be async).
 * Preloaded on session_start and refreshed before each command run.
 */
let cachedConfig: Record<string, string> | null = null;

async function resolveContent(source: string, cwd: string): Promise<{ content: string; origin: string }> {
	if (isUrl(source)) {
		const res = await fetch(source, { redirect: "follow" });
		if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
		return { content: await res.text(), origin: source };
	}

	// Local file: try cwd-relative first, then config-dir-relative, then absolute.
	const candidates = [resolve(cwd, source), resolve(join(homedir(), ".pi", "agent", "config"), source)];
	if (isAbsolute(source)) candidates.unshift(source);

	let lastErr: unknown;
	for (const path of candidates) {
		try {
			return { content: await readFile(path, "utf8"), origin: path };
		} catch (e) {
			lastErr = e;
		}
	}
	throw new Error(`Could not read file "${source}" (tried: ${candidates.join(", ")}). ${String(lastErr)}`);
}

function formatEntry(name: string, origin: string, content: string): string {
	return `<added-context name="${name}" source="${origin}">\n${content}\n</added-context>`;
}

export default function addCtxExtension(pi: ExtensionAPI) {
	pi.on("session_start", async (_event, ctx) => {
		cachedConfig = await loadConfig(ctx);
	});

	pi.registerCommand("add-ctx", {
		description: "Add reference context to this session (from add-ctx.json config)",
		getArgumentCompletions: (prefix) => {
			const config = cachedConfig ?? {};
			const keys = Object.keys(config).filter((k) => k.startsWith(prefix));
			return keys.length > 0 ? keys.map((k) => ({ value: k, label: k })) : null;
		},
		handler: async (args, ctx) => {
			cachedConfig = await loadConfig(ctx);
			const config = cachedConfig;
			const names = args.trim().length > 0 ? args.trim().split(/\s+/) : [];

			if (names.length === 0) {
				const keys = Object.keys(config);
				if (keys.length === 0) {
					ctx.ui.notify(
						`No contexts configured. Create ${GLOBAL_CONFIG} or .pi/add-ctx.json with {"name": "path-or-url"}`,
						"warning",
					);
					return;
				}
				if (!ctx.hasUI) {
					ctx.ui.notify(`Available contexts: ${keys.join(", ")}`, "info");
					return;
				}
				const items = keys.map((k) => `${k} -> ${config[k]}`);
				const choice = await ctx.ui.select("Add context:", items);
				if (!choice) return;
				names.push(choice.split(" -> ")[0]);
			}

			const unknown = names.filter((n) => !(n in config));
			if (unknown.length > 0) {
				ctx.ui.notify(`Unknown context: ${unknown.join(", ")}`, "error");
				return;
			}

			for (const name of names) {
				const source = config[name];
				try {
					const { content, origin } = await resolveContent(source, ctx.cwd);
					pi.sendMessage(
						{ customType: CUSTOM_TYPE, content: formatEntry(name, origin, content), display: true, details: { name, source: origin } },
						{ deliverAs: "nextTurn" },
					);
					ctx.ui.notify(`Added context "${name}" (${content.length} bytes from ${origin})`, "info");
				} catch (e) {
					ctx.ui.notify(`Failed to add context "${name}": ${String((e as Error)?.message ?? e)}`, "error");
				}
			}
		},
	});
}