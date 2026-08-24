#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import {
	assertNoUnknownOptions,
	connectManagedBrowser,
	disconnectQuietly,
	formatResult,
	runCli,
	selectPage,
	takeOption,
} from "./browser-common.js";

const args = process.argv.slice(2);
const tab = takeOption(args, "--tab");
assertNoUnknownOptions(args);
const message = args.join(" ");

if (!message) {
	console.log("Usage: browser-pick.js [--tab <index-or-text>] 'message'");
	process.exit(1);
}

await runCli(async () => {
	const browser = await connectManagedBrowser();
	try {
		const page = await selectPage(browser, tab);
		await page.bringToFront();
		const pickerKey = `__pi_browser_picker_${randomUUID().replaceAll("-", "")}`;

		await page.evaluate((key) => {
			window[key] = (prompt) => new Promise((resolve) => {
				const selections = [];
				const selectedElements = new Set();
				const originalOutlines = new Map();

				const overlay = document.createElement("div");
				overlay.style.cssText = "position:fixed;inset:0;z-index:2147483647;pointer-events:none";
				const highlight = document.createElement("div");
				highlight.style.cssText = "position:fixed;border:2px solid #3b82f6;background:rgba(59,130,246,.1);pointer-events:none";
				overlay.appendChild(highlight);
				const banner = document.createElement("div");
				banner.style.cssText = "position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#1f2937;color:white;padding:12px 24px;border-radius:8px;font:14px sans-serif;box-shadow:0 4px 12px rgba(0,0,0,.3);pointer-events:auto;z-index:2147483647";

				const updateBanner = () => {
					banner.textContent = `${prompt} (${selections.length} selected; Ctrl/Cmd+click adds; Enter finishes; Esc cancels)`;
				};
				updateBanner();
				document.body.append(banner, overlay);

				const escapeCss = (value) => window.CSS?.escape ? window.CSS.escape(value) : value.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
				const uniqueSelector = (element) => {
					if (element.id) {
						const idSelector = `#${escapeCss(element.id)}`;
						if (document.querySelectorAll(idSelector).length === 1) return idSelector;
					}
					const parts = [];
					let current = element;
					while (current instanceof Element && current !== document.documentElement) {
						let part = current.localName;
						const classes = Array.from(current.classList || []).slice(0, 2).map(escapeCss);
						if (classes.length > 0) part += `.${classes.join(".")}`;
						const parent = current.parentElement;
						if (parent) {
							const sameTag = Array.from(parent.children).filter((child) => child.localName === current.localName);
							if (sameTag.length > 1) part += `:nth-of-type(${sameTag.indexOf(current) + 1})`;
						}
						parts.unshift(part);
						const candidate = parts.join(" > ");
						try {
							if (document.querySelectorAll(candidate).length === 1) return candidate;
						} catch {}
						current = parent;
					}
					return parts.join(" > ");
				};

				const elementInfo = (element) => ({
					selector: uniqueSelector(element),
					tag: element.localName,
					text: element.textContent?.trim().slice(0, 200) || null,
					ariaLabel: element.getAttribute("aria-label"),
					role: element.getAttribute("role"),
					name: element.getAttribute("name"),
					type: element.getAttribute("type"),
					href: element instanceof HTMLAnchorElement ? element.href : null,
				});

				const cleanup = () => {
					document.removeEventListener("mousemove", onMove, true);
					document.removeEventListener("click", onClick, true);
					document.removeEventListener("keydown", onKey, true);
					overlay.remove();
					banner.remove();
					for (const [element, outline] of originalOutlines) element.style.outline = outline;
				};
				const elementAt = (event) => {
					const element = document.elementFromPoint(event.clientX, event.clientY);
					return element && !overlay.contains(element) && !banner.contains(element) ? element : null;
				};
				const onMove = (event) => {
					const element = elementAt(event);
					if (!element) return;
					const rectangle = element.getBoundingClientRect();
					Object.assign(highlight.style, {
						top: `${rectangle.top}px`,
						left: `${rectangle.left}px`,
						width: `${rectangle.width}px`,
						height: `${rectangle.height}px`,
					});
				};
				const addSelection = (element) => {
					if (selectedElements.has(element)) return;
					selectedElements.add(element);
					originalOutlines.set(element, element.style.outline);
					element.style.outline = "3px solid #10b981";
					selections.push(elementInfo(element));
					updateBanner();
				};
				const onClick = (event) => {
					if (banner.contains(event.target)) return;
					event.preventDefault();
					event.stopPropagation();
					const element = elementAt(event);
					if (!element) return;
					if (event.metaKey || event.ctrlKey) {
						addSelection(element);
						return;
					}
					cleanup();
					resolve(selections.length > 0 ? selections : elementInfo(element));
				};
				const onKey = (event) => {
					if (event.key === "Escape") {
						event.preventDefault();
						cleanup();
						resolve(null);
					} else if (event.key === "Enter" && selections.length > 0) {
						event.preventDefault();
						cleanup();
						resolve(selections);
					}
				};

				document.addEventListener("mousemove", onMove, true);
				document.addEventListener("click", onClick, true);
				document.addEventListener("keydown", onKey, true);
			});
		}, pickerKey);

		let result;
		try {
			result = await page.evaluate((key, prompt) => window[key](prompt), pickerKey, message);
		} finally {
			await page.evaluate((key) => delete window[key], pickerKey).catch(() => {});
		}
		console.log(formatResult(result));
	} finally {
		await disconnectQuietly(browser);
	}
});
