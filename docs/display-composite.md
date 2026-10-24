# Display Composite — Server-Composited MP4 for the Samsung TV

> Target device: **Samsung UA55MU6100** (2017 MU6100 series, Tizen 3.0) — one hardware media decoder.
> Mode: **server-composited MP4** (offline file render, one `<video>` on the TV).
> Browser mode: React `/display` with N independent panels — the desktop/browser path.

The UA55MU6100 has a single hardware decoder. A browser page that plays several
independent `<video>` elements cannot rely on that device to decode them all.
Composite mode sidesteps that limit: the **server** renders every active display
panel into a single H.264/AAC MP4, and the TV plays exactly one file.

This is an **operator runbook + reference** for the feature. Source of truth:

| Concern | File |
| --- | --- |
| Render pipeline, snapshot, signature, pruning | `backend/app/Services/DisplayCompositeService.php` |
| Tunables and env fallbacks | `backend/config/display_composite.php` |
| CLI entry point | `backend/app/Console/Commands/ComposeDisplays.php` |
| Read-only status endpoint | `backend/app/Http/Controllers/Api/DisplayCompositeController.php` |
| Route (`GET /api/v1/display-composite`) | `backend/routes/api.php:33` |

---

## 1. Output contract

| Property | Value |
| --- | --- |
| File on disk | `backend/storage/app/public/composites/<sha256>.mp4` |
| Public URL | `/storage/composites/<sha256>.mp4` |
| Container | MP4, `+faststart` (moov atom first — progressive playback) |
| Video | H.264 Main, level 4.0 (`libx264`, `veryfast`, CRF 23, `-threads 2`, maxrate 8 Mbps / VBV 16 Mbps), `yuv420p`, 25 fps |
| Audio | AAC, 48 kHz, stereo, 128 kbps |
| Frame | 1920×1080, SAR 1:1, black padding to full width |
| Length | 300 s (config `display_composite.duration`) |
| Encoding wall-clock budget | ≤ 1800 s total for one render (config `display_composite.timeout`) |

`<sha256>` is the **signature** of the render inputs (see §6). Identical inputs
produce the identical filename, so a re-render never produces a new URL unless
something actually changed.

### This is a file, not a live stream

The MP4 is an **offline render**. There is no HLS, no DASH, no segmenting, and
no browser-side `AVPlayer`/multi-decode path. The TV loads a static file over
HTTP and loops it. Update latency for an admin change is therefore
`poll (15 s) + render time`, not sub-second. Do not describe this feature as
"live video" in operator-facing material.

The profile/level and 8 Mbps rate cap stay below the 2017 Samsung FHD media
specification's H.264 level 4.1 / 20 Mbps limit. This is a compatibility target,
not a substitute for the physical-TV smoke test:
<https://developer.samsung.com/smarttv/develop/specifications/media-specifications/2017-tv-video-specifications.html>.

---

## 2. Timeline semantics — read before trusting a long playlist

- The output file is exactly **300 seconds** long.
- Each panel gets its own **300-second normalization budget**, spent in
  playlist order (`playlist_order`, then `id`).
- **Consequence: clips that would start after the first 300 s of a panel's
  ordered playlist are not rendered at all.** They never appear, because the
  panel's rendered playlist restarts from its own beginning — the later clips
  are not part of that list. A 20-minute playlist does *not* play 20 minutes;
  only its first 300 seconds of content are ever rendered.
- Inside one render each panel's playlist loops **independently**
  (`-stream_loop -1` per panel input). Panels with different playlist lengths
  therefore restart at different moments and are **not phase-aligned**.
- When the TV replays the file (file boundary), **all panels restart together**
  from their own first frame. The loop is a hard cut, not a crossfade — expect a
  visible jump at the boundary and verify it on the actual TV.

---

## 3. Requirements

- PHP 8.3+ and the Laravel app (`backend/`).
- `ffmpeg` and `ffprobe` on the machine that runs the renderer. Same binaries
  the dynamic TTS announcer already uses (`DynamicAnnouncerService`).
- `php artisan storage:link` — `backend/public/storage → backend/storage/app/public`.
  Without it, `/storage/composites/<hash>.mp4` is a 404.
- Write access to `backend/storage/app/private/display-composite` (created `0700`)
  and `backend/storage/app/public/composites`; read access to
  `backend/storage/app/public/videos`.
- Local toolchain is installed from the committed lockfiles (`npm ci`,
  `composer install` without scripts). No package upgrade, no migration, and no
  production change is part of this feature.

---

## 4. Configuration

| Config key | Env override | Default | Notes |
| --- | --- | --- | --- |
| `display_composite.ffmpeg` | `DISPLAY_COMPOSITE_FFMPEG` → `DYNAMIC_TTS_FFMPEG` → `ffmpeg` | `ffmpeg` | Absolute path recommended on the VPS. |
| `display_composite.ffprobe` | `DISPLAY_COMPOSITE_FFPROBE` | `ffprobe` | |
| `display_composite.state_path` | — | `storage/app/private/display-composite` | `status.json` + `compose.lock` live here. |
| `display_composite.width` | — | `1920` | Clamped 160–1920, forced even. |
| `display_composite.height` | — | `1080` | Clamped 90–1080, forced even. |
| `display_composite.duration` | — | `300` | Clamped 1–300. |
| `display_composite.timeout` | — | `1800` | Total render deadline, clamped 5–1800 s. |
| `display_composite.poll_seconds` | — | `15` | Watch-mode poll interval, clamped 5–60 s. |

Env changes need a config rebuild (`php artisan optimize:clear && php artisan
config:cache`) before the running process sees them.

---

## 5. Running the renderer

```bash
cd backend            # or /var/www/antrian/backend on the VPS

# One-shot: render now, then exit
php artisan displays:compose

# Watch: re-check every ~15 s and re-render when inputs change
php artisan displays:compose --watch
```

Console output (`Composite: …`):

| Result | Meaning |
| --- | --- |
| `ready` | A new composite was rendered and published. |
| `unchanged` | Inputs match the current signature — **FFmpeg was not started**. |
| `empty` | No active displays; the previous output URL was withdrawn. |
| `busy` | Another renderer holds the lock; this process did nothing. |
| `Composite generation failed; check the application log.` | Render failed. One-shot mode exits with code 1; `--watch` logs the exception and keeps polling. |

Operational rules:

- **Run it as its own long-running OS service.** It is *not* a queue job.
  The existing worker in `DEPLOY.md` runs `queue:work --sleep=3 --tries=3 --timeout=90`;
  a 90-second timeout is far below render time and would kill FFmpeg mid-render,
  abort the composite, and (on a hard kill) leave a stray `.<token>.part` file in
  `storage/app/public/composites/`.
- **No auto-scheduling.** Nothing in the application schedules this command —
  the operator (or the OS service manager) starts it.
- `--watch` handles `SIGINT`/`SIGTERM` when the `pcntl` extension is available
  and finishes the current render before stopping. Idle shutdown checks run
  every second. Allow at least the 1800-second render deadline when configuring
  a process manager's graceful-stop timeout; SIGKILL bypasses cleanup.
- The renderer holds an exclusive lock (`compose.lock`) for the whole build, so
  two renderers can never write the same output concurrently.

---

## 6. API reference — `GET /api/v1/display-composite`

Public (no authentication), read-only, `Cache-Control: no-store`. It **never**
enqueues a job and never starts an encoder.

```bash
curl -s http://<host>/api/v1/display-composite
```

```json
{
  "data": {
    "status": "ready",
    "video_url": "/storage/composites/<sha256>.mp4",
    "signature": "<sha256>",
    "generated_at": "2026-10-24T09:15:04+08:00",
    "displays": [
      { "id": 1, "name": "Lobby" },
      { "id": 2, "name": "Loket 1" }
    ],
    "duration": 300,
    "message": null
  }
}
```

| Field | Notes |
| --- | --- |
| `status` | `ready` \| `building` \| `error` \| `empty` \| `unavailable`. |
| `video_url` | Public path, or `null` when there is nothing playable. Only ever `/storage/composites/<64 hex>.mp4`. |
| `signature` | Render-input signature; `null` when `video_url` is `null`. |
| `generated_at` | ISO-8601 publish time of the current file; `null` when `video_url` is `null`. |
| `displays` | `[{id, name}]` of the panels in the current file; empty when `video_url` is `null`. |
| `duration` | Always the configured length (300). |
| `message` | Fixed public text per status; `null` when `ready`. |

| Status | Public `message` | `video_url` |
| --- | --- | --- |
| `ready` | `null` | current file |
| `building` | `Video gabungan sedang disiapkan.` | previous file (still playable) |
| `error` | `Video gabungan gagal dibuat. Periksa proses render di server.` | previous file, or `null` if there never was one |
| `empty` | `Tidak ada display aktif.` | `null` |
| `unavailable` | `Video gabungan belum tersedia. Jalankan proses render di server.` | `null` |

`unavailable` is the state before the first successful build. The endpoint
exposes neither local file paths nor encoder error details — the reason for a
failure is only in the Laravel log (`storage/logs/laravel.log`, message
`Display composite rendering failed.`).

### Change detection

The **signature** is `sha256` over a deterministic snapshot: active displays
(ordered by `id`), their active clips (ordered by `playlist_order`, then `id`),
each clip's local path/size/mtime/ctime, display names, output format, and per-panel volume.

- Same signature → `unchanged`, **no FFmpeg process is started** (verified by
  `backend/tests/Feature/DisplayCompositeTest.php`).
- A re-render is triggered by: a display activated/deactivated/added/removed, a
  playlist reorder, a source file replaced (size/mtime change), or a per-display
  volume or display-name change. Same-size, same-second in-place edits are not
  a supported replacement method; replace videos through the admin upload API.

---

## 7. Failure, concurrency, and file handling

- **Background render keeps the old file.** During a rebuild the status becomes
  `building`, but `video_url` keeps pointing at the last good file, so the TV
  does not go blank.
- **Atomic publish.** The new file is written to a hidden `.<token>.part` file,
  validated with `ffprobe` (H.264 / `yuv420p` / 1920×1080 / AAC / duration
  within ±0.25 s), then renamed into place. A failed render never publishes a
  partial file.
- **Failure semantics.** Status becomes `error` with the fixed public message;
  the previous file stays available; details go to the Laravel log only.
- **Configuration changed mid-render** → the render is discarded
  (`Display configuration changed during rendering; retry with current inputs.`)
  and the next poll re-renders from the current inputs.
- **Pruning.** After each successful publish, generated files matching
  `<64 hex>.mp4` that are not the current one and are older than **600 s** are
  deleted. Uploaded source videos in `storage/app/public/videos` are never
  touched. (While the status is `empty`/`error`, pruning does not run, so old
  files can linger until a successful publish happens again.)
- **Lock.** `compose.lock` (exclusive, non-blocking) → a second renderer
  returns `busy` instead of duplicating work.
- **Crash recovery.** While holding that lock, the next build removes only
  strictly named stale `work-<24 hex>` directories, `.<24 hex>.part` outputs,
  and `status-<16 hex>.tmp` files older than the render deadline. Recent or
  unrelated files are retained.

---

## 8. Source and limit restrictions

| Rule | Value |
| --- | --- |
| Accepted source | `/storage/videos/<file>` with extension `mp4`, `mov`, `webm`, `mkv`, `avi`, `ogv`, resolving inside `storage/app/public/videos` |
| Remote URLs | **Rejected** — render fails with `Composite requires local uploaded video files.` |
| Path traversal / symlink escape | **Rejected** (realpath containment check) |
| Missing or renamed file | Render fails; the whole composite fails |
| Active displays | Max **8** (`Composite supports at most eight active displays.`) |
| Active clips (all panels) | Max **64** (`Composite supports at most 64 active video sources.`) |
| Clip with no video stream / no finite duration | Render fails (`Video input has no finite playable video duration.`) |

A single broken source therefore takes down the entire composite, not just one
panel. Fix the source and the next poll re-renders.

---

## 9. Volume and audio rules

- Per-display volume = `settings.volume`, else the first active clip's
  `volume_level`, else `1`. Clamped to `0…1`; a non-finite value becomes `0`.
- **Per-display volume is baked into the render.** Changing it in the admin
  requires a new render — it is not a live instant change.
- **The TV's own volume slider remains the master** for the whole composite.
- Panels are mixed with `amix` (`normalize=0`, i.e. levels are summed, not
  averaged) and passed through `alimiter`.
- A clip with no audio track is normalized to **silence**, so a silent panel
  does not break the mix.
- A panel with no active clips renders as a dark filler (`0x0f172a`) at 25 fps
  with silence, not as a missing hole.
- Panel width = 1920 ÷ number of panels, rounded down to an even number; any
  leftover width is padded black. With 7 panels the content is 1918 px wide and
  1 px of black is padded on each side.

---

## 10. Workstation checks (before walking to the TV)

```bash
# 1. Tooling present
ffmpeg  -version | head -1
ffprobe -version | head -1

# 2. Storage link present (Apache/nginx serve /storage through it)
ls -l backend/public/storage

# 3. Render once, watch the console line
cd backend && php artisan displays:compose

# 4. Status endpoint (public, read-only)
curl -s http://<host>/api/v1/display-composite | jq .

# 5. Inspect the published file: codecs, dimensions, duration
ffprobe -v error \
  -show_entries stream=codec_type,codec_name,width,height,pix_fmt,r_frame_rate:format=duration \
  -of default=noprint_wrappers=1 \
  backend/storage/app/public/composites/<sha256>.mp4

# (JSON variant, same info)
ffprobe -v error -show_streams -show_format -of json \
  backend/storage/app/public/composites/<sha256>.mp4 | jq '.streams[].codec_name, .format.duration'

# 6. HTTP Range support (Tizen seeks via 206 Partial Content)
curl -sI -H "Range: bytes=0-1023" \
  http://<host>/storage/composites/<sha256>.mp4 | tr -d '\r' | head -12
```

Expected:

- [ ] `ffmpeg` / `ffprobe` resolvable by the user running the renderer.
- [ ] `backend/public/storage` symlink exists.
- [ ] `displays:compose` prints `Composite: ready` (or `unchanged` on a second run).
- [ ] `GET /api/v1/display-composite` returns `status: ready` and a
      `/storage/composites/<64 hex>.mp4` URL.
- [ ] `ffprobe` reports `codec_name=h264`, `width=1920`, `height=1080`,
      `pix_fmt=yuv420p`, `r_frame_rate=25/1`, an AAC audio stream, and
      `duration ≈ 300`.
- [ ] The Range request returns `206 Partial Content` with `Content-Type: video/mp4`.

---

## 11. Manual TV checklist (hardware only)

Desktop Chrome, `ffprobe`, and `curl` **cannot** prove Samsung behaviour. Run
this on the actual UA55MU6100 before rollout, together with
[`docs/samsung-tv-smoke.md`](samsung-tv-smoke.md).

- [ ] The TV shows one composite video containing a panel per active display.
- [ ] The panel count matches the number of active displays. The top bar shows
      `Video Gabungan (N display)`; individual names are available in the status
      API, not burnt into the video pixels.
- [ ] After the 300 s file boundary, **all panels restart together**; no panel
      freezes, stutters, or shows a stale frame.
- [ ] Polling is stable: the page does not reset, and the composite URL does not
      change on every poll.
- [ ] Swapping works: change a playlist or activate/deactivate a display in the
      admin, wait for the next render, and confirm the TV picks up the new file.
- [ ] Audio: a panel whose clip has no audio is silent, not broken; per-panel
      volume is audible as baked; the TV master slider still works.
- [ ] **Announcer handoff (single audio decoder):** after the TTS announcement
      ends, the audio decoder must be released and the video **recreated** — the
      existing `tv.html` behaviour (`new Audio(wav_url)` + full `<video>` DOM
      recreation on handoff, never reassigning `src` on a dead node). This must
      be verified on the actual TV before rollout.

---

## 12. TV page integration status

- Legacy `/tv.html` **without a parameter** consumes the single composite.
- `/tv.html?display=<ID>` keeps a single display's own playlist; an **invalid
  ID shows an error state and does not fall back** to the composite.
- A healthy unchanged generation is not reloaded by the 15-second status poll.
  New generations take over at the next file boundary or after announcer handoff.
  Decode/network failures retry from the current status on the next poll; an
  explicit `empty` status releases the old video instead of showing stale media.
- Announcer playback releases the video source first; completion/error/timeout
  releases the audio source before recreating the video. Both transitions need
  physical-device verification. Source code and desktop fixtures cannot certify it.
- The React `/display` page renders independent browser panels and remains the
  desktop/browser path. `/display?tv=1` is a separate React surface, **not** the
  single-decoder solution for the UA55MU6100; use `/tv.html` on that device.

---

## 13. Deployment (documentation only — not applied)

> These examples are **documentation**. Adding a systemd unit / supervisor
> program, installing `ffmpeg` on the VPS, or touching production is a
> production change and needs **separate explicit deployment approval**.
> Paths below follow [`DEPLOY.md`](../DEPLOY.md) (app at `/var/www/antrian`,
> backend at `/var/www/antrian/backend`, service user `www-data`).

systemd:

```ini
# /etc/systemd/system/antrian-composite.service
[Unit]
Description=Antrian Display Composite Renderer
After=network.target mysql.service

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/var/www/antrian/backend
ExecStart=/usr/bin/php artisan displays:compose --watch
Restart=always
RestartSec=5
TimeoutStopSec=1830
KillSignal=SIGTERM

[Install]
WantedBy=multi-user.target
```

supervisor:

```ini
[program:antrian-composite]
directory=/var/www/antrian/backend
command=/usr/bin/php artisan displays:compose --watch
user=www-data
autostart=true
autorestart=true
stopsignal=TERM
stopwaitsecs=1830
stdout_logfile=/var/log/supervisor/antrian-composite.log
redirect_stderr=true
```

Serving the output:

- **Apache** (the `DEPLOY.md` setup): the vhost's `DocumentRoot` is
  `backend/public` and `ProxyPassMatch` excludes `/storage`, so the existing
  `php artisan storage:link` is sufficient — Apache serves
  `/storage/composites/<hash>.mp4` straight from the filesystem.
- **nginx** equivalent: serve `/storage` from the filesystem
  (`location /storage/ { alias /var/www/antrian/backend/storage/app/public/; }`) and make sure
  it is **not** proxied to the Next.js server. The `public/storage` symlink
  must exist either way.

---

## 14. Known limitations

- 300 s per-panel budget — long playlists are truncated (§2).
- Panels loop independently inside a render; the file boundary is a hard cut.
- Per-display volume changes require a re-render.
- One broken source fails the entire composite.
- No live stream: change latency = poll interval + render time.
- Composite rendering is CPU-bound (two video-encoding threads, one thread per
  input decoder, plus filter/audio work); this is not a strict two-core CPU quota.
  Run it on a host with sufficient headroom, separate from the web workers.

---

## Related

- [`docs/samsung-tv-smoke.md`](samsung-tv-smoke.md) — full TV smoke gate
  (legacy `tv.html` + React `/display`).
- [`DEPLOY.md`](../DEPLOY.md) — production deployment (paths, services, vhost).
