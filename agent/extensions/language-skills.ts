/**
 * Language Skills Bridge Extension
 *
 * Detects the programming languages used in the current repository and
 * injects language-specific skill content into the system prompt only
 * when that language is detected.
 *
 * Skills live in language-skills/ (not the standard skills/ path) so Pi
 * does not auto-discover them. This keeps them out of the system prompt
 * unless the repository actually uses that language.
 *
 * Convention: {language-skills-dir}/{language}/{topic}.md
 *   e.g. ~/.pi/agent/language-skills/rust/guidelines.md
 *
 * Commands:
 *   /lang-skills  - Preview the prompt that would be injected
 *
 * Usage:
 * 1. Place this file in ~/.pi/agent/extensions/ (global) or .pi/extensions/ (project)
 * 2. Create language-specific skills in ~/.pi/agent/language-skills/ or .pi/language-skills/
 *    Named by convention: {language}/{topic}.md (e.g., rust/guidelines.md)
 * 3. The extension auto-detects languages and injects matching skill content.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/* ------------------------------------------------------------------ */
/*  Language detection heuristics                                      */
/* ------------------------------------------------------------------ */

interface LanguageDef {
	name: string;
	display: string;
	markers: string[];
}

const LANGUAGES: LanguageDef[] = [
	{ name: "rust", display: "Rust", markers: ["Cargo.toml", "Cargo.lock"] },
	{ name: "python", display: "Python", markers: ["pyproject.toml", "setup.py", "requirements.txt", "Pipfile", "poetry.lock"] },
	{ name: "go", display: "Go", markers: ["go.mod", "go.sum"] },
	{ name: "typescript", display: "TypeScript", markers: ["tsconfig.json"] },
	{ name: "javascript", display: "JavaScript", markers: ["package.json", "package-lock.json", "yarn.lock", "pnpm-lock.yaml"] },
	{ name: "java", display: "Java", markers: ["pom.xml", "build.gradle", "build.gradle.kts"] },
	{ name: "ruby", display: "Ruby", markers: ["Gemfile", "Gemfile.lock", ".gemspec"] },
	{ name: "csharp", display: "C#", markers: [".csproj", ".sln"] },
	{ name: "cpp", display: "C++", markers: ["CMakeLists.txt", "Makefile"] },
	{ name: "elixir", display: "Elixir", markers: ["mix.exs", "mix.lock"] },
	{ name: "php", display: "PHP", markers: ["composer.json", "composer.lock"] },
	{ name: "swift", display: "Swift", markers: ["Package.swift"] },
	{ name: "kotlin", display: "Kotlin", markers: ["build.gradle.kts"] },
	{ name: "scala", display: "Scala", markers: ["build.sbt"] },
	{ name: "haskell", display: "Haskell", markers: ["stack.yaml", "cabal.project", "package.yaml"] },
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function dirExists(p: string): boolean {
	try { return fs.statSync(p).isDirectory(); } catch { return false; }
}

function fileExists(p: string): boolean {
	try { return fs.statSync(p).isFile(); } catch { return false; }
}

function scanDirForMarkers(dir: string): Set<string> {
	const found = new Set<string>();
	if (!dirExists(dir)) return found;

	const entries = fs.readdirSync(dir, { withFileTypes: true });
	for (const entry of entries) {
		if (!entry.isFile()) continue;
		for (const lang of LANGUAGES) {
			for (const marker of lang.markers) {
				if (marker.startsWith(".") ? entry.name.endsWith(marker) : entry.name === marker) {
					found.add(lang.name);
				}
			}
		}
	}
	return found;
}

function detectLanguages(cwd: string): string[] {
	const found = new Set<string>();

	// Root
	for (const lang of scanDirForMarkers(cwd)) found.add(lang);

	// One level deep (monorepo packages/)
	const entries = fs.readdirSync(cwd, { withFileTypes: true });
	for (const entry of entries) {
		if (entry.isDirectory()) {
			for (const lang of scanDirForMarkers(path.join(cwd, entry.name))) found.add(lang);
		}
	}

	// TS supersedes plain JS
	if (found.has("typescript") && found.has("javascript")) {
		found.delete("javascript");
	}

	return Array.from(found);
}

/* ------------------------------------------------------------------ */
/*  Skill discovery (non-standard path, not auto-scanned by Pi)        */
/* ------------------------------------------------------------------ */

interface FoundSkill {
	name: string;        // e.g. "rust-guidelines"
	language: string;    // e.g. "rust"
	topic: string;       // e.g. "guidelines"
	skillPath: string;   // absolute path
	content: string;     // file contents
}

/**
 * Scan a language-skills directory for skills matching detected languages.
 * Convention: {baseDir}/{language}/{topic}.md
 */
function findLanguageSkills(baseDir: string, detectedLangs: string[]): FoundSkill[] {
	const results: FoundSkill[] = [];
	if (!dirExists(baseDir)) return results;

	for (const lang of detectedLangs) {
		const langDir = path.join(baseDir, lang);
		if (!dirExists(langDir)) continue;

		const entries = fs.readdirSync(langDir, { withFileTypes: true });
		for (const entry of entries) {
			if (!entry.isFile()) continue;
			if (!entry.name.endsWith(".md")) continue;

			const topic = entry.name.replace(/\.md$/, "");
			const skillPath = path.join(langDir, entry.name);
			const content = fs.readFileSync(skillPath, "utf-8");
			results.push({
				name: `${lang}-${topic}`,
				language: lang,
				topic,
				skillPath,
				content,
			});
		}
	}

	return results;
}

function stripFrontmatter(text: string): string {
	const lines = text.split("\n");
	if (lines[0].trim() === "---") {
		const end = lines.findIndex((l, i) => i > 0 && l.trim() === "---");
		if (end !== -1) {
			return lines.slice(end + 1).join("\n").trimStart();
		}
	}
	return text;
}

/* ------------------------------------------------------------------ */
/*  Prompt builder (shared by command and event handler)               */
/* ------------------------------------------------------------------ */

function buildPromptSection(repoRoot: string, detectedLangs: string[]): string | null {
	if (detectedLangs.length === 0) return null;

	const searchPaths = [
		path.join(repoRoot, ".pi", "language-skills"),
		path.join(process.env.HOME ?? "", ".pi", "agent", "language-skills"),
	];

	const allSkills: FoundSkill[] = [];
	for (const dir of searchPaths) {
		allSkills.push(...findLanguageSkills(dir, detectedLangs));
	}

	if (allSkills.length === 0) return null;

	// Deduplicate by skill name (project-local wins over global)
	const byName = new Map<string, FoundSkill>();
	for (const skill of allSkills) {
		byName.set(skill.name, skill);
	}
	const uniqueSkills = Array.from(byName.values());

	const sections: string[] = [];
	for (const skill of uniqueSkills) {
		const body = stripFrontmatter(skill.content);
		sections.push(`## Skill: ${skill.name}\n\n${body}`);
	}

	return `
## Repository Language Skills

The following skills are active because their associated languages were detected in this workspace.

${sections.join("\n\n---\n\n")}
`;
}

/* ------------------------------------------------------------------ */
/*  Extension                                                          */
/* ------------------------------------------------------------------ */

export default function languageSkillsExtension(pi: ExtensionAPI) {
	let detectedLangs: string[] = [];
	let repoRoot = "";

	pi.on("session_start", async (_event, ctx) => {
		repoRoot = ctx.cwd;
		detectedLangs = detectLanguages(repoRoot);

		if (detectedLangs.length > 0) {
			const list = detectedLangs
				.map((l) => LANGUAGES.find((d) => d.name === l)?.display ?? l)
				.join(", ");
			ctx.ui.notify?.(`Languages detected: ${list}`, "info");
		}
	});

	pi.on("before_agent_start", async (event) => {
		const section = buildPromptSection(repoRoot, detectedLangs);
		if (!section) return;

		return {
			systemPrompt: event.systemPrompt + section,
		};
	});

	// Debug command: preview the injected prompt
	pi.registerCommand("lang-skills", {
		description: "Preview the language skills prompt that would be injected",
		handler: async (_args, ctx) => {
			if (detectedLangs.length === 0) {
				ctx.ui.notify("No languages detected in this workspace.", "warning");
				return;
			}

			const section = buildPromptSection(repoRoot, detectedLangs);
			if (!section) {
				ctx.ui.notify(`Languages detected (${detectedLangs.join(", ")}) but no matching skills found.`, "warning");
				return;
			}

			const lines = [
				"**Language Skills Debug Output**",
				"",
				`Detected languages: ${detectedLangs.join(", ")}`,
				"",
				"---",
				section,
				"---",
			];

			pi.sendMessage(
				{
					customType: "lang-skills-debug",
					content: lines.join("\n"),
					display: true,
				},
				{ triggerTurn: false },
			);
		},
	});
}
