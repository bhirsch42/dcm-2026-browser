export interface Show {
  id: string;
  slug: string;
  title: string;
  url: string;
  image: string;
  datetime: string; // local-clock ISO, no Z
  weekday: string;
  dateLabel: string;
  timeLabel: string;
  venue: string;
  venueName: string;
  categories: string[];
  categoryNames: string[];
  excerpt: string;
  performers: string[];
}

export type PerformersIndex = Record<string, string[]>;

export interface Filters {
  search: string;
  days: Set<string>;
  venues: Set<string>;
  categories: Set<string>;
  performers: Set<string>;
}

export const DAY_ROUTES: { id: string; dateLabel: string; weekday: string }[] = [
  { id: 'wed', dateLabel: 'Wednesday, June 10', weekday: 'Wednesday' },
  { id: 'thu', dateLabel: 'Thursday, June 11', weekday: 'Thursday' },
  { id: 'fri', dateLabel: 'Friday, June 12', weekday: 'Friday' },
  { id: 'sat', dateLabel: 'Saturday, June 13', weekday: 'Saturday' },
  { id: 'sun', dateLabel: 'Sunday, June 14', weekday: 'Sunday' },
];

export function dayIdForDateLabel(label: string): string | null {
  return DAY_ROUTES.find((d) => d.dateLabel === label)?.id ?? null;
}

export function dateLabelForDayId(id: string): string | null {
  return DAY_ROUTES.find((d) => d.id === id)?.dateLabel ?? null;
}
