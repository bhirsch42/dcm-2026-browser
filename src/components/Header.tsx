import { Link, useNavigate } from '@tanstack/react-router';
import { useStore } from '../state';
import { DAY_ROUTES } from '../types';

interface Props {
  onMenuClick: () => void;
  sidebarOpen: boolean;
  showFilterToggle?: boolean;
}

export function Header({ onMenuClick, sidebarOpen, showFilterToggle = true }: Props) {
  const savedCount = useStore((s) => s.saved.size);
  const navigate = useNavigate();

  async function jumpToDay(id: string) {
    let el = document.getElementById(`day-${id}`);
    if (!el) {
      // Not on the grid view (e.g. on /schedule). Switch routes and wait for
      // the day section to mount.
      await navigate({ to: '/' });
      for (let i = 0; i < 20; i++) {
        el = document.getElementById(`day-${id}`);
        if (el) break;
        await new Promise((r) => setTimeout(r, 30));
      }
    }
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  return (
    <header className="sticky top-0 z-30 bg-zinc-900 border-b border-zinc-800">
      <div className="flex items-center gap-2 px-3 md:px-5 py-2.5">
        {showFilterToggle && (
        <button
          className="inline-flex items-center justify-center w-9 h-9 rounded border border-zinc-700 text-zinc-300 hover:bg-zinc-800"
          onClick={onMenuClick}
          aria-label="Toggle filters"
          aria-expanded={sidebarOpen}
          title={sidebarOpen ? 'Hide filters' : 'Show filters'}
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            className="w-4 h-4"
          >
            <path d="M3 6h18M6 12h12M10 18h4" />
          </svg>
        </button>
        )}
        <Link
          to="/"
          className="flex items-baseline gap-2 mr-2 hover:opacity-80"
          activeOptions={{ exact: true }}
        >
          <span className="text-xl md:text-2xl font-black tracking-tight">
            DCM<span className="text-accent">26</span>
          </span>
          <span className="hidden sm:inline text-xs text-zinc-500">unofficial planner</span>
        </Link>
        <nav className="flex-1 min-w-0 flex items-center gap-1 overflow-x-auto no-scrollbar">
          {DAY_ROUTES.map((d) => (
            <button
              key={d.id}
              onClick={() => jumpToDay(d.id)}
              className="px-2 md:px-2.5 py-1 rounded text-sm whitespace-nowrap text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
              title={`Jump to ${d.weekday}`}
            >
              <span className="md:hidden">{d.weekday.slice(0, 3)}</span>
              <span className="hidden md:inline">{d.weekday}</span>
            </button>
          ))}
        </nav>
        <Link
          to="/schedule"
          className="shrink-0 inline-flex items-center gap-1.5 px-2 md:px-2.5 py-1 rounded text-sm whitespace-nowrap text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800 data-[status=active]:text-zinc-100 data-[status=active]:bg-zinc-700"
          activeProps={{ 'data-status': 'active' } as Record<string, string>}
          aria-label="My Schedule"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-4 h-4 sm:hidden"
          >
            <rect x="3" y="5" width="18" height="16" rx="2" />
            <path d="M3 9h18M8 3v4M16 3v4" />
          </svg>
          <span className="hidden sm:inline">My Schedule</span>
          <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 rounded text-xs bg-accent text-white font-bold">
            {savedCount}
          </span>
        </Link>
      </div>
    </header>
  );
}
