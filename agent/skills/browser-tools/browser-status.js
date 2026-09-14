#!/usr/bin/env node

import { CDP_HOST, CDP_PORT, DATA_DIR, getBrowserStatus, runCli } from "./browser-common.js";

await runCli(async () => {
	const status = await getBrowserStatus();
	if (!status.running) {
		console.log("stopped");
		return;
	}
	console.log(status.managed ? "running" : "occupied by unmanaged browser");
	console.log(`endpoint: http://${CDP_HOST}:${CDP_PORT}`);
	console.log(`version: ${status.version}`);
	if (status.managed) {
		if (status.state?.kind === "remote") {
			console.log("profile: (remote browser)");
		} else {
			const attached = status.state?.kind === "attached" ? " (attached)" : "";
			console.log(`profile: ${status.state?.dataDir ?? DATA_DIR}${attached}`);
		}
	}
});
