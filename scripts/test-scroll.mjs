#!/usr/bin/env node
// Validate the match-navigator scroll behavior with Puppeteer.
// Usage: node scripts/test-scroll.mjs

import puppeteer from 'puppeteer';

const URL = process.env.URL || 'http://localhost:5173/';
const QUERIES = ['chloe', 'asssscat', 'improv'];
const STICKY_STACK_PX = 137; // 57 header + 40 toolbar + 40 day heading

async function pause(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function run() {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });

  page.on('console', (msg) => {
    const t = msg.text();
    if (msg.type() === 'error') console.log('  [page error]', t);
    if (t.startsWith('[scroll')) console.log('  [page]', t);
  });

  console.log(`Navigating to ${URL}`);
  await page.goto(URL, { waitUntil: 'networkidle0' });

  // Wait for shows to load: any chip should be present.
  await page.waitForSelector('[data-show-id]', { timeout: 10000 });

  const sample = await page.$$eval('[data-show-id]', (els) => els.length);
  console.log(`Loaded — ${sample} chips rendered.`);

  let allOk = true;

  for (const query of QUERIES) {
    console.log(`\n--- Query: "${query}" ---`);

    // Focus the search input.
    await page.click('aside input[type="search"]');
    // Clear it
    await page.evaluate(() => {
      const el = document.querySelector('aside input[type="search"]');
      if (el) {
        el.value = '';
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    await page.type('aside input[type="search"]', query, { delay: 20 });

    // Wait a tick for React to re-render and matchedList to populate.
    await pause(500);

    const stats = await page.evaluate(() => {
      const labelEl = document.body.innerText.match(/(\d+)\s+of\s+(\d+)\s+match/);
      return labelEl ? { current: Number(labelEl[1]), total: Number(labelEl[2]) } : null;
    });
    if (!stats) {
      console.log(`  no matches text found`);
      continue;
    }
    console.log(`  ${stats.current} of ${stats.total} matches`);

    if (stats.total === 0) continue;

    // Sample a few advances and verify scroll behavior.
    const checks = Math.min(stats.total, 4);
    for (let i = 0; i < checks; i++) {
      const before = await page.evaluate(() => ({
        scrollY: window.scrollY,
        innerHeight: window.innerHeight,
      }));

      // Click the next button.
      await page.evaluate(() => {
        const btn = [...document.querySelectorAll('button')].find(
          (b) => b.getAttribute('aria-label') === 'Next match',
        );
        if (btn) btn.click();
      });

      // Wait for smooth scroll to settle.
      await pause(900);

      const result = await page.evaluate((STICK) => {
        const ring = document.querySelector('.ring-accent');
        if (!ring) return { ok: false, reason: 'no ringed chip' };
        const rect = ring.getBoundingClientRect();
        const inView = rect.top >= 0 && rect.bottom <= window.innerHeight;
        const underSticky = rect.top < STICK;
        const offScreenH = rect.right < 0 || rect.left > window.innerWidth;
        const scroller = ring.closest('[data-grid-scroll]');
        const scrollerInfo = scroller
          ? {
              scrollLeft: scroller.scrollLeft,
              clientWidth: scroller.clientWidth,
              scrollWidth: scroller.scrollWidth,
              ringLeft: rect.left,
              ringWidth: rect.width,
            }
          : null;
        return {
          ok: inView && !underSticky && !offScreenH,
          inView,
          underSticky,
          offScreenH,
          rect: { top: rect.top, left: rect.left, right: rect.right, bottom: rect.bottom },
          scrollerInfo,
          scrollY: window.scrollY,
        };
      }, STICKY_STACK_PX);

      const delta = (result.scrollY ?? 0) - before.scrollY;
      const verdict = result.ok ? '✓' : '✗';
      console.log(
        `  [${i + 1}/${checks}] ${verdict} scrollY ${before.scrollY}→${result.scrollY} (Δ${delta})  ` +
          `rect.top=${Math.round(result.rect?.top ?? -999)}  ` +
          (result.underSticky ? 'UNDER STICKY ' : '') +
          (result.offScreenH ? 'OFF-SCREEN X ' : '') +
          (!result.inView ? 'NOT IN VIEW' : ''),
      );
      if (!result.ok) {
        allOk = false;
        console.log('     details:', JSON.stringify(result, null, 2).slice(0, 400));
      }
    }
  }

  await browser.close();
  console.log(allOk ? '\nALL OK' : '\nFAILURES PRESENT');
  process.exit(allOk ? 0 : 1);
}

run().catch((e) => {
  console.error(e);
  process.exit(2);
});
