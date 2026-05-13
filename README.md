# DCM26 Browser

An unofficial planner for UCB's Del Close Marathon 26 (June 10–14, 2026).

Browse all 331 shows, filter by day / venue / category, search, save shows to a personal schedule, export to Google Calendar (single show) or as an `.ics` file (full schedule), and share a snapshot of your schedule via URL.

Built as a static site — deployable to GitHub Pages with zero build step.

## Run locally

```
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Re-extract show data

If UCB updates the calendar, re-save the page as HTML and re-run the parser:

```
node scripts/extract.js "/path/to/DCM26 Marathon Calendar - Upright Citizens Brigade.html"
```

This writes `data/shows.json` (chronologically sorted).

## Performer index (optional)

Performer names aren't in the UCB calendar listing — they live on individual show detail pages, and ucbcomedy.com blocks direct scraping. To populate the **Performers** tab and per-performer filtering:

1. Install **Tampermonkey** (Chrome/Firefox/Safari/Edge extension).
2. Open `scripts/dcm26-page-saver.user.js`, copy its contents, and add it as a new Tampermonkey script (or drag the file onto the Tampermonkey dashboard).
3. Visit https://ucbcomedy.com/shows/dcm26-marathon-calendar/ — a floating panel appears bottom-right.
4. Click **▶ Start**. It fetches all 331 show pages via your browser session (so Cloudflare allows it), then click **⬇ Download ZIP** for `dcm26-pages-331.zip`.
5. Unzip into `data/raw-pages/`:
   ```
   mkdir -p data/raw-pages && unzip -o ~/Downloads/dcm26-pages-330.zip -d data/raw-pages
   ```
6. Run the performer parser:
   ```
   node scripts/extract-performers.js
   ```
   This walks every saved page, pulls names out of the `Cast: Name, Name, …` line, falls back to title parsing for marquee headliners, scans descriptions for `Character (Real Name)` patterns, and writes `data/performers.json` keyed by both slug and post ID.

Roughly **315 of 330** shows resolve performers automatically; the rest are either blank stubs on UCB's site or shows like ASSSSCAT that don't pre-announce the cast.

## Deploy to GitHub Pages

1. Push this directory to a repo.
2. In **Settings → Pages**, set source = `main` branch, `/` (root).
3. Wait a minute, visit `https://<user>.github.io/<repo>/`.

## Share links

The "Share schedule" button on the toolbar copies a URL that encodes your saved shows. It's a **snapshot** — if you change your schedule afterward, the link doesn't update. Re-share to get a fresh link.
