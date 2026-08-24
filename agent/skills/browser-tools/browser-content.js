#!/usr/bin/env node

import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";
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

const MAX_HTML_BYTES = 10 * 1024 * 1024;
const args = process.argv.slice(2);
const tab = takeOption(args, "--tab");
const newTab = takeFlag(args, "--new");
assertNoUnknownOptions(args);
const inputUrl = args.shift();

if (!inputUrl || args.length > 0 || (newTab && tab !== undefined)) {
	console.log("Usage: browser-content.js <url> [--new] [--tab <index-or-text>]");
	process.exit(1);
}

function htmlToMarkdown(html) {
	const turndown = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" });
	turndown.use(gfm);
	turndown.addRule("removeEmptyLinks", {
		filter: (node) => node.nodeName === "A" && !node.textContent?.trim(),
		replacement: () => "",
	});
	return turndown
		.turndown(html)
		.replace(/\[\\?\[\s*\\?\]\]\([^)]*\)/g, "")
		.replace(/ +/g, " ")
		.replace(/\s+,/g, ",")
		.replace(/\s+\./g, ".")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

function extractReadableContent({ html, url }) {
	const document = new JSDOM(html, { url }).window.document;
	const article = new Readability(document).parse();
	if (article?.content) return { title: article.title, content: htmlToMarkdown(article.content) };

	document.querySelectorAll("script, style, noscript, nav, header, footer, aside").forEach((element) => element.remove());
	const main = document.querySelector("main, article, [role='main'], .content, #content") || document.body;
	const fallbackHtml = main?.innerHTML || "";
	return {
		title: document.title || undefined,
		content: fallbackHtml.trim().length > 100 ? htmlToMarkdown(fallbackHtml) : "(Could not extract readable content)",
	};
}

await runCli(async () => {
	const url = validateNavigationUrl(inputUrl);
	const browser = await connectManagedBrowser();
	try {
		const page = newTab ? await browser.newPage() : await selectPage(browser, tab, { create: true });
		await page.bringToFront();
		await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
		try {
			await page.waitForNetworkIdle({ idleTime: 500, timeout: 5000 });
		} catch {}

		const finalUrl = page.url();
		const html = await page.content();
		if (Buffer.byteLength(html, "utf8") > MAX_HTML_BYTES) {
			throw new Error(`Page HTML exceeds the ${MAX_HTML_BYTES / 1024 / 1024}MB extraction limit.`);
		}
		const { title, content } = extractReadableContent({ html, url: finalUrl });
		console.log(`URL: ${finalUrl}`);
		if (title) console.log(`Title: ${title}`);
		console.log(`\n${content}`);
	} finally {
		await disconnectQuietly(browser);
	}
});

export { extractReadableContent, htmlToMarkdown };
