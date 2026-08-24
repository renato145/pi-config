#!/usr/bin/env node

import {
	assertNoUnknownOptions,
	connectManagedBrowser,
	disconnectQuietly,
	formatResult,
	redactCookies,
	runCli,
	selectPage,
	takeOption,
} from "./browser-common.js";

const args = process.argv.slice(2);
const tab = takeOption(args, "--tab");
assertNoUnknownOptions(args);
if (args.length > 0) {
	console.log("Usage: browser-cookies.js [--tab <index-or-text>]");
	process.exit(1);
}

await runCli(async () => {
	const browser = await connectManagedBrowser();
	try {
		const page = await selectPage(browser, tab);
		const client = await page.createCDPSession();
		try {
			const { cookies } = await client.send("Network.getCookies", { urls: [page.url()] });
			console.log(formatResult(redactCookies(cookies)));
		} finally {
			await client.detach();
		}
	} finally {
		await disconnectQuietly(browser);
	}
});
