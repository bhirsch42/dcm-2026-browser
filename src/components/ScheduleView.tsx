import { useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useStore } from '../state';
import { conflictsBetween } from '../conflicts';
import { downloadICS, googleCalUrl } from '../ics';
import { buildShareLink } from '../share';
import { ShareModal } from './ShareModal';

export function ScheduleView() {
  const shows = useStore((s) => s.shows);
  const saved = useStore((s) => s.saved);
  const toggle = useStore((s) => s.toggleSaved);

  const [shareOpen, setShareOpen] = useState(false);

  const savedShows = useMemo(
    () =>
      shows
        .filter((s) => saved.has(s.id))
        .sort((a, b) => a.datetime.localeCompare(b.datetime)),
    [shows, saved],
  );

  const conflicts = useMemo(() => conflictsBetween(savedShows), [savedShows]);

  if (savedShows.length === 0) {
    return (
      <div className="text-center py-16 text-zinc-400">
        <p className="text-lg font-semibold mb-2">No shows saved yet.</p>
        <p className="text-sm">
          Head <Link to="/" className="text-accent hover:underline">home</Link> and tap the + button
          on any show to add it to your schedule.
        </p>
      </div>
    );
  }

  // Group by day
  const byDay = new Map<string, typeof savedShows>();
  for (const s of savedShows) {
    const arr = byDay.get(s.dateLabel) ?? [];
    arr.push(s);
    byDay.set(s.dateLabel, arr);
  }

  return (
    <div>
      <div className="flex items-start md:items-center justify-between gap-3 mb-4 flex-col md:flex-row">
        <div>
          <h1 className="text-xl md:text-2xl font-bold">My Schedule</h1>
          <div className="text-xs text-zinc-500 mt-0.5">
            {savedShows.length} shows
            {conflicts.size > 0 && (
              <span className="text-conflict"> · {conflicts.size / 2 | 0}+ overlapping</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="px-3 py-1.5 rounded text-sm bg-accent text-white hover:bg-accent-soft font-semibold"
            onClick={() => downloadICS(savedShows)}
          >
            Export .ics
          </button>
          <button
            className="px-3 py-1.5 rounded text-sm border border-zinc-600 text-zinc-200 hover:bg-zinc-800"
            onClick={() => setShareOpen(true)}
          >
            Share
          </button>
        </div>
      </div>

      <div className="space-y-5">
        {[...byDay.entries()].map(([day, list]) => (
          <section key={day}>
            <h2 className="text-sm font-bold text-zinc-300 mb-2 border-b border-zinc-800 pb-1">
              {day}
            </h2>
            <ul className="space-y-1.5">
              {list.map((s) => {
                const isConflict = conflicts.has(s.id);
                return (
                  <li
                    key={s.id}
                    className={[
                      'flex items-start gap-3 p-2.5 rounded border',
                      isConflict
                        ? 'border-conflict/60 bg-conflict/5'
                        : 'border-zinc-700 bg-zinc-800',
                    ].join(' ')}
                  >
                    <span className="font-mono text-sm text-accent shrink-0 w-20 whitespace-nowrap">
                      {s.timeLabel}
                    </span>
                    <div className="flex-1 min-w-0">
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noopener"
                        className="text-sm font-semibold text-zinc-100 hover:underline"
                      >
                        {s.title}
                      </a>
                      <div className="text-xs font-semibold text-zinc-200 mt-0.5">
                        {s.venueName}
                      </div>
                      {s.performers.length > 0 && (
                        <div className="text-[11px] text-zinc-500 mt-0.5">
                          {s.performers.slice(0, 4).join(', ')}
                          {s.performers.length > 4 ? '…' : ''}
                        </div>
                      )}
                      {isConflict && (
                        <div className="text-[11px] text-conflict mt-1 font-semibold">
                          ⚠ overlaps with another saved show
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <a
                        href={googleCalUrl(s)}
                        target="_blank"
                        rel="noopener"
                        className="px-2 py-1 rounded text-xs border border-zinc-600 text-zinc-300 hover:bg-zinc-700"
                        title="Add to Google Calendar"
                      >
                        G
                      </a>
                      <button
                        onClick={() => toggle(s.id)}
                        className="px-2 py-1 rounded text-xs border border-zinc-600 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-100"
                        title="Remove from schedule"
                      >
                        ×
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      {shareOpen && (
        <ShareModal url={buildShareLink([...saved])} onClose={() => setShareOpen(false)} />
      )}
    </div>
  );
}
