#!/usr/bin/env node

import { chmodSync } from "node:fs";
import { join } from "node:path";
import {
	DATA_DIR,
	assertNoUnknownOptions,
	connectManagedBrowser,
	disconnectQuietly,
	ensurePrivateDirectory,
	runCli,
	selectPage,
	takeFlag,
	takeOption,
} from "./browser-common.js";

const args = process.argv.slice(2);
const tab = takeOption(args, "--tab");
const fullPage = takeFlag(args, "--full-page");
assertNoUnknownOptions(args);
if (args.length > 0) {
	console.log("Usage: browser-screenshot.js [--tab <index-or-text>] [--full-page]");
	process.exit(1);
}

await runCli(async () => {
	const artifactsDirectory = join(DATA_DIR, "artifacts");
	ensurePrivateDirectory(artifactsDirectory);
	const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
	const filepath = join(artifactsDirectory, `screenshot-${timestamp}.png`);
	const browser = await connectManagedBrowser();
	try {
		const page = await selectPage(browser, tab);
		await page.screenshot({ path: filepath, fullPage });
		chmodSync(filepath, 0o600);
		console.log(filepath);
	} finally {
		await disconnectQuietly(browser);
	}
});
