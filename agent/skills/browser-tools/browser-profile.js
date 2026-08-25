import { accessSync, existsSync, lstatSync, readdirSync, readlinkSync, rmSync, writeFileSync } from "node:fs";
import { constants as fsConstants } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { ensurePrivateDirectory, isProcessAlive } from "./browser-common.js";

const DEDICATED_PROFILE_MARKER = ".browser-tools-dedicated-profile";

export function chromeBinaryCandidates({ platform = process.platform, home = homedir() } = {}) {
	const configured = process.env.BROWSER_TOOLS_CHROME;
	if (configured) return [configured];
	if (platform === "darwin") return ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"];
	if (platform === "linux") {
		return ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/snap/bin/chromium"];
	}
	if (platform === "win32") {
		return [
			join(process.env.PROGRAMFILES || "", "Google", "Chrome", "Application", "chrome.exe"),
			join(process.env["PROGRAMFILES(X86)"] || "", "Google", "Chrome", "Application", "chrome.exe"),
			join(process.env.LOCALAPPDATA || home, "Google", "Chrome", "Application", "chrome.exe"),
		];
	}
	return [];
}

export function findChromeBinary(options) {
	for (const candidate of chromeBinaryCandidates(options)) {
		if (!candidate) continue;
		try {
			accessSync(candidate, fsConstants.X_OK);
			return candidate;
		} catch {}
	}
	throw new Error("Chrome was not found. Set BROWSER_TOOLS_CHROME to its executable path.");
}

export function ensureDedicatedProfile(dataDir) {
	ensurePrivateDirectory(dataDir);
	const marker = join(dataDir, DEDICATED_PROFILE_MARKER);
	if (existsSync(marker)) return;
	if (readdirSync(dataDir).length > 0) {
		throw new Error("Refusing to launch an unmarked Chrome profile. Browser-tools requires its own dedicated profile.");
	}
	writeFileSync(marker, "Dedicated browser-tools profile. Do not replace with a normal Chrome profile.\n", { mode: 0o600 });
}

function pathExistsWithoutFollowingLinks(path) {
	try {
		lstatSync(path);
		return true;
	} catch {
		return false;
	}
}

function lockPid(lockPath) {
	try {
		const target = readlinkSync(lockPath);
		const match = target.match(/-(\d+)$/);
		return match ? Number.parseInt(match[1], 10) : undefined;
	} catch {
		return undefined;
	}
}

export function clearStaleBrowserLocks(dataDir) {
	const lockPath = join(dataDir, "SingletonLock");
	if (!pathExistsWithoutFollowingLinks(lockPath)) return;
	const pid = lockPid(lockPath);
	if (pid === undefined) throw new Error("The browser profile has a lock that cannot be verified; refusing to remove it.");
	if (isProcessAlive(pid)) throw new Error(`The browser profile is locked by process ${pid}; stop that browser first.`);
	for (const name of ["SingletonLock", "SingletonSocket", "SingletonCookie"]) {
		rmSync(join(dataDir, name), { force: true });
	}
}
