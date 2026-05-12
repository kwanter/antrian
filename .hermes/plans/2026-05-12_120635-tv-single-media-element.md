# Plan: Fix TV video not resuming — single media element approach

## Deep Root Cause

Samsung UA55MU6100 (Tizen 3.0) has a SINGLE hardware media decoder.
Previous approach: `new Audio(url)` for announcer + `<video>` for video = 2 media elements.
After Audio plays and releases decoder, the video element is in a broken state.
Reassigning src + load() + play() doesn't reliably re-acquire the decoder on this old browser.

## Solution: Single `<video>` element for BOTH video and announcer

Use the same `<video id="vid">` element to:
1. Play video normally (loop playlist)
2. When announcer triggers: save current video position, switch src to announcer MP3 URL
3. After announcer ends (onended): switch src back to video, seek to saved position, play

This guarantees only ONE media element ever exists → no decoder conflict.

MP3 plays fine in a `<video>` element — browsers treat it as audio-only media.

## Implementation

1. Remove `new Audio()` usage entirely from announcer flow.
2. `playAudioUrl(url)`:
   - Save `videoIndex`, `currentTime`, `currentSrc`
   - Set `vid.src = announcer_mp3_url`
   - `vid.load(); vid.play()`
   - `vid.onended = restoreVideo`
3. `restoreVideo()`:
   - Set `vid.src = saved video url`
   - `vid.load()`
   - `vid.oncanplay` → seek to saved time, play
4. Remove `resumeVideo()` (replaced by `restoreVideo`)
5. Remove all `announcerAudio = new Audio(...)` code
6. Keep `unlockAudio()` simpler — just set flag

## Fallbacks
- If announcer src fails to load (onerror) → restoreVideo immediately
- Safety timeout 15s → restoreVideo
- If oncanplay doesn't fire within 3s after restoreVideo → force play anyway

## Steps
1. Rewrite announcer section of tv.html
2. Verify locally
3. Commit + deploy
4. Verify prod
