# Plan: Rearrange tv.html — Video Top, Queue Bottom

## Goal

Change layout from side-by-side (video left 60% / queue right 40%) to stacked vertical (video top / queue cards bottom). Improve UX for TV viewing distance.

## Current state

- Layout: horizontal flex → video 60% left, panel 40% right.
- 4 active layanan (Hukum, Perdata, Pidana, Umum).
- Each has dedicated loket.
- Samsung UA55MU6100, resolution 1920x1080.
- File: `frontend/public/tv.html` (static, no React).

## New layout concept

```
┌─────────────────────────────────────────────────────┐
│  [Display Utama - Lobi PTSP]        [Senin, 12 Mei] │  ← header bar
├─────────────────────────────────────────────────────┤
│                                                     │
│              VIDEO PLAYER (55-60%)                   │  ← top section
│                                                     │
├─────────────────────────────────────────────────────┤
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐ │
│  │ L.Hukum  │ │ L.Perdata│ │ L.Pidana │ │ L.Umum │ │  ← bottom queue
│  │  HUK-001 │ │  PDT-003 │ │  PID-002 │ │ UMM-001│ │     cards row
│  │ Loket Hkm│ │ Loket Pdt│ │ Loket Pid│ │Loket Um│ │
│  └──────────┘ └──────────┘ └──────────┘ └────────┘ │
├─────────────────────────────────────────────────────┤
│  [jam 10:45:32]                        [sync 10:45] │  ← footer clock
└─────────────────────────────────────────────────────┘
```

## Design decisions

1. Vertical stack: `flex-direction: column` on `.wrap`.
2. Video takes ~58% height. Queue cards take ~34%. Header+footer ~8%.
3. Queue cards in horizontal row (not vertical column):
   - 4 layanan = 4 equal-width cards side by side.
   - Each card: layanan name + code on top, ticket number center, loket badge bottom.
   - Vertical card layout (stacked internally).
4. Adaptive:
   - ≤2 layanan: cards wider, ticket font bigger.
   - 3-4 layanan: equal 25% each, balanced.
   - 5+ layanan: narrower cards, smaller font, scroll-hidden overflow.
5. No `.recent` rows in this layout (horizontal space too tight per card).
6. Card internal layout:
   ```
   ┌─────────────────┐
   │ LAYANAN HUKUM   │  ← blue header with code pill
   │      HUK        │
   ├─────────────────┤
   │                 │
   │    HUK-001      │  ← big amber ticket
   │                 │
   │  ● Loket Hukum  │  ← green loket badge
   │  Sedang dipanggil│  ← status text
   └─────────────────┘
   ```
7. Header bar: display name + location left, date right.
8. Footer: clock left, sync indicator right.
9. Keep start overlay, error bubble, video controls unchanged.

## Implementation steps

1. Rewrite CSS:
   - `.wrap` → `flex-direction: column`
   - `.video` → `width:100%; height:58%`
   - `.panel` → `width:100%; height:auto; flex-direction:column`
   - `.queue-list` → `flex-direction: row` (horizontal cards)
   - `.card` → `flex:1; min-width:0` (equal width)
   - Remove old mode-many float hack.
   - New adaptive modes adjust font sizes only.

2. Rewrite HTML structure:
   - header bar (display name + date/time)
   - video section
   - queue cards row
   - footer (clock + sync)

3. JS: keep same logic, just adjust `renderLayanans` card HTML to vertical internal layout.

4. Test locally, commit, deploy.

## Files to change

- `frontend/public/tv.html` (full rewrite of CSS + HTML structure, JS logic stays same)

## Risks

- Horizontal card row with 5+ layanan may get cramped. Mitigation: cap visible cards at 6, reduce font.
- Video at 58% height on 1080p = ~626px. Enough for 16:9 video.
- Old Tizen flex-direction:column is supported (basic flexbox).

## Acceptance criteria

- Video fills top ~58% of screen.
- Queue cards sit in a clean horizontal row below video.
- Each card clearly shows: layanan name, ticket number, loket badge.
- No overlap, no scroll needed.
- Works on 1920x1080 Samsung TV browser.
- Prod `http://192.168.5.14/tv.html` returns 200 and renders correctly.
