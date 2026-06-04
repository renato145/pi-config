/**
 * Language Skills Bridge Extension
 *
 * Detects the programming languages used in the current repository and
 * appends a lightweight prompt section mapping detected languages to
 * available language-specific skills.
 *
 * Usage:
 * 1. Place this file in ~/.pi/agent/extensions/ (global) or .pi/extensions/ (project)
 * 2. Create language-specific skills in ~/.pi/agent/skills/ or .pi/skills/
 *    Named by convention: {language}-{topic}/SKILL.md (e.g., rust-guidelines/)
 * 3. The extension will auto-detect languages and tell the agent which skills
 *    to consider loading.
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
  // Optional: files that, if present, suggest this language is primary
  strongMarkers?: string[];
}

const LANGUAGES: LanguageDef[] = [
  {
    name: "rust",
    display: "Rust",
    markers: ["Cargo.toml", "Cargo.lock"],
    strongMarkers: ["Cargo.toml"],
  },
  {
    name: "python",
    display: "Python",
    markers: [
      "pyproject.toml",
      "setup.py",
      "requirements.txt",
      "Pipfile",
      "poetry.lock",
    ],
    strongMarkers: ["pyproject.toml", "setup.py"],
  },
  // {
  //   name: "go",
  //   display: "Go",
  //   markers: ["go.mod", "go.sum"],
  //   strongMarkers: ["go.mod"],
  // },
  {
    name: "typescript",
    display: "TypeScript",
    markers: ["tsconfig.json", "package.json"],
    strongMarkers: ["tsconfig.json"],
  },
  {
    name: "javascript",
    display: "JavaScript",
    markers: [
      "package.json",
      "package-lock.json",
      "yarn.lock",
      "pnpm-lock.yaml",
    ],
    strongMarkers: [],
  },
  // {
  //   name: "java",
  //   display: "Java",
  //   markers: ["pom.xml", "build.gradle", "build.gradle.kts"],
  //   strongMarkers: ["pom.xml", "build.gradle"],
  // },
  // {
  //   name: "ruby",
  //   display: "Ruby",
  //   markers: ["Gemfile", "Gemfile.lock", ".gemspec"],
  //   strongMarkers: ["Gemfile"],
  // },
  // {
  //   name: "csharp",
  //   display: "C#",
  //   markers: [".csproj", ".sln"],
  //   strongMarkers: [".csproj"],
  // },
  // {
  //   name: "cpp",
  //   display: "C++",
  //   markers: ["CMakeLists.txt", "Makefile", ".cmake"],
  //   strongMarkers: ["CMakeLists.txt"],
  // },
  // {
  //   name: "elixir",
  //   display: "Elixir",
  //   markers: ["mix.exs", "mix.lock"],
  //   strongMarkers: ["mix.exs"],
  // },
  // {
  //   name: "php",
  //   display: "PHP",
  //   markers: ["composer.json", "composer.lock"],
  //   strongMarkers: ["composer.json"],
  // },
  // {
  //   name: "swift",
  //   display: "Swift",
  //   markers: ["Package.swift"],
  //   strongMarkers: ["Package.swift"],
  // },
  // {
  //   name: "kotlin",
  //   display: "Kotlin",
  //   markers: ["build.gradle.kts"],
  //   strongMarkers: [],
  // },
  // {
  //   name: "scala",
  //   display: "Scala",
  //   markers: ["build.sbt"],
  //   strongMarkers: ["build.sbt"],
  // },
  // {
  //   name: "haskell",
  //   display: "Haskell",
  //   markers: ["stack.yaml", "cabal.project", "package.yaml"],
  //   strongMarkers: ["stack.yaml", "cabal.project"],
  // },
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function fileExists(p: string): boolean {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function dirExists(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Scan a directory (non-recursive) for language markers.
 */
function scanDir(dir: string): Set<string> {
  const found = new Set<string>();
  if (!dirExists(dir)) return found;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    for (const lang of LANGUAGES) {
      for (const marker of lang.markers) {
        // Support suffix match for things like .csproj
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

/**
 * Detect languages in the repository.
 * Scans root + one level of subdirectories to catch monorepos.
 */
function detectLanguages(cwd: string): string[] {
  const found = new Set<string>();

  // Root
  for (const lang of scanDir(cwd)) found.add(lang);

  // One level deep (monorepo packages/)
  const entries = fs.readdirSync(cwd, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      for (const lang of scanDir(path.join(cwd, entry.name))) found.add(lang);
    }
  }

  // If both TS and JS are found, drop plain JS (TS supersedes it)
  if (found.has("typescript") && found.has("javascript")) {
    found.delete("javascript");
  }
  // If Kotlin and Java are found, keep both unless you want to suppress one
  // (kept separate since they can coexist)

  return Array.from(found);
}

/**
 * Find skills that belong to a given language by naming convention.
 * Matches skill names like "rust-guidelines", "rust-testing", etc.
 */
function skillsForLanguage(
  langName: string,
  skills: { name: string; description: string }[] | undefined,
): { name: string; description: string }[] {
  if (!skills) return [];
  const prefix = `${langName}-`;
  return skills.filter((s) => s.name === langName || s.name.startsWith(prefix));
}

/* ------------------------------------------------------------------ */
/*  Extension                                                          */
/* ------------------------------------------------------------------ */

export default function languageSkillsExtension(pi: ExtensionAPI) {
  let detectedLangs: string[] = [];
  let repoRoot = "";

  // Re-scan on every session start (new cwd / new repo)
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

  // Inject language → skill mapping into system prompt
  pi.on("before_agent_start", async (event) => {
    if (detectedLangs.length === 0) return;

    const { skills } = event.systemPromptOptions;
    const lines: string[] = [];

    for (const lang of detectedLangs) {
      const langDef = LANGUAGES.find((d) => d.name === lang);
      if (!langDef) continue;

      const langSkills = skillsForLanguage(lang, skills);
      if (langSkills.length === 0) continue;

      lines.push(
        `- **${langDef.display}**: ${langSkills.map((s) => `\`${s.name}\``).join(", ")}`,
      );
    }

    if (lines.length === 0) return;

    const promptSection = `
## Repository Languages & Skills

This workspace contains code for the following languages. When working on a task involving one of these languages, load the corresponding skill(s) for detailed guidance.

${lines.join("\n")}
`;

    return {
      systemPrompt: event.systemPrompt + promptSection,
    };
  });
}
