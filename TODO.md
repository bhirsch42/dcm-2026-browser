# TODO

Deferred from the React/TS rewrite (2026-05-13). Roughly priority order.

## Features

- **Performers view** (hi-priority). Port from the old `app.js` `renderPerformers()`: sortable list of all performers with appearance count, click a name to filter the grid by that performer. Suggested route: `/performers` in `src/router.tsx`. Data already loaded: `useStore.getState().performers` + `buildPerformerIndex(shows)` in `src/data.ts`.
- **Saved-only filter.** Toggle in the sidebar to gray out everything except saved shows in the grid.
- **"Now" indicator** on the grid during DCM26 (June 10–14). Horizontal line across the venue columns at the current time, autoscroll on first load.
- **Inline conflict warnings on the grid** (not just on the Schedule view). When you save a show that overlaps another saved show, show a small ⚠ badge on both chips.
- **Keyboard nav on the grid:** ←/→ between venue columns, ↑/↓ between time slots, Space toggles save on focused chip, `?` opens a shortcut overlay.
- **Persist filters in URL.** Right now filters live only in the Zustand store; reloading drops them. Add `?q=…&venue=…&cat=…` to the route search params via TanStack Router.

## Polish

- **Show runtime durations** when UCB ever publishes them. Currently `DEFAULT_SHOW_DURATION_MIN = 60` is used for both grid layout (2 slots) and conflict detection.
- **Late-night rollover.** Sun 1am shows currently bucket as "Sunday" because we trust `dateLabel`. If UCB ever puts a 1am show under Saturday's date, the grid hour-grouping in `MobileTimeline` needs to handle hour < 5am as "late Saturday".
- **Hover card on small viewport.** Currently a tap pins the card and it's positioned via portal. Consider a full bottom sheet on `< sm`.
- **Image lazy-loading + skeleton.** `<img loading="lazy">` is set, but a placeholder while loading would feel better.
- **Empty state for filtered-to-zero days.** The grid shows everything dimmed when 0 matches; consider a hint at the top: "0 matches on this day — try Thursday".

## Deployment

- **GitHub Actions workflow** for `gh-pages` deploy. Builds with `VITE_BASE=/<repo-name>/`, pushes `dist/` to a `gh-pages` branch.
- **Open Graph image** for the share link preview.

## Tech debt

- **Tests.** The data pipeline is regex-heavy and brittle to UCB markup changes. Even a basic Vitest snapshot test on a fixture HTML page would help.
- **Bundle size audit** once everything's in place. React + Router + Zustand is ~50KB gzip; consider Preact compat if it bloats.

## Known limitations

- **15 blank-cast shows.** UCB has not published their cast (mostly placeholder stubs + ASSSSCAT-style late announcements). Not fixable on our end.
- **Show images hot-linked** from ucbcomedy.com. If they ever change CDNs, the hover-card image breaks.
