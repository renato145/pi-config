#!/usr/bin/env node

import { spawn } from "node:child_process";
import {
	CDP_HOST,
	CDP_PORT,
	DATA_DIR,
	connectBrowser,
	getBrowserStatus,
	isProcessAlive,
	removeState,
	runCli,
	writeState,
} from "./browser-common.js";
import { clearStaleBrowserLocks, ensureDedicatedProfile, findChromeBinary } from "./browser-profile.js";

if (process.argv.length > 2) {
	console.log("Usage: browser-start.js");
	console.log("\nBrowser-tools always uses its own persistent profile. Profile copying and import are not supported.");
	process.exit(1);
}

await runCli(async () => {
	const status = await getBrowserStatus();
	if (status.running) {
		if (!status.managed) throw new Error(`CDP port ${CDP_PORT} is occupied by an unmanaged browser.`);
		console.log(`✓ Browser already running at http://${CDP_HOST}:${CDP_PORT}`);
		return;
	}
	if (status.state && isProcessAlive(status.state.pid)) {
		throw new Error(`Browser process ${status.state.pid} exists but CDP is unavailable; refusing to reuse its profile.`);
	}

	ensureDedicatedProfile(DATA_DIR);
	clearStaleBrowserLocks(DATA_DIR);
	removeState();
	const chrome = findChromeBinary();
	const child = spawn(
		chrome,
		[
			`--remote-debugging-address=${CDP_HOST}`,
			`--remote-debugging-port=${CDP_PORT}`,
			`--user-data-dir=${DATA_DIR}`,
			"--disable-sync",
			"--no-first-run",
			"--no-default-browser-check",
		],
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
		if (pages.length === 0) await browser.newPage();
		writeState({ pid: child.pid });
	} finally {
		await browser.disconnect();
	}

	console.log(`✓ Browser started at http://${CDP_HOST}:${CDP_PORT}`);
	console.log(`  dedicated profile: ${DATA_DIR}`);
});
