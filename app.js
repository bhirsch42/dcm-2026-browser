// DCM26 Browser — festival planner
// Static, no build step. Loads data/shows.json and renders four views.

const STORAGE_KEY = 'dcm26-saved-v1';
const TZ = 'America/New_York';
const DEFAULT_SHOW_DURATION_MIN = 60;

// ----- State -----
const state = {
  shows: [],
  performers: {},        // name -> [showIds]
  hasPerformerData: false,
  saved: new Set(loadSaved()),
  filters: {
    search: '',
    days: new Set(),
    venues: new Set(),
    categories: new Set(),
    performer: null,
  },
  view: 'browse',
  shareToImport: null,
};

function loadSaved() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
function persistSaved() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...state.saved]));
  updateSavedCount();
  updateToolbarButtons();
}

// ----- Data loading -----
async function loadData() {
  const res = await fetch('data/shows.json');
  state.shows = await res.json();

  // Optional performer data file. If present, augments shows with performer arrays.
  try {
    const perfRes = await fetch('data/performers.json');
    if (perfRes.ok) {
      const perfData = await perfRes.json();
      // Two supported shapes: {showId: [names]} or {showId: {performers: [names]}}.
      for (const show of state.shows) {
        const entry = perfData[show.id] || perfData[show.slug];
        if (entry) {
          show.performers = Array.isArray(entry) ? entry : (entry.performers || []);
        }
      }
      state.hasPerformerData = state.shows.some((s) => s.performers && s.performers.length);
    }
  } catch { /* no performer data, fine */ }

  // Build performer index.
  state.performers = {};
  for (const show of state.shows) {
    for (const name of (show.performers || [])) {
      if (!state.performers[name]) state.performers[name] = [];
      state.performers[name].push(show.id);
    }
  }
}

// ----- URL share decoding -----
// Share URL shape: ?s=<base64url(JSON.stringify(showIds))>
function parseShareLink() {
  const params = new URLSearchParams(window.location.search);
  const encoded = params.get('s');
  if (!encoded) return null;
  try {
    const json = atob(encoded.replace(/-/g, '+').replace(/_/g, '/'));
    const ids = JSON.parse(json);
    if (Array.isArray(ids)) return ids.map(String);
  } catch { /* ignore */ }
  return null;
}
function buildShareLink(ids) {
  const json = JSON.stringify(ids);
  const b64 = btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const url = new URL(window.location.href);
  url.search = `?s=${b64}`;
  url.hash = '';
  return url.toString();
}

// ----- Filtering & sort -----
function filteredShows() {
  const f = state.filters;
  const searchLower = f.search.trim().toLowerCase();
  return state.shows.filter((s) => {
    if (f.days.size && !f.days.has(s.weekday)) return false;
    if (f.venues.size && !f.venues.has(s.venue)) return false;
    if (f.categories.size) {
      const ok = (s.categories || []).some((c) => f.categories.has(c));
      if (!ok) return false;
    }
    if (f.performer) {
      if (!(s.performers || []).includes(f.performer)) return false;
    }
    if (searchLower) {
      const hay = `${s.title} ${s.excerpt || ''} ${(s.performers || []).join(' ')}`.toLowerCase();
      if (!hay.includes(searchLower)) return false;
    }
    return true;
  });
}

function groupByDay(shows) {
  const groups = new Map();
  for (const s of shows) {
    const key = s.dateLabel || 'Unscheduled';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(s);
  }
  // Sort each group by datetime then title.
  for (const arr of groups.values()) {
    arr.sort((a, b) => {
      if (a.datetime && b.datetime && a.datetime !== b.datetime) return a.datetime.localeCompare(b.datetime);
      return (a.title || '').localeCompare(b.title || '');
    });
  }
  return groups;
}

// Show overlap = same start window (assume 60min) on same date.
function showInterval(s) {
  if (!s.datetime) return null;
  const start = new Date(s.datetime).getTime();
  return { start, end: start + DEFAULT_SHOW_DURATION_MIN * 60_000 };
}
function conflictsBetween(savedShows) {
  const intervals = savedShows.map((s) => ({ id: s.id, ...showInterval(s) })).filter((i) => i.start);
  const conflicts = new Set();
  for (let i = 0; i < intervals.length; i++) {
    for (let j = i + 1; j < intervals.length; j++) {
      const a = intervals[i], b = intervals[j];
      if (a.start < b.end && b.start < a.end) {
        conflicts.add(a.id);
        conflicts.add(b.id);
      }
    }
  }
  return conflicts;
}

// ----- ICS export -----
function pad(n) { return String(n).padStart(2, '0'); }
function icsDate(s) {
  // s.datetime is local NYC; emit floating local + VTIMEZONE not needed if we use TZID.
  const d = new Date(s.datetime);
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
}
function icsEscape(s) {
  return String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}
function buildICS(shows) {
  const now = new Date();
  const stamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth()+1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//DCM26 Browser//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:DCM26 Schedule',
    'X-WR-TIMEZONE:America/New_York',
  ];
  for (const s of shows) {
    if (!s.datetime) continue;
    const start = icsDate(s);
    const endDate = new Date(s.datetime);
    endDate.setMinutes(endDate.getMinutes() + DEFAULT_SHOW_DURATION_MIN);
    const end = `${endDate.getFullYear()}${pad(endDate.getMonth()+1)}${pad(endDate.getDate())}T${pad(endDate.getHours())}${pad(endDate.getMinutes())}00`;
    lines.push(
      'BEGIN:VEVENT',
      `UID:dcm26-${s.id}@dcm26-browser`,
      `DTSTAMP:${stamp}`,
      `DTSTART;TZID=${TZ}:${start}`,
      `DTEND;TZID=${TZ}:${end}`,
      `SUMMARY:${icsEscape(s.title)}`,
      `LOCATION:${icsEscape(s.venueName || '')}`,
      `DESCRIPTION:${icsEscape((s.excerpt || '') + (s.url ? `\n\n${s.url}` : ''))}`,
      `URL:${icsEscape(s.url || '')}`,
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

function downloadICS(shows, filename = 'dcm26-schedule.ics') {
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

// Single-event Google Calendar URL.
function googleCalUrl(s) {
  if (!s.datetime) return null;
  const startD = new Date(s.datetime);
  const endD = new Date(s.datetime);
  endD.setMinutes(endD.getMinutes() + DEFAULT_SHOW_DURATION_MIN);
  const fmt = (d) => `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: s.title,
    dates: `${fmt(startD)}/${fmt(endD)}`,
    details: `${s.excerpt || ''}\n\n${s.url || ''}`,
    location: s.venueName || '',
    ctz: TZ,
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}

// ----- Rendering -----
const viewRoot = document.getElementById('viewRoot');

function renderBrowse() {
  const shows = filteredShows();
  if (!shows.length) {
    viewRoot.innerHTML = `<div class="empty-state"><h3>No shows match your filters.</h3><p>Try clearing search or filters.</p></div>`;
    return;
  }

  // When a search is active, flatten to one chronological table (no day grouping).
  if (state.filters.search.trim()) {
    const sorted = [...shows].sort((a, b) => (a.datetime || '').localeCompare(b.datetime || ''));
    viewRoot.innerHTML = renderShowTable(sorted, { showWeekday: true });
    attachRowHandlers();
    return;
  }

  // Otherwise group by day.
  const groups = groupByDay(shows);
  const dayOrder = ['Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const sortedKeys = [...groups.keys()].sort((a, b) => {
    const da = groups.get(a)[0]?.weekday;
    const db = groups.get(b)[0]?.weekday;
    return dayOrder.indexOf(da) - dayOrder.indexOf(db);
  });

  const html = sortedKeys.map((day) => {
    const items = groups.get(day);
    return `
      <section class="day-section">
        <div class="day-heading">
          <h2>${escapeHtml(day)}</h2>
          <span class="day-count">${items.length} show${items.length === 1 ? '' : 's'}</span>
        </div>
        ${renderShowTable(items, { showWeekday: false })}
      </section>
    `;
  }).join('');
  viewRoot.innerHTML = html;
  attachRowHandlers();
}

function renderShowTable(rows, opts = {}) {
  const showWeekday = !!opts.showWeekday;
  const conflicts = opts.conflicts || new Set();
  return `
    <div class="show-table-wrap">
      <table class="show-table">
        <colgroup>
          <col class="col-save" />
          <col class="col-time" />
          <col />
          <col class="col-venue" />
          <col class="col-cast" />
          <col class="col-actions" />
        </colgroup>
        <thead>
          <tr>
            <th></th>
            <th>Time</th>
            <th>Show</th>
            <th>Venue</th>
            <th>Cast</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((s) => renderRow(s, { showWeekday, conflict: conflicts.has(s.id) })).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderRow(s, opts = {}) {
  const isSaved = state.saved.has(s.id);
  const isConflict = !!opts.conflict;
  const showWeekday = !!opts.showWeekday;
  const isHeadliner = (s.categories || []).includes('dcm26-headliner');
  const gcal = googleCalUrl(s);
  const performers = s.performers || [];
  const performerHtml = performers.length
    ? performers.map((n) => `<a class="perf-link${state.filters.performer === n ? ' perf-active' : ''}" data-perf="${escapeAttr(n)}">${escapeHtml(n)}</a>`).join(', ')
    : `<em class="cast-empty">—</em>`;
  const rowCls = [];
  if (isSaved) rowCls.push('saved');
  if (isConflict) rowCls.push('conflict');
  return `
    <tr class="${rowCls.join(' ')}" data-id="${s.id}">
      <td class="cell-save">
        <button class="save-btn ${isSaved ? 'is-saved' : ''}" data-act="toggle-save" data-id="${s.id}" title="${isSaved ? 'Remove from schedule' : 'Save to schedule'}">${isSaved ? '✓' : '+'}</button>
      </td>
      <td class="cell-time">
        ${showWeekday ? `<span class="weekday">${escapeHtml((s.weekday || '').slice(0,3))}</span>` : ''}
        ${escapeHtml(s.timeLabel || 'TBA')}
      </td>
      <td class="cell-title">
        ${isHeadliner ? `<span class="row-tag row-tag-headliner">Headliner</span>` : ''}
        <a href="${escapeAttr(s.url)}" target="_blank" rel="noopener">${escapeHtml(s.title)}</a>
        ${s.excerpt ? `<span class="row-excerpt">${escapeHtml(s.excerpt)}</span>` : ''}
        ${isConflict ? `<span class="cell-conflict-flag">⚠ time conflict</span>` : ''}
      </td>
      <td class="cell-venue">${escapeHtml(s.venueName || '—')}</td>
      <td class="cell-cast">${performerHtml}</td>
      <td class="cell-actions">
        ${gcal ? `<a target="_blank" rel="noopener" href="${escapeAttr(gcal)}" title="Add to Google Calendar">G</a>` : ''}
        <a href="${escapeAttr(s.url)}" target="_blank" rel="noopener" title="Open on ucbcomedy.com">↗</a>
      </td>
    </tr>
  `;
}

function renderSchedule() {
  const savedShows = state.shows.filter((s) => state.saved.has(s.id));
  if (!savedShows.length) {
    viewRoot.innerHTML = `<div class="empty-state"><h3>No shows saved yet.</h3><p>Click the <strong>+</strong> button on any row to start your schedule.</p></div>`;
    return;
  }
  savedShows.sort((a, b) => (a.datetime || '').localeCompare(b.datetime || ''));
  const conflicts = conflictsBetween(savedShows);
  const groups = groupByDay(savedShows);

  const html = [...groups.entries()].map(([day, items]) => `
    <section class="day-section">
      <div class="day-heading">
        <h2>${escapeHtml(day)}</h2>
        <span class="day-count">${items.length} saved</span>
      </div>
      ${renderShowTable(items, { showWeekday: false, conflicts })}
    </section>
  `).join('');
  viewRoot.innerHTML = html;
  attachRowHandlers();
}

function renderCalendar() {
  const shows = filteredShows();
  if (!shows.length) {
    viewRoot.innerHTML = `<div class="empty-state"><h3>No shows match your filters.</h3></div>`;
    return;
  }
  const groups = groupByDay(shows);
  const venueOrder = [
    'dcm26-ucb-mainstage',
    'dcm26-ucb-upstairs',
    'dcm26-theater-for-the-new-city-mainstage',
    'dcm26-theater-for-the-new-city-stage-2',
    'dcm26-theater-for-the-new-city-stage-3',
    'dcm26-theater-for-the-new-city-stage-4',
    'dcm26-theater-for-the-new-city',
  ];
  const venueLabels = {
    'dcm26-ucb-mainstage': 'UCB Mainstage',
    'dcm26-ucb-upstairs': 'UCB Upstairs',
    'dcm26-theater-for-the-new-city-mainstage': 'TFTNC Main',
    'dcm26-theater-for-the-new-city-stage-2': 'TFTNC 2',
    'dcm26-theater-for-the-new-city-stage-3': 'TFTNC 3',
    'dcm26-theater-for-the-new-city-stage-4': 'TFTNC 4',
    'dcm26-theater-for-the-new-city': 'TFTNC',
  };

  const dayOrder = ['Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const sortedDays = [...groups.keys()].sort((a, b) => {
    const da = groups.get(a)[0]?.weekday;
    const db = groups.get(b)[0]?.weekday;
    return dayOrder.indexOf(da) - dayOrder.indexOf(db);
  });

  const html = sortedDays.map((day) => {
    const items = groups.get(day);
    const venuesInDay = venueOrder.filter((v) => items.some((s) => s.venue === v));
    if (!venuesInDay.length) return '';
    // Build time slots (30-min increments). Determine range.
    const times = items.map((s) => s.datetime ? new Date(s.datetime) : null).filter(Boolean);
    if (!times.length) return '';
    const minHour = Math.min(...times.map((d) => d.getHours() + (d.getDate() < new Date(times[0]).getDate() ? -24 : 0)));
    const maxHour = Math.max(...times.map((d) => d.getHours() + d.getMinutes()/60)) + 1;
    const slots = [];
    for (let h = Math.floor(minHour); h <= Math.ceil(maxHour); h++) {
      slots.push({ hour: h, min: 0 });
      slots.push({ hour: h, min: 30 });
    }

    // Map items into slot/venue cells.
    const cells = new Map(); // key: `${slotIdx}-${venue}` -> array of shows
    for (const s of items) {
      if (!s.datetime || !s.venue) continue;
      const d = new Date(s.datetime);
      const slotIdx = slots.findIndex((sl) => sl.hour === d.getHours() && (d.getMinutes() < sl.min + 30) && d.getMinutes() >= sl.min);
      if (slotIdx < 0) continue;
      const key = `${slotIdx}-${s.venue}`;
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key).push(s);
    }

    const cols = venuesInDay.length;
    let grid = `<div class="cal-grid" style="--venue-cols:${cols}">`;
    grid += `<div class="cal-head">Time</div>`;
    for (const v of venuesInDay) grid += `<div class="cal-head">${escapeHtml(venueLabels[v] || v)}</div>`;
    for (let i = 0; i < slots.length; i++) {
      const sl = slots[i];
      grid += `<div class="cal-time">${pad(sl.hour % 24)}:${pad(sl.min)}</div>`;
      for (const v of venuesInDay) {
        const arr = cells.get(`${i}-${v}`) || [];
        grid += `<div class="cal-cell">`;
        for (const s of arr) {
          const cls = state.saved.has(s.id) ? 'saved' : ((s.categories || []).includes('dcm26-headliner') ? 'headliner' : '');
          grid += `<a class="cal-event ${cls}" href="${escapeAttr(s.url)}" target="_blank" rel="noopener" title="${escapeAttr(s.title)} — ${escapeAttr(s.timeLabel)}">${escapeHtml(s.title)}</a>`;
        }
        grid += `</div>`;
      }
    }
    grid += `</div>`;

    return `<div class="cal-day-heading"><h2>${escapeHtml(day)}</h2><span class="day-count">${items.length} shows</span></div>${grid}`;
  }).join('');

  viewRoot.innerHTML = html;
}

function renderPerformers() {
  if (!state.hasPerformerData) {
    viewRoot.innerHTML = `
      <div class="performer-empty">
        <h3>Performer index not yet available</h3>
        <p>The UCB calendar page lists shows but not cast members. To add performer filtering, generate a <code>data/performers.json</code> file mapping show IDs to cast names. See <code>scripts/extract.js</code> and the README for details.</p>
      </div>
    `;
    return;
  }
  const names = Object.keys(state.performers).sort((a, b) =>
    state.performers[b].length - state.performers[a].length || a.localeCompare(b));
  const html = `
    <div class="results-meta" style="margin-bottom:14px"><strong>${names.length}</strong> performers · click to filter</div>
    <div class="performer-grid">
      ${names.map((n) => `
        <button class="performer-card" data-performer="${escapeAttr(n)}">
          <span>${escapeHtml(n)}</span>
          <span class="perf-count">${state.performers[n].length}</span>
        </button>
      `).join('')}
    </div>
  `;
  viewRoot.innerHTML = html;
  viewRoot.querySelectorAll('.performer-card').forEach((b) => {
    b.addEventListener('click', () => {
      state.filters.performer = b.dataset.performer;
      switchView('browse');
      renderPerformerFilterSection();
    });
  });
}

function renderPerformerFilterSection() {
  const section = document.getElementById('performerFilterSection');
  const label = document.getElementById('activePerformer');
  if (state.filters.performer) {
    section.hidden = false;
    label.textContent = state.filters.performer;
  } else {
    section.hidden = true;
  }
}

function render() {
  renderPerformerFilterSection();
  switch (state.view) {
    case 'browse': renderBrowse(); break;
    case 'schedule': renderSchedule(); break;
    case 'calendar': renderCalendar(); break;
    case 'performers': renderPerformers(); break;
  }
  renderResultsMeta();
}

function renderResultsMeta() {
  const meta = document.getElementById('resultsMeta');
  if (state.view === 'schedule') {
    meta.innerHTML = `<strong>${state.saved.size}</strong> saved`;
    return;
  }
  if (state.view === 'performers') { meta.innerHTML = ''; return; }
  const count = filteredShows().length;
  const total = state.shows.length;
  meta.innerHTML = count === total
    ? `<strong>${total}</strong> shows`
    : `<strong>${count}</strong> of ${total} shows`;
}

// ----- Filter chips -----
function renderFilters() {
  // Days
  const days = ['Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const dayCounts = countBy(state.shows, 'weekday');
  document.getElementById('filterDays').innerHTML = days
    .filter((d) => dayCounts[d])
    .map((d) => chipHtml(d, d, dayCounts[d], state.filters.days.has(d)))
    .join('');

  // Venues
  const venues = uniqueBy(state.shows, 'venue').filter(Boolean);
  document.getElementById('filterVenues').innerHTML = venues
    .map((v) => {
      const name = state.shows.find((s) => s.venue === v)?.venueName || v;
      const count = state.shows.filter((s) => s.venue === v).length;
      return chipHtml(v, name, count, state.filters.venues.has(v));
    }).join('');

  // Categories
  const cats = ['dcm26-headliner', 'dcm26-marathon'];
  const catNames = { 'dcm26-headliner': 'Headliner', 'dcm26-marathon': 'Marathon' };
  document.getElementById('filterCategories').innerHTML = cats
    .map((c) => {
      const count = state.shows.filter((s) => (s.categories || []).includes(c)).length;
      if (!count) return '';
      return chipHtml(c, catNames[c], count, state.filters.categories.has(c));
    }).join('');

  document.querySelectorAll('#filterDays .chip').forEach((b) =>
    b.addEventListener('click', () => toggleSet(state.filters.days, b.dataset.value)));
  document.querySelectorAll('#filterVenues .chip').forEach((b) =>
    b.addEventListener('click', () => toggleSet(state.filters.venues, b.dataset.value)));
  document.querySelectorAll('#filterCategories .chip').forEach((b) =>
    b.addEventListener('click', () => toggleSet(state.filters.categories, b.dataset.value)));
}

function toggleSet(set, value) {
  if (set.has(value)) set.delete(value); else set.add(value);
  renderFilters();
  render();
}

function chipHtml(value, label, count, active) {
  return `<button class="chip ${active ? 'chip-active' : ''}" data-value="${escapeAttr(value)}">
    ${escapeHtml(label)} <span class="chip-count">${count}</span>
  </button>`;
}

function countBy(arr, key) {
  return arr.reduce((acc, x) => { const k = x[key]; if (k) acc[k] = (acc[k] || 0) + 1; return acc; }, {});
}
function uniqueBy(arr, key) {
  const seen = new Set();
  const out = [];
  for (const x of arr) if (x[key] && !seen.has(x[key])) { seen.add(x[key]); out.push(x[key]); }
  return out;
}

// ----- Row handlers -----
function attachRowHandlers() {
  document.querySelectorAll('[data-act="toggle-save"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const id = btn.dataset.id;
      if (state.saved.has(id)) state.saved.delete(id); else state.saved.add(id);
      persistSaved();
      render();
    });
  });
  document.querySelectorAll('.perf-link').forEach((a) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const name = a.dataset.perf;
      state.filters.performer = state.filters.performer === name ? null : name;
      renderPerformerFilterSection();
      render();
    });
  });
}
// Back-compat alias.
const attachCardHandlers = attachRowHandlers;

// ----- View switching -----
function switchView(name) {
  state.view = name;
  document.querySelectorAll('.tab').forEach((t) => {
    const active = t.dataset.view === name;
    t.classList.toggle('tab-active', active);
    t.setAttribute('aria-selected', String(active));
  });
  render();
}

function updateSavedCount() {
  const badge = document.getElementById('savedCount');
  badge.textContent = state.saved.size || '';
  badge.dataset.zero = state.saved.size === 0 ? '1' : '0';
}
function updateToolbarButtons() {
  const has = state.saved.size > 0;
  document.getElementById('exportIcsBtn').disabled = !has;
  document.getElementById('shareBtn').disabled = !has;
}

// ----- Utilities -----
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
function escapeAttr(s) { return escapeHtml(s); }

// ----- Init -----
async function init() {
  await loadData();
  renderFilters();
  attachStaticHandlers();
  // Check for share link.
  const shareIds = parseShareLink();
  if (shareIds && shareIds.length) {
    const validIds = shareIds.filter((id) => state.shows.some((s) => s.id === id));
    state.shareToImport = validIds;
    const banner = document.getElementById('shareBanner');
    banner.hidden = false;
    document.getElementById('shareBannerDetail').textContent =
      `${validIds.length} show${validIds.length === 1 ? '' : 's'} from a snapshot link.`;
  }
  updateSavedCount();
  updateToolbarButtons();
  render();
}

function attachStaticHandlers() {
  // Tabs
  document.querySelectorAll('.tab').forEach((t) =>
    t.addEventListener('click', () => switchView(t.dataset.view)));

  // Search
  const search = document.getElementById('searchInput');
  const clear = document.getElementById('clearSearch');
  search.addEventListener('input', () => {
    state.filters.search = search.value;
    clear.hidden = !search.value;
    render();
  });
  clear.addEventListener('click', () => {
    search.value = '';
    state.filters.search = '';
    clear.hidden = true;
    render();
  });

  // Reset filters
  document.getElementById('resetFilters').addEventListener('click', () => {
    state.filters.days.clear();
    state.filters.venues.clear();
    state.filters.categories.clear();
    state.filters.performer = null;
    state.filters.search = '';
    document.getElementById('searchInput').value = '';
    document.getElementById('clearSearch').hidden = true;
    renderFilters();
    render();
  });

  // Clear performer
  document.getElementById('clearPerformer').addEventListener('click', () => {
    state.filters.performer = null;
    renderPerformerFilterSection();
    render();
  });

  // Export ICS
  document.getElementById('exportIcsBtn').addEventListener('click', () => {
    const saved = state.shows.filter((s) => state.saved.has(s.id));
    downloadICS(saved);
  });

  // Share
  const modal = document.getElementById('shareModal');
  const openShare = () => {
    const ids = state.shows.filter((s) => state.saved.has(s.id)).map((s) => s.id);
    const url = buildShareLink(ids);
    document.getElementById('shareUrl').value = url;
    document.getElementById('shareCopiedNote').hidden = true;
    modal.hidden = false;
  };
  document.getElementById('shareBtn').addEventListener('click', openShare);
  modal.querySelectorAll('[data-close]').forEach((el) =>
    el.addEventListener('click', () => modal.hidden = true));
  document.getElementById('copyShareUrl').addEventListener('click', async () => {
    const input = document.getElementById('shareUrl');
    input.select();
    try { await navigator.clipboard.writeText(input.value); }
    catch { document.execCommand('copy'); }
    document.getElementById('shareCopiedNote').hidden = false;
  });

  // Share banner import
  document.getElementById('shareImportBtn').addEventListener('click', () => {
    if (!state.shareToImport) return;
    for (const id of state.shareToImport) state.saved.add(id);
    persistSaved();
    document.getElementById('shareBanner').hidden = true;
    state.shareToImport = null;
    switchView('schedule');
  });
  document.getElementById('shareDismissBtn').addEventListener('click', () => {
    document.getElementById('shareBanner').hidden = true;
    state.shareToImport = null;
  });
}

init().catch((err) => {
  console.error(err);
  viewRoot.innerHTML = `<div class="empty-state"><h3>Failed to load shows.</h3><p>${escapeHtml(err.message)}</p></div>`;
});
