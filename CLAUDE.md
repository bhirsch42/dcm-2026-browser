# CLAUDE.md — agent guide

Static planner for UCB's **Del Close Marathon 26** (June 10–14, 2026). Browse all 331 shows, filter, save a personal schedule to localStorage, export ICS / Google Calendar links, share via snapshot URLs.

The whole thing is hand-written vanilla HTML + CSS + JS with **zero build step** and **zero runtime dependencies**. Designed to host on GitHub Pages by pushing the repo as-is.

---

## Repo layout

```
index.html                       app shell, header, sidebar, content slot, modal
styles.css                       dark-festival theme; table view is primary
app.js                           all state + rendering (no framework)
data/shows.json                  331 shows — generated, do not hand-edit
data/performers.json             slug+id → [performer names] — generated, do not hand-edit
data/raw-pages/*.html            330 saved show detail pages (gitignored by convention; ~53 MB)
scripts/extract.js               parses calendar HTML → data/shows.json
scripts/extract-performers.js    parses raw-pages/*.html → data/performers.json
scripts/dcm26-page-saver.user.js Tampermonkey script that bulk-fetches show detail pages on ucbcomedy.com
README.md                        user-facing
CLAUDE.md                        this file
```

---

## Data pipeline (read this before touching data)

There are three data inputs, all generated, never hand-edited:

1. **Calendar HTML** — the user saved `~/Desktop/DCM26 Marathon Calendar - Upright Citizens Brigade.html` from `https://ucbcomedy.com/shows/dcm26-marathon-calendar/`. The page uses infinite scroll; the saved copy has all 331 shows because they scrolled before saving.

2. **`scripts/extract.js`** turns that HTML into `data/shows.json`. Each show has:
   ```
   id, slug, title, url, image, datetime, weekday, dateLabel,
   timeLabel, venue, venueName, categories[], categoryNames[], excerpt,
   performers[]
   ```
   `datetime` is a *local-clock* ISO string (no Z, no offset) — times in the source HTML are NYC-local; we keep them that way so JS `new Date()` treats them as local. ICS export tags them with `TZID=America/New_York`.

3. **Show detail pages** — `scripts/dcm26-page-saver.user.js` is a Tampermonkey userscript that runs on the calendar page, walks every `article.wpgb-card a[href*="/show/"]`, fetches each detail page via same-origin `fetch` (passes Cloudflare because it's the user's real browser session), persists progress/HTML in IndexedDB (resumable across reloads), and finally packages everything into a ZIP via JSZip. The user downloads `dcm26-pages-330.zip` and unzips into `data/raw-pages/`.

4. **`scripts/extract-performers.js`** walks `data/raw-pages/*.html` and produces `data/performers.json`. Strategies, in order:
   - **Cast line** (291/330): `<p><strong>Cast: <span data-sheets-root="1">Name, Name, …</span></strong>` in the `ucb-event-description` block.
   - **Title fallback** (21/330): headliner shows put the performer in the title — `extractFromHeadlinerTitle` strips "`: UCB DCM26 Headliner`" then pulls "<Show> with <Name>", "<Name>'s <Show>", "<Name> and Friends", or a clean 2–4-word capitalized title.
   - **Character-paren pattern** (2/330): in shows like the George Lucas Talk Show the description reads "`George Lucas (Connor Ratliff) and Watto (Griffin Newman)`". We slice from `<div class="ucb-event-description">` to the next `<div class="tickera"` (we can't rely on `</div>` because of nested divs), strip HTML tags so `<strong>` inside parens doesn't break the match, then regex `\(\s*<CapName>\s*\)`.
   - **SLUG_OVERRIDES** (1/330): hardcoded for `tim-eric-ucb-dcm26-headliner` → `["Tim Heidecker", "Eric Wareheim"]`.
   - 15 shows remain empty — UCB literally hasn't published cast for them (13 are placeholder stubs, 2 are ASSSSCAT-style shows where cast is announced day-of).

Re-running everything from scratch:

```
node scripts/extract.js                        # rebuilds shows.json
node scripts/extract-performers.js             # rebuilds performers.json (needs data/raw-pages/)
```

---

## Architecture

### app.js layout (top → bottom)

```
constants:  STORAGE_KEY, TZ, DEFAULT_SHOW_DURATION_MIN
state:      shows, performers (index), saved (Set), filters, view, shareToImport
loadSaved / persistSaved      localStorage
loadData                       fetches data/shows.json + optional data/performers.json
parseShareLink / buildShareLink  ?s=<base64url(JSON ids)>
filteredShows                  applies filters.search/days/venues/categories/performer
groupByDay                     Map<dateLabel, shows[]>
showInterval / conflictsBetween  overlap detection
ICS helpers + downloadICS
googleCalUrl                   per-show prefilled-event URL
render functions:
  renderBrowse, renderSchedule, renderCalendar, renderPerformers
  renderShowTable, renderRow   the table renderer used by Browse + Schedule
renderFilters                  chip groups in sidebar
attachRowHandlers              save toggle + performer-link clicks
switchView, updateSavedCount, updateToolbarButtons
escapeHtml / escapeAttr
init + attachStaticHandlers
```

State is plain mutable globals; `render()` re-renders the active view by replacing `viewRoot.innerHTML` and re-binding handlers via `attachRowHandlers()`. **There is no framework.** Don't add one.

### Views

| Tab | Function | Notes |
|---|---|---|
| Browse | `renderBrowse` | Day-grouped tables by default. **When `filters.search` is non-empty, flatten into one chronological table** (per user preference). |
| My Schedule | `renderSchedule` | Same table renderer with `conflicts` Set; saved + conflicting rows get colored left borders. Empty state if `state.saved.size === 0`. |
| Calendar | `renderCalendar` | Per-day grid: venues as columns, 30-min rows. Saved shows highlighted green; headliners yellow. Cells contain `<a>` show links. |
| Performers | `renderPerformers` | Sorted by appearance count. Click filters Browse view by that performer. If `data/performers.json` not loaded, shows a friendly placeholder. |

### Persistence

- **`localStorage["dcm26-saved-v1"]`** — JSON array of saved show IDs.
- **Share link** — `?s=<base64url(JSON.stringify(ids))>`. On boot, if `?s=` present, we don't auto-import — we show a banner ("Schedule shared with you · N shows") with Import/Dismiss. The Share modal explicitly tells users their link is a snapshot, not a live view.

### ICS / GCal export

- Single show: `googleCalUrl(s)` returns a `calendar.google.com/calendar/render?action=TEMPLATE&...` URL with `ctz=America/New_York`.
- Full schedule: `downloadICS(savedShows)` builds a VCALENDAR with `DTSTART;TZID=America/New_York:<localstamp>` (no UTC conversion — local-clock semantics). Default duration `DEFAULT_SHOW_DURATION_MIN = 60`. UCB doesn't publish runtimes; if we ever get them, plug into `showInterval` + ICS builders.

### Conflict detection

`conflictsBetween(savedShows)` does O(n²) overlap on `[start, start+60min)` windows. Fine for ≤331 shows. If the data ever has explicit durations, switch to those instead of the constant.

---

## Styling conventions

- Dark theme. Color tokens at the top of `styles.css` under `:root`. Notable: `--accent` (DCM red `#ff3344`), `--headliner` (yellow), `--saved` (green), `--conflict` (orange).
- **Table view is primary**, designed for density. Card classes (`.show-card`, `.show-image`, etc.) still exist for the legacy grid but `.show-list` is set to `display: none` — re-enable with `.show-list.show` if needed.
- Sticky elements: header (`.site-header`, `top: 0`), day heading + table thead (`top: 70px`). If you adjust header height, fix the `top` offsets.

---

## Common tasks

### Add a new column to the table
1. Add a `<col class="col-…" />` to `renderShowTable`'s `<colgroup>`.
2. Add a `<th>` in `<thead>`.
3. Add a `<td>` in `renderRow`.
4. Add `.col-… { width }` + a `.cell-… { … }` block in `styles.css` (near the existing `.show-table` section).

### Add a new filter (e.g. "Has performers")
1. Extend `state.filters`.
2. Update `filteredShows()`.
3. Add a chip group to the sidebar in `index.html` + a render function in `renderFilters()` + bind in `attachStaticHandlers`.

### Cache-busting
Both `index.html` references use `?v=N`. Bump `N` when you change `app.js` or `styles.css`. `python3 -m http.server` does not send no-cache headers and browsers are aggressive about caching them.

### Local dev
```
python3 -m http.server 8765
open http://127.0.0.1:8765/
```
Killing: `pkill -f "http.server 8765"`.

---

## Known issues / future work

- **Tim & Eric override is hardcoded**. If UCB updates that page with a Cast line, the override is harmless but redundant.
- **Calendar view** assumes a single contiguous time range per day; if a show is at 11pm and another at 1am, slot math will treat them as separate days because we just bucket by `Date.getHours()`. Acceptable for DCM scheduling.
- **Show images** are hot-linked from `ucbcomedy.com/wp-content/...`. They're not on the page anywhere (table view drops them) but `shows.json` still has the URLs. If you re-introduce images, prefer hot-linking — copying 330 images into the repo bloats GitHub Pages.
- **Pagination** isn't implemented because 331 rows in a table renders fine. If we ever 10× the dataset, paginate.
- **15 blank-cast shows**: list is documented above. UCB owns this; not fixable on our end.

---

## What NOT to do

- Don't add a framework or build step. The user wants this hostable on plain GitHub Pages with `git push` and nothing else.
- Don't break the share link format without thought — users may have copied URLs.
- Don't store HTML content in `localStorage` (5–10 MB limit). The userscript uses IndexedDB; keep it there.
- Don't try to scrape `ucbcomedy.com` from Node or server-side — it returns HTTP 403. The userscript path exists precisely because direct fetches are blocked; that's the only working approach.
- Don't auto-import shared schedules without user confirmation. The "Import to my schedule" button is intentional.
