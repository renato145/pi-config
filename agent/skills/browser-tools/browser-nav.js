#!/usr/bin/env node

import {
	assertNoUnknownOptions,
	connectManagedBrowser,
	disconnectQuietly,
	runCli,
	selectPage,
	takeFlag,
	takeOption,
	validateNavigationUrl,
} from "./browser-common.js";

const args = process.argv.slice(2);
const newTab = takeFlag(args, "--new");
const reload = takeFlag(args, "--reload");
const tab = takeOption(args, "--tab");
assertNoUnknownOptions(args);
const inputUrl = args.shift();

if (!inputUrl || args.length > 0 || (newTab && tab !== undefined)) {
	console.log("Usage: browser-nav.js <url> [--new] [--reload] [--tab <index-or-text>]");
	process.exit(1);
}

await runCli(async () => {
	const url = validateNavigationUrl(inputUrl);
	const browser = await connectManagedBrowser();
	try {
		const page = newTab ? await browser.newPage() : await selectPage(browser, tab, { create: true });
		await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
		if (reload) await page.reload({ waitUntil: "domcontentloaded", timeout: 30000 });
		console.log(`✓ ${newTab ? "Opened" : "Navigated to"}: ${page.url()}`);
	} finally {
		await disconnectQuietly(browser);
	}
});
