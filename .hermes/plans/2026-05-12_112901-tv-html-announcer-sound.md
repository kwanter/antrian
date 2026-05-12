# Plan: Add announcer sound to `tv.html`

## Goal

Make Samsung TV legacy display (`frontend/public/tv.html`) play announcer sound when a queue is called.

## Current findings

- `tv.html` currently has no announcer logic at all.
- It only polls queue data and updates cards.
- It does not load display `settings.announcer_*`.
- Prod display settings currently:
  - `{"volume":0.8}`
  - no `announcer_enabled`
  - no `announcer_sound_url`
- Prod storage has no `/storage/announcers` directory/files yet.
- Backend has broadcast event `QueueCalled`, but `tv.html` intentionally avoids WebSocket for old Samsung Tizen. So polling-based announcer is safer.
- Samsung UA55MU6100 browser should not rely on `speechSynthesis`. Use uploaded audio file if configured. Fallback beep optional.

## UX rule

Announcer sound must work after the user presses OK/Enter on the start overlay. This is required because TV browsers block autoplay audio before user gesture.

## Proposed behavior

1. On page load:
   - fetch active display via `/api/v1/displays`.
   - read `display.settings`:
     - `announcer_enabled`
     - `announcer_volume`
     - `announcer_sound_url`
     - `announcer_sound_title`
2. On OK/Enter start:
   - unlock media by playing/pausing a tiny silent audio element or initializing the announcer `Audio` object.
   - set `audioUnlocked=true`.
3. During queue polling:
   - when a layanan card detects current queue with status `called` or `serving`, compare queue id + called_at to last announced map.
   - if unseen, play announcer sound.
   - prevent repeat spam with `lastAnnouncementKeyByLayanan[layanan.id]`.
4. Announcer sound priority:
   - if `display.settings.announcer_sound_url` exists: play that audio file.
   - else: use short generated beep via `<audio>`? Better: use Web Audio only if available, but old TV may not support it. Keep fallback visual warning: “Audio announcer belum disetel”.
5. Show small footer/debug text:
   - `announcer: siap`
   - `announcer: belum ada audio`
   - `announcer: diputar 11:29:04`
   - `announcer: gagal play` if blocked.

## Important backend/admin dependency

To hear custom announcer on Samsung TV:
- Admin must upload audio in Display settings.
- Backend already stores it in display settings via `DisplaysController@updateAnnouncer`.
- `announcer_sound_url` should be `/storage/announcers/<file>`.
- Apache already serves `/storage` directly.

If no uploaded audio exists, there is currently nothing meaningful to play. `tv.html` can still show status and optional beep, but cannot speak ticket numbers because Tizen lacks reliable TTS.

## Implementation steps

### 1. Patch `frontend/public/tv.html`

Add globals:
```js
var announcerSettings={}, audioUnlocked=false, announcerAudio=null, lastAnnounced={};
```

Add helper functions:
- `setAnnouncerStatus(msg)` updates footer text.
- `initAnnouncer()` reads settings, creates `new Audio(url)` if URL exists.
- `unlockAudio()` called inside `start()` after OK/Enter.
- `playAnnouncer(queue, layanan)` plays configured audio if enabled + unlocked + queue not already announced.
- `announcementKey(queue)` returns queue id + called_at/status.

Patch `loadDisplay()`:
- store `display.settings || {}`.
- call `initAnnouncer()`.

Patch `start()`:
- call `unlockAudio()`.

Patch `updateQueue()`:
- after determining `cur`, if `cur.status` is `called` or `serving`, call `playAnnouncer(cur,l)`.

### 2. Add footer UI slot

Footer currently has time + sync. Add third element:
```html
<div class="announce" id="announce">announcer: -</div>
```

CSS small + readable.

### 3. Local validation

- Verify HTML contains announcer helpers.
- Run Next build.
- Optional open local `tv.html` but API is prod-relative; manual TV test required.

### 4. Deploy

Commit/push:
```bash
git add frontend/public/tv.html
git commit -m "Add polling announcer sound to legacy TV display"
git push antrian develop
```

Prod:
```bash
ssh root@192.168.5.14 'cd /var/www/antrian && git fetch origin develop && git merge --no-ff origin/develop -m "Merge TV announcer sound" && cd frontend && npm run build && systemctl restart antrian-frontend'
```

### 5. Verify

HTTP:
```bash
curl -s http://192.168.5.14/tv.html | grep -E "announcer|playAnnouncer|announce"
curl -s http://192.168.5.14/api/v1/displays
```

Manual admin setup:
1. Go to Admin → Displays.
2. Edit/announcer settings for Display Utama.
3. Enable announcer.
4. Upload MP3/WAV/AAC sound.
5. Save.
6. Open Samsung TV: `http://192.168.5.14/tv.html`.
7. Press OK/Enter.
8. Call a queue from loket.
9. TV should play uploaded sound once per called queue.

## Risks

- If user expects spoken ticket number (“Nomor A001 ke Loket 1”), `tv.html` cannot reliably do that on Samsung UA55MU6100 because `speechSynthesis` is not supported/reliable. Need pre-recorded generic audio or server-side generated audio per ticket (future feature).
- Audio autoplay blocked if OK/Enter not pressed first.
- Polling detects calls every 3s, so announcer may be delayed up to 3s.
- If no `announcer_sound_url` is configured, no sound will play.

## Acceptance criteria

- `tv.html` includes announcer logic.
- Footer shows announcer readiness/status.
- Sound plays after OK/Enter when queue status becomes called/serving and display has enabled uploaded announcer audio.
- No repeated sound spam for same queue.
- Prod `http://192.168.5.14/tv.html` returns 200.
