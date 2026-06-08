# Samsung TV Display — Manual Smoke Checklist

> Target device: **Samsung UA55MU6100** (2017 MU6100 series, Tizen 3.0)
> Legacy page: `frontend/public/tv.html` served at `http://192.168.5.14/tv.html`
> React page: `frontend/app/display/page.tsx` served at `http://192.168.5.14/display?tv=1`

This checklist is the in-repo smoke gate for any change that touches the
Samsung TV display path. The TV is a separate platform target with a single
hardware media decoder and an older browser engine — it does NOT behave like
desktop Chrome. Treat `tv.html` and `/display?tv=1` as distinct surfaces and
run the relevant section before merging display-side work.

Background and rationale live in the `antrian-codebase` skill references:
`legacy-tv-html-display.md`, `samsung-tv-display-compat.md`,
`dynamic-tv-announcer-tts.md`, and `timezone-wita-frontend-tv.md`.

---

## When to run this

Run this checklist when a change touches any of:

- `frontend/public/tv.html`
- `frontend/app/display/**` or `frontend/components/display/**`
- the public display/queue/TTS endpoints
  (`/api/v1/displays`, `/api/v1/displays/{id}/sync`, `/api/v1/layanans/{id}/queues`,
  `/api/v1/tts/queue/{id}`, `/api/v1/videos`)
- `QueueCalled` / `QueueCompleted` broadcast payloads consumed by the display
- Apache vhost / `ServerAlias` / `/storage` video serving

---

## Pre-flight (from a workstation, no TV required)

These curl checks catch most regressions before you walk to the TV.

```bash
# 1. Pages reachable
curl -s -o /dev/null -w "TV_HTML:%{http_code}\n"      http://192.168.5.14/tv.html
curl -s -o /dev/null -w "DISPLAY:%{http_code}\n"      "http://192.168.5.14/display?tv=1&debug=1"
curl -s -o /dev/null -w "HOST_DISPLAY:%{http_code}\n" -H "Host: antrian.pn" "http://127.0.0.1/display?tv=1&debug=1"

# 2. Public APIs the display depends on
curl -s -o /dev/null -w "LAYANAN:%{http_code}\n"  http://192.168.5.14/api/v1/layanans
curl -s -o /dev/null -w "DISPLAYS:%{http_code}\n" http://192.168.5.14/api/v1/displays

# 3. Video must support HTTP Range (Tizen seeks/streams via 206)
first=$(find /var/www/antrian/backend/storage/app/public/videos -type f \( -name "*.mp4" -o -name "*.MP4" \) | head -1)
if [ -n "$first" ]; then
  rel=${first#/var/www/antrian/backend/storage/app/public}
  curl -sI -H "Range: bytes=0-1023" "http://192.168.5.14/storage$rel" | tr -d '\r' | head -12
fi

# 4. tv.html still contains the critical helpers (catches accidental deletion)
curl -s http://192.168.5.14/tv.html | grep -E "fitVideo|playAnnouncer|recreateVideo|tts/queue"
```

Expected:

- [ ] `TV_HTML`, `DISPLAY`, `HOST_DISPLAY`, `LAYANAN`, `DISPLAYS` all return `200`.
- [ ] Video Range request returns `206 Partial Content` with `Content-Type: video/mp4`.
- [ ] `grep` finds `fitVideo`, `playAnnouncer`, video-recreation, and the TTS call.

---

## A. Legacy `tv.html` smoke (UA55MU6100 / Tizen 3)

On the actual TV, open `http://192.168.5.14/tv.html`.

### A1. Load & start
- [ ] Page loads without getting stuck on `Memuat...`.
- [ ] Start overlay shows "Tekan OK / ENTER untuk mulai".
- [ ] Pressing OK/Enter hides the overlay and begins video playback.

### A2. Video rendering
- [ ] Video is centered and NOT cut in half / cropped (no `object-fit:contain` regression).
- [ ] Mixed aspect ratios (e.g. 16:9 and 1620x1080) both fit without cropping.
- [ ] If no active video: a clean "Tidak ada video aktif" state shows and the queue panel stays visible.

### A3. Queue panel
- [ ] Layanan/loket cards do not overlap the video or footer.
- [ ] Ticket numbers are readable from across the room.
- [ ] Each layanan shows a clear loket badge (not mixed into status text).
- [ ] A newly called queue appears within ~3 seconds (polling cadence).
- [ ] With no current queue: ticket shows `-`, status `Menunggu antrian`, loket badge keeps its label.

### A4. Announcer (only if announcer audio configured)
- [ ] After OK/Enter, calling a queue plays the dynamic TTS WAV once (says ticket + loket).
- [ ] Footer cycles through `membuat audio <ticket>` → `memutar <ticket>`.
- [ ] After the announcer finishes, the **video resumes** (decoder handoff works — the `<video>` node is recreated, not revived).
- [ ] The same queue does not re-announce on every 3s poll (dedup works).
- [ ] If announcer is off / no audio uploaded: footer shows `off` / `belum ada audio`, no error.

### A5. Date safety
- [ ] Only **today's** queues appear; old-day called/completed entries are not shown.

---

## B. React `/display?tv=1` smoke

On the TV (or a desktop browser as a first pass), open
`http://192.168.5.14/display?tv=1&debug=1`.

### B1. Load & diagnostics
- [ ] Debug overlay renders: UA string, TV detection, WebSocket support/connection, last sync, announcer state, video errors.
- [ ] No stuck loading state.

### B2. Realtime
- [ ] Calling a queue updates the display (via Reverb/WebSocket, or polling fallback if WS unavailable).
- [ ] Completing a queue removes/updates it without a full reload.

### B3. Video & announcer
- [ ] Video plays after the OK/Enter gesture (unmuted autoplay is gesture-gated on Tizen).
- [ ] Announcer prefers server-side TTS / uploaded audio — NOT browser `speechSynthesis`.

---

## C. Known invariants — do NOT regress

- [ ] `tv.html` stays plain ES5-style JS: no modules, `let/const`, arrow functions, async/await, optional chaining, or `NodeList.forEach`.
- [ ] `tv.html` uses `XMLHttpRequest`, not `fetch`.
- [ ] No HEVC/H.265 or WebM-only videos pushed for the TV; MP4 H.264 + AAC only.
- [ ] Announcer uses `new Audio(wav_url)` + full `<video>` DOM recreation on handoff — never reassigns `src` on the same dead node.
- [ ] Dates render in WITA (Asia/Makassar); "today" filtering matches server day.

---

## Sign-off

Record in the PR description:

```
Samsung TV smoke: [pre-flight ✓] [A legacy tv.html ✓/n-a] [B /display ✓/n-a]
Tested on: [UA55MU6100 on-site | desktop browser only | curl pre-flight only]
Notes: <anything that needed a workaround>
```

If you could only run the curl pre-flight (no physical TV access), say so
explicitly — pre-flight alone does not cover decoder handoff or rendering,
which are the failure modes most specific to this device.
