#!/usr/bin/env node

import {
	assertNoUnknownOptions,
	connectManagedBrowser,
	disconnectQuietly,
	formatResult,
	runCli,
	selectPage,
	takeFlag,
	takeOption,
} from "./browser-common.js";

const args = process.argv.slice(2);
const tab = takeOption(args, "--tab");
const allowSensitive = takeFlag(args, "--allow-sensitive");
assertNoUnknownOptions(args);
const code = args.join(" ");

if (!code) {
	console.log("Usage: browser-eval.js [--tab <index-or-text>] [--allow-sensitive] '<expression>'");
	process.exit(1);
}

const sensitivePatterns = [
	/\bdocument\s*\.\s*cookie\b/i,
	/\bcookieStore\b/i,
	/\blocalStorage\b/i,
	/\bsessionStorage\b/i,
	/\bindexedDB\b/i,
];

await runCli(async () => {
	if (!allowSensitive && sensitivePatterns.some((pattern) => pattern.test(code))) {
		throw new Error("Sensitive browser storage access is blocked. It requires explicit user approval and --allow-sensitive.");
	}
	const browser = await connectManagedBrowser();
	try {
		const page = await selectPage(browser, tab);
		const result = await page.evaluate((source) => {
			const AsyncFunction = (async () => {}).constructor;
			return new AsyncFunction(`"use strict"; return (${source}\n);`)();
		}, code);
		console.log(formatResult(result));
	} finally {
		await disconnectQuietly(browser);
	}
});
