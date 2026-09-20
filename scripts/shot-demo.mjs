// Demo screenshot driver: boots the vite dev server on a unique port, drives
// the multi-theme demo in headless Chrome, and captures the language switcher,
// BOTH storage-meter instances (VAULT v9 dark + Lattice Light) and the store
// monitor at 2x, with the LEFT instance set to en and the RIGHT instance set
// to zh-CN (locale is a per-instance prop, so the shot shows two hosts
// rendering differing locales). It then CLICKS + 1.5 GB: the mock IFileEntry
// store gains an entry, both instances remount and re-read the entries, and
// the quota bar visibly recomputes from the summed sizeBytes (64% ok → 94%
// warn) — proving the quota derives from the file entries, not an interface.
// Demo-only tooling; not part of the published package.
import { spawn } from "node:child_process";
import { stat, mkdir } from "node:fs/promises";
import path from "node:path";
import puppeteer from "puppeteer-core";

const PORT = 4183;
// vite binds to localhost (IPv6 loopback first on macOS) — poll and navigate
// via localhost, not 127.0.0.1.
const BASE_URL = `http://localhost:${PORT}/`;
const OUT_DIR = "/tmp/guanlan-review";
const OUT_PATH = path.join(OUT_DIR, "demo-storage-meter.png");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const MIN_BYTES = 20_000;

function startDevServer() {
  const child = spawn("npx", ["vite", "--port", String(PORT), "--strictPort"], {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env },
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += String(chunk);
  });
  child.on("exit", (code) => {
    // 143 = SIGTERM from this script's cleanup; anything else is real.
    if (code !== null && code !== 0 && code !== 143) {
      process.stderr.write(`vite exited ${code}:\n${stderr}\n`);
    }
  });
  return child;
}

async function waitForServer(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const response = await fetch(url, { method: "HEAD" });
      if (response.ok) {
        return;
      }
    } catch {
      // not up yet
    }
    if (Date.now() > deadline) {
      throw new Error(`dev server at ${url} did not become ready in ${timeoutMs}ms`);
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 250);
    });
  }
}

/** Clicks the option ("EN" / "中文") of a Mantine SegmentedControl by testid. */
async function clickSegmentedOption(page, rootSelector, optionText) {
  const clicked = await page.evaluate(
    ({ rootSelector, optionText }) => {
      const root = document.querySelector(rootSelector);
      if (root === null) {
        return false;
      }
      const label = Array.from(root.querySelectorAll("label")).find(
        (candidate) => candidate.textContent?.trim() === optionText,
      );
      if (label === undefined) {
        return false;
      }
      label.click();
      return true;
    },
    { rootSelector, optionText },
  );
  if (!clicked) {
    throw new Error(`segmented option "${optionText}" not found in ${rootSelector}`);
  }
}

const server = startDevServer();
let browser;
try {
  await waitForServer(BASE_URL, 30_000);
  browser = await puppeteer.launch({ executablePath: CHROME, headless: "new" });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900, deviceScaleFactor: 2 });
  await page.goto(BASE_URL, { waitUntil: "networkidle0" });

  // Locale is a per-instance prop: LEFT (VAULT) stays en, RIGHT (Lattice
  // Light) switches to zh-CN — both set through the per-instance controls so
  // the shot shows the two hosts rendering differing locales while the GLOBAL
  // switcher stays visible above.
  await page.waitForSelector('[data-testid="demo-locale-switcher"]');
  await clickSegmentedOption(page, '[data-testid="demo-instance-locale-a"]', "EN");
  await clickSegmentedOption(page, '[data-testid="demo-instance-locale-b"]', "中文");

  // The mock executor seeds the five sample entries on mount; wait for BOTH
  // instances to render the computed usage line (64% • 3.2 GB OF 5 GB) and
  // for the RIGHT (zh-CN) instance to show its localized usage copy.
  await page.waitForSelector('[data-testid="demo-locale-stage"]');
  await page.waitForFunction(() => {
    const usages = document.querySelectorAll('[data-testid="storage-meter-usage"]');
    return (
      usages.length === 2 &&
      Array.from(usages).every((node) => (node.textContent ?? "").startsWith("64%"))
    );
  });
  await page.waitForFunction(() => {
    const titles = document.querySelectorAll('[data-testid="storage-meter-title"]');
    return (
      titles.length === 2 && Array.from(titles).some((node) => node.textContent === "本地工作区")
    );
  });

  // Press + 1.5 GB: the mock store gains an entry, both instances remount and
  // re-read the stored file entries, and the quota recomputes — the usage
  // line moves to 94% and the meter turns warn (≥ 85%).
  await page.click('[data-testid="demo-store-grow"]');
  await page.waitForFunction(() => {
    const usages = document.querySelectorAll('[data-testid="storage-meter-usage"]');
    return (
      usages.length === 2 &&
      Array.from(usages).every((node) => (node.textContent ?? "").startsWith("94%"))
    );
  });
  await page.waitForFunction(() => {
    const fills = document.querySelectorAll('[data-testid="storage-meter-fill"]');
    return (
      fills.length === 2 &&
      Array.from(fills).every((node) =>
        (node.getAttribute("style") ?? "").includes("var(--mantine-color-warn-filled)"),
      )
    );
  });
  await new Promise((resolve) => {
    setTimeout(resolve, 400);
  });

  // Capture the full demo page: both instances at 94% (warn) and the store
  // monitor showing the six entries the quota was computed from.
  await mkdir(OUT_DIR, { recursive: true });
  const pageRoot = await page.waitForSelector('[data-testid="demo-page"]');
  await pageRoot.screenshot({ path: OUT_PATH });
  const { size } = await stat(OUT_PATH);
  if (size < MIN_BYTES) {
    throw new Error(`screenshot ${OUT_PATH} is suspiciously small (${size} bytes)`);
  }
  console.log(`saved ${OUT_PATH} (${size} bytes)`);
} finally {
  if (browser !== undefined) {
    await browser.close().catch(() => undefined);
  }
  server.kill("SIGTERM");
}
