import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useStore } from '../state';
import { parseShareLink } from '../share';

export function ShareBanner() {
  const saveMany = useStore((s) => s.saveMany);
  const setSaved = useStore((s) => s.setSaved);
  const existingSaved = useStore((s) => s.saved);
  const shows = useStore((s) => s.shows);
  const navigate = useNavigate();
  const [pendingIds, setPendingIds] = useState<string[] | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    // Share param is on the *outer* URL (?s=...), not in the hash route.
    const ids = parseShareLink(window.location.search);
    if (ids && ids.length > 0) setPendingIds(ids);
  }, []);

  const pendingShows = useMemo(() => {
    if (!pendingIds) return [];
    const byId = new Map(shows.map((s) => [s.id, s]));
    return pendingIds
      .map((id) => byId.get(id))
      .filter((s): s is NonNullable<typeof s> => Boolean(s))
      .sort((a, b) => a.datetime.localeCompare(b.datetime));
  }, [pendingIds, shows]);

  const overlapCount = useMemo(() => {
    if (!pendingIds) return 0;
    let n = 0;
    for (const id of pendingIds) if (existingSaved.has(id)) n++;
    return n;
  }, [pendingIds, existingSaved]);

  if (!pendingIds) return null;

  const total = pendingIds.length;
  const newCount = total - overlapCount;
  const hasExisting = existingSaved.size > 0;

  const dismiss = () => {
    // Strip the query param so refreshing doesn't re-show the banner.
    const url = new URL(window.location.href);
    url.searchParams.delete('s');
    window.history.replaceState({}, '', url.toString());
    setPendingIds(null);
  };

  const goToSchedule = () => {
    dismiss();
    navigate({ to: '/schedule' });
  };

  const addToSchedule = () => {
    saveMany(pendingIds);
    goToSchedule();
  };

  const replaceSchedule = () => {
    const ok = window.confirm(
      `Replace your ${existingSaved.size} saved show${existingSaved.size === 1 ? '' : 's'} ` +
        `with this snapshot of ${total}? Your current selections will be removed.`,
    );
    if (!ok) return;
    setSaved(pendingIds);
    goToSchedule();
  };

  const allAlreadySaved = hasExisting && newCount === 0;

  return (
    <div className="bg-accent/20 border-b border-accent/40 px-4 py-2.5 flex flex-col gap-2">
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4">
        <div className="text-sm text-zinc-100">
          <strong className="text-accent">Schedule shared with you.</strong>{' '}
          <span className="text-zinc-300">
            {total} show{total === 1 ? '' : 's'} in this snapshot
            {hasExisting && overlapCount > 0 && (
              <> · {overlapCount} already in your schedule</>
            )}
            .
          </span>{' '}
          <button
            type="button"
            onClick={() => setPreviewOpen((v) => !v)}
            className="underline text-zinc-300 hover:text-zinc-100"
            aria-expanded={previewOpen}
          >
            {previewOpen ? 'Hide' : 'Preview'}
          </button>
        </div>
        <div className="flex items-center gap-2 flex-wrap sm:ml-auto">
          {!allAlreadySaved && (
            <button
              onClick={addToSchedule}
              className="px-3 py-1.5 rounded text-sm bg-accent text-white hover:bg-accent-soft font-semibold"
            >
              {hasExisting
                ? `Add ${newCount} to my schedule`
                : `Import ${total} show${total === 1 ? '' : 's'}`}
            </button>
          )}
          {hasExisting && (
            <button
              onClick={replaceSchedule}
              className="px-3 py-1.5 rounded text-sm border border-accent/60 text-accent hover:bg-accent/10"
              title={`Discard your ${existingSaved.size} saved shows and use this snapshot instead`}
            >
              {allAlreadySaved ? 'Replace my schedule' : 'Replace instead'}
            </button>
          )}
          <button
            onClick={dismiss}
            className="px-3 py-1.5 rounded text-sm border border-zinc-600 text-zinc-200 hover:bg-zinc-800"
          >
            Dismiss
          </button>
        </div>
      </div>
      {previewOpen && (
        <ul className="max-h-56 overflow-y-auto bg-zinc-900/60 border border-zinc-700/60 rounded p-2 text-xs text-zinc-200 space-y-1">
          {pendingShows.length === 0 ? (
            <li className="text-zinc-400 italic px-1">
              These shows aren't in the current data — the link may be from an older build.
            </li>
          ) : (
            pendingShows.map((s) => {
              const already = existingSaved.has(s.id);
              return (
                <li key={s.id} className="flex gap-2 items-baseline">
                  <span className="font-semibold shrink-0 w-9 text-zinc-400">
                    {s.weekday.slice(0, 3)}
                  </span>
                  <span className="font-mono text-accent shrink-0 w-14">{s.timeLabel}</span>
                  <span className="truncate flex-1">
                    {s.title}
                    <span className="text-zinc-500"> · {s.venueName}</span>
                  </span>
                  {already && (
                    <span className="shrink-0 text-[10px] uppercase tracking-wide text-zinc-500">
                      saved
                    </span>
                  )}
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}
