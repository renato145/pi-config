import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import puppeteer from "puppeteer-core";

const DEFAULT_PORT = 9222;
const CONNECT_TIMEOUT_MS = 5000;

export const DATA_DIR = resolve(process.env.BROWSER_TOOLS_DATA_DIR || join(homedir(), ".cache", "browser-tools"));
export const CDP_HOST = "127.0.0.1";
export const CDP_PORT = parsePort(process.env.BROWSER_TOOLS_PORT);
export const STATE_FILE = join(DATA_DIR, ".browser-tools-state.json");

function parsePort(value) {
	if (value === undefined) return DEFAULT_PORT;
	const port = Number.parseInt(value, 10);
	if (!Number.isInteger(port) || port < 1 || port > 65535) {
		throw new Error(`Invalid BROWSER_TOOLS_PORT: ${value}`);
	}
	return port;
}

export function ensurePrivateDirectory(path) {
	mkdirSync(path, { recursive: true, mode: 0o700 });
	chmodSync(path, 0o700);
}

export function readState() {
	try {
		const value = JSON.parse(readFileSync(STATE_FILE, "utf8"));
		if (value?.dataDir !== DATA_DIR || value?.host !== CDP_HOST || value?.port !== CDP_PORT) return null;
		return value;
	} catch {
		return null;
	}
}

export function writeState({ pid }) {
	ensurePrivateDirectory(DATA_DIR);
	writeFileSync(
		STATE_FILE,
		`${JSON.stringify({ pid, host: CDP_HOST, port: CDP_PORT, dataDir: DATA_DIR, startedAt: new Date().toISOString() }, null, 2)}\n`,
		{ mode: 0o600 },
	);
	chmodSync(STATE_FILE, 0o600);
}

export function removeState() {
	rmSync(STATE_FILE, { force: true });
}

export function isProcessAlive(pid) {
	if (!Number.isInteger(pid) || pid < 1) return false;
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

export function browserUrl() {
	return `http://${CDP_HOST}:${CDP_PORT}`;
}

export async function connectBrowser({ timeoutMs = CONNECT_TIMEOUT_MS } = {}) {
	let timeoutId;
	try {
		return await Promise.race([
			puppeteer.connect({ browserURL: browserUrl(), defaultViewport: null }),
			new Promise((_, reject) => {
				timeoutId = setTimeout(() => reject(new Error(`Connection timed out after ${timeoutMs}ms`)), timeoutMs);
			}),
		]);
	} finally {
		clearTimeout(timeoutId);
	}
}

export async function getBrowserStatus() {
	const state = readState();
	let browser;
	try {
		browser = await connectBrowser({ timeoutMs: 1000 });
	} catch {
		if (state && !isProcessAlive(state.pid)) removeState();
		return { running: false, managed: false, state };
	}

	try {
		const version = await browser.version();
		const managed = Boolean(state && isProcessAlive(state.pid));
		return { running: true, managed, state, version };
	} finally {
		await browser.disconnect();
	}
}

export async function connectManagedBrowser() {
	const status = await getBrowserStatus();
	if (!status.running) {
		throw new Error("Browser is not running. Run ./browser-start.js first.");
	}
	if (!status.managed) {
		throw new Error(`CDP port ${CDP_PORT} is occupied by an unmanaged browser; refusing to control it.`);
	}
	return connectBrowser();
}

async function inspectPage(page, index) {
	let title = "";
	let activity = { focused: false, visible: false };
	try {
		title = await page.title();
	} catch {}
	try {
		activity = await page.evaluate(() => ({
			focused: document.hasFocus(),
			visible: document.visibilityState === "visible",
		}));
	} catch {}
	return {
		page,
		index: index + 1,
		title,
		url: page.url(),
		focused: activity.focused === true,
		visible: activity.visible === true,
	};
}

export async function inspectPages(browser) {
	const pages = await browser.pages();
	return Promise.all(pages.map((page, index) => inspectPage(page, index)));
}

export async function selectPage(browser, selector, { create = false } = {}) {
	let pages = await inspectPages(browser);
	if (pages.length === 0 && create) {
		await browser.newPage();
		pages = await inspectPages(browser);
	}
	if (pages.length === 0) throw new Error("No browser tabs are open.");

	if (selector !== undefined) {
		const normalizedSelector = selector.trim();
		if (!normalizedSelector) throw new Error("--tab requires a non-empty selector.");
		if (/^\d+$/.test(normalizedSelector)) {
			const index = Number.parseInt(normalizedSelector, 10);
			const match = pages.find((entry) => entry.index === index);
			if (!match) throw new Error(`Tab ${index} does not exist. Run ./browser-tabs.js to list tabs.`);
			return match.page;
		}

		const needle = normalizedSelector.toLowerCase();
		const matches = pages.filter((entry) => entry.url.toLowerCase().includes(needle) || entry.title.toLowerCase().includes(needle));
		if (matches.length === 1) return matches[0].page;
		if (matches.length === 0) throw new Error(`No tab matches "${selector}". Run ./browser-tabs.js to list tabs.`);
		throw new Error(`Multiple tabs match "${selector}"; use the numeric index from ./browser-tabs.js.`);
	}

	const focused = pages.filter((entry) => entry.focused);
	if (focused.length === 1) return focused[0].page;
	const visible = pages.filter((entry) => entry.visible);
	if (visible.length === 1) return visible[0].page;
	if (pages.length === 1) return pages[0].page;
	throw new Error("The active tab is ambiguous. Run ./browser-tabs.js and pass --tab <index-or-text>.");
}

export function formatTab(entry) {
	const marker = entry.focused ? "*" : entry.visible ? "+" : " ";
	return `${marker} ${entry.index}: ${entry.title || "(untitled)"}\n    ${entry.url}`;
}

export function takeFlag(args, name) {
	const index = args.indexOf(name);
	if (index === -1) return false;
	args.splice(index, 1);
	return true;
}

export function takeOption(args, name) {
	const index = args.indexOf(name);
	if (index === -1) return undefined;
	const value = args[index + 1];
	if (value === undefined || value.startsWith("--")) throw new Error(`${name} requires a value.`);
	args.splice(index, 2);
	return value;
}

export function assertNoUnknownOptions(args) {
	const unknown = args.find((arg) => arg.startsWith("--"));
	if (unknown) throw new Error(`Unknown option: ${unknown}`);
}

export function validateNavigationUrl(input) {
	let url;
	try {
		url = new URL(input);
	} catch {
		throw new Error(`Invalid URL: ${input}`);
	}
	if (!new Set(["http:", "https:"]).has(url.protocol)) {
		throw new Error(`Unsupported URL protocol: ${url.protocol}. Only http and https are allowed.`);
	}
	if (url.username || url.password) throw new Error("URLs containing credentials are not allowed.");
	return url.href;
}

export function formatResult(value) {
	if (value === undefined) return "undefined";
	if (typeof value === "string") return value;
	if (typeof value === "bigint") return value.toString();
	if (typeof value === "object" && value !== null) {
		try {
			return JSON.stringify(value, null, 2);
		} catch {}
	}
	return String(value);
}

export function redactCookies(cookies) {
	return cookies.map(({ name, domain, path, httpOnly, secure, sameSite, expires }) => ({
		name,
		domain,
		path,
		httpOnly,
		secure,
		sameSite,
		session: expires === -1 || expires === 0,
		value: "[REDACTED]",
	}));
}

export async function disconnectQuietly(browser) {
	try {
		await browser?.disconnect();
	} catch {}
}

export async function runCli(main) {
	try {
		await main();
	} catch (error) {
		console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
		process.exitCode = 1;
	}
}

