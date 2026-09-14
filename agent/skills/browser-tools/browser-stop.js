#!/usr/bin/env node

import { connectBrowser, disconnectQuietly, getBrowserStatus, isProcessAlive, removeState, runCli } from "./browser-common.js";

await runCli(async () => {
	const status = await getBrowserStatus();
	if (!status.running) {
		removeState();
		console.log("✓ Browser already stopped");
		return;
	}
	if (!status.managed) throw new Error("Refusing to stop an unmanaged browser on the CDP port.");

	if (status.state?.kind === "remote") {
		// The remote browser is not ours to kill (e.g. it is driving a scraper); detach only.
		const remoteBrowser = await connectBrowser();
		await disconnectQuietly(remoteBrowser);
		removeState();
		console.log("✓ Detached from remote browser (left running)");
		return;
	}

	const browser = await connectBrowser();
	try {
		await browser.close();
	} catch {
		await browser.disconnect();
	}

	for (let attempt = 0; attempt < 20 && isProcessAlive(status.state.pid); attempt += 1) {
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
	if (isProcessAlive(status.state.pid)) process.kill(status.state.pid, "SIGTERM");
	removeState();
	console.log("✓ Browser stopped");
});
