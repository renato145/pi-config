import { accessSync, chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { constants as fsConstants } from "node:fs";
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { ensurePrivateDirectory, isProcessAlive } from "./browser-common.js";

const PROFILE_EXCLUDES = [
	"Cache/",
	"Code Cache/",
	"GPUCache/",
	"GrShaderCache/",
	"Sessions/",
	"Current Session",
	"Current Tabs",
	"Last Session",
	"Last Tabs",
	"Login Data*",
	"History*",
	"Web Data*",
	"Top Sites*",
	"Visited Links",
	"Shortcuts*",
	"Favicons*",
	"Download Metadata",
	"Bookmarks*",
	"Extensions/",
	"Extension State/",
	"Extension Rules/",
	"Extension Scripts/",
	"Extension Cookies/",
	"Local Extension Settings/",
	"Managed Extension Settings/",
	"Sync Extension Settings/",
	"Service Worker/CacheStorage/",
];

export function chromeUserDataDirectory({ platform = process.platform, home = homedir() } = {}) {
	if (platform === "darwin") return join(home, "Library", "Application Support", "Google", "Chrome");
	if (platform === "linux") return join(home, ".config", "google-chrome");
	if (platform === "win32") {
		const localAppData = process.env.LOCALAPPDATA;
		if (!localAppData) throw new Error("LOCALAPPDATA is not set.");
		return join(localAppData, "Google", "Chrome", "User Data");
	}
	throw new Error(`Unsupported platform: ${platform}`);
}

export function validateProfileDirectoryName(value) {
	if (!value || value === "." || value === ".." || basename(value) !== value || value.includes("/") || value.includes("\\")) {
		throw new Error(`Invalid Chrome profile directory: ${value}`);
	}
	return value;
}

export function defaultProfileDirectory(sourceRoot) {
	try {
		const localState = JSON.parse(readFileSync(join(sourceRoot, "Local State"), "utf8"));
		const lastUsed = localState?.profile?.last_used;
		if (typeof lastUsed === "string") return validateProfileDirectoryName(lastUsed);
	} catch {}
	return "Default";
}

export function copiedProfileDirectory(dataDir) {
	try {
		return validateProfileDirectoryName(readFileSync(join(dataDir, ".browser-tools-profile"), "utf8").trim());
	} catch {
		return undefined;
	}
}

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
	if (pid === undefined) {
		throw new Error("The browser profile has a lock that cannot be verified; refusing to remove it.");
	}
	if (isProcessAlive(pid)) throw new Error(`The browser profile is locked by process ${pid}; stop that browser first.`);
	for (const name of ["SingletonLock", "SingletonSocket", "SingletonCookie"]) {
		rmSync(join(dataDir, name), { force: true });
	}
}

export function assertSourceProfileClosed(sourceRoot) {
	for (const name of ["SingletonLock", "SingletonSocket", "SingletonCookie"]) {
		if (pathExistsWithoutFollowingLinks(join(sourceRoot, name))) {
			throw new Error("Your normal Chrome profile appears to be in use. Close normal Chrome before syncing it.");
		}
	}
}

export function profileCopyArguments({ sourceProfile, destinationProfile }) {
	return [
		"-a",
		...PROFILE_EXCLUDES.flatMap((pattern) => ["--exclude", pattern]),
		`${sourceProfile}/`,
		`${destinationProfile}/`,
	];
}

function hasExistingProfile(dataDir) {
	if (!existsSync(dataDir)) return false;
	try {
		return readdirSync(dataDir).length > 0;
	} catch {
		return true;
	}
}

export function syncChromeProfile({ sourceRoot, destinationRoot, profileDirectory, replace = false }) {
	validateProfileDirectoryName(profileDirectory);
	assertSourceProfileClosed(sourceRoot);
	const sourceProfile = join(sourceRoot, profileDirectory);
	if (!existsSync(sourceProfile)) throw new Error(`Chrome profile does not exist: ${profileDirectory}`);
	if (hasExistingProfile(destinationRoot) && !replace) {
		throw new Error("A browser-tools profile already exists. Syncing would overwrite its sessions; explicit replacement is required.");
	}

	const parent = dirname(destinationRoot);
	mkdirSync(parent, { recursive: true });
	const stage = `${destinationRoot}.sync-${process.pid}-${Date.now()}`;
	const backup = `${destinationRoot}.backup-${process.pid}-${Date.now()}`;
	ensurePrivateDirectory(stage);
	const stagedProfile = join(stage, profileDirectory);
	mkdirSync(stagedProfile, { recursive: true, mode: 0o700 });

	try {
		const localState = join(sourceRoot, "Local State");
		if (existsSync(localState)) copyFileSync(localState, join(stage, "Local State"));
		const result = spawnSync("rsync", profileCopyArguments({ sourceProfile, destinationProfile: stagedProfile }), {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"],
		});
		if (result.error) throw result.error;
		if (result.status !== 0) throw new Error(result.stderr.trim() || `rsync exited with code ${result.status}`);
		writeFileSync(join(stage, ".browser-tools-profile"), `${profileDirectory}\n`, { mode: 0o600 });

		if (existsSync(destinationRoot)) renameSync(destinationRoot, backup);
		renameSync(stage, destinationRoot);
		chmodSync(destinationRoot, 0o700);
		rmSync(backup, { recursive: true, force: true });
	} catch (error) {
		rmSync(stage, { recursive: true, force: true });
		if (!existsSync(destinationRoot) && existsSync(backup)) renameSync(backup, destinationRoot);
		throw error;
	}
}
