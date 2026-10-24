/* eslint-disable @typescript-eslint/no-explicit-any */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ─── Legacy tv.html composite + stability harness ────────────────────────────
// Runs the real ES5 script in JSDOM (runScripts) with a scripted XHR, patched
// HTMLMediaElement and fake timers. No React involved — this is the Tizen
// legacy surface described in docs/samsung-tv-smoke.md.

// NOTE: `new URL(rel, import.meta.url)` is unreliable under the Vitest jsdom
// environment — resolve from the vitest cwd (frontend/) instead.
const tvHtml = readFileSync(join(process.cwd(), "public", "tv.html"), "utf8");

// jsdom ships no bundled TS types and dev deps must not change — require it.
const require_ = createRequire(import.meta.url);
const { JSDOM, VirtualConsole } = require_("jsdom") as { JSDOM: any; VirtualConsole: any };

interface CompositePayload {
  status: string;
  video_url: string | null;
  signature: string | null;
  generated_at: string | null;
  displays: Array<{ id: number; name: string }>;
  duration: number;
  message: string | null;
}

interface State {
  displays: Array<Record<string, unknown>>;
  videos: Record<string, Array<Record<string, unknown>>>;
  layanans: Array<Record<string, unknown>>;
  queues: Record<string, Array<Record<string, unknown>>>;
  composite: CompositePayload;
  requests: string[];
  loads: string[];
  audios: HTMLAudioElement[];
  hungTts: boolean;
}

const state: State = {
  displays: [],
  videos: {},
  layanans: [],
  queues: {},
  composite: {
    status: "unavailable",
    video_url: null,
    signature: null,
    generated_at: null,
    displays: [],
    duration: 300,
    message: null,
  },
  requests: [],
  loads: [],
  audios: [],
  hungTts: false,
};

const displayFixture = (id: number, active = true): Record<string, unknown> => ({
  id,
  name: `Display ${id}`,
  location: `Lantai ${id}`,
  is_active: active,
  settings: { volume: 0.5, announcer_enabled: false },
});

const videoFixture = (id: number, order = 0): Record<string, unknown> => ({
  id,
  display_id: 1,
  title: `Video ${id}`,
  file_url: `/storage/videos/${id}.mp4`,
  duration: 10,
  volume_level: 0.5,
  is_active: true,
  playlist_order: order,
});

const compositeReady = (file: string, sig: string): CompositePayload => ({
  status: "ready",
  video_url: `/storage/composites/${file}`,
  signature: sig,
  generated_at: "2026-10-24T00:00:00Z",
  displays: [
    { id: 1, name: "Display 1" },
    { id: 2, name: "Display 2" },
  ],
  duration: 300,
  message: null,
});

function respond(url: string): { status: number; body: unknown } {
  if (url.indexOf("/display-composite") !== -1) return { status: 200, body: { data: state.composite } };
  if (url.indexOf("/tts/queue/") !== -1) return { status: 200, body: { audio_url: "/storage/tts/a-1.wav", ticket_number: "A-1" } };
  if (url.indexOf("/queues") !== -1) {
    const id = (url.split("/layanans/")[1] ?? "").split("/")[0] || "0";
    return { status: 200, body: { data: state.queues[id] ?? [] } };
  }
  if (url.indexOf("/videos?") !== -1) {
    const id = (url.split("display_id=")[1] ?? "").split("&")[0] || "0";
    return { status: 200, body: { data: state.videos[id] ?? [] } };
  }
  if (url.indexOf("/layanans") !== -1) return { status: 200, body: { data: state.layanans } };
  if (url.indexOf("/displays") !== -1) return { status: 200, body: { data: state.displays } };
  return { status: 404, body: { message: "unexpected " + url } };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

interface Page {
  dom: any;
  window: any;
  doc: Document;
}

const openPages: Page[] = [];

function installMocks(w: any): void {
  const proto = w.HTMLMediaElement.prototype as unknown as Record<string, unknown>;
  proto.load = function (this: HTMLMediaElement) {
    state.loads.push(this.getAttribute("src") ?? "");
  };
  proto.pause = function (this: HTMLMediaElement & { _mockPaused?: boolean }) {
    this._mockPaused = true;
  };
  proto.play = function (this: HTMLMediaElement & { _mockPaused?: boolean }) {
    this._mockPaused = false;
    return Promise.resolve();
  };

  // Delegate window timers to the test realm so vi fake timers drive the page.
  w.setTimeout = ((fn: TimerHandler, ms?: number) => setTimeout(fn as () => void, ms)) as typeof w.setTimeout;
  w.clearTimeout = clearTimeout as unknown as typeof w.clearTimeout;
  w.setInterval = ((fn: TimerHandler, ms?: number) => setInterval(fn as () => void, ms)) as typeof w.setInterval;
  w.clearInterval = clearInterval as unknown as typeof w.clearInterval;

  class MockXHR {
    status = 0;
    readyState = 0;
    responseText = "";
    onreadystatechange: (() => void) | null = null;
    ontimeout: (() => void) | null = null;
    timeout = 0;
    private targetUrl = "";

    open(_method: string, url: string): void {
      this.targetUrl = url;
    }

    send(): void {
      state.requests.push(this.targetUrl);
      if (state.hungTts && this.targetUrl.includes("/tts/queue/")) {
        if (this.timeout > 0) setTimeout(() => this.ontimeout?.(), this.timeout);
        return;
      }
      void Promise.resolve().then(() => {
        const res = respond(this.targetUrl);
        this.readyState = 4;
        this.status = res.status;
        this.responseText = JSON.stringify(res.body);
        this.onreadystatechange?.();
      });
    }
  }
  w.XMLHttpRequest = MockXHR as unknown as typeof w.XMLHttpRequest;

  const NativeAudio = w.Audio;
  const WrappedAudio = function (this: unknown, url?: string): HTMLAudioElement {
    const el = new (NativeAudio as unknown as { new (url?: string): HTMLAudioElement })(url);
    el.setAttribute("data-fixture-source", url ?? "");
    state.audios.push(el);
    return el;
  } as unknown as typeof w.Audio;
  w.Audio = WrappedAudio;
}

async function renderPage(query = ""): Promise<Page> {
  const vc = new VirtualConsole();
  vc.on("jsdomError", () => {});
  const dom = new JSDOM(tvHtml, {
    runScripts: "dangerously",
    url: "http://localhost/tv.html" + query,
    virtualConsole: vc,
    beforeParse(w: any) {
      installMocks(w);
    },
  });
  const page: Page = { dom, window: dom.window, doc: dom.window.document };
  openPages.push(page);
  await flush();
  return page;
}

const videosIn = (doc: Document) => Array.from(doc.querySelectorAll("video"));
const srcOf = (v: Element) => v.getAttribute("src") ?? "";
const novideoText = (doc: Document) => (doc.getElementById("novideo")?.textContent ?? "").trim();
const compositeLoads = () => state.loads.filter((s) => s.indexOf("/storage/composites/") !== -1);
const originalPlaylistRequests = () => state.requests.filter((u) => u.indexOf("/videos?") !== -1);
const compositeRequests = () => state.requests.filter((u) => u.indexOf("/display-composite") !== -1);
const announceAudios = () =>
  state.audios.filter((a) => (a.getAttribute("data-fixture-source") ?? "").indexOf("/tts/") !== -1);

async function pressStart(page: Page): Promise<void> {
  page.doc.dispatchEvent(new page.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  await flush();
}

beforeEach(() => {
  vi.useFakeTimers();
  state.displays = [];
  state.videos = {};
  state.layanans = [];
  state.queues = {};
  state.composite = {
    status: "unavailable",
    video_url: null,
    signature: null,
    generated_at: null,
    displays: [],
    duration: 300,
    message: null,
  };
  state.requests = [];
  state.loads = [];
  state.audios = [];
  state.hungTts = false;
});

afterEach(() => {
  for (const page of openPages) {
    try {
      page.dom.window.close();
    } catch {
      /* already closed */
    }
  }
  openPages.length = 0;
  vi.useRealTimers();
});

// ─── Composite mode (no ?display param) ──────────────────────────────────────

describe("tv.html composite mode (no ?display)", () => {
  it("plays exactly one pre-rendered composite video without falling back to original playlists", async () => {
    state.displays = [displayFixture(1), displayFixture(2)];
    state.videos["1"] = [videoFixture(11)];
    state.videos["2"] = [videoFixture(21)];
    state.composite = compositeReady("abc123.mp4", "sig-a");

    const page = await renderPage();
    const vids = videosIn(page.doc);

    expect(vids).toHaveLength(1);
    expect(srcOf(vids[0])).toBe("/storage/composites/abc123.mp4");
    expect(originalPlaylistRequests()).toHaveLength(0);
    expect(page.doc.getElementById("displayName")?.textContent).toContain("Video Gabungan");
    expect(page.doc.getElementById("displayLoc")?.textContent).toContain("Display 1 · Display 2");
  });

  it("does not reload the composite when status polls return the same generation", async () => {
    state.displays = [displayFixture(1), displayFixture(2)];
    state.composite = compositeReady("abc123.mp4", "sig-a");

    const page = await renderPage();
    expect(compositeLoads()).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(30_000);
    await flush();

    expect(compositeLoads()).toHaveLength(1);
    expect(videosIn(page.doc)).toHaveLength(1);
    expect(srcOf(videosIn(page.doc)[0])).toBe("/storage/composites/abc123.mp4");
  });

  it("keeps playing the previous good composite while a new one is building", async () => {
    state.displays = [displayFixture(1), displayFixture(2)];
    state.composite = compositeReady("abc123.mp4", "sig-a");
    const page = await renderPage();

    state.composite = { ...compositeReady("abc123.mp4", "sig-a"), status: "building" };
    await vi.advanceTimersByTimeAsync(15_000);
    await flush();

    const vids = videosIn(page.doc);
    expect(vids).toHaveLength(1);
    expect(srcOf(vids[0])).toBe("/storage/composites/abc123.mp4");
    expect(compositeLoads()).toHaveLength(1);
    expect(originalPlaylistRequests()).toHaveLength(0);
  });

  it("shows the fixed unavailable state instead of silently playing an original video", async () => {
    state.displays = [displayFixture(1), displayFixture(2)];
    state.videos["1"] = [videoFixture(11)];
    state.composite = {
      status: "unavailable",
      video_url: null,
      signature: null,
      generated_at: null,
      displays: [],
      duration: 300,
      message: "Renderer belum dijalankan",
    };

    const page = await renderPage();

    expect(videosIn(page.doc)).toHaveLength(0);
    expect(novideoText(page.doc)).toMatch(/tidak tersedia|belum dijalankan/i);
    expect(originalPlaylistRequests()).toHaveLength(0);
  });

  it("takes over a new generation at the next clip boundary, not mid-clip", async () => {
    state.displays = [displayFixture(1), displayFixture(2)];
    state.composite = compositeReady("abc123.mp4", "sig-a");
    const page = await renderPage();

    state.composite = compositeReady("def456.mp4", "sig-b");
    await vi.advanceTimersByTimeAsync(15_000);
    await flush();

    expect(srcOf(videosIn(page.doc)[0])).toBe("/storage/composites/abc123.mp4");

    videosIn(page.doc)[0].dispatchEvent(new page.window.Event("ended"));
    await flush();

    const vids = videosIn(page.doc);
    expect(vids).toHaveLength(1);
    expect(srcOf(vids[0])).toBe("/storage/composites/def456.mp4");
  });

  it("loads the empty status even when there are no configured displays", async () => {
    state.displays = [];
    state.composite = { ...state.composite, status: "empty" };
    const page = await renderPage();
    expect(compositeRequests()).toHaveLength(1);
    expect(novideoText(page.doc)).toContain("Tidak ada display aktif");
  });

  it("withdraws the current video when all displays become inactive", async () => {
    state.displays = [displayFixture(1)];
    state.composite = compositeReady("abc123.mp4", "sig-a");
    const page = await renderPage();
    state.displays = [displayFixture(1, false)];
    state.composite = { ...state.composite, status: "empty", video_url: null, displays: [] };
    await vi.advanceTimersByTimeAsync(15_000);
    await flush();
    expect(videosIn(page.doc)).toHaveLength(0);
    expect(novideoText(page.doc)).toContain("Tidak ada display aktif");
  });

  it("recovers a failed old generation on the next status poll without waiting for ended", async () => {
    state.displays = [displayFixture(1)];
    state.composite = compositeReady("abc123.mp4", "sig-a");
    const page = await renderPage();
    videosIn(page.doc)[0].dispatchEvent(new page.window.Event("error"));
    state.composite = compositeReady("new456.mp4", "sig-new");
    await vi.advanceTimersByTimeAsync(15_000);
    await flush();
    expect(srcOf(videosIn(page.doc)[0])).toBe("/storage/composites/new456.mp4");
  });
});

// ─── Explicit ?display=ID mode ───────────────────────────────────────────────

describe("tv.html explicit ?display=ID", () => {
  it("filters disabled clips and orders the active playlist", async () => {
    state.displays = [displayFixture(1)];
    state.videos["1"] = [videoFixture(12, 2), { ...videoFixture(10), is_active: false }, videoFixture(11, 1)];
    const page = await renderPage("?display=1");
    expect(srcOf(videosIn(page.doc)[0])).toBe("/storage/videos/11.mp4");
    state.videos["1"] = [];
    await vi.advanceTimersByTimeAsync(15_000);
    await flush();
    expect(videosIn(page.doc)).toHaveLength(0);
  });
  it("plays the original single-display playlist and never requests the composite", async () => {
    state.displays = [displayFixture(1), displayFixture(2, false)];
    state.videos["1"] = [videoFixture(11)];

    const page = await renderPage("?display=1");

    const vids = videosIn(page.doc);
    expect(vids).toHaveLength(1);
    expect(srcOf(vids[0])).toBe("/storage/videos/11.mp4");
    expect(compositeRequests()).toHaveLength(0);
    expect(page.doc.getElementById("displayName")?.textContent).toBe("Display 1");
  });

  it("shows a clear not-found state for an unknown ID with no fallback", async () => {
    state.displays = [displayFixture(1)];
    state.videos["1"] = [videoFixture(11)];

    const page = await renderPage("?display=999");

    expect(videosIn(page.doc)).toHaveLength(0);
    expect(page.doc.body.textContent ?? "").toMatch(/tidak ditemukan/i);
    expect(originalPlaylistRequests()).toHaveLength(0);
    expect(compositeRequests()).toHaveLength(0);
    expect(page.doc.querySelectorAll(".card")).toHaveLength(0);
  });

  it("honours configured volume 0 (muted) after OK/Enter in playlist mode", async () => {
    state.displays = [{ ...displayFixture(1), settings: { volume: 0, announcer_enabled: false } }];
    state.videos["1"] = [videoFixture(11)];

    const page = await renderPage("?display=1");
    await pressStart(page);

    const v = videosIn(page.doc)[0] as HTMLVideoElement;
    expect(v.volume).toBe(0);
    expect(v.muted).toBe(true);
  });
});

// ─── Master volume & remote stability ────────────────────────────────────────

describe("tv.html composite master volume & remote stability", () => {
  it("plays the pre-mixed composite at master volume 1 regardless of display settings", async () => {
    state.displays = [
      { ...displayFixture(1), settings: { volume: 0.3, announcer_enabled: false } },
      { ...displayFixture(2), settings: { volume: 0.7, announcer_enabled: false } },
    ];
    state.composite = compositeReady("abc123.mp4", "sig-a");

    const page = await renderPage();
    await pressStart(page);

    const v = videosIn(page.doc)[0] as HTMLVideoElement;
    expect(v.volume).toBe(1);
    expect(v.muted).toBe(false);
  });

  it("does not reload media when OK/Enter is pressed repeatedly", async () => {
    state.displays = [displayFixture(1), displayFixture(2)];
    state.composite = compositeReady("abc123.mp4", "sig-a");

    const page = await renderPage();
    await pressStart(page);

    const loadsBefore = state.loads.length;
    const srcBefore = srcOf(videosIn(page.doc)[0]);

    await pressStart(page);
    await pressStart(page);
    await flush();

    expect(state.loads.length).toBe(loadsBefore);
    expect(videosIn(page.doc)).toHaveLength(1);
    expect(srcOf(videosIn(page.doc)[0])).toBe(srcBefore);
  });
});

// ─── Announcer decoder handoff & dedupe ──────────────────────────────────────

describe("tv.html announcer handoff", () => {
  const announcerFixtures = () => {
    state.displays = [
      { ...displayFixture(1), settings: { volume: 0.5, announcer_enabled: true, announcer_volume: 0.9 } },
    ];
    state.videos["1"] = [videoFixture(11)];
    state.layanans = [{ id: 11, name: "Layanan A", code: "A", counter: { name: "Loket 1" } }];
    state.queues["11"] = [
      {
        id: 5,
        ticket_number: "A-1",
        status: "called",
        called_at: "2026-10-24T08:00:00.000Z",
        counter: { name: "Loket 1" },
      },
    ];
  };

  it("ships a real silent WAV in the same public surface as the legacy page", async () => {
    const path = join(process.cwd(), "public", "sounds", "silence.wav");
    expect(existsSync(path)).toBe(true);
    const wav = readFileSync(path);
    expect(wav.toString("ascii", 0, 4)).toBe("RIFF");
    expect(wav.toString("ascii", 8, 12)).toBe("WAVE");
    const page = await renderPage();
    await pressStart(page);
    expect(state.audios[0].getAttribute("src")).toBe("/sounds/silence.wav");
  });

  it("recovers announcement playback after a hung TTS request times out", async () => {
    announcerFixtures();
    state.hungTts = true;
    const page = await renderPage("?display=1");
    await pressStart(page);
    await vi.advanceTimersByTimeAsync(3_000);
    await flush();
    expect(announceAudios()).toHaveLength(0);
    state.hungTts = false;
    await vi.advanceTimersByTimeAsync(13_000);
    await flush();
    await vi.advanceTimersByTimeAsync(3_000);
    await flush();
    expect(announceAudios()).toHaveLength(1);
  });

  it("releases the video decoder before announcer audio, then recreates the video after it ends", async () => {
    announcerFixtures();
    const page = await renderPage("?display=1");
    await pressStart(page);
    expect(announceAudios()).toHaveLength(0); // only silence priming so far

    await vi.advanceTimersByTimeAsync(3_000);
    await flush();

    expect(announceAudios()).toHaveLength(1);
    const firstVid = videosIn(page.doc)[0] as HTMLVideoElement & { _mockPaused?: boolean };
    expect(firstVid._mockPaused).toBe(true); // explicitly paused before the Audio started
    expect(firstVid.getAttribute("src")).toBeNull(); // src dropped to free the decoder

    announceAudios()[0].dispatchEvent(new page.window.Event("ended"));
    await flush();

    const vids = videosIn(page.doc);
    expect(vids).toHaveLength(1);
    expect(vids[0]).not.toBe(firstVid); // fresh element (fresh decoder), not revived
    expect(srcOf(vids[0])).toBe("/storage/videos/11.mp4");
    expect(announceAudios()[0].getAttribute("src")).toBeNull();
  });

  it("releases an overlong announcer before restoring the single video decoder", async () => {
    announcerFixtures();
    const page = await renderPage("?display=1");
    await pressStart(page);
    await vi.advanceTimersByTimeAsync(3_000);
    await flush();
    const audio = announceAudios()[0] as HTMLAudioElement & { _mockPaused?: boolean };
    await vi.advanceTimersByTimeAsync(30_000);
    await flush();
    expect(audio._mockPaused).toBe(true);
    expect(audio.getAttribute("src")).toBeNull();
    expect(srcOf(videosIn(page.doc)[0])).toBe("/storage/videos/11.mp4");
  });

  it("does not re-announce the same queue after config polls and does not duplicate card intervals", async () => {
    announcerFixtures();
    const page = await renderPage("?display=1");
    await pressStart(page);

    await vi.advanceTimersByTimeAsync(3_000);
    await flush();
    expect(announceAudios()).toHaveLength(1);

    announceAudios()[0].dispatchEvent(new page.window.Event("ended"));
    await flush();

    await vi.advanceTimersByTimeAsync(15_000); // config poll — must not reset dedupe
    await flush();
    expect(announceAudios()).toHaveLength(1);
    expect(page.doc.querySelectorAll(".card")).toHaveLength(1); // cards not recreated

    const queueRequestsBefore = state.requests.filter((u) => u.indexOf("/queues") !== -1).length;
    await vi.advanceTimersByTimeAsync(3_000);
    await flush();
    const queueDelta = state.requests.filter((u) => u.indexOf("/queues") !== -1).length - queueRequestsBefore;
    expect(queueDelta).toBe(1); // exactly one card interval, no duplication
    expect(announceAudios()).toHaveLength(1);
  });
});
