#!/usr/bin/env node

import { connectBrowser, getBrowserStatus, isProcessAlive, removeState, runCli } from "./browser-common.js";

await runCli(async () => {
	const status = await getBrowserStatus();
	if (!status.running) {
		removeState();
		console.log("✓ Browser already stopped");
		return;
	}
	if (!status.managed) throw new Error("Refusing to stop an unmanaged browser on the CDP port.");

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
