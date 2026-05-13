import type { Show } from './types';

export const DEFAULT_SHOW_DURATION_MIN = 60;

export function showInterval(s: Show): { start: number; end: number } {
  const start = new Date(s.datetime).getTime();
  return { start, end: start + DEFAULT_SHOW_DURATION_MIN * 60 * 1000 };
}

export function conflictsBetween(shows: Show[]): Set<string> {
  const conflicts = new Set<string>();
  const intervals = shows.map((s) => ({ s, ...showInterval(s) }));
  for (let i = 0; i < intervals.length; i++) {
    for (let j = i + 1; j < intervals.length; j++) {
      const a = intervals[i];
      const b = intervals[j];
      if (a.start < b.end && b.start < a.end) {
        conflicts.add(a.s.id);
        conflicts.add(b.s.id);
      }
    }
  }
  return conflicts;
}
