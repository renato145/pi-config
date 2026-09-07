#!/usr/bin/env node

import { readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
	CDP_HOST,
	CDP_PORT,
	assertNoUnknownOptions,
	connectBrowser,
	disconnectQuietly,
	isBrowserMainProcess,
	isProcessAlive,
	readState,
	runCli,
	takeFlag,
	takeOption,
	userDataDirFromCmdline,
	writeState,
} from "./browser-common.js";

function browserProcessesOnPort(port) {
	const found = [];
	let entries;
	try {
		entries = readdirSync("/proc");
	} catch {
		return found;
	}
	for (const entry of entries) {
		if (!/^\d+$/.test(entry)) continue;
		let raw;
		try {
			raw = readFileSync(join("/proc", entry, "cmdline"), "utf8");
		} catch {
			continue;
		}
		if (isBrowserMainProcess(raw, port)) found.push({ pid: Number(entry), raw });
	}
	return found;
}

function assertAttachableProfile(dataDir) {
	if (!dataDir) {
		throw new Error(
			"Refusing to attach: the browser uses its default Chrome profile. Attach only browsers with an isolated profile (Playwright supplies a temporary one automatically).",
		);
	}
	const defaults = [
		join(homedir(), ".config", "google-chrome"),
		join(homedir(), ".config", "chromium"),
		join(homedir(), "snap", "chromium", "common", "chromium"),
	];
	if (defaults.includes(dataDir)) {
		throw new Error(`Refusing to attach: ${dataDir} is a normal Chrome profile. Browser-tools only controls dedicated or automation profiles.`);
	}
}

await runCli(async () => {
	const args = process.argv.slice(2);
	const force = takeFlag(args, "--force");
	const pidOption = takeOption(args, "--pid");
	assertNoUnknownOptions(args);

	let pidFilter;
	if (pidOption !== undefined) {
		pidFilter = Number.parseInt(pidOption, 10);
		if (!Number.isInteger(pidFilter)) throw new Error("--pid requires a numeric pid.");
	}

	const candidates = browserProcessesOnPort(CDP_PORT).filter((candidate) => pidFilter === undefined || candidate.pid === pidFilter);
	if (pidFilter !== undefined && candidates.length === 0) {
		throw new Error(`No browser process ${pidFilter} exposes --remote-debugging-port=${CDP_PORT}.`);
	}
	if (candidates.length === 0) {
		throw new Error(
			`No browser exposes CDP on port ${CDP_PORT}. Launch it with --remote-debugging-port=${CDP_PORT} ` +
				`(e.g. chromium.launch(args=["--remote-debugging-port=${CDP_PORT}"])) and re-run ./browser-attach.js.`,
		);
	}
	if (candidates.length > 1) {
		const list = candidates.map((candidate) => `  pid ${candidate.pid}: ${candidate.argv[0]}`).join("\n");
		throw new Error(`Multiple browser processes match port ${CDP_PORT}:\n${list}\nRe-run with --pid <pid>.`);
	}

	const { pid, raw } = candidates[0];
	const dataDir = userDataDirFromCmdline(raw);
	assertAttachableProfile(dataDir);

	const existing = readState();
	if (!force && existing && existing.pid !== pid && isProcessAlive(existing.pid)) {
		throw new Error(`Browser-tools already controls a live browser (pid ${existing.pid}). Re-run with --force to switch.`);
	}

	const response = await fetch(`http://${CDP_HOST}:${CDP_PORT}/json/version`, { signal: AbortSignal.timeout(3000) });
	if (!response.ok) throw new Error(`Port ${CDP_PORT} answered with HTTP ${response.status}; expected a CDP endpoint.`);
	const info = await response.json();
	if (!info?.Browser) throw new Error(`Port ${CDP_PORT} answered, but not with a CDP endpoint.`);

	let tabs;
	const browser = await connectBrowser();
	try {
		tabs = (await browser.pages()).length;
	} finally {
		await disconnectQuietly(browser);
	}

	writeState({ pid, kind: "attached", dataDir });
	console.log(`✓ Attached to external browser: ${info.Browser} (pid ${pid}) at http://${CDP_HOST}:${CDP_PORT}`);
	console.log(`  profile: ${dataDir ?? "(default)"}`);
	console.log(`  tabs: ${tabs}`);
	console.log("  All browser-tools commands now control this browser; ./browser-stop.js will close it.");
});
