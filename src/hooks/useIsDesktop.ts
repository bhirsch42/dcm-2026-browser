import { useEffect, useState } from 'react';

/** True when viewport ≥ Tailwind's `md` breakpoint (768px). */
export function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window === 'undefined' ? true : window.matchMedia('(min-width: 768px)').matches,
  );
  useEffect(() => {
    const m = window.matchMedia('(min-width: 768px)');
    const onChange = () => setIsDesktop(m.matches);
    m.addEventListener('change', onChange);
    return () => m.removeEventListener('change', onChange);
  }, []);
  return isDesktop;
}
