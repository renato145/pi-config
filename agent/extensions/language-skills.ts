/**
 * Language Skills Bridge Extension
 *
 * Detects the programming languages used in the current repository and
 * exposes matching language-specific skills to Pi via the
 * `resources_discover` event. Pi then discovers them as regular skills,
 * loading them on-demand (progressive disclosure) without any files
 * created in the working repository.
 *
 * Convention:
 *   ~/.pi/agent/language-skills/{language}-{topic}/SKILL.md
 *   e.g. ~/.pi/agent/language-skills/rust-guidelines/SKILL.md
 *
 * Why directory-based:
 *   Pi's skill discovery requires each skill to be a directory containing
 *   SKILL.md. Arbitrary .md files in nested folders are not discovered.
 *
 * Commands:
 *   /lang-skills  - Show detected languages and matching skill paths
 *
 * Usage:
 * 1. Place this file in ~/.pi/agent/extensions/ (global) or .pi/extensions/ (project)
 * 2. Create language-specific skills in ~/.pi/agent/language-skills/
 *    Named by convention: {language}-{topic}/SKILL.md
 * 3. The extension auto-detects languages and exposes matching skills to Pi.
 */

import * as fs from "node:fs";
import * as os from "node:os";
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
  {
    name: "python",
    display: "Python",
    markers: [
      "pyproject.toml",
      "setup.py",
      "requirements.txt",
      "Pipfile",
      "poetry.lock",
      "src/__init__.py",
      "main.py",
    ],
  },
  { name: "go", display: "Go", markers: ["go.mod", "go.sum"] },
  { name: "typescript", display: "TypeScript", markers: ["tsconfig.json"] },
  {
    name: "javascript",
    display: "JavaScript",
    markers: [
      "package.json",
      "package-lock.json",
      "yarn.lock",
      "pnpm-lock.yaml",
    ],
  },
  {
    name: "java",
    display: "Java",
    markers: ["pom.xml", "build.gradle", "build.gradle.kts"],
  },
  {
    name: "ruby",
    display: "Ruby",
    markers: ["Gemfile", "Gemfile.lock", ".gemspec"],
  },
  { name: "csharp", display: "C#", markers: [".csproj", ".sln"] },
  { name: "cpp", display: "C++", markers: ["CMakeLists.txt", "Makefile"] },
  { name: "elixir", display: "Elixir", markers: ["mix.exs", "mix.lock"] },
  { name: "php", display: "PHP", markers: ["composer.json", "composer.lock"] },
  { name: "swift", display: "Swift", markers: ["Package.swift"] },
  { name: "kotlin", display: "Kotlin", markers: ["build.gradle.kts"] },
  { name: "scala", display: "Scala", markers: ["build.sbt"] },
  {
    name: "haskell",
    display: "Haskell",
    markers: ["stack.yaml", "cabal.project", "package.yaml"],
  },
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function dirExists(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function fileExists(p: string): boolean {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function scanDirForMarkers(dir: string): Set<string> {
  const found = new Set<string>();
  if (!dirExists(dir)) return found;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    for (const lang of LANGUAGES) {
      for (const marker of lang.markers) {
        if (
          marker.startsWith(".")
            ? entry.name.endsWith(marker)
            : entry.name === marker
        ) {
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
      for (const lang of scanDirForMarkers(path.join(cwd, entry.name)))
        found.add(lang);
    }
  }

  // TS supersedes plain JS
  if (found.has("typescript") && found.has("javascript")) {
    found.delete("javascript");
  }

  return Array.from(found);
}

/* ------------------------------------------------------------------ */
/*  Skill source discovery                                             */
/* ------------------------------------------------------------------ */

interface FoundSkill {
  name: string; // e.g. "rust-guidelines"
  language: string; // e.g. "rust"
  skillDir: string; // absolute path to skill directory
}

const LANGUAGE_SKILLS_ROOT = path.join(
  os.homedir(),
  ".pi",
  "agent",
  "language-skills",
);

/**
 * Scan the language-skills root for skills matching detected languages.
 * Convention: {root}/{language}-{topic}/SKILL.md
 */
function findLanguageSkills(detectedLangs: string[]): FoundSkill[] {
  const results: FoundSkill[] = [];
  if (!dirExists(LANGUAGE_SKILLS_ROOT)) return results;

  const entries = fs.readdirSync(LANGUAGE_SKILLS_ROOT, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    // Match naming convention: {language}-{topic} or just {language}
    const match = detectedLangs.find(
      (lang) => entry.name === lang || entry.name.startsWith(`${lang}-`),
    );
    if (!match) continue;

    const skillDir = path.join(LANGUAGE_SKILLS_ROOT, entry.name);
    if (!fileExists(path.join(skillDir, "SKILL.md"))) continue;

    results.push({
      name: entry.name,
      language: match,
      skillDir,
    });
  }

  return results;
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

    if (detectedLangs.length === 0) return;

    const skills = findLanguageSkills(detectedLangs);
    const displayNames = detectedLangs
      .map((l) => LANGUAGES.find((d) => d.name === l)?.display ?? l)
      .join(", ");

    if (skills.length > 0) {
      ctx.ui.notify?.(
        `Languages: ${displayNames} — Skills: ${skills.map((s) => s.name).join(", ")}`,
        "info",
      );
    } else {
      ctx.ui.notify?.(`Languages: ${displayNames} — no skills found`, "info");
    }
  });

  // Expose matching skills to Pi as regular skill directories
  pi.on("resources_discover", async (event) => {
    // Use event.cwd for reloads (may differ from original repoRoot)
    const cwd = event.cwd;
    const langs = detectLanguages(cwd);
    const skills = findLanguageSkills(langs);

    if (skills.length === 0) {
      return { skillPaths: [] };
    }

    return {
      skillPaths: skills.map((s) => s.skillDir),
    };
  });

  // Debug command: show detected languages and matching skill paths
  pi.registerCommand("lang-skills", {
    description: "Show detected languages and matching language skill paths",
    handler: async (_args, ctx) => {
      if (detectedLangs.length === 0) {
        ctx.ui.notify("No languages detected in this workspace.", "warning");
        return;
      }

      const skills = findLanguageSkills(detectedLangs);
      const lines = [
        "**Language Skills Status**",
        "",
        `Detected languages: ${detectedLangs.join(", ")}`,
        "",
        "Matching skills:",
        ...(skills.length > 0
          ? skills.map((s) => `  - ${s.name} -> ${s.skillDir}`)
          : ["  (none)"]),
        "",
        "Language skills root:",
        `  ${LANGUAGE_SKILLS_ROOT}`,
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
