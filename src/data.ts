import type { PerformersIndex, Show } from './types';

const BASE = import.meta.env.BASE_URL || '/';

export async function loadShows(): Promise<Show[]> {
  const res = await fetch(`${BASE}data/shows.json`);
  if (!res.ok) throw new Error(`Failed to load shows.json: ${res.status}`);
  const shows: Show[] = await res.json();
  // UCB tags some TFTNC Mainstage shows (headliners) with a generic "Theater
  // For the New City" venue and others with "TFTNC - Mainstage". Merge them so
  // the grid renders a single column.
  for (const s of shows) {
    if (s.venue === 'dcm26-theater-for-the-new-city') {
      s.venue = 'dcm26-theater-for-the-new-city-mainstage';
      s.venueName = 'TFTNC - Mainstage';
    }
  }
  return shows;
}

export async function loadPerformers(): Promise<PerformersIndex | null> {
  try {
    const res = await fetch(`${BASE}data/performers.json`);
    if (!res.ok) return null;
    return (await res.json()) as PerformersIndex;
  } catch {
    return null;
  }
}

/**
 * Attach `performers[]` to each show from the performers index, which is keyed
 * by both slug and id. Falls back to the empty array `show.performers` already
 * has in shows.json. Mutates in place.
 */
export function attachPerformers(shows: Show[], idx: PerformersIndex | null): void {
  if (!idx) return;
  for (const s of shows) {
    const names = idx[s.slug] ?? idx[s.id] ?? [];
    if (names.length) s.performers = names;
  }
}

/** Unique performer name -> list of show IDs. Sorted by appearance count desc. */
export function buildPerformerIndex(shows: Show[]): Map<string, string[]> {
  const idx = new Map<string, string[]>();
  for (const s of shows) {
    for (const name of s.performers) {
      const arr = idx.get(name) ?? [];
      arr.push(s.id);
      idx.set(name, arr);
    }
  }
  return new Map(
    [...idx.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0])),
  );
}
