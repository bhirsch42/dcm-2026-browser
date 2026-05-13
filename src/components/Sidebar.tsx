import { useMemo } from 'react';
import { useStore } from '../state';
import { PerformerMultiSelect } from './PerformerMultiSelect';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function Sidebar({ open, onClose }: Props) {
  const shows = useStore((s) => s.shows);
  const filters = useStore((s) => s.filters);
  const setSearch = useStore((s) => s.setSearch);
  const toggleFilter = useStore((s) => s.toggleFilter);
  const resetFilters = useStore((s) => s.resetFilters);

  const venues = useMemo(() => {
    const set = new Set<string>();
    shows.forEach((s) => set.add(s.venueName));
    return [...set].sort();
  }, [shows]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    shows.forEach((s) => s.categoryNames.forEach((c) => set.add(c)));
    return [...set].sort();
  }, [shows]);

  return (
    <>
      {open && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/60"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      {/* Desktop: collapse out of flow when closed so main expands. Mobile:
          always rendered (fixed overlay, slides off-canvas when closed). */}
      <aside
        className={[
          'bg-zinc-900 border-r border-zinc-800',
          // Mobile: fixed overlay, slide off when closed
          'fixed inset-y-0 left-0 z-50 w-80 max-w-[85vw] overflow-y-auto transition-transform',
          open ? 'translate-x-0' : '-translate-x-full',
          // Desktop: sticky in-flow, hidden entirely when closed
          'md:sticky md:inset-auto md:top-[57px] md:self-start md:z-auto md:w-72 md:max-w-none md:max-h-[calc(100vh-57px)] md:translate-x-0 md:transition-none',
          open ? 'md:block' : 'md:hidden',
        ].join(' ')}
        aria-label="Filters"
      >
        <div className="p-4 space-y-5">
          <div className="flex items-center justify-between md:hidden">
            <span className="text-sm font-bold text-zinc-300">Filters</span>
            <button
              className="inline-flex items-center justify-center w-7 h-7 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
              onClick={onClose}
              aria-label="Close"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-4 h-4"
              >
                <path d="M15 6l-6 6 6 6" />
              </svg>
            </button>
          </div>

          <div>
            <input
              type="search"
              value={filters.search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search shows, descriptions, performers…"
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-accent"
              autoComplete="off"
            />
          </div>

          <FilterGroup
            title="Venue"
            options={venues}
            selected={filters.venues}
            onToggle={(v) => toggleFilter('venues', v)}
          />
          <FilterGroup
            title="Category"
            options={categories}
            selected={filters.categories}
            onToggle={(v) => toggleFilter('categories', v)}
          />

          <PerformerMultiSelect />

          <button
            onClick={resetFilters}
            className="w-full text-sm border border-zinc-700 rounded px-3 py-2 text-zinc-300 hover:bg-zinc-800"
          >
            Reset all filters
          </button>
        </div>
      </aside>
    </>
  );
}

interface FilterGroupProps {
  title: string;
  options: string[];
  selected: Set<string>;
  onToggle: (v: string) => void;
}

function FilterGroup({ title, options, selected, onToggle }: FilterGroupProps) {
  return (
    <div>
      <h3 className="text-xs uppercase tracking-wider text-zinc-500 mb-2">{title}</h3>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const active = selected.has(o);
          return (
            <button
              key={o}
              onClick={() => onToggle(o)}
              className={[
                'px-2 py-1 rounded text-xs border transition-colors',
                active
                  ? 'bg-accent/20 border-accent text-accent'
                  : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:border-zinc-600',
              ].join(' ')}
            >
              {o}
            </button>
          );
        })}
      </div>
    </div>
  );
}
