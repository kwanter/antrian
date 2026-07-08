# Plan: Fix tv.html overlap + improve announcer loket phrase

## Problems

### 1. Video overlaps loket/queue cards

Current layout uses absolute regions that overlap:

- `.video-wrap` top: `10vh`, bottom: `10px` → video occupies almost all area below header.
- `.queue-row` bottom: `calc(7vh + 20px)` → queue cards are drawn on top of video.
- `.footer` bottom: `10px`.

So video player overlaps with loket/queue cards.

### 2. Announcer does not clearly say “menuju loket ...”

Current dynamic TTS text:

```php
Nomor antrian {ticket}, silakan menuju ke {counter}.
```

If counter name is `Loket Pidana`, espeak can blur/skip the “menuju ke” phrase. Need stronger, repeated, clearer phrase:

```text
Nomor antrian {ticket}. Menuju loket: {counter}. Sekali lagi, nomor antrian {ticket}, menuju loket: {counter}.
```

Also slow down espeak speed slightly for TV speaker clarity.

## Goals

1. Create fixed non-overlapping vertical regions for old Samsung Tizen browser.
2. Keep video prominent but never under queue cards.
3. Make loket/queue cards readable and separated.
4. Force dynamic announcer phrase to include ticket + loket tujuan clearly.
5. Keep static/default announcer disabled; dynamic only.
6. Restore video sound after announcer using current hybrid Audio()+recreate-video approach.

## UI Design

Use simple absolute positioning with explicit top/bottom boundaries:

```text
0-10vh      HEADER
10-63vh     VIDEO
64-92vh     QUEUE ROW
92-100vh    FOOTER
```

Implementation CSS:

- `.topbar { top:0; height:10vh }`
- `.video-wrap { top:10vh; bottom:36vh }`
- `.queue-row { top:64vh; bottom:8vh }`
- `.footer { bottom:10px; height:7vh }`
- `.start-overlay { top:10vh; bottom:36vh }` so it overlays video only, not queue/footer.

Queue card behavior:

- 4 cards visible for prod data.
- Equal width, no overlap.
- Ticket prominent.
- Loket badge clear.
- Status compact.
- No horizontal/vertical overlap with video.

## Announcer Plan

Patch `backend/app/Services/DynamicAnnouncerService.php`:

- Text format:
  `Nomor antrian {ticket}. Menuju loket: {counter}. Sekali lagi, nomor antrian {ticket}, menuju loket: {counter}.`
- Slow speech from `-s 145` to `-s 125`.
- Keep WAV output for Audio() compatibility.
- Cache key already includes `md5($text)`, so new wording creates new WAV files automatically.

## Compatibility

- No CSS grid.
- No modern JS changes.
- Keep `video-host` 100% size.
- Keep manual `fitVideo()` sizing.
- Keep dynamic announcer only.
- Keep `new Audio(WAV)` + recreate video element after announcer.

## Steps

1. Patch CSS layout regions.
2. Patch TTS wording + speed.
3. Verify local markers.
4. Commit/push/deploy.
5. Clear old dynamic WAV cache on prod or let new cache key regenerate.
6. Verify prod served CSS + TTS endpoint returns new WAV.
7. User tests on Samsung TV.
