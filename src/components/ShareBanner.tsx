import { useEffect, useState } from 'react';
import { useStore } from '../state';
import { parseShareLink } from '../share';

export function ShareBanner() {
  const setSaved = useStore((s) => s.setSaved);
  const [pendingIds, setPendingIds] = useState<string[] | null>(null);

  useEffect(() => {
    // Share param is on the *outer* URL (?s=...), not in the hash route.
    const ids = parseShareLink(window.location.search);
    if (ids && ids.length > 0) setPendingIds(ids);
  }, []);

  if (!pendingIds) return null;

  const dismiss = () => {
    // Strip the query param so refreshing doesn't re-show the banner.
    const url = new URL(window.location.href);
    url.searchParams.delete('s');
    window.history.replaceState({}, '', url.toString());
    setPendingIds(null);
  };

  const importAll = () => {
    setSaved(pendingIds);
    dismiss();
  };

  return (
    <div className="bg-accent/20 border-b border-accent/40 px-4 py-2.5 flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4">
      <div className="text-sm text-zinc-100">
        <strong className="text-accent">Schedule shared with you.</strong>{' '}
        <span className="text-zinc-300">{pendingIds.length} shows from a snapshot link.</span>
      </div>
      <div className="flex items-center gap-2 sm:ml-auto">
        <button
          onClick={importAll}
          className="px-3 py-1.5 rounded text-sm bg-accent text-white hover:bg-accent-soft font-semibold"
        >
          Import to my schedule
        </button>
        <button
          onClick={dismiss}
          className="px-3 py-1.5 rounded text-sm border border-zinc-600 text-zinc-200 hover:bg-zinc-800"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
