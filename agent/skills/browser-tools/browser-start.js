#!/usr/bin/env node

import { spawn } from "node:child_process";
import {
	CDP_HOST,
	CDP_PORT,
	DATA_DIR,
	connectBrowser,
	ensurePrivateDirectory,
	getBrowserStatus,
	isProcessAlive,
	removeState,
	runCli,
	takeFlag,
	takeOption,
	writeState,
} from "./browser-common.js";
import {
	chromeUserDataDirectory,
	clearStaleBrowserLocks,
	copiedProfileDirectory,
	defaultProfileDirectory,
	findChromeBinary,
	syncChromeProfile,
} from "./browser-profile.js";

const args = process.argv.slice(2);
const syncProfile = takeFlag(args, "--sync-profile") || takeFlag(args, "--profile");
const replaceProfileCopy = takeFlag(args, "--replace-profile-copy");
const profileDirectoryOption = takeOption(args, "--profile-directory");

if (args.length > 0 || (replaceProfileCopy && !syncProfile) || (profileDirectoryOption && !syncProfile)) {
	console.log("Usage: browser-start.js [--sync-profile|--profile] [--profile-directory <name>] [--replace-profile-copy]");
	console.log("\nWithout options, reuses the persistent browser-tools profile.");
	console.log("--sync-profile copies session data from a closed normal Chrome profile.");
	console.log("--replace-profile-copy explicitly replaces existing browser-tools sessions.");
	process.exit(1);
}

await runCli(async () => {
	const status = await getBrowserStatus();
	if (status.running) {
		if (!status.managed) throw new Error(`CDP port ${CDP_PORT} is occupied by an unmanaged browser.`);
		if (syncProfile) throw new Error("Stop browser-tools before synchronizing a profile.");
		console.log(`✓ Browser already running at http://${CDP_HOST}:${CDP_PORT}`);
		return;
	}
	if (status.state && isProcessAlive(status.state.pid)) {
		throw new Error(`Browser process ${status.state.pid} exists but CDP is unavailable; refusing to reuse or replace its profile.`);
	}

	if (syncProfile) {
		const sourceRoot = chromeUserDataDirectory();
		const profileDirectory = profileDirectoryOption || defaultProfileDirectory(sourceRoot);
		console.log(`Synchronizing Chrome profile directory: ${profileDirectory}`);
		syncChromeProfile({
			sourceRoot,
			destinationRoot: DATA_DIR,
			profileDirectory,
			replace: replaceProfileCopy,
		});
	}

	ensurePrivateDirectory(DATA_DIR);
	clearStaleBrowserLocks(DATA_DIR);
	removeState();
	const chrome = findChromeBinary();
	const copiedProfile = copiedProfileDirectory(DATA_DIR);
	const chromeArguments = [
		`--remote-debugging-address=${CDP_HOST}`,
		`--remote-debugging-port=${CDP_PORT}`,
		`--user-data-dir=${DATA_DIR}`,
		"--no-first-run",
		"--no-default-browser-check",
	];
	if (copiedProfile) chromeArguments.push(`--profile-directory=${copiedProfile}`);
	const child = spawn(
		chrome,
		chromeArguments,
		{ detached: true, stdio: "ignore" },
	);
	child.unref();

	let browser;
	for (let attempt = 0; attempt < 40; attempt += 1) {
		try {
			browser = await connectBrowser({ timeoutMs: 500 });
			break;
		} catch {
			await new Promise((resolve) => setTimeout(resolve, 250));
		}
	}
	if (!browser) {
		try {
			process.kill(child.pid, "SIGTERM");
		} catch {}
		throw new Error("Chrome started but its local debugging endpoint did not become ready.");
	}

	try {
		const pages = await browser.pages();
		const page = pages[0] || (await browser.newPage());
		await page.bringToFront();
		writeState({ pid: child.pid });
	} finally {
		await browser.disconnect();
	}

	console.log(`✓ Browser started at http://${CDP_HOST}:${CDP_PORT}`);
	console.log(`  profile: ${DATA_DIR}`);
});
