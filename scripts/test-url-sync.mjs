#!/usr/bin/env node
// Verify filter <-> URL search-param sync.

import puppeteer from 'puppeteer';

const URL = process.env.URL || 'http://localhost:5173/';

async function pause(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const browser = await puppeteer.launch({ headless: 'new' });
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 900 });

// 1) Typing search should push ?q= into URL.
console.log('1) Search → URL push');
await page.goto(URL, { waitUntil: 'networkidle0' });
await page.waitForSelector('[data-show-id]');
await page.click('aside input[type="search"]');
await page.type('aside input[type="search"]', 'chloe', { delay: 20 });
await pause(500);
let url = page.url();
console.log('   URL:', url);
const ok1 = url.includes('q=chloe');
console.log('   ', ok1 ? '✓ q=chloe in URL' : '✗ q missing');

// 2) Reload should rehydrate from URL.
console.log('2) Reload → search hydrate');
await page.reload({ waitUntil: 'networkidle0' });
await page.waitForSelector('[data-show-id]');
await pause(600);
const input = await page.$eval('aside input[type="search"]', (el) => el.value);
console.log('   search input value:', JSON.stringify(input));
const ok2 = input === 'chloe';
console.log('   ', ok2 ? '✓ hydrated' : '✗ did NOT hydrate');

// 3) Click venue chip → URL gets it → reload → chip still active.
console.log('3) Venue chip → URL → reload round-trip');
await page.goto(URL, { waitUntil: 'networkidle0' });
await page.waitForSelector('[data-show-id]');
await pause(300);
await page.evaluate(() => {
  const chips = [...document.querySelectorAll('aside button')];
  const c = chips.find((b) => b.textContent.trim() === 'UCB Mainstage');
  if (c) c.click();
});
await pause(400);
const urlAfterClick = page.url();
console.log('   URL after click:', urlAfterClick);
const ok3a = urlAfterClick.includes('venue=');
console.log('   ', ok3a ? '✓ venue in URL' : '✗ venue missing');

await page.reload({ waitUntil: 'networkidle0' });
await page.waitForSelector('[data-show-id]');
await pause(600);
const chipState = await page.evaluate(() => {
  const chips = [...document.querySelectorAll('aside button')];
  const c = chips.find((b) => b.textContent.trim() === 'UCB Mainstage');
  return c ? c.className : null;
});
console.log('   chip className after reload:', chipState?.slice(0, 90));
const ok3b = chipState && chipState.includes('border-accent');
console.log('   ', ok3b ? '✓ chip active after reload' : '✗ chip not re-hydrated');
const ok3 = ok3a && ok3b;

await browser.close();

const allOk = ok1 && ok2 && ok3;
console.log(allOk ? '\nALL OK' : '\nFAILURES');
process.exit(allOk ? 0 : 1);
