import { forwardRef, useCallback, useRef } from 'react';
import type { Show } from '../types';
import { useStore } from '../state';
import { HoverCard } from './HoverCard';
import { useIsDesktop } from '../hooks/useIsDesktop';

interface Props {
  show: Show;
  matched: boolean;
  isCurrentMatch?: boolean;
  showVenueBadge?: boolean;
  compact?: boolean;
}

export const ShowChip = forwardRef<HTMLDivElement, Props>(function ShowChip(
  { show, matched, isCurrentMatch, showVenueBadge, compact },
  ref,
) {
  const saved = useStore((s) => s.saved.has(show.id));
  const toggle = useStore((s) => s.toggleSaved);
  const isDesktop = useIsDesktop();
  const isActive = useStore((s) => s.activeCardId === show.id);
  const openCard = useStore((s) => s.openCard);
  const closeCardIfActive = useStore((s) => s.closeCardIfActive);
  const closeCard = useStore((s) => s.closeCard);
  const localRef = useRef<HTMLDivElement | null>(null);
  const closeTimer = useRef<number | undefined>(undefined);

  const setRefs = (el: HTMLDivElement | null) => {
    localRef.current = el;
    if (typeof ref === 'function') ref(el);
    else if (ref) (ref as { current: HTMLDivElement | null }).current = el;
  };

  const headliner = show.categoryNames.some((c) => c.toLowerCase().includes('headliner'));

  const onEnter = useCallback(() => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    openCard(show.id);
  }, [openCard, show.id]);
  const onLeave = useCallback(() => {
    closeTimer.current = window.setTimeout(() => closeCardIfActive(show.id), 120);
  }, [closeCardIfActive, show.id]);

  // Hover card is desktop-only — on mobile it covers the whole screen.
  const showCard = isDesktop && isActive;

  return (
    <div
      ref={setRefs}
      data-show-id={show.id}
      onMouseEnter={isDesktop ? onEnter : undefined}
      onMouseLeave={isDesktop ? onLeave : undefined}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('button, a')) return;
        window.open(show.url, '_blank', 'noopener');
      }}
      className={[
        'group relative cursor-pointer rounded border transition-all overflow-hidden',
        compact ? 'p-1.5 h-full' : 'p-2',
        matched ? 'opacity-100' : 'opacity-30 grayscale',
        isCurrentMatch ? 'ring-2 ring-accent ring-offset-1 ring-offset-zinc-900' : '',
        saved
          ? 'bg-saved/10 border-saved/60'
          : headliner
            ? 'bg-headliner/10 border-headliner/40'
            : 'bg-zinc-800 border-zinc-700 hover:border-zinc-500',
      ].join(' ')}
      tabIndex={0}
    >
      <div className="flex items-start gap-1.5 min-w-0">
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggle(show.id);
          }}
          aria-label={saved ? 'Remove from schedule' : 'Add to schedule'}
          aria-pressed={saved}
          className={[
            'shrink-0 w-5 h-5 rounded-full border flex items-center justify-center text-[10px] font-bold transition-colors',
            saved
              ? 'bg-saved text-zinc-900 border-saved'
              : 'bg-transparent text-zinc-400 border-zinc-500 hover:border-accent hover:text-accent',
          ].join(' ')}
        >
          {saved ? '✓' : '+'}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5 text-xs">
            <span className="text-accent font-mono shrink-0">{show.timeLabel}</span>
            {headliner && <span className="text-headliner text-[10px]">★</span>}
          </div>
          <div className={`leading-tight ${compact ? 'text-[11px]' : 'text-xs'} text-zinc-100 line-clamp-2`}>
            {show.title}
          </div>
          {showVenueBadge && (
            <div className="text-[10px] text-zinc-500 truncate mt-0.5">{show.venueName}</div>
          )}
        </div>
      </div>

      {showCard && localRef.current && (
        <HoverCard show={show} anchor={localRef.current} onClose={closeCard} />
      )}
    </div>
  );
});
