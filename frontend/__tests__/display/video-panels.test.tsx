import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Display, DisplaySyncEvent, Video, VolumeUpdateEvent } from "@/lib/types";

const mocks = vi.hoisted(() => ({
  params: new URLSearchParams(),
  get: vi.fn(),
  volume: undefined as ((event: VolumeUpdateEvent) => void) | undefined,
  sync: undefined as ((event: DisplaySyncEvent) => void) | undefined,
}));

vi.mock("next/navigation", () => ({ useSearchParams: () => mocks.params }));
vi.mock("@/lib/api", () => ({
  default: { get: mocks.get },
  getLayanans: vi.fn(async () => ({ data: [] })),
}));
vi.mock("@/hooks/use-websocket", () => ({
  useVolumeChannel: (callback: typeof mocks.volume) => { mocks.volume = callback; },
  useDisplayChannel: (callback: typeof mocks.sync) => { mocks.sync = callback; },
}));

import DisplayPage from "@/app/display/page";

const display = (id: number, isActive = true): Display => ({
  id, name: `Display ${id}`, location: "Lobby", is_active: isActive,
  settings: { volume: id === 1 ? 0.2 : 0.7, announcer_enabled: false },
});
const video = (id: number, displayId: number, order = 0, isActive = true): Video => ({
  id, display_id: displayId, title: `Video ${id}`, file_url: `/storage/videos/${id}.mp4`,
  duration: 10, volume_level: 0.5, is_active: isActive, playlist_order: order,
});

let host: HTMLDivElement;
let root: Root;
let displays: Display[];
let playlists: Record<number, Video[]>;
let load: ReturnType<typeof vi.spyOn>;
let play: ReturnType<typeof vi.spyOn>;

async function settle() {
  await act(async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); });
}
async function render() {
  await act(async () => { root.render(<DisplayPage />); });
  await settle();
}
const sources = () => Array.from(host.querySelectorAll("video source")).map((el) => el.getAttribute("src"));
const playerFor = (id: number) => Array.from(host.querySelectorAll("video")).find(
  (el) => el.querySelector("source")?.getAttribute("src")?.endsWith(`/${id}.mp4`),
);
async function startTv() {
  const trigger = host.querySelector<HTMLElement>('button, [tabindex="0"]');
  expect(trigger, "one shared TV start control should be available").not.toBeNull();
  await act(async () => {
    trigger!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  });
  await settle();
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers();
  mocks.params = new URLSearchParams();
  displays = [display(1), display(2), display(3, false)];
  playlists = { 1: [video(12, 1, 2), video(11, 1, 1), video(10, 1, 0, false)], 2: [video(21, 2)], 3: [video(31, 3)] };
  mocks.get.mockReset().mockImplementation(async (path: string, config?: { params?: { display_id?: number } }) => {
    if (path === "/displays") return { data: { data: structuredClone(displays) } };
    if (path === "/videos") return { data: { data: structuredClone(playlists[config?.params?.display_id ?? 0] ?? []) } };
    if (path.endsWith("/sync")) return { data: { data: {} } };
    if (path.startsWith("/tts/")) return { data: {} };
    throw new Error(`Unexpected API request: ${path}`);
  });
  load = vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "canPlayType").mockReturnValue("probably");
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => { root.unmount(); });
  host.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("configured display video panels", () => {
  it("plays one active ordered playlist per active display, not inactive videos or displays", async () => {
    await render();
    expect(sources()).toEqual(["/storage/videos/11.mp4", "/storage/videos/21.mp4"]);
    expect(host.textContent).toContain("Display 1");
    expect(host.textContent).toContain("Display 2");
    expect(host.textContent).not.toContain("Display 3");
  });

  it("advances each playlist independently", async () => {
    await render();
    await act(async () => { playerFor(11)?.dispatchEvent(new Event("ended", { bubbles: true })); });
    await settle();
    expect(sources()).toEqual(["/storage/videos/12.mp4", "/storage/videos/21.mp4"]);
  });

  it("preserves explicit single-display URLs", async () => {
    mocks.params = new URLSearchParams("display=2");
    await render();
    expect(sources()).toEqual(["/storage/videos/21.mp4"]);
  });

  it("does not substitute an unrelated playlist for an unknown display ID", async () => {
    mocks.params = new URLSearchParams("display=999");
    await render();
    expect(host.querySelectorAll("video")).toHaveLength(0);
    expect(host.textContent).toMatch(/display tidak ditemukan/i);
  });

  it("shows an empty state instead of falling back to an inactive display", async () => {
    displays = [display(3, false)];
    await render();
    expect(host.querySelectorAll("video")).toHaveLength(0);
    expect(host.textContent).toMatch(/tidak ada display aktif/i);
  });

  it("routes admin volume updates by display ID without restarting video", async () => {
    await render();
    await act(async () => { document.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    const before = load.mock.calls.length;
    await act(async () => { mocks.volume?.({ display_id: 2, volume: 0.35 }); });
    await settle();
    expect(playerFor(11)?.volume).toBeCloseTo(0.2);
    expect(playerFor(21)?.volume).toBeCloseTo(0.35);
    expect(load.mock.calls).toHaveLength(before);
  });

  it("keeps a named placeholder for a display without an active playlist", async () => {
    playlists[2] = [];
    await render();
    expect(host.textContent).toContain("Display 2");
    expect(host.textContent).toMatch(/tidak ada video aktif/i);
    expect(sources()).toEqual(["/storage/videos/11.mp4"]);
  });

  it("refreshes admin changes without reloading unchanged video players", async () => {
    await render();
    const before = load.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    await settle();
    expect(load.mock.calls).toHaveLength(before);
    displays = [display(1), display(3)];
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    await settle();
    expect(sources()).toEqual(["/storage/videos/11.mp4", "/storage/videos/31.mp4"]);
  });

  it("keeps the last playable playlist during a transient refresh failure", async () => {
    await render();
    const original = mocks.get.getMockImplementation()!;
    mocks.get.mockImplementation((path: string, config?: unknown) => path === "/videos"
      ? Promise.reject(new Error("Temporary offline state")) : original(path, config));
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    await settle();
    expect(sources()).toEqual(["/storage/videos/11.mp4", "/storage/videos/21.mp4"]);
  });

  it("accepts later server volume settings after a previous websocket override", async () => {
    await render();
    await act(async () => {
      document.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      mocks.volume?.({ display_id: 2, volume: 0.35 });
    });
    expect(playerFor(21)?.volume).toBeCloseTo(0.35);
    displays[1].settings.volume = 0.6;
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    await settle();
    expect(playerFor(21)?.volume).toBeCloseTo(0.6);
  });

  it("ignores a delayed old poll when a newer poll has already completed", async () => {
    await render();
    const original = mocks.get.getMockImplementation()!;
    let finishOld: (value: unknown) => void = () => {};
    let delayed = false;
    mocks.get.mockImplementation((path: string, config?: unknown) => {
      if (path === "/displays" && !delayed) {
        delayed = true;
        return new Promise((resolve) => { finishOld = resolve; });
      }
      return original(path, config);
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    displays = [display(1), display(3)];
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    await settle();
    expect(sources()).toEqual(["/storage/videos/11.mp4", "/storage/videos/31.mp4"]);
    await act(async () => { finishOld({ data: { data: [display(1), display(2)] } }); });
    await settle();
    expect(sources()).toEqual(["/storage/videos/11.mp4", "/storage/videos/31.mp4"]);
  });
});

describe("Samsung TV shared start", () => {
  it("starts all TV panels after one remote Enter, with no second player overlay", async () => {
    mocks.params = new URLSearchParams("tv=1");
    await render();
    await startTv();
    expect(sources()).toEqual(["/storage/videos/11.mp4", "/storage/videos/21.mp4"]);
    expect(play.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(host.textContent).not.toMatch(/pour commencer|untuk mulai/i);
  });

  it("does not reload TV playback when status or display settings change", async () => {
    mocks.params = new URLSearchParams("tv=1");
    await render();
    await startTv();
    expect(host.querySelectorAll("video")).toHaveLength(2);
    const before = load.mock.calls.length;
    await act(async () => {
      mocks.sync?.({});
      mocks.volume?.({ display_id: 1, volume: 0.4, settings: { volume: 0.4, announcer_enabled: false } });
    });
    await settle();
    expect(load.mock.calls).toHaveLength(before);
    expect(playerFor(11)?.volume).toBeCloseTo(0.4);
    expect(playerFor(21)?.volume).toBeCloseTo(0.7);
  });
});
