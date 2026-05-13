import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useStore } from '../state';
import { DAY_ROUTES } from '../types';
import type { Show } from '../types';
import { filtersActive, showMatches } from '../filters';
import { ShowChip } from './ShowChip';
import { MatchNavigator } from './MatchNavigator';
import { indexRoute } from '../router';
import { useIsDesktop } from '../hooks/useIsDesktop';

const SLOT_MIN = 30;
const SLOT_HEIGHT_PX = 64; // h-16

// Fixed column order — every day renders all venues, even if a venue has zero
// shows that day, so the grid lines up nicely day-to-day.
const VENUE_ORDER = [
  'UCB Mainstage',
  'UCB Upstairs',
  'TFTNC - Mainstage',
  'TFTNC - Stage 2',
  'TFTNC - Stage 3',
  'TFTNC - Stage 4',
];

function orderVenues(present: Set<string>): string[] {
  const known = VENUE_ORDER;
  const extras = [...present].filter((v) => !known.includes(v)).sort();
  return [...known, ...extras];
}
const HEADER_OFFSET_PX = 57; // sticky site header height
const TOOLBAR_HEIGHT_PX = 40; // sticky match-toolbar height (h-10)
const DAY_HEADING_TOP_PX = HEADER_OFFSET_PX + TOOLBAR_HEIGHT_PX;

// Combined opaque chrome at the top: site header + match toolbar + day heading.
const STICKY_STACK_PX = HEADER_OFFSET_PX + TOOLBAR_HEIGHT_PX + 40;

/**
 * Manual scroll: the page is the window, and any horizontally-scrolling ancestor
 * marked with `[data-grid-scroll]` is panned independently. We don't trust
 * native `scrollIntoView` because the desktop grid is an overflow-x scroller
 * that the browser may treat as a vertical scroll container too, swallowing the
 * page-level scroll. Math is in absolute (document) coordinates.
 */
function scrollChipIntoView(el: HTMLElement): void {
  const rect = el.getBoundingClientRect();
  const visibleH = window.innerHeight - STICKY_STACK_PX;
  const targetY =
    rect.top + window.scrollY - STICKY_STACK_PX - visibleH / 2 + rect.height / 2;
  window.scrollTo({ top: Math.max(0, targetY), behavior: 'smooth' });

  const scroller = el.closest('[data-grid-scroll]') as HTMLElement | null;
  if (scroller) {
    const sRect = scroller.getBoundingClientRect();
    const cRect = el.getBoundingClientRect();
    const xOffset = cRect.left - sRect.left;
    const targetX =
      scroller.scrollLeft + xOffset - sRect.width / 2 + cRect.width / 2;
    scroller.scrollTo({ left: Math.max(0, targetX), behavior: 'smooth' });
  }
}

export function GridView() {
  const allShows = useStore((s) => s.shows);
  const filters = useStore((s) => s.filters);
  const setFiltersFromQuery = useStore((s) => s.setFiltersFromQuery);
  const search = indexRoute.useSearch();
  const navigate = useNavigate({ from: '/' });

  // Hydrate filters from URL on first mount.
  const hydrated = useRef(false);
  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    setFiltersFromQuery({
      search: search.q ?? '',
      venues: search.venue ?? [],
      categories: search.cat ?? [],
      performers: search.perf ?? [],
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push filter state back into URL search params (replace, not push, so the
  // browser back stack stays sane while you tweak filters).
  useEffect(() => {
    if (!hydrated.current) return;
    navigate({
      to: '/',
      search: {
        q: filters.search || undefined,
        venue: filters.venues.size ? [...filters.venues] : undefined,
        cat: filters.categories.size ? [...filters.categories] : undefined,
        perf: filters.performers.size ? [...filters.performers] : undefined,
      },
      replace: true,
    });
  }, [filters, navigate]);

  // Group shows by dateLabel
  const showsByDay = useMemo(() => {
    const map = new Map<string, Show[]>();
    for (const s of allShows) {
      const arr = map.get(s.dateLabel) ?? [];
      arr.push(s);
      map.set(s.dateLabel, arr);
    }
    for (const arr of map.values()) arr.sort((a, b) => a.datetime.localeCompare(b.datetime));
    return map;
  }, [allShows]);

  // Global matched set + chronological list (across all days)
  const matchedIds = useMemo(() => {
    if (!filtersActive(filters)) return new Set<string>();
    return new Set(allShows.filter((s) => showMatches(s, filters)).map((s) => s.id));
  }, [allShows, filters]);

  const matchedList = useMemo(() => {
    if (matchedIds.size === 0) return [] as string[];
    return [...allShows]
      .filter((s) => matchedIds.has(s.id))
      .sort((a, b) => a.datetime.localeCompare(b.datetime))
      .map((s) => s.id);
  }, [allShows, matchedIds]);

  const [matchIdx, setMatchIdx] = useState(-1);

  useEffect(() => {
    setMatchIdx(matchedList.length > 0 ? 0 : -1);
  }, [matchedList.join('|')]);

  useEffect(() => {
    if (matchIdx < 0 || matchIdx >= matchedList.length) return;
    const id = matchedList[matchIdx];
    // Both the desktop grid and the mobile timeline render a chip for every id.
    // Pick the one currently visible (offsetParent !== null filters out display:none subtrees).
    const candidates = document.querySelectorAll<HTMLElement>(`[data-show-id="${id}"]`);
    const el =
      [...candidates].find((c) => c.offsetParent !== null) ?? candidates[0] ?? null;
    if (!el) return;
    scrollChipIntoView(el);
    el.classList.remove('match-flash');
    void el.offsetWidth;
    el.classList.add('match-flash');
  }, [matchIdx, matchedList]);

  const prev = () =>
    setMatchIdx((i) => (matchedList.length === 0 ? -1 : (i - 1 + matchedList.length) % matchedList.length));
  const next = () =>
    setMatchIdx((i) => (matchedList.length === 0 ? -1 : (i + 1) % matchedList.length));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const inSearch = target?.tagName === 'INPUT' && (target as HTMLInputElement).type === 'search';
      if (!inSearch) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        if (e.shiftKey) prev();
        else next();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [matchedList]);

  // No refs needed — we look up chips by `[data-show-id]` in the scroll effect.
  const setRef = (_id: string) => () => {};

  const filtersOn = filtersActive(filters);
  const currentMatchId = matchIdx >= 0 ? matchedList[matchIdx] : null;
  const saved = useStore((s) => s.saved);
  const saveMany = useStore((s) => s.saveMany);
  const resetFilters = useStore((s) => s.resetFilters);
  const unsavedMatchCount = useMemo(
    () => matchedList.reduce((n, id) => (saved.has(id) ? n : n + 1), 0),
    [matchedList, saved],
  );

  return (
    <div>
      {/* Sticky toolbar with match navigator + bulk-save */}
      <div
        className="sticky z-20 h-10 -mx-3 md:-mx-6 px-3 md:px-6 bg-zinc-800 border-b border-zinc-700 flex items-center justify-between gap-3 mb-3"
        style={{ top: HEADER_OFFSET_PX }}
      >
        <div className="text-xs text-zinc-500 truncate">
          {DAY_ROUTES.length} days · {allShows.length} shows
        </div>
        <div className="flex items-center gap-2">
          {filtersOn && matchedList.length > 0 && (
            <button
              onClick={() => saveMany(matchedList)}
              disabled={unsavedMatchCount === 0}
              className={[
                'px-2.5 h-7 rounded text-xs font-semibold transition-colors whitespace-nowrap',
                unsavedMatchCount === 0
                  ? 'bg-saved/10 text-saved/70 border border-saved/40 cursor-default'
                  : 'bg-accent text-white hover:bg-accent-soft',
              ].join(' ')}
              title={
                unsavedMatchCount === 0
                  ? 'All matched shows already in your schedule'
                  : `Add all ${unsavedMatchCount} unsaved matched shows to your schedule`
              }
            >
              {unsavedMatchCount === 0
                ? `✓ ${matchedList.length} saved`
                : `+ Save ${unsavedMatchCount}`}
            </button>
          )}
          <MatchNavigator
            totalMatched={matchedList.length}
            totalShown={allShows.length}
            currentIndex={matchIdx}
            onPrev={prev}
            onNext={next}
            active={filtersOn}
          />
          {filtersOn && (
            <button
              onClick={resetFilters}
              className="px-2.5 h-7 rounded text-xs border border-zinc-600 text-zinc-300 hover:bg-zinc-700 whitespace-nowrap"
              title="Clear all filters and search"
            >
              <span className="hidden sm:inline">Clear filters</span>
              <span className="sm:hidden">Clear</span>
            </button>
          )}
        </div>
      </div>

      <div className="space-y-8">
        {DAY_ROUTES.map((d) => {
          const dayShows = showsByDay.get(d.dateLabel) ?? [];
          if (dayShows.length === 0) return null;
          return (
            <DaySection
              key={d.id}
              id={`day-${d.id}`}
              dateLabel={d.dateLabel}
              shows={dayShows}
              matchedIds={matchedIds}
              currentMatchId={currentMatchId}
              filtersOn={filtersOn}
              setRef={setRef}
            />
          );
        })}
      </div>
    </div>
  );
}

interface DaySectionProps {
  id: string;
  dateLabel: string;
  shows: Show[];
  matchedIds: Set<string>;
  currentMatchId: string | null;
  filtersOn: boolean;
  setRef: (id: string) => (el: HTMLDivElement | null) => void;
}

function DaySection({
  id,
  dateLabel,
  shows,
  matchedIds,
  currentMatchId,
  filtersOn,
  setRef,
}: DaySectionProps) {
  const venues = useMemo(() => {
    const set = new Set<string>();
    shows.forEach((s) => set.add(s.venueName));
    return orderVenues(set);
  }, [shows]);

  const slotRange = useMemo(() => buildSlotRange(shows), [shows]);
  const dayMatched = useMemo(
    () => shows.filter((s) => matchedIds.has(s.id)).length,
    [shows, matchedIds],
  );
  const venueCount = useMemo(() => new Set(shows.map((s) => s.venueName)).size, [shows]);
  const isDesktop = useIsDesktop();

  return (
    <section id={id} className="scroll-mt-24">
      <h2
        className="sticky z-10 bg-zinc-800 -mx-3 md:-mx-6 px-3 md:px-6 h-10 border-b border-zinc-700 flex items-baseline justify-between"
        style={{ top: DAY_HEADING_TOP_PX }}
      >
        <span className="text-base md:text-lg font-bold self-center">{dateLabel}</span>
        <span className="text-xs text-zinc-500 self-center">
          {shows.length} shows · {venueCount} venues
          {filtersOn && (
            <span className={dayMatched === 0 ? 'text-zinc-600' : 'text-accent'}>
              {' '}
              · {dayMatched} match{dayMatched === 1 ? '' : 'es'}
            </span>
          )}
        </span>
      </h2>

      <div className="mt-3">
        {isDesktop ? (
          <DesktopGrid
            dayShows={shows}
            venues={venues}
            slotRange={slotRange}
            matchedIds={matchedIds}
            currentMatchId={currentMatchId}
            filtersOn={filtersOn}
            setRef={setRef}
          />
        ) : (
          <MobileTimeline
            dayShows={shows}
            matchedIds={matchedIds}
            currentMatchId={currentMatchId}
            filtersOn={filtersOn}
            setRef={setRef}
          />
        )}
      </div>
    </section>
  );
}

function buildSlotRange(shows: Show[]): { startMs: number; slots: number } {
  if (shows.length === 0) return { startMs: 0, slots: 0 };
  let min = Infinity;
  let max = -Infinity;
  for (const s of shows) {
    const t = new Date(s.datetime).getTime();
    if (t < min) min = t;
    if (t > max) max = t;
  }
  const slotMs = SLOT_MIN * 60 * 1000;
  const start = Math.floor(min / slotMs) * slotMs;
  const end = max + 60 * 60 * 1000;
  const slots = Math.ceil((end - start) / slotMs);
  return { startMs: start, slots };
}

function showSlotIndex(s: Show, startMs: number): number {
  const t = new Date(s.datetime).getTime();
  return Math.floor((t - startMs) / (SLOT_MIN * 60 * 1000));
}

function formatSlotLabel(slotIdx: number, startMs: number): string {
  const t = new Date(startMs + slotIdx * SLOT_MIN * 60 * 1000);
  let h = t.getHours();
  const m = t.getMinutes();
  const am = h < 12;
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return m === 0 ? `${h}${am ? 'a' : 'p'}` : `${h}:${String(m).padStart(2, '0')}${am ? 'a' : 'p'}`;
}

interface DesktopProps {
  dayShows: Show[];
  venues: string[];
  slotRange: { startMs: number; slots: number };
  matchedIds: Set<string>;
  currentMatchId: string | null;
  filtersOn: boolean;
  setRef: (id: string) => (el: HTMLDivElement | null) => void;
}

function DesktopGrid({
  dayShows,
  venues,
  slotRange,
  matchedIds,
  currentMatchId,
  filtersOn,
  setRef,
}: DesktopProps) {
  const byCell = useMemo(() => {
    const map = new Map<string, Show[]>();
    for (const s of dayShows) {
      const slot = showSlotIndex(s, slotRange.startMs);
      const key = `${s.venueName}|${slot}`;
      const arr = map.get(key) ?? [];
      arr.push(s);
      map.set(key, arr);
    }
    return map;
  }, [dayShows, slotRange.startMs]);

  const colTemplate = `64px repeat(${venues.length}, minmax(180px, 1fr))`;

  return (
    <div
      data-grid-scroll
      className="border border-zinc-800 rounded-lg overflow-x-auto overflow-y-visible bg-zinc-900"
    >
      <div className="min-w-fit">
        <div
          className="grid border-b border-zinc-700 bg-zinc-900"
          style={{ gridTemplateColumns: colTemplate }}
        >
          <div className="px-2 py-2 text-[10px] uppercase tracking-wider text-zinc-500">Time</div>
          {venues.map((v) => (
            <div
              key={v}
              className="px-2 py-2 text-xs font-semibold text-zinc-200 border-l border-zinc-800 truncate"
              title={v}
            >
              {v}
            </div>
          ))}
        </div>

        <div
          className="grid"
          style={{
            gridTemplateColumns: colTemplate,
            gridAutoRows: `${SLOT_HEIGHT_PX}px`,
          }}
        >
          {Array.from({ length: slotRange.slots }).map((_, slot) => (
            <div
              key={`time-${slot}`}
              className="text-[10px] font-mono text-zinc-500 px-2 pt-1 border-t border-zinc-800"
              style={{ gridRow: slot + 1, gridColumn: 1 }}
            >
              {slot % 2 === 0 ? formatSlotLabel(slot, slotRange.startMs) : ''}
            </div>
          ))}
          {venues.map((v, vIdx) =>
            Array.from({ length: slotRange.slots }).map((_, slot) => (
              <div
                key={`${v}-${slot}`}
                className="border-t border-l border-zinc-800"
                style={{ gridRow: slot + 1, gridColumn: vIdx + 2 }}
              />
            )),
          )}
          {[...byCell.entries()].flatMap(([key, shows]) => {
            const [venue, slotStr] = key.split('|');
            const slot = Number(slotStr);
            const vIdx = venues.indexOf(venue);
            return shows.map((s, i) => {
              return (
                <div
                  key={s.id}
                  className="p-0.5"
                  style={{
                    gridRow: `${slot + 1} / span 1`,
                    gridColumn: vIdx + 2,
                    zIndex: shows.length > 1 ? 1 + i : 1,
                  }}
                >
                  <ShowChip
                    ref={setRef(s.id)}
                    show={s}
                    matched={!filtersOn || matchedIds.has(s.id)}
                    isCurrentMatch={currentMatchId === s.id}
                    compact
                  />
                </div>
              );
            });
          })}
        </div>
      </div>
    </div>
  );
}

interface MobileProps {
  dayShows: Show[];
  matchedIds: Set<string>;
  currentMatchId: string | null;
  filtersOn: boolean;
  setRef: (id: string) => (el: HTMLDivElement | null) => void;
}

function MobileTimeline({ dayShows, matchedIds, currentMatchId, filtersOn, setRef }: MobileProps) {
  const groups = useMemo(() => {
    const map = new Map<string, Show[]>();
    for (const s of dayShows) {
      const d = new Date(s.datetime);
      const key = `${d.getHours()}`;
      const arr = map.get(key) ?? [];
      arr.push(s);
      map.set(key, arr);
    }
    return [...map.entries()].sort((a, b) => Number(a[0]) - Number(b[0]));
  }, [dayShows]);

  return (
    <div className="space-y-3">
      {groups.map(([hourKey, shows]) => {
        const h = Number(hourKey);
        const hLabel = ((h + 11) % 12) + 1;
        const am = h < 12 ? 'AM' : 'PM';
        return (
          <section key={hourKey}>
            <h3 className="px-1 py-1 text-xs font-bold text-zinc-400">
              {hLabel} {am}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {shows.map((s) => (
                <ShowChip
                  key={s.id}
                  ref={setRef(s.id)}
                  show={s}
                  matched={!filtersOn || matchedIds.has(s.id)}
                  isCurrentMatch={currentMatchId === s.id}
                  showVenueBadge
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
