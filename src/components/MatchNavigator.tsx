interface Props {
  totalMatched: number;
  totalShown: number;
  currentIndex: number;
  onPrev: () => void;
  onNext: () => void;
  active: boolean;
}

export function MatchNavigator({ totalMatched, totalShown, currentIndex, onPrev, onNext, active }: Props) {
  if (!active) {
    return (
      <div className="text-sm text-zinc-400">
        Showing all <span className="text-zinc-200 font-semibold">{totalShown}</span> shows
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-zinc-300">
        <span className="text-accent font-semibold">{totalMatched === 0 ? 0 : currentIndex + 1}</span>
        <span className="text-zinc-500"> of </span>
        <span className="text-zinc-200 font-semibold">{totalMatched}</span>
        <span className="text-zinc-500"> match{totalMatched === 1 ? '' : 'es'}</span>
      </span>
      <button
        onClick={onPrev}
        disabled={totalMatched === 0}
        className="w-7 h-7 rounded border border-zinc-600 text-zinc-300 transition-colors hover:bg-zinc-700 disabled:opacity-40 disabled:hover:bg-transparent"
        aria-label="Previous match"
        title="Previous match (Shift+Enter)"
      >
        ↑
      </button>
      <button
        onClick={onNext}
        disabled={totalMatched === 0}
        className="w-7 h-7 rounded border border-zinc-600 text-zinc-300 transition-colors hover:bg-zinc-700 disabled:opacity-40 disabled:hover:bg-transparent"
        aria-label="Next match"
        title="Next match (Enter)"
      >
        ↓
      </button>
    </div>
  );
}
