import { DEFAULT_SHOW_DURATION_MIN, showInterval } from './conflicts';
import type { Show } from './types';

/** Local-clock stamp 20260610T190000 (no Z, no offset) for TZID-tagged DTSTART. */
function localStamp(dt: Date): string {
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return (
    `${dt.getFullYear()}${pad(dt.getMonth() + 1)}${pad(dt.getDate())}` +
    `T${pad(dt.getHours())}${pad(dt.getMinutes())}${pad(dt.getSeconds())}`
  );
}

function utcStamp(dt: Date): string {
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return (
    `${dt.getUTCFullYear()}${pad(dt.getUTCMonth() + 1)}${pad(dt.getUTCDate())}` +
    `T${pad(dt.getUTCHours())}${pad(dt.getUTCMinutes())}${pad(dt.getUTCSeconds())}Z`
  );
}

function escapeICS(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}

export function buildICS(shows: Show[]): string {
  const now = utcStamp(new Date());
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//dcm26-browser//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];
  for (const s of shows) {
    const { start, end } = showInterval(s);
    lines.push(
      'BEGIN:VEVENT',
      `UID:${s.id}@dcm26-browser`,
      `DTSTAMP:${now}`,
      `DTSTART;TZID=America/New_York:${localStamp(new Date(start))}`,
      `DTEND;TZID=America/New_York:${localStamp(new Date(end))}`,
      `SUMMARY:${escapeICS(s.title)}`,
      `LOCATION:${escapeICS(s.venueName)}`,
      `DESCRIPTION:${escapeICS(s.excerpt)}\\n\\n${escapeICS(s.url)}`,
      `URL:${s.url}`,
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

export function downloadICS(shows: Show[], filename = 'dcm26-schedule.ics'): void {
  const blob = new Blob([buildICS(shows)], { type: 'text/calendar' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function googleCalUrl(s: Show): string {
  const { start, end } = showInterval(s);
  const fmt = (ms: number) => {
    const d = new Date(ms);
    const pad = (n: number) => String(n).padStart(2, '0');
    return (
      `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
      `T${pad(d.getHours())}${pad(d.getMinutes())}00`
    );
  };
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: s.title,
    dates: `${fmt(start)}/${fmt(end)}`,
    details: `${s.excerpt}\n\n${s.url}`,
    location: s.venueName,
    ctz: 'America/New_York',
  });
  void DEFAULT_SHOW_DURATION_MIN; // (re-exported elsewhere)
  return `https://calendar.google.com/calendar/render?${params}`;
}
