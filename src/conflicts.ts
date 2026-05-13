import type { Show } from './types';

// Used by ICS / Google Calendar export to give events an end time. NOT used
// for conflict detection (see `conflictsBetween` below).
export const DEFAULT_SHOW_DURATION_MIN = 60;

export function showInterval(s: Show): { start: number; end: number } {
  const start = new Date(s.datetime).getTime();
  return { start, end: start + DEFAULT_SHOW_DURATION_MIN * 60 * 1000 };
}

/**
 * Two shows conflict only when they start at the exact same time. UCB doesn't
 * publish per-show durations, and DCM runs short back-to-back slots overnight,
 * so any interval-based heuristic produced too many false positives. Same
 * start time = you literally cannot be at both, which is the only signal we
 * can trust.
 */
export function conflictsBetween(shows: Show[]): Set<string> {
  const byStart = new Map<string, Show[]>();
  for (const s of shows) {
    const arr = byStart.get(s.datetime) ?? [];
    arr.push(s);
    byStart.set(s.datetime, arr);
  }
  const conflicts = new Set<string>();
  for (const arr of byStart.values()) {
    if (arr.length > 1) for (const s of arr) conflicts.add(s.id);
  }
  return conflicts;
}
