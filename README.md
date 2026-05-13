# DCM26 Browser

An unofficial planner for UCB's Del Close Marathon 26 (June 10–14, 2026).

Per-day per-venue grid of all 331 shows. Hover a show for a floating card with image, cast, and description. Save shows to localStorage, export to Google Calendar (single show) or `.ics` (full schedule), share a snapshot of your schedule via URL.

Built with **Vite + React + TypeScript + Tailwind + TanStack Router** — a single static bundle. No backend.

## Develop

```
npm install
npm run dev          # http://localhost:5173/
```

Other scripts:

```
npm run build        # production bundle in dist/
npm run preview      # serve dist/ locally
npm run typecheck    # tsc --noEmit
```

## Deploy to GitHub Pages

This project uses hash routing (`#/day/wed`), so GitHub Pages works without an SPA fallback.

```
VITE_BASE=/dcm-2026-browser/ npm run build
# push dist/ to a `gh-pages` branch (or use the gh-pages npm package)
```

In **Settings → Pages**, set source = `gh-pages` branch, root.

## Re-extract show data

When UCB updates the calendar, re-save the page to disk and rerun:

```
node scripts/extract.js "/path/to/DCM26 Marathon Calendar - Upright Citizens Brigade.html"
```

Writes `public/data/shows.json` (chronologically sorted).

## Performer index (optional)

Performer names aren't in the UCB calendar listing — they live on individual show detail pages, and `ucbcomedy.com` blocks direct scraping via Cloudflare. To populate per-performer filtering:

1. Install **Tampermonkey** (Chrome/Firefox/Safari/Edge extension).
2. Open `scripts/dcm26-page-saver.user.js`, copy its contents, add it as a new Tampermonkey script.
3. Visit https://ucbcomedy.com/shows/dcm26-marathon-calendar/. A floating panel appears bottom-right.
4. Scroll all the way down to load every card (infinite scroll), tap **Re-scan**, then **▶ Start**.
5. When done, **⬇ Download ZIP**, then:
   ```
   mkdir -p public/data/raw-pages && unzip -o ~/Downloads/dcm26-pages-330.zip -d public/data/raw-pages
   node scripts/extract-performers.js
   ```

Roughly 315 of 330 shows resolve performers automatically; the rest are either blank stubs on UCB's site or shows like ASSSSCAT that don't pre-announce the cast.

## Share links

The "Share" button on My Schedule copies a URL with your saved shows encoded. It's a **snapshot** — if you change your schedule afterward, the link doesn't update. Re-share to get a fresh one.

## See also

- `CLAUDE.md` — full architecture guide for working on the codebase
- `TODO.md` — deferred work (Performers tab is hi-priority)
