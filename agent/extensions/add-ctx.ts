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
 *   /add-ctx                          fuzzy-search picker (like /model)
 *   Tab after /add-ctx                autocomplete from config keys
 *
 * The resolved content is injected as a persistent custom message that
 * participates in LLM context on subsequent turns.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { Component, Focusable, KeybindingsManager, TUI } from "@earendil-works/pi-tui";
import { Container, fuzzyFilter, Input, Spacer, Text } from "@earendil-works/pi-tui";
import type { Theme } from "@earendil-works/pi-coding-agent";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

const GLOBAL_CONFIG = join(homedir(), ".pi", "agent", "config", "add-ctx.json");
const PROJECT_CONFIG = ".pi/add-ctx.json";
const CUSTOM_TYPE = "add-ctx";

type Config = Record<string, string>;

function isUrl(value: string): boolean {
	return value.startsWith("http://") || value.startsWith("https://");
}

async function readJsonFile(path: string): Promise<Config> {
	try {
		const raw = await readFile(path, "utf8");
		const parsed = JSON.parse(raw);
		if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
			const out: Config = {};
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

/** Run mode: "tui" | "rpc" | "json" | "print". Exists at runtime but not on every ExtensionContext type revision. */
function runMode(ctx: ExtensionContext): string {
	return (ctx as { mode?: string }).mode ?? "print";
}

/** `isProjectTrusted` exists at runtime but is not on every ExtensionContext type revision. */
function projectTrusted(ctx: ExtensionContext): boolean {
	const fn = (ctx as { isProjectTrusted?: () => boolean }).isProjectTrusted;
	return fn ? fn() : true;
}

async function loadConfig(ctx: ExtensionContext): Promise<Config> {
	const globalCfg = await readJsonFile(GLOBAL_CONFIG);
	const projectPath = isAbsolute(PROJECT_CONFIG) ? PROJECT_CONFIG : resolve(ctx.cwd, PROJECT_CONFIG);
	const projectCfg = projectTrusted(ctx) ? await readJsonFile(projectPath) : {};
	return { ...globalCfg, ...projectCfg };
}

/**
 * Sync cache used by getArgumentCompletions (which cannot be async).
 * Preloaded on session_start and refreshed before each command run.
 */
let cachedConfig: Config | null = null;

type CtxEntry = { name: string; source: string };

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

function entriesOf(config: Config): CtxEntry[] {
	return Object.entries(config).map(([name, source]) => ({ name, source }));
}

async function addContexts(names: string[], config: Config, ctx: ExtensionContext, pi: ExtensionAPI): Promise<void> {
	for (const name of names) {
		const source = config[name];
		try {
			const { content, origin } = await resolveContent(source, ctx.cwd);
			pi.sendMessage(
				{
					customType: CUSTOM_TYPE,
					content: formatEntry(name, origin, content),
					display: true,
					details: { name, source: origin },
				},
				{ deliverAs: "nextTurn" },
			);
			ctx.ui.notify(`Added context "${name}" (${content.length} bytes from ${origin})`, "info");
		} catch (e) {
			ctx.ui.notify(`Failed to add context "${name}": ${String((e as Error)?.message ?? e)}`, "error");
		}
	}
}

/**
 * Fuzzy-search selector for context entries, mirroring the `/model` picker:
 * type to filter, arrow keys to move, Enter to select, Esc to cancel.
 */
class ContextSelector extends Container implements Component, Focusable {
	private readonly entries: CtxEntry[];
	private readonly onSelect: (name: string | undefined) => void;
	private readonly keybindings: KeybindingsManager;
	private readonly theme: Theme;
	private readonly tui: TUI;
	private readonly searchInput: Input;
	private readonly listContainer = new Container();
	private readonly hint: Text;
	private filtered: CtxEntry[] = [];
	private selectedIndex = 0;
	private readonly maxVisible = 10;
	private _focused = false;

	get focused(): boolean {
		return this._focused;
	}
	set focused(value: boolean) {
		this._focused = value;
		this.searchInput.focused = value;
	}

	constructor(tui: TUI, theme: Theme, keybindings: KeybindingsManager, entries: CtxEntry[], onSelect: (name: string | undefined) => void) {
		super();
		this.tui = tui;
		this.theme = theme;
		this.keybindings = keybindings;
		this.entries = entries;
		this.onSelect = onSelect;

		this.addChild(new Text(theme.fg("accent", theme.bold("Add context")), 0, 0));
		this.addChild(new Spacer(1));

		this.searchInput = new Input();
		this.searchInput.onSubmit = () => {
			if (this.filtered[this.selectedIndex]) this.select(this.filtered[this.selectedIndex].name);
		};
		this.addChild(this.searchInput);
		this.addChild(new Spacer(1));

		this.addChild(this.listContainer);
		this.addChild(new Spacer(1));

		this.hint = new Text(
			`${theme.fg("muted", "↑↓ navigate")}  ${theme.fg("muted", "enter select")}  ${theme.fg("muted", "esc cancel")}  ${theme.fg("muted", "type to fuzzy-filter")}`,
			0,
			0,
		);
		this.addChild(this.hint);

		this.filtered = [...entries];
		this.updateList();
	}

	private filter(query: string): void {
		this.filtered = query
			? fuzzyFilter(this.entries, query, (e) => `${e.name} ${e.source}`)
			: [...this.entries];
		this.selectedIndex = Math.min(this.selectedIndex, Math.max(0, this.filtered.length - 1));
		this.updateList();
		this.tui.requestRender();
	}

	private updateList(): void {
		this.listContainer.clear();
		const startIndex = Math.max(
			0,
			Math.min(this.selectedIndex - Math.floor(this.maxVisible / 2), this.filtered.length - this.maxVisible),
		);
		const endIndex = Math.min(startIndex + this.maxVisible, this.filtered.length);

		for (let i = startIndex; i < endIndex; i++) {
			const entry = this.filtered[i];
			if (!entry) continue;
			const selected = i === this.selectedIndex;
			const lineText = `${entry.name} ${this.theme.fg("muted", `[${entry.source}]`)}`;
			this.listContainer.addChild(
				new Text(selected ? `${this.theme.fg("accent", "→ ")}${this.theme.fg("accent", lineText)}` : `  ${lineText}`, 0, 0),
			);
		}

		if (startIndex > 0 || endIndex < this.filtered.length) {
			this.listContainer.addChild(
				new Text(this.theme.fg("muted", `  (${this.selectedIndex + 1}/${this.filtered.length})`), 0, 0),
			);
		}

		if (this.filtered.length === 0) {
			this.listContainer.addChild(new Text(this.theme.fg("muted", "  No matching contexts"), 0, 0));
			return;
		}

		const selected = this.filtered[this.selectedIndex];
		this.listContainer.addChild(new Spacer(1));
		this.listContainer.addChild(new Text(this.theme.fg("muted", `  Source: ${selected.source}`), 0, 0));
	}

	private select(name: string): void {
		this.onSelect(name);
	}

	handleInput(keyData: string): void {
		const kb = this.keybindings;
		if (kb.matches(keyData, "tui.select.up")) {
			if (this.filtered.length === 0) return;
			this.selectedIndex = this.selectedIndex === 0 ? this.filtered.length - 1 : this.selectedIndex - 1;
			this.updateList();
			this.tui.requestRender();
		} else if (kb.matches(keyData, "tui.select.down")) {
			if (this.filtered.length === 0) return;
			this.selectedIndex = this.selectedIndex === this.filtered.length - 1 ? 0 : this.selectedIndex + 1;
			this.updateList();
			this.tui.requestRender();
		} else if (kb.matches(keyData, "tui.select.confirm")) {
			const entry = this.filtered[this.selectedIndex];
			if (entry) this.select(entry.name);
		} else if (kb.matches(keyData, "tui.select.cancel")) {
			this.onSelect(undefined);
		} else {
			this.searchInput.handleInput(keyData);
			this.filter(this.searchInput.getValue());
		}
	}

	dispose(): void {
		this.searchInput.focused = false;
	}
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
			return keys.length > 0
				? keys.map((k) => ({ value: k, label: k, description: config[k] }))
				: null;
		},
		handler: async (args, ctx) => {
			cachedConfig = await loadConfig(ctx);
			const config = cachedConfig;
			const names = args.trim().length > 0 ? args.trim().split(/\s+/) : [];

			if (names.length === 0) {
				const entries = entriesOf(config);
				if (entries.length === 0) {
					ctx.ui.notify(
						`No contexts configured. Create ${GLOBAL_CONFIG} or .pi/add-ctx.json with {"name": "path-or-url"}`,
						"warning",
					);
					return;
				}

				if (runMode(ctx) === "tui") {
					// Fuzzy-search picker mirroring /model.
					const choice = await ctx.ui.custom<string | undefined>(
						(tui, theme, keybindings, done) =>
							new ContextSelector(tui, theme, keybindings, entries, done),
					);
					if (!choice) return;
					await addContexts([choice], config, ctx, pi);
					return;
				}

				// Non-TUI (RPC/print/json): fall back to a plain selector / listing.
				if (!ctx.hasUI) {
					ctx.ui.notify(`Available contexts: ${entries.map((e) => e.name).join(", ")}`, "info");
					return;
				}
				const items = entries.map((e) => `${e.name} -> ${e.source}`);
				const picked = await ctx.ui.select("Add context:", items);
				if (!picked) return;
				await addContexts([picked.split(" -> ")[0]], config, ctx, pi);
				return;
			}

			const unknown = names.filter((n) => !(n in config));
			if (unknown.length > 0) {
				ctx.ui.notify(`Unknown context: ${unknown.join(", ")}`, "error");
				return;
			}
			await addContexts(names, config, ctx, pi);
		},
	});
}