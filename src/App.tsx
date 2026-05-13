import { RouterProvider } from '@tanstack/react-router';
import { useEffect } from 'react';
import { router } from './router';
import { useStore } from './state';
import { attachPerformers, loadPerformers, loadShows } from './data';

export function App() {
  const setShows = useStore((s) => s.setShows);
  const setPerformers = useStore((s) => s.setPerformers);
  const setLoaded = useStore((s) => s.setLoaded);
  const loaded = useStore((s) => s.loaded);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [shows, performers] = await Promise.all([loadShows(), loadPerformers()]);
      if (cancelled) return;
      attachPerformers(shows, performers);
      setShows(shows);
      setPerformers(performers);
      setLoaded(true);
    })().catch((err) => console.error('Load failed', err));
    return () => {
      cancelled = true;
    };
  }, [setShows, setPerformers, setLoaded]);

  if (!loaded) {
    return (
      <div className="min-h-screen flex items-center justify-center text-zinc-400">
        Loading DCM26 shows…
      </div>
    );
  }

  return <RouterProvider router={router} />;
}
