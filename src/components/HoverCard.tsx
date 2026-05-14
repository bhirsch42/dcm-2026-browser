import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Show } from '../types';
import { useStore } from '../state';
import { googleCalUrl } from '../ics';

interface Props {
  show: Show;
  anchor: HTMLElement;
  onClose: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onPin?: () => void;
}

const W = 340;
const GAP = 2;
const BRIDGE = 14;

export function HoverCard({ show, anchor, onClose, onMouseEnter, onMouseLeave }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; side: 'right' | 'left' } | null>(null);
  const saved = useStore((s) => s.saved.has(show.id));
  const toggle = useStore((s) => s.toggleSaved);

  useEffect(() => {
    const rect = anchor.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const cardH = ref.current?.offsetHeight ?? 320;
    let side: 'right' | 'left' = 'right';
    let left = rect.right + GAP;
    if (left + W > vw - 12) {
      left = rect.left - W - GAP;
      side = 'left';
    }
    if (left < 12) left = Math.max(12, Math.min(vw - W - 12, rect.left));
    let top = rect.top;
    if (top + cardH > vh - 12) top = Math.max(12, vh - cardH - 12);
    setPos({ top, left, side });
  }, [anchor]);

  return createPortal(
    <div
      ref={ref}
      className={[
        'fixed z-50 w-[340px] max-w-[92vw] bg-zinc-800 border border-zinc-600 rounded-lg shadow-2xl text-zinc-100',
        pos ? 'hover-card-in' : 'opacity-0',
      ].join(' ')}
      style={{ top: pos?.top ?? 0, left: pos?.left ?? 0 }}
      role="dialog"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <span
        aria-hidden
        className="absolute top-0 bottom-0"
        style={{
          [pos?.side === 'left' ? 'right' : 'left']: -BRIDGE,
          width: BRIDGE,
        } as React.CSSProperties}
      />
      {show.image && (
        <img
          src={show.image}
          alt=""
          className="w-full h-32 object-cover bg-zinc-700 rounded-t-lg"
          loading="lazy"
        />
      )}
      <div className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-bold leading-tight">{show.title}</h3>
          <button
            className="text-zinc-500 hover:text-zinc-200 text-lg leading-none"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="text-xs text-zinc-400">
          <div>
            <span className="text-accent font-mono">{show.timeLabel}</span> · {show.dateLabel}
          </div>
          <div>{show.venueName}</div>
          {show.categoryNames.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {show.categoryNames.map((c) => (
                <span
                  key={c}
                  className={`px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider ${
                    c.toLowerCase().includes('headliner')
                      ? 'bg-headliner/20 text-headliner border border-headliner/40'
                      : 'bg-zinc-700 text-zinc-300 border border-zinc-600'
                  }`}
                >
                  {c}
                </span>
              ))}
            </div>
          )}
        </div>
        {show.performers.length > 0 && (
          <div className="text-xs text-zinc-300">
            <span className="text-zinc-500">Cast: </span>
            {show.performers.join(', ')}
          </div>
        )}
        <p className="text-xs text-zinc-400 leading-snug line-clamp-5">{show.excerpt}</p>
        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={() => toggle(show.id)}
            className={[
              'flex-1 px-3 py-1.5 rounded text-sm font-semibold transition-colors',
              saved
                ? 'bg-saved/20 border border-saved text-saved'
                : 'bg-accent text-white hover:bg-accent-soft',
            ].join(' ')}
          >
            {saved ? '✓ Saved' : '+ Save'}
          </button>
          <a
            href={googleCalUrl(show)}
            target="_blank"
            rel="noopener"
            className="px-2.5 py-1.5 rounded text-sm border border-zinc-600 text-zinc-300 hover:bg-zinc-700"
            title="Add to Google Calendar"
          >
            G
          </a>
          <a
            href={show.url}
            target="_blank"
            rel="noopener"
            className="px-2.5 py-1.5 rounded text-sm border border-zinc-600 text-zinc-300 hover:bg-zinc-700"
            title="Open on UCB"
          >
            ↗
          </a>
        </div>
      </div>
    </div>,
    document.body,
  );
}
