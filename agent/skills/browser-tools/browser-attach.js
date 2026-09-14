#!/usr/bin/env node

import { readdirSync, readFileSync } from "node:fs";
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
import { isNormalChromeProfile } from "./browser-profile.js";

function browserProcessesOnPort(port) {
	let entries;
	try {
		entries = readdirSync("/proc");
	} catch {
		throw new Error("Process discovery requires Linux /proc. Cannot attach on this platform.");
	}

	const found = [];
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

function parsePidOption(value) {
	if (!/^[1-9]\d*$/.test(value)) throw new Error("--pid requires a positive integer pid.");
	return Number.parseInt(value, 10);
}

function processSummary({ pid, raw }) {
	const binary = raw.split(/[\s\0]/).find((part) => part !== "") ?? "(unknown)";
	const dataDir = userDataDirFromCmdline(raw) ?? "(default profile)";
	return `  pid ${pid}: ${binary} ${dataDir}`;
}

function assertAttachableProfile(dataDir) {
	if (!dataDir) {
		throw new Error(
			"Refusing to attach: the browser uses its default Chrome profile. Attach only browsers with an isolated profile (Playwright supplies a temporary one automatically).",
		);
	}
	if (isNormalChromeProfile(dataDir)) {
		throw new Error(`Refusing to attach: ${dataDir} is a normal Chrome profile. Browser-tools only controls dedicated or automation profiles.`);
	}
}

async function readCdpVersion() {
	try {
		const response = await fetch(`http://${CDP_HOST}:${CDP_PORT}/json/version`, { signal: AbortSignal.timeout(3000) });
		if (!response.ok) return null;
		const info = await response.json();
		return info?.Browser ? info : null;
	} catch {
		return null;
	}
}

await runCli(async () => {
	const args = process.argv.slice(2);
	const force = takeFlag(args, "--force");
	const pidOption = takeOption(args, "--pid");
	const remote = takeFlag(args, "--remote");
	assertNoUnknownOptions(args);
	if (args.length > 0) throw new Error(`Unexpected argument: ${args[0]}`);

	if (remote) {
		if (pidOption !== undefined) throw new Error("--pid cannot be combined with --remote.");
		const versionInfo = await readCdpVersion();
		if (!versionInfo) {
			throw new Error(
				`No CDP endpoint at http://${CDP_HOST}:${CDP_PORT}. ` +
					"Forward the remote browser first (e.g. `kubectl port-forward <pod> 9222:9222` or `ssh -L 9222:127.0.0.1:9222`) and retry.",
			);
		}
		const currentState = readState();
		if (!force && currentState && (currentState.kind === "remote" || isProcessAlive(currentState.pid))) {
			throw new Error("Browser-tools already controls a live browser. Re-run with --force to switch.");
		}
		let tabs;
		const browser = await connectBrowser();
		try {
			tabs = (await browser.pages()).length;
		} finally {
			await disconnectQuietly(browser);
		}
		writeState({ pid: null, kind: "remote" });
		console.log(`✓ Attached to remote browser: ${versionInfo.Browser} at http://${CDP_HOST}:${CDP_PORT}`);
		console.log("  Remote mode: ./browser-stop.js detaches without closing the remote browser.");
		console.log(`  tabs: ${tabs}`);
		return;
	}

	const pidFilter = pidOption === undefined ? undefined : parsePidOption(pidOption);
	const candidates = browserProcessesOnPort(CDP_PORT).filter((candidate) => pidFilter === undefined || candidate.pid === pidFilter);
	if (candidates.length === 0) {
		if (pidFilter !== undefined) {
			throw new Error(`No browser process ${pidFilter} exposes --remote-debugging-port=${CDP_PORT}.`);
		}
		const cdpLive = Boolean(await readCdpVersion());
		if (cdpLive) {
			throw new Error(
				`CDP is live on port ${CDP_PORT}, but no process has --remote-debugging-port=${CDP_PORT}. ` +
					"Attach needs that flag on the browser command line to record its pid and profile.",
			);
		}
		throw new Error(
			`No browser exposes CDP on port ${CDP_PORT}. Launch it with --remote-debugging-port=${CDP_PORT} ` +
				`(e.g. chromium.launch(args=["--remote-debugging-port=${CDP_PORT}"])) and re-run ./browser-attach.js.`,
		);
	}
	if (candidates.length > 1) {
		throw new Error(`Multiple browser processes match port ${CDP_PORT}:\n${candidates.map(processSummary).join("\n")}\nRe-run with --pid <pid>.`);
	}

	const { pid, raw } = candidates[0];
	const dataDir = userDataDirFromCmdline(raw);
	assertAttachableProfile(dataDir);

	const existing = readState();
	if (!force && existing && existing.pid !== pid && isProcessAlive(existing.pid)) {
		throw new Error(`Browser-tools already controls a live browser (pid ${existing.pid}). Re-run with --force to switch.`);
	}

	const info = await readCdpVersion();
	if (!info) {
		throw new Error(
			`Process ${pid} has --remote-debugging-port=${CDP_PORT}, but http://${CDP_HOST}:${CDP_PORT} is not a CDP endpoint.`,
		);
	}

	let tabs;
	const browser = await connectBrowser();
	try {
		tabs = (await browser.pages()).length;
	} finally {
		await disconnectQuietly(browser);
	}

	writeState({ pid, kind: "attached", dataDir });
	console.log(`✓ Attached to external browser: ${info.Browser} (pid ${pid}) at http://${CDP_HOST}:${CDP_PORT}`);
	console.log(`  profile: ${dataDir}`);
	console.log(`  tabs: ${tabs}`);
	console.log("  All browser-tools commands now control this browser; ./browser-stop.js will close it.");
});
