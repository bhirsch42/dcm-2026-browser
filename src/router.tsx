import {
  createHashHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  useRouterState,
} from '@tanstack/react-router';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { ShareBanner } from './components/ShareBanner';
import { GridView } from './components/GridView';
import { ScheduleView } from './components/ScheduleView';
import { useState } from 'react';

function RootLayout() {
  // Open by default on desktop, closed on mobile. One shared state — the
  // header button toggles it in either mode.
  const [sidebarOpen, setSidebarOpen] = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(min-width: 768px)').matches
      : false,
  );
  // Filters only apply to the grid view. Hide the sidebar (and its header
  // toggle) anywhere else.
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const showFilters = pathname === '/';
  return (
    <div className="min-h-screen flex flex-col">
      <Header
        onMenuClick={() => setSidebarOpen((v) => !v)}
        sidebarOpen={sidebarOpen}
        showFilterToggle={showFilters}
      />
      <ShareBanner />
      <div className="flex-1 flex flex-col md:flex-row">
        {showFilters && <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />}
        <main className="flex-1 min-w-0 px-3 py-3 md:px-6 md:py-5">
          <Outlet />
        </main>
      </div>
      <footer className="px-4 py-4 text-xs text-zinc-500 border-t border-zinc-800">
        Unofficial planner for UCB's Del Close Marathon 26 (June 10–14, 2026). Data parsed from{' '}
        <a
          className="text-accent hover:underline"
          href="https://ucbcomedy.com/shows/dcm26-marathon-calendar/"
          target="_blank"
          rel="noopener"
        >
          ucbcomedy.com
        </a>
        . Showtimes subject to change — verify on the UCB site.
      </footer>
    </div>
  );
}

const rootRoute = createRootRoute({ component: RootLayout });

export interface GridSearch {
  q?: string;
  venue?: string[];
  cat?: string[];
  perf?: string[];
}

function toArr(v: unknown): string[] | undefined {
  if (Array.isArray(v)) return v.map(String).filter(Boolean);
  if (typeof v === 'string' && v.length) return [v];
  return undefined;
}

export const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  validateSearch: (search: Record<string, unknown>): GridSearch => ({
    q: typeof search.q === 'string' && search.q.length ? search.q : undefined,
    venue: toArr(search.venue),
    cat: toArr(search.cat),
    perf: toArr(search.perf),
  }),
  component: GridView,
});

const scheduleRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/schedule',
  component: ScheduleView,
});

const routeTree = rootRoute.addChildren([indexRoute, scheduleRoute]);

export const router = createRouter({
  routeTree,
  history: createHashHistory(),
  defaultPreload: 'intent',
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
