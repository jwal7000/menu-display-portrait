# Digital Menu Board — Portrait/Vertical Build Progress

> **Repo:** [menu-display-portrait](https://github.com/jwal7000/menu-display-portrait)
> **Companion (Horizontal):** [menu-display-horizontal](https://github.com/jwal7000/menu-display-horizontal)
> **Target:** 9:16 vertical screens (1080×1920 reference)

---

## Overview

A standalone portrait-orientation digital menu board for Five Daughters Bakery vertical displays. Shares the same `menu.json` data format and brand tokens as the horizontal version but is redesigned for a tall screen aspect ratio.

---

## Architecture

| File | Purpose |
|------|---------|
| `public/index.html` | Shell — viewport locked to `width=1080` |
| `public/styles.css` | Portrait-specific layout and typography |
| `public/menu.js` | Data fetch, render loop, sold-out handling |
| `output/menu.json` | Menu data (same schema as horizontal) |
| `public/fonts/` | Neutraface 2 Display (local) |
| `public/logo.png` | FDB logo |

### Key Layout Differences vs Horizontal

| | Horizontal | Portrait |
|--|-----------|---------|
| Viewport ref | 1920×1080 | 1080×1920 |
| `html font-size` | `0.8333vw` | `1.4815vw` |
| Section grid | 3 cols + promo sidebar | 2 cols, full width |
| Promo image | Right sidebar | Removed |
| Header | Left / Center / Right | Logo + location stacked center |
| Thumbnail | `5.5vh` | `4.5vh` |
| Item padding | `0.8vh` | `1.1vh` |

---

## Changelog

### 2026-08-17
- **Init** — Project scaffolded as separate repo from horizontal version
- `index.html` — Portrait viewport meta (`width=1080`)
- `styles.css` — Portrait CSS: `1.4815vw` font-size base, 2-column section grid, stacked center header, tuned item/section padding
- `menu.js` — Landscape promo sidebar removed; same section-stacking logic (Rolls + Paleo), Dropbox URL resolver, 60s auto-refresh, sold-out handling
- GitHub repo created: `jwal7000/menu-display-portrait`
- Horizontal repo renamed: `menu-display` → `menu-display-horizontal`

---

## Open Items / Next Steps

- [ ] Hook up to live Square data pipeline (same as horizontal)
- [ ] Identify physical screens — confirm they are truly 9:16 (not 16:9 rotated in software)
- [ ] Evaluate whether a promo/featured item panel should be added (e.g. bottom strip or top banner)
- [ ] Test thumbnail image sizes at actual screen distance
- [ ] Decide if location name should display (some vertical installs are single-location)
- [ ] Set up launchd / auto-start equivalent for portrait screens
- [ ] Consider a "Now serving" or rotating feature slot to use extra vertical space

---

## Notes

- All sizes use `vh`/`vw` units — layout scales to any 9:16 screen without media queries
- `menu.json` schema is identical between horizontal and portrait; both projects can share the same data feed
- Rolls and Paleo sections are stacked into a single grid cell (same behavior as horizontal)

### 2026-08-18
- **Server** — Persistent launchd agent added (`com.fivedaughters.menu-display-portrait`)
  - Serves `public/` on port **4000** via `serve` (same binary as horizontal project)
  - `KeepAlive=true` — restarts automatically if it crashes or Mac reboots
  - Wrapper script (`scripts/serve-portrait.sh`) sets explicit PATH for launchd environment
  - Logs: `logs/server.log` / `logs/server-error.log`
- **Data sync** — Horizontal refresh script (`refresh-menu.sh`) updated to:
  - Fix push URL → `menu-display-horizontal.git` (repo was renamed)
  - Copy fresh `menu.json` to portrait `output/` on every 10-min refresh cycle
- **Preview URL** — `http://192.168.12.216:4000/public/` (local network)
