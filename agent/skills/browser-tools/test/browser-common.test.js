import assert from "node:assert/strict";
import test from "node:test";
import { formatResult, redactCookies, selectPage, validateNavigationUrl } from "../browser-common.js";

function createPage({ title, url, focused = false, visible = false }) {
	return {
		title: async () => title,
		url: () => url,
		evaluate: async () => ({ focused, visible }),
		bringToFront: async () => {},
	};
}

function createBrowser(pages) {
	return {
		pages: async () => pages,
		newPage: async () => {
			const page = createPage({ title: "New Tab", url: "about:blank", focused: true, visible: true });
			pages.push(page);
			return page;
		},
	};
}

test("selectPage uses the uniquely focused tab", async () => {
	const first = createPage({ title: "One", url: "https://one.example", visible: true });
	const second = createPage({ title: "Two", url: "https://two.example", focused: true, visible: true });
	assert.equal(await selectPage(createBrowser([first, second])), second);
});

test("selectPage refuses an ambiguous active tab", async () => {
	const browser = createBrowser([
		createPage({ title: "One", url: "https://one.example", visible: true }),
		createPage({ title: "Two", url: "https://two.example", visible: true }),
	]);
	await assert.rejects(() => selectPage(browser), /active tab is ambiguous/i);
});

test("selectPage accepts numeric and text selectors", async () => {
	const first = createPage({ title: "GitHub", url: "https://github.com" });
	const second = createPage({ title: "Instagram", url: "https://instagram.com" });
	const browser = createBrowser([first, second]);
	assert.equal(await selectPage(browser, "2"), second);
	assert.equal(await selectPage(browser, "github"), first);
});

test("selectPage rejects ambiguous text selectors", async () => {
	const browser = createBrowser([
		createPage({ title: "Instagram", url: "https://instagram.com" }),
		createPage({ title: "Instagram notifications", url: "https://instagram.com/notifications" }),
	]);
	await assert.rejects(() => selectPage(browser, "instagram"), /multiple tabs match/i);
});

test("validateNavigationUrl permits HTTP and rejects unsafe URL forms", () => {
	assert.equal(validateNavigationUrl("https://example.com/a"), "https://example.com/a");
	assert.throws(() => validateNavigationUrl("file:///etc/passwd"), /unsupported URL protocol/i);
	assert.throws(() => validateNavigationUrl("https://user:secret@example.com"), /credentials/i);
	assert.throws(() => validateNavigationUrl("not a URL"), /invalid URL/i);
});

test("formatResult preserves structured values", () => {
	assert.equal(formatResult(["one", null, { nested: true }]), '[\n  "one",\n  null,\n  {\n    "nested": true\n  }\n]');
});

test("redactCookies never includes cookie values", () => {
	const output = redactCookies([
		{
			name: "session",
			value: "top-secret-token",
			domain: ".example.com",
			path: "/",
			httpOnly: true,
			secure: true,
			sameSite: "Lax",
			expires: -1,
		},
	]);
	assert.equal(output[0].value, "[REDACTED]");
	assert.equal(JSON.stringify(output).includes("top-secret-token"), false);
});
