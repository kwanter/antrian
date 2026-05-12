# Plan: Fix video stops when announcer plays on Samsung TV

## Problem

When the announcer audio plays on Samsung TV, the video playback stops. This is a known limitation of old Tizen browsers — they only support a single active media element at a time. Playing a new `Audio()` object causes the existing `<video>` element to pause/stop.

## Root Cause

Samsung UA55MU6100 (Tizen 3.0, 2017) has a single hardware media decoder. When `new Audio(url).play()` is called for the announcer, the browser pauses the `<video>` element because it can only decode one media stream at a time.

## Solution

After the announcer audio finishes playing (`onended` event), automatically resume the video playback. This gives the behavior:
1. Queue called → video pauses momentarily
2. Announcer plays: "Nomor antrian PID001, silakan menuju ke Loket Pidana"
3. Announcer ends → video resumes from where it left off

This is actually desirable UX — the announcer gets full audio attention, then video continues.

## Implementation

Patch `playAudioUrl()` in `tv.html`:
1. Before playing announcer, store video current state (was it playing?).
2. Pause video explicitly (cleaner than letting browser fight).
3. Lower video volume to 0 during announcement (if browser allows both).
4. On announcer `onended`: resume video playback + restore volume.
5. On announcer `onerror`: also resume video.
6. Safety timeout: if announcer doesn't end within 15s, resume video anyway.

## Steps

1. Patch `playAudioUrl()` to pause video before, resume after.
2. Add `resumeVideo()` helper.
3. Verify locally.
4. Commit + deploy prod.
5. Verify.

## Acceptance

- Video resumes after announcer finishes.
- If announcer fails/errors, video still resumes.
- No permanent video freeze.
