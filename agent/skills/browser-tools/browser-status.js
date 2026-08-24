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
	if (status.managed) console.log(`profile: ${DATA_DIR}`);
});
