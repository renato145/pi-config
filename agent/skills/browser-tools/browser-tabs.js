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
const close = takeOption(args, "--close");
assertNoUnknownOptions(args);
if (args.length > 0 || (focus !== undefined && close !== undefined)) {
	console.log("Usage: browser-tabs.js [--focus <index-or-text> | --close <index-or-text>]");
	process.exit(1);
}

await runCli(async () => {
	const browser = await connectManagedBrowser();
	try {
		if (focus !== undefined) {
			const page = await selectPage(browser, focus);
			await page.bringToFront();
		}
		if (close !== undefined) {
			const page = await selectPage(browser, close);
			const pagesBeforeClose = await inspectPages(browser);
			const entry = pagesBeforeClose.find((candidate) => candidate.page === page);
			if (!entry) throw new Error("The selected tab closed before it could be processed.");
			if (pagesBeforeClose.length === 1) await browser.newPage();
			await page.close();
			console.log(`✓ Closed tab: ${entry.title || "(untitled)"}`);
			console.log(`  ${entry.url}\n`);
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
