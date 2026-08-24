#!/usr/bin/env node

import {
	assertNoUnknownOptions,
	connectManagedBrowser,
	disconnectQuietly,
	formatTab,
	inspectPages,
	runCli,
	selectPage,
	takeOption,
} from "./browser-common.js";

const args = process.argv.slice(2);
const focus = takeOption(args, "--focus");
assertNoUnknownOptions(args);
if (args.length > 0) {
	console.log("Usage: browser-tabs.js [--focus <index-or-text>]");
	process.exit(1);
}

await runCli(async () => {
	const browser = await connectManagedBrowser();
	try {
		if (focus !== undefined) {
			const page = await selectPage(browser, focus);
			await page.bringToFront();
		}
		const pages = await inspectPages(browser);
		if (pages.length === 0) {
			console.log("No tabs open");
			return;
		}
		console.log(pages.map(formatTab).join("\n"));
		console.log("\n* focused, + visible in another browser window");
	} finally {
		await disconnectQuietly(browser);
	}
});
