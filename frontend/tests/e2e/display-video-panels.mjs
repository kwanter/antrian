// Run against a built local server. APIs/media are fixtures; no production calls.
// node tests/e2e/display-video-panels.mjs http://127.0.0.1:3100 /path/to/test.mp4
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";

const [baseUrl = "http://127.0.0.1:3100", mediaPath] = process.argv.slice(2);
if (!mediaPath) throw new Error("Pass a local H.264/AAC MP4 fixture as the second argument.");
const media = await readFile(mediaPath);
const origin = new URL(baseUrl).origin;
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
await context.routeWebSocket(/.*/, (socket) => socket.close());
const errors = [];
const apiCalls = [];
const displays = [1, 2].map((id) => ({
  id, name: `Display ${id}`, location: "Smoke fixture", is_active: true,
  settings: { volume: 0, announcer_enabled: false },
}));
const videos = [1, 2].map((id) => ({
  id, display_id: id, title: `Video ${id}`, file_url: `/storage/videos/${id}.mp4`,
  duration: 1, volume_level: 0, is_active: true, playlist_order: 0,
}));
const headers = {
  "access-control-allow-origin": origin,
  "access-control-allow-credentials": "true",
  "access-control-allow-headers": "Content-Type, Accept, X-Requested-With",
};
await context.route("**/*", async (route) => {
  const request = route.request();
  const url = new URL(request.url());
  if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
  if (url.pathname.startsWith("/api/v1/")) {
    apiCalls.push(url.pathname);
    let data;
    if (url.pathname === "/api/v1/displays") data = displays;
    else if (url.pathname === "/api/v1/videos") {
      data = videos.filter((v) => v.display_id === Number(url.searchParams.get("display_id")));
    } else if (url.pathname === "/api/v1/display-composite") {
      data = {
        status: "ready", video_url: `/storage/composites/${"a".repeat(64)}.mp4`,
        signature: "a".repeat(64), duration: 300, generated_at: "2026-10-24T00:00:00Z",
        displays: displays.map(({ id, name }) => ({ id, name })), message: null,
      };
    } else if (url.pathname.endsWith("/sync")) data = {};
    else if (url.pathname === "/api/v1/layanans") data = [];
    else if (url.pathname === "/api/v1/auth/me") return route.fulfill({ status: 401, json: { message: "Unauthenticated." }, headers });
    else throw new Error(`Unexpected fixture API request: ${url.pathname}`);
    return route.fulfill({ json: { data }, headers });
  }
  if (url.pathname.startsWith("/storage/")) {
    const range = request.headers().range;
    const match = range?.match(/^bytes=(\d+)-(\d*)$/);
    const start = match ? Number(match[1]) : 0;
    const end = match?.[2] ? Math.min(Number(match[2]), media.length - 1) : media.length - 1;
    return route.fulfill({
      status: match ? 206 : 200,
      headers: {
        ...headers, "content-type": "video/mp4", "accept-ranges": "bytes",
        ...(match ? { "content-range": `bytes ${start}-${end}/${media.length}` } : {}),
      },
      body: media.subarray(start, end + 1),
    });
  }
  if (url.origin !== origin) return route.abort("blockedbyclient");
  return route.continue();
});
const page = await context.newPage();
page.on("pageerror", (error) => errors.push(error.message));

try {
  await page.goto(`${origin}/display`);
  await page.waitForFunction(() => document.querySelectorAll("video").length === 2);
  await page.waitForFunction(() => Array.from(document.querySelectorAll("video")).every((v) => v.currentTime > 0.1));
  const boxes = await page.locator("video").evaluateAll((els) => els.map((el) => {
    const box = el.getBoundingClientRect();
    return { x: box.x, y: box.y, width: box.width, height: box.height };
  }));
  assert(boxes[1].x >= boxes[0].x + boxes[0].width, "Browser videos must be side by side, not overlapping.");
  assert(boxes.every((box) => box.width > 100 && box.height > 100));
  console.log("PASS browser: both independent video panels play side by side");

  await page.goto(`${origin}/display?display=2`);
  await page.waitForFunction(() => document.querySelectorAll("video").length === 1);
  assert((await page.locator("video source").getAttribute("src")).endsWith("/2.mp4"));
  console.log("PASS browser: explicit display ID remains single-panel");

  await page.goto(`${origin}/display?display=999`);
  await page.getByText("Display tidak ditemukan", { exact: true }).waitFor();
  assert.equal(await page.locator("video").count(), 0);

  await page.goto(`${origin}/display?tv=1`);
  await page.waitForFunction(() => document.querySelectorAll("video").length === 2);
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Mulai display", exact: true }).waitFor({ state: "detached" });
  await page.waitForFunction(() => Array.from(document.querySelectorAll("video")).every((v) => !v.paused));
  console.log("PASS TV browser mode: one remote Enter starts both mounted players");

  if (!process.argv.includes("--browser-only")) {
    await page.goto(`${origin}/tv.html`);
    await page.waitForFunction(() => document.querySelector("video")?.getAttribute("src")?.includes("/composites/"));
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => document.querySelector("video")?.currentTime > 0.1);
    assert.equal(await page.locator("video").count(), 1);
    assert(apiCalls.includes("/api/v1/display-composite"));
    console.log("PASS legacy TV: one video decoder plays the composed MP4");

    await page.goto(`${origin}/tv.html?display=2`);
    await page.waitForFunction(() => document.querySelector("video")?.getAttribute("src")?.endsWith("/2.mp4"));
    assert.equal(await page.locator("video").count(), 1);
    await page.goto(`${origin}/tv.html?display=999`);
    await page.waitForFunction(() => document.body.textContent.includes("Display tidak ditemukan"));
    assert.equal(await page.locator("video").count(), 0);
    console.log("PASS legacy TV: selected and missing display IDs do not fall back");
  }
  assert.deepEqual(errors, [], "Browser must not emit uncaught runtime errors.");
  console.log("PASS runtime: no uncaught browser errors (desktop Chrome; not physical Tizen verification)");
} finally {
  await context.close();
  await browser.close();
}
