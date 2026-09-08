import test from "node:test";
import assert from "node:assert/strict";
import { isBrowserMainProcess, userDataDirFromCmdline } from "../browser-common.js";

test("isBrowserMainProcess matches space-separated cmdlines (Chrome rewrites argv)", () => {
	const cmdline = "/usr/bin/chrome --remote-debugging-port=9222 --user-data-dir=/tmp/playwright_chromiumdev_profile-x\0";
	assert.equal(isBrowserMainProcess(cmdline, 9222), true);
	assert.equal(isBrowserMainProcess(cmdline, 9223), false);
});

test("isBrowserMainProcess does not treat 9222 as a prefix of 92220", () => {
	const cmdline = "/usr/bin/chrome --remote-debugging-port=92220 --user-data-dir=/tmp/p\0";
	assert.equal(isBrowserMainProcess(cmdline, 9222), false);
	assert.equal(isBrowserMainProcess(cmdline, 92220), true);
});

test("isBrowserMainProcess matches NUL-separated cmdlines", () => {
	const cmdline = "/usr/bin/chrome\0--remote-debugging-port=9222\0--user-data-dir=/tmp/p\0";
	assert.equal(isBrowserMainProcess(cmdline, 9222), true);
});

test("isBrowserMainProcess rejects child processes", () => {
	const renderer = "/usr/bin/chrome --type=renderer --remote-debugging-port=9222";
	const nulRenderer = "/usr/bin/chrome\0--type=gpu-process\0--remote-debugging-port=9222\0";
	assert.equal(isBrowserMainProcess(renderer, 9222), false);
	assert.equal(isBrowserMainProcess(nulRenderer, 9222), false);
});

test("userDataDirFromCmdline extracts the profile directory from both layouts", () => {
	assert.equal(userDataDirFromCmdline("/usr/bin/chrome --user-data-dir=/tmp/playwright_chromiumdev_profile-x\0"), "/tmp/playwright_chromiumdev_profile-x");
	assert.equal(userDataDirFromCmdline("/usr/bin/chrome\0--user-data-dir=/tmp/p\0--headless\0"), "/tmp/p");
	assert.equal(userDataDirFromCmdline("/usr/bin/chrome --headless\0"), null);
});
