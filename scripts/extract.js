#!/usr/bin/env node
// Parse the saved UCB DCM26 calendar HTML into structured shows.json.
// Run: node scripts/extract.js

const fs = require('fs');
const path = require('path');

const SRC = process.argv[2] || '/Users/bhirsch/Desktop/DCM26 Marathon Calendar - Upright Citizens Brigade.html';
const OUT = path.join(__dirname, '..', 'data', 'shows.json');

const html = fs.readFileSync(SRC, 'utf8');

// Each show lives in <article class="wpgb-card ..."> ... </article>.
// We scan classes for dcm26-* tags (category + venue), then pull date/title/url/image/excerpt out of the inner blocks.
const VENUE_NAMES = {
  'dcm26-ucb-mainstage': 'UCB Mainstage',
  'dcm26-ucb-upstairs': 'UCB Upstairs',
  'dcm26-theater-for-the-new-city': 'Theater For the New City',
  'dcm26-theater-for-the-new-city-mainstage': 'TFTNC - Mainstage',
  'dcm26-theater-for-the-new-city-stage-2': 'TFTNC - Stage 2',
  'dcm26-theater-for-the-new-city-stage-3': 'TFTNC - Stage 3',
  'dcm26-theater-for-the-new-city-stage-4': 'TFTNC - Stage 4',
};

const CATEGORY_NAMES = {
  'dcm26-headliner': 'Headliner',
  'dcm26-marathon': 'Marathon',
  'dcm26-classes': 'Classes',
  'dcm26-festival-3-day-festival-headliner-badge': '3-Day Festival + Headliner Badge',
  'dcm26-festival-single-day-pass': 'Single Day Pass',
  'dcm26-marathon-calendar': 'Marathon Calendar',
  'dcm26-calendar': 'Calendar',
};

function decodeEntities(s) {
  return s
    .replace(/&#8217;|&rsquo;/g, '’')
    .replace(/&#8216;|&lsquo;/g, '‘')
    .replace(/&#8220;|&ldquo;/g, '“')
    .replace(/&#8221;|&rdquo;/g, '”')
    .replace(/&#8211;|&ndash;/g, '–')
    .replace(/&#8212;|&mdash;/g, '—')
    .replace(/&#8230;|&hellip;/g, '…')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function stripTags(s) {
  return decodeEntities(s.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
}

// Parse "Wednesday, June 10, 2026 @ 7:00 PM" into ISO + parts.
function parseDateTime(raw) {
  const m = raw.match(/^(\w+),\s+(\w+)\s+(\d{1,2}),\s+(\d{4})\s+@\s+(\d{1,2}):(\d{2})\s+(AM|PM)$/i);
  if (!m) return null;
  const [, weekday, monthName, day, year, hourStr, minute, ampm] = m;
  const months = { January: 0, February: 1, March: 2, April: 3, May: 4, June: 5, July: 6, August: 7, September: 8, October: 9, November: 10, December: 11 };
  const month = months[monthName];
  let hour = parseInt(hourStr, 10) % 12;
  if (ampm.toUpperCase() === 'PM') hour += 12;
  // Times are local to NYC. We store an ISO-like string without timezone so the browser treats it as local for display.
  // Calendar export will tag it as America/New_York.
  const pad = (n) => String(n).padStart(2, '0');
  const local = `${year}-${pad(month + 1)}-${pad(parseInt(day, 10))}T${pad(hour)}:${minute}:00`;
  return {
    iso: local,
    weekday,
    dateLabel: `${weekday}, ${monthName} ${day}`,
    timeLabel: `${parseInt(hourStr, 10)}:${minute} ${ampm.toUpperCase()}`,
    year: parseInt(year, 10),
    month: month + 1,
    day: parseInt(day, 10),
    hour,
    minute: parseInt(minute, 10),
  };
}

// Split <article ...> ... </article> blocks. Articles don't nest, so a simple regex is safe.
const ARTICLE_RE = /<article\s+class="wpgb-card[^"]*"[^>]*>[\s\S]*?<\/article>/g;
const articles = html.match(ARTICLE_RE) || [];

console.error(`Found ${articles.length} <article> blocks`);

const shows = [];
for (const article of articles) {
  const classMatch = article.match(/<article\s+class="([^"]+)"/);
  if (!classMatch) continue;
  const classes = classMatch[1].split(/\s+/);

  // Find dcm26-* tags. Filter image-size suffixes.
  const dcmTags = classes.filter((c) => /^dcm26-/.test(c) && !/\d+x\d+$/.test(c));

  const venueSlug = dcmTags.find((t) => VENUE_NAMES[t]);
  const categorySlugs = dcmTags.filter((t) => CATEGORY_NAMES[t]);

  const postIdMatch = article.match(/wpgb-post-(\d+)/);
  const postId = postIdMatch ? postIdMatch[1] : null;

  const dateMatch = article.match(/<div class="wpgb-block event-post-date">\s*([^<]+?)\s*<\/div>/);
  const rawDate = dateMatch ? decodeEntities(dateMatch[1]).trim() : null;
  const datetime = rawDate ? parseDateTime(rawDate) : null;

  const titleMatch = article.match(/<h3 class="wpgb-block ucb-event-post-title">\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
  const url = titleMatch ? titleMatch[1] : null;
  const title = titleMatch ? stripTags(titleMatch[2]) : null;

  const slugMatch = url ? url.match(/\/show\/([^/]+)\/?$/) : null;
  const slug = slugMatch ? slugMatch[1] : null;

  const excerptMatch = article.match(/<div class="wpgb-block ucb-event-post-excerpt">[\s\S]*?<p>\s*([\s\S]*?)\s*<\/p>/);
  const excerpt = excerptMatch ? stripTags(excerptMatch[1]) : null;

  // First img inside the card. Try (in order): data-src (lazy-loaded), srcset first URL, src (only if https), then noscript fallback.
  const thumbBlockMatch = article.match(/<div class="wpgb-card-media-thumbnail">([\s\S]*?)<\/a>/);
  let image = null;
  if (thumbBlockMatch) {
    const block = thumbBlockMatch[1];
    let m;
    if ((m = block.match(/\sdata-src="([^"]+)"/))) image = m[1];
    else if ((m = block.match(/\ssrcset="(https?:\/\/[^ "]+)/))) image = m[1];
    else if ((m = block.match(/\ssrc="(https?:\/\/[^"]+)"/))) image = m[1];
  }

  if (!title || !url) continue;

  shows.push({
    id: postId,
    slug,
    title,
    url,
    image,
    datetime: datetime ? datetime.iso : null,
    weekday: datetime ? datetime.weekday : null,
    dateLabel: datetime ? datetime.dateLabel : null,
    timeLabel: datetime ? datetime.timeLabel : null,
    venue: venueSlug || null,
    venueName: venueSlug ? VENUE_NAMES[venueSlug] : null,
    categories: categorySlugs,
    categoryNames: categorySlugs.map((c) => CATEGORY_NAMES[c]),
    excerpt,
    performers: [],
  });
}

// Sort chronologically.
shows.sort((a, b) => {
  if (!a.datetime) return 1;
  if (!b.datetime) return -1;
  return a.datetime.localeCompare(b.datetime);
});

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(shows, null, 2));

// Summary.
const byVenue = {};
const byCategory = {};
const byDate = {};
for (const s of shows) {
  byVenue[s.venueName || 'Unknown'] = (byVenue[s.venueName || 'Unknown'] || 0) + 1;
  for (const c of s.categoryNames) byCategory[c] = (byCategory[c] || 0) + 1;
  if (s.dateLabel) byDate[s.dateLabel] = (byDate[s.dateLabel] || 0) + 1;
}
console.error(`Wrote ${shows.length} shows to ${OUT}`);
console.error('By venue:', byVenue);
console.error('By category:', byCategory);
console.error('By date:', byDate);
