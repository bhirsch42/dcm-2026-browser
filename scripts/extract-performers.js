#!/usr/bin/env node
// Read data/raw-pages/*.html (from the userscript zip) and emit data/performers.json
// keyed by both show slug and id.
//
// Strategy:
//   - Look for the "Cast:" line: <p><strong>Cast: <span ...>NAMES</span></strong>
//     Some shows omit the span; some have variants with extra markup.
//   - Fallback for headliner shows: pull marquee performer(s) out of the title
//     (e.g. "Patti Harrison: UCB DCM26 Headliner" -> "Patti Harrison").

const fs = require('fs');
const path = require('path');

const RAW_DIR = path.join(__dirname, '..', 'data', 'raw-pages');
const OUT = path.join(__dirname, '..', 'data', 'performers.json');
const SHOWS = require(path.join(__dirname, '..', 'data', 'shows.json'));

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

function splitNames(raw) {
  if (!raw) return [];
  // Performers are normally comma-separated. Some shows use " and " for the last one or " & ".
  return raw
    .split(/,| & | and (?=[A-Z])/g)
    .map((n) => n.trim())
    .map((n) => n.replace(/\s+/g, ' '))
    .filter(Boolean)
    // Skip residue (page footers occasionally bleed in).
    .filter((n) => n.length >= 2 && n.length <= 60 && !/[.:;]/.test(n) && !/\d/.test(n))
    // Drop suspiciously long entries that probably swallowed the rest of a sentence.
    .filter((n) => n.split(/\s+/).length <= 6);
}

// A few headliner shows omit the Cast line but name the cast inside the description as
// "<Character> (<Real Name>)". Pull those out — but ONLY from the show description block,
// not the surrounding site chrome (the nav menu has things like "(Wild Card Team)").
function extractCharacterParens(html) {
  // The show body has nested divs, so we can't use non-greedy </div> match.
  // Slice from the start of ucb-event-description to the start of the tickets section that follows.
  const startStr = '<div class="ucb-event-description">';
  const start = html.indexOf(startStr);
  if (start < 0) return [];
  let end = html.indexOf('<div class="tickera', start);
  if (end < 0) end = html.indexOf('</article>', start);
  if (end < 0) end = html.length;
  // Strip HTML tags so parens that wrap <strong>Name</strong> still match cleanly.
  const body = html.slice(start, end).replace(/<[^>]+>/g, ' ');
  const re = /\(\s*([A-Z][a-zA-Z'’\-]+(?:\s+[A-Z][a-zA-Z'’\-]+){1,2})\s*\)/g;
  const seen = new Set();
  const names = [];
  let m;
  while ((m = re.exec(body))) {
    const name = m[1].trim();
    if (name.length > 40) continue;
    if (seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    names.push(name);
  }
  return names;
}

// Hardcoded overrides for shows whose pages list no cast but whose performers are public.
// Only add entries that are unambiguously documented in the show title.
const SLUG_OVERRIDES = {
  'tim-eric-ucb-dcm26-headliner': ['Tim Heidecker', 'Eric Wareheim'],
};

// Try several variants of the Cast pattern.
function extractCast(html) {
  // Variant 1: <p><strong>Cast: <span ...>NAMES</span></strong>
  let m = html.match(/<p[^>]*>\s*<strong>\s*Cast\s*:\s*(?:<span[^>]*>)?\s*([\s\S]*?)\s*(?:<\/span>)?\s*<\/strong>/i);
  if (m) return splitNames(stripTags(m[1]));

  // Variant 2: just "Cast: NAMES" inside a paragraph without <strong>
  m = html.match(/<p[^>]*>\s*Cast\s*:\s*([\s\S]*?)<\/p>/i);
  if (m) return splitNames(stripTags(m[1]));

  // Variant 3: "Featuring:" or "Starring:"
  m = html.match(/(?:Featuring|Starring)\s*:\s*([\s\S]{1,400}?)(?:<\/(?:p|strong|div)>|\.)/i);
  if (m) return splitNames(stripTags(m[1]));

  return [];
}

// Extract a marquee performer from a headliner show title.
// Common patterns:
//   "Patti Harrison: UCB DCM26 Headliner"
//   "Solving Your Problems with Chloe Troast: UCB DCM26 Headliner"
//   "Adam Conover and Friends: UCB DCM26 Headliner"
//   "Bigger with Brennan Lee Mulligan and Izzy Roland: UCB DCM26 Headliner"
//   "Edi Patterson’s PLAYGIRL: UCB DCM26 Headliner"
//   "Dinosaur w/ Paul Scheer: UCB DCM26 Headliner"
function extractFromHeadlinerTitle(title) {
  const base = title.replace(/:\s*UCB\s*DCM26\s*Headliner.*$/i, '').trim();
  // "<show> with <Name(s)>" or "<show> w/ <Name(s)>"
  let m = base.match(/(?:\bwith\b|\bw\/)\s+(.+)$/i);
  if (m) {
    return splitNames(m[1].replace(/\s+and Friends\s*$/i, ''));
  }
  // "<Name>’s <Show>" -> Name
  m = base.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)[’']s\s+/);
  if (m) return [m[1]];
  // "<Name> and Friends" -> Name
  m = base.match(/^(.+?)\s+and Friends\s*$/i);
  if (m) return splitNames(m[1]);
  // Otherwise treat the whole title as one performer if it parses cleanly (2-4 capitalized words).
  if (/^([A-Z][a-zA-Z’'\-]+\s+){1,3}[A-Z][a-zA-Z’'\-]+$/.test(base)) return [base];
  return [];
}

// ----- run -----
const showsBySlug = new Map();
for (const s of SHOWS) if (s.slug) showsBySlug.set(s.slug, s);

const files = fs.readdirSync(RAW_DIR).filter((f) => f.endsWith('.html'));
const out = {}; // keyed by slug AND id (both populated for app.js convenience)
const stats = { total: 0, withCast: 0, withTitleFallback: 0, empty: 0, missing: [] };
const allPerformers = {};

for (const file of files) {
  stats.total++;
  const slug = file.replace(/\.html$/, '');
  const show = showsBySlug.get(slug);
  const html = fs.readFileSync(path.join(RAW_DIR, file), 'utf8');
  let names = extractCast(html);
  let source = 'cast';
  if (!names.length && show) {
    const titleNames = extractFromHeadlinerTitle(show.title);
    if (titleNames.length) {
      names = titleNames;
      source = 'title';
      stats.withTitleFallback++;
    }
  }
  if (!names.length) {
    // Try "<Character> (<Real Name>)" pattern in description.
    const parenNames = extractCharacterParens(html);
    if (parenNames.length) {
      names = parenNames;
      source = 'parens';
      stats.viaParens = (stats.viaParens || 0) + 1;
    }
  }
  if (!names.length && SLUG_OVERRIDES[slug]) {
    names = SLUG_OVERRIDES[slug];
    source = 'override';
    stats.viaOverride = (stats.viaOverride || 0) + 1;
  }
  if (!names.length) {
    stats.empty++;
    stats.missing.push(slug);
    continue;
  }
  if (source === 'cast') stats.withCast++;
  // Trim and de-dup case-insensitively keeping the first casing.
  const seen = new Set();
  const uniq = [];
  for (const n of names) {
    const k = n.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    uniq.push(n);
  }
  out[slug] = uniq;
  if (show && show.id) out[show.id] = uniq;
  for (const n of uniq) allPerformers[n] = (allPerformers[n] || 0) + 1;
}

fs.writeFileSync(OUT, JSON.stringify(out, null, 2));

console.error(`Parsed ${stats.total} pages`);
console.error(`  with Cast: line       ${stats.withCast}`);
console.error(`  via title fallback    ${stats.withTitleFallback}`);
console.error(`  via "(Name)" in body  ${stats.viaParens || 0}`);
console.error(`  via slug override     ${stats.viaOverride || 0}`);
console.error(`  no performers found   ${stats.empty}`);
console.error(`Unique performers: ${Object.keys(allPerformers).length}`);
console.error(`Top 10 by appearance count:`);
const top = Object.entries(allPerformers).sort((a, b) => b[1] - a[1]).slice(0, 10);
for (const [n, c] of top) console.error(`  ${c}\t${n}`);
console.error(`\nFirst 10 shows with no performer data:`);
for (const s of stats.missing.slice(0, 10)) console.error(`  ${s}`);
console.error(`\nWrote ${OUT}`);
