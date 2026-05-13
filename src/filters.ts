import type { Filters, Show } from './types';

/** True if a show matches the active filters (excluding day, which is implicit per route). */
export function showMatches(s: Show, f: Filters): boolean {
  if (f.search) {
    const q = f.search.toLowerCase();
    const hay = `${s.title} ${s.excerpt} ${s.performers.join(' ')}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  if (f.venues.size && !f.venues.has(s.venueName)) return false;
  if (f.categories.size && !s.categoryNames.some((c) => f.categories.has(c))) return false;
  if (f.performers.size && !s.performers.some((p) => f.performers.has(p))) return false;
  return true;
}

export function filtersActive(f: Filters): boolean {
  return Boolean(
    f.search ||
      f.venues.size ||
      f.categories.size ||
      f.performers.size ||
      f.days.size, // not used in grid, but counts as "active" for reset visibility
  );
}
