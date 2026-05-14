# CLAUDE.md — agent guide

Static planner for UCB's **Del Close Marathon 26** (June 10–14, 2026). Per-day per-venue grid of all 331 shows, hover for show cards, save to localStorage, share via snapshot URLs, export ICS / Google Calendar links.

**Vite + React 18 + TypeScript + Tailwind v4 + TanStack Router.** Builds to a static bundle hostable on GitHub Pages (`npm run build` → `dist/`). No backend.

---

## Repo layout

```
index.html                       Vite entry (loads src/main.tsx)
src/
  main.tsx                       React root
  App.tsx                        loads data into Zustand store, then renders <RouterProvider>
  router.tsx                     TanStack Router setup (hash history). Routes:
                                   /            → GridView (one long scroll, all 5 days stacked)
                                   /schedule    → ScheduleView
  types.ts                       Show, PerformersIndex, Filters, DAY_ROUTES
  data.ts                        loadShows, loadPerformers, attachPerformers, buildPerformerIndex
  state.ts                       Zustand store: shows, performers, saved Set, filters
  filters.ts                     showMatches(show, filters)
  conflicts.ts                   showInterval, conflictsBetween, DEFAULT_SHOW_DURATION_MIN=60
  share.ts                       parseShareLink, buildShareLink (?s=base64url(json))
  ics.ts                         buildICS, downloadICS, googleCalUrl
  index.css                      Tailwind directives + theme tokens + match-flash keyframes
  components/
    Header.tsx                   sticky top bar: brand + day jump-links (scroll to anchor) + schedule link
    Sidebar.tsx                  search + venue/category chips + performer filter
                                 (collapsible drawer on mobile, sticky pane on md+)
    GridView.tsx                 main view. One long scroll, 5 day sections stacked.
                                 Each DaySection dual-renders:
                                   desktop: venue-column × time-slot CSS grid
                                   mobile:  chronological list grouped by hour
                                 Sticky match toolbar + sticky per-day header. Owns
                                 the cross-day match-navigation state (currentMatchIdx).
    ShowChip.tsx                 a single show cell. Save button + hover/tap card.
    HoverCard.tsx                portal-positioned floating preview (image, cast, excerpt).
    MatchNavigator.tsx           "N of M matches" UI with ↑↓ buttons.
    ScheduleView.tsx             saved-shows list with conflict highlighting + export buttons.
    ShareModal.tsx               copy-URL modal with snapshot warning.
    ShareBanner.tsx              top banner when ?s= is on the outer URL.
public/
  data/shows.json                331 shows — generated, do not hand-edit
  data/performers.json           slug+id → [performer names] — generated, do not hand-edit
  data/raw-pages/                gitignored, ~53 MB. Saved show detail pages.
scripts/
  extract.cjs                    calendar HTML → public/data/shows.json
  extract-performers.cjs         raw-pages/*.html → public/data/performers.json
  dcm26-page-saver.user.js       Tampermonkey bulk-fetcher for show detail pages
vite.config.ts                   base: VITE_BASE ?? '/'  (set when deploying to GH Pages)
tailwind.config*                 none — Tailwind v4 reads tokens via @theme in index.css
TODO.md                          deferred work (Performers view, etc.)
```

---

## Running

```
npm install
npm run dev            # http://localhost:5173/
npm run build          # → dist/
npm run preview        # serve dist/ locally
npm run typecheck
```

Deployed to `dcmplanner.com` (apex) via Vercel; domain registered at Route 53. Vercel auto-detects Vite and builds with `npm run build` → `dist/`. The custom domain serves at root, so `base` stays `/` — **do not set `VITE_BASE`**. Hash history (`#/day/wed`) means **no 404.html fallback is needed**.

---

## Data pipeline (read before touching data)

Three generated inputs, never hand-edited:

1. **Calendar HTML** — the user saved `~/Desktop/DCM26 Marathon Calendar - Upright Citizens Brigade.html` from `https://ucbcomedy.com/shows/dcm26-marathon-calendar/`. Infinite-scroll; saved with all 331 shows already loaded.

2. **`scripts/extract.cjs`** turns that HTML into `public/data/shows.json`. Each show:
   ```
   id, slug, title, url, image, datetime, weekday, dateLabel,
   timeLabel, venue, venueName, categories[], categoryNames[], excerpt,
   performers[]
   ```
   `datetime` is a **local-clock ISO string** (no Z, no offset) — times in the source HTML are NYC-local; we keep them that way so JS `new Date()` parses them as local. ICS export tags them with `TZID=America/New_York`.

3. **Show detail pages** — `scripts/dcm26-page-saver.user.js` is a Tampermonkey userscript that runs on the calendar page (NOT in Node — ucbcomedy.com returns 403 to server-side fetches via Cloudflare). It walks `article.wpgb-card a[href*="/show/"]`, fetches each detail page via same-origin `fetch`, persists progress/HTML in IndexedDB, and packages everything into a ZIP via JSZip. Output: `dcm26-pages-330.zip` → unzip into `public/data/raw-pages/`.

4. **`scripts/extract-performers.cjs`** walks `public/data/raw-pages/*.html` and produces `public/data/performers.json`. Strategies, in order:
   - **Talent grid** (265/330): `<a class="ucb-talent-grid__name-link">Name</a>` — UCB's structured per-performer markup. Most reliable; try first.
   - **Cast line** (52/330): `<p><strong>Cast: <span data-sheets-root="1">Name, Name, …</span></strong>` in the `ucb-event-description` block.
   - **Title fallback** (4/330): headliner shows put the performer in the title.
   - **Character-paren pattern** (0/330): "George Lucas (Connor Ratliff)". Slice from `<div class="ucb-event-description">` to next `<div class="tickera"`; strip HTML tags first so `<strong>` inside parens doesn't break the match.
   - **SLUG_OVERRIDES** (1/330): hardcoded `tim-eric-ucb-dcm26-headliner` → `["Tim Heidecker", "Eric Wareheim"]`.
   - 8 shows remain empty — UCB hasn't published cast.

```
node scripts/extract.cjs                 # rebuilds public/data/shows.json
node scripts/extract-performers.cjs      # rebuilds public/data/performers.json
```

---

## App architecture

### State (`src/state.ts`)

One Zustand store with:
- `shows: Show[]` — all 331, loaded once
- `performers: PerformersIndex | null`
- `saved: Set<string>` — show IDs; mirrored to localStorage key `dcm26-saved-v2`
- `filters: Filters` — `{ search, days, venues, categories, performer }`
- `loaded: boolean`

All views are pure functions of the store; no local mirrors of saved shows.

### Routing (`src/router.tsx`)

TanStack Router with **hash history** (so GH Pages doesn't need an SPA fallback). The share-link query param `?s=...` lives on the **outer URL** (not the hash), which is why `ShareBanner` reads `window.location.search` directly rather than going through the router.

### The grid (`src/components/GridView.tsx`)

Lands on `/` and renders all 5 days as stacked `<DaySection id="day-wed">` blocks (anchors targeted by the header day-jump buttons). The match navigator + day-section headers are both sticky; offsets must stay in sync with `HEADER_OFFSET_PX` (57px). Each section dual-renders:

- **Desktop (`md:block`):** CSS Grid with `gridTemplateColumns: 64px repeat(numVenues, minmax(180px, 1fr))`. Each show is placed via inline `gridRow: <slot+1> / span 2; gridColumn: <vIdx+2>`. 30-min slots, 60-min default duration. Sticky header row with venue names.
- **Mobile (`md:hidden`):** chronological flat list grouped by hour. Two-up grid at `sm:`.

**Filter-as-find UX:** filters never *hide* shows. They gray out non-matchers (`opacity-30 grayscale`) and build a chronological `matchedList[]`. `<MatchNavigator>` shows "N of M matches" with ↑↓ buttons. `Enter`/`Shift+Enter` in the search input advance/retreat. On index change, `scrollIntoView({block:'center'})` plus a `match-flash` CSS animation flashes a red ring on the current match.

### Hover cards (`src/components/HoverCard.tsx`)

`mouseenter` on a chip pops a 340px portal-positioned card with image, cast, excerpt, save/GCal/UCB buttons. Position computed against viewport — flips left if it would overflow right. Tap on mobile **pins** the card (click anywhere else on the chip to unpin).

### Conflict detection

`conflictsBetween(savedShows)` does O(n²) overlap on `[start, start+60min)` windows. Surfaces as an orange-border row in `ScheduleView`. Fine for ≤331 shows.

---

## Common tasks

### Add a new route

In `src/router.tsx`, create a new `createRoute({ getParentRoute: () => rootRoute, path: '…', component: … })` and add it to `rootRoute.addChildren([...])`. Link from `<Header>` via `<Link to="/foo">`.

### Add a new filter

1. Extend `Filters` in `src/types.ts`.
2. Update `emptyFilters()` in `state.ts` + a setter.
3. Update `showMatches()` in `filters.ts`.
4. Add UI in `Sidebar.tsx`.

### Re-skin

Tailwind v4 reads theme tokens from `@theme` in `src/index.css`: `--color-accent`, `--color-headliner`, `--color-saved`, `--color-conflict`. Edit there, not in component files.

---

## What NOT to do

- Don't add SSR / Next / a server. Static site, full stop. Hash router lets GitHub Pages work without a 404 fallback.
- Don't break the share link format (`?s=base64url(JSON.stringify(ids))`) — users may have copied URLs.
- Don't store HTML content in `localStorage` (5–10 MB limit). The userscript uses IndexedDB.
- Don't try to scrape `ucbcomedy.com` from Node. Cloudflare returns 403. The Tampermonkey userscript path exists because direct fetches are blocked.
- Don't auto-import shared schedules. The "Import to my schedule" button is intentional.
- Don't drop responsive breakpoints. Mobile is a primary surface — every component should look right at ≤375px wide.

---

## Known issues / future work

See `TODO.md`.
