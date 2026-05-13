import { useMemo, useState } from 'react';
import { useStore } from '../state';
import { buildPerformerIndex } from '../data';

const SUGGEST_LIMIT = 60;

export function PerformerMultiSelect() {
  const shows = useStore((s) => s.shows);
  const selected = useStore((s) => s.filters.performers);
  const togglePerformer = (name: string) => useStore.getState().toggleFilter('performers', name);
  const clearPerformers = useStore((s) => s.clearPerformers);

  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  // Cached at module scope would be nicer, but `shows` only changes once.
  const performerIndex = useMemo(() => buildPerformerIndex(shows), [shows]);

  const entries = useMemo(() => [...performerIndex.entries()], [performerIndex]);

  const filtered = useMemo(() => {
    if (!query.trim()) return entries.slice(0, SUGGEST_LIMIT);
    const q = query.trim().toLowerCase();
    const out: [string, string[]][] = [];
    for (const e of entries) {
      if (e[0].toLowerCase().includes(q)) out.push(e);
      if (out.length >= 200) break;
    }
    return out;
  }, [entries, query]);

  const totalPerformers = entries.length;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs uppercase tracking-wider text-zinc-500">
          Performers
          <span className="ml-1 text-zinc-500 normal-case tracking-normal">
            ({totalPerformers})
          </span>
        </h3>
        {selected.size > 0 && (
          <button
            onClick={clearPerformers}
            className="text-[11px] text-zinc-400 hover:text-zinc-100"
          >
            clear {selected.size}
          </button>
        )}
      </div>

      {selected.size > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {[...selected].sort().map((name) => (
            <button
              key={name}
              onClick={() => togglePerformer(name)}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] bg-accent/20 border border-accent/40 text-accent hover:bg-accent/30"
              title="Remove"
            >
              <span className="truncate max-w-[140px]">{name}</span>
              <span className="text-accent/70">×</span>
            </button>
          ))}
        </div>
      )}

      <div className="relative">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={() =>
            // Delay so a click on a list item registers before close
            window.setTimeout(() => setOpen(false), 150)
          }
          placeholder={`Find a performer…`}
          className="w-full bg-zinc-800 border border-zinc-700 rounded px-2.5 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-accent"
          autoComplete="off"
        />
        {(open || query) && (
          <div className="mt-1 max-h-60 overflow-y-auto rounded border border-zinc-700 bg-zinc-900">
            {filtered.length === 0 ? (
              <div className="px-2.5 py-2 text-xs text-zinc-500">No matches.</div>
            ) : (
              <ul className="py-1">
                {filtered.map(([name, ids]) => {
                  const checked = selected.has(name);
                  return (
                    <li key={name}>
                      <button
                        onMouseDown={(e) => e.preventDefault() /* keep input focused */}
                        onClick={() => togglePerformer(name)}
                        className={[
                          'w-full flex items-center gap-2 px-2.5 py-1 text-xs text-left hover:bg-zinc-800',
                          checked ? 'text-accent' : 'text-zinc-200',
                        ].join(' ')}
                      >
                        <span
                          className={[
                            'inline-flex items-center justify-center w-3.5 h-3.5 rounded border shrink-0 text-[9px] font-bold',
                            checked
                              ? 'bg-accent border-accent text-zinc-900'
                              : 'border-zinc-500 bg-transparent',
                          ].join(' ')}
                        >
                          {checked ? '✓' : ''}
                        </span>
                        <span className="flex-1 truncate">{name}</span>
                        <span className="text-zinc-500 text-[10px]">{ids.length}</span>
                      </button>
                    </li>
                  );
                })}
                {!query && entries.length > SUGGEST_LIMIT && (
                  <li className="px-2.5 py-1.5 text-[10px] text-zinc-500 border-t border-zinc-800">
                    Showing {SUGGEST_LIMIT} of {entries.length}. Type to find more.
                  </li>
                )}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
