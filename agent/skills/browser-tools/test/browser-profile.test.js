import assert from "node:assert/strict";
import test from "node:test";
import {
	chromeBinaryCandidates,
	chromeUserDataDirectory,
	profileCopyArguments,
	validateProfileDirectoryName,
} from "../browser-profile.js";

test("chromeUserDataDirectory resolves supported platforms", () => {
	assert.equal(chromeUserDataDirectory({ platform: "linux", home: "/home/test" }), "/home/test/.config/google-chrome");
	assert.equal(
		chromeUserDataDirectory({ platform: "darwin", home: "/Users/test" }),
		"/Users/test/Library/Application Support/Google/Chrome",
	);
});

test("validateProfileDirectoryName blocks traversal", () => {
	assert.equal(validateProfileDirectoryName("Profile 1"), "Profile 1");
	for (const value of ["", ".", "..", "../Default", "a/b", "a\\b"]) {
		assert.throws(() => validateProfileDirectoryName(value), /invalid chrome profile directory/i);
	}
});

test("profile copy excludes non-session and sensitive browser data", () => {
	const args = profileCopyArguments({ sourceProfile: "/source/Default", destinationProfile: "/target/Default" });
	const command = args.join(" ");
	for (const excluded of ["Login Data*", "History*", "Web Data*", "Cache/", "Sessions/", "Extensions/", "Bookmarks*"]) {
		assert.equal(command.includes(excluded), true, `${excluded} should be excluded`);
	}
	assert.equal(args.at(-2), "/source/Default/");
	assert.equal(args.at(-1), "/target/Default/");
});

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
