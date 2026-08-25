import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { chromeBinaryCandidates, ensureDedicatedProfile } from "../browser-profile.js";

test("configured Chrome binary takes precedence", () => {
	const previous = process.env.BROWSER_TOOLS_CHROME;
	process.env.BROWSER_TOOLS_CHROME = "/custom/chrome";
	try {
		assert.deepEqual(chromeBinaryCandidates({ platform: "linux", home: "/home/test" }), ["/custom/chrome"]);
	} finally {
		if (previous === undefined) delete process.env.BROWSER_TOOLS_CHROME;
		else process.env.BROWSER_TOOLS_CHROME = previous;
	}
});

test("ensureDedicatedProfile marks and reuses an empty profile", () => {
	const directory = mkdtempSync(join(process.cwd(), ".test-dedicated-profile-"));
	try {
		ensureDedicatedProfile(directory);
		assert.equal(existsSync(join(directory, ".browser-tools-dedicated-profile")), true);
		assert.doesNotThrow(() => ensureDedicatedProfile(directory));
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});

test("ensureDedicatedProfile rejects an unmarked profile", () => {
	const directory = mkdtempSync(join(process.cwd(), ".test-unmarked-profile-"));
	try {
		writeFileSync(join(directory, "Local State"), "{}");
		assert.throws(() => ensureDedicatedProfile(directory), /unmarked Chrome profile/i);
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});
