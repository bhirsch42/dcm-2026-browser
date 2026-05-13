// ==UserScript==
// @name         DCM26 Page Saver
// @namespace    https://github.com/local/dcm-2026-browser
// @version      1.1.0
// @description  Bulk-save every DCM26 show detail page from ucbcomedy.com into a single ZIP. Resumable across reloads (IndexedDB).
// @match        https://ucbcomedy.com/shows/dcm26-marathon-calendar/*
// @match        https://ucbcomedy.com/shows/dcm26-marathon-calendar
// @run-at       document-idle
// @require      https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  // ---------- config ----------
  const CONCURRENCY = 3;
  const DELAY_MS = 200;
  const MAX_RETRIES = 2;
  const RETRY_BACKOFF_MS = 1500;
  const HOST = 'https://ucbcomedy.com';
  const DB_NAME = 'dcm26-saver';
  const DB_VERSION = 1;
  const STORE_PAGES = 'pages';
  const STORE_FAILED = 'failed';
  const STORE_URLS = 'urls';

  // ---------- IndexedDB helpers ----------
  let dbPromise = null;
  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_PAGES)) db.createObjectStore(STORE_PAGES, { keyPath: 'slug' });
        if (!db.objectStoreNames.contains(STORE_FAILED)) db.createObjectStore(STORE_FAILED, { keyPath: 'slug' });
        if (!db.objectStoreNames.contains(STORE_URLS)) db.createObjectStore(STORE_URLS, { keyPath: 'slug' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }
  async function idbPut(storeName, value) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).put(value);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
  async function idbDelete(storeName, key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
  async function idbGet(storeName, key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function idbGetAllKeys(storeName) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).getAllKeys();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function idbGetAll(storeName) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function idbClear(storeName) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // ---------- state ----------
  const state = {
    urls: [],                 // [{ slug, url }] — work queue
    completedSlugs: new Set(), // slugs already saved to IDB (HTML lives in IDB, not memory)
    failedSlugs: new Set(),
    inFlight: 0,
    running: false,
    paused: false,
    cancelled: false,
    cursor: 0,
  };

  // ---------- url discovery ----------
  function discoverFromDOM() {
    const anchors = document.querySelectorAll('article.wpgb-card a[href*="/show/"]');
    const seen = new Set();
    const found = [];
    anchors.forEach((a) => {
      const m = a.href.match(/^https?:\/\/[^/]+\/show\/([^/?#]+)\/?/);
      if (!m) return;
      const slug = m[1];
      if (seen.has(slug)) return;
      seen.add(slug);
      found.push({ slug, url: `${HOST}/show/${slug}/` });
    });
    return found;
  }

  // Merge new URLs into queue + IDB. Returns # added.
  async function rescan() {
    const found = discoverFromDOM();
    const existing = new Set(state.urls.map((u) => u.slug));
    let added = 0;
    for (const item of found) {
      if (!existing.has(item.slug)) {
        state.urls.push(item);
        existing.add(item.slug);
        await idbPut(STORE_URLS, item);
        added++;
      }
    }
    ui.update();
    return { added, totalInDOM: found.length };
  }

  // ---------- fetch ----------
  async function fetchOne(item) {
    const res = await fetch(item.url, {
      credentials: 'include',
      redirect: 'follow',
      headers: { Accept: 'text/html,*/*' },
    });
    if (!res.ok) {
      const err = new Error(`HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    const html = await res.text();
    return { html, contentType: res.headers.get('content-type') || 'text/html' };
  }

  async function processUrl(item) {
    let attempt = 0;
    while (attempt <= MAX_RETRIES) {
      try {
        const { html, contentType } = await fetchOne(item);
        await idbPut(STORE_PAGES, {
          slug: item.slug,
          url: item.url,
          html,
          contentType,
          size: html.length,
          savedAt: new Date().toISOString(),
        });
        state.completedSlugs.add(item.slug);
        state.failedSlugs.delete(item.slug);
        await idbDelete(STORE_FAILED, item.slug);
        return;
      } catch (err) {
        attempt++;
        if (attempt > MAX_RETRIES) {
          const failedEntry = { slug: item.slug, url: item.url, error: String(err), attempts: attempt, savedAt: new Date().toISOString() };
          await idbPut(STORE_FAILED, failedEntry);
          state.failedSlugs.add(item.slug);
          return;
        }
        await sleep(RETRY_BACKOFF_MS * attempt);
      }
    }
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function worker() {
    while (state.running && !state.cancelled) {
      if (state.paused) { await sleep(200); continue; }
      const idx = state.cursor++;
      if (idx >= state.urls.length) return;
      const item = state.urls[idx];
      if (state.completedSlugs.has(item.slug)) { ui.update(); continue; }
      state.inFlight++;
      ui.update();
      try { await processUrl(item); }
      finally { state.inFlight--; ui.update(); }
      await sleep(DELAY_MS);
    }
  }

  async function startRun() {
    if (state.running) return;
    if (!state.urls.length) { ui.log('No URLs queued. Click Re-scan first.'); return; }
    state.cancelled = false;
    state.paused = false;
    state.running = true;
    state.cursor = 0;
    ui.update();
    const workers = [];
    for (let i = 0; i < CONCURRENCY; i++) workers.push(worker());
    await Promise.all(workers);
    state.running = false;
    ui.update();
    ui.log(`Done. ${state.completedSlugs.size}/${state.urls.length} saved · ${state.failedSlugs.size} failed.`);
  }

  function pauseRun() { state.paused = !state.paused; ui.update(); }
  function cancelRun() { state.cancelled = true; state.running = false; ui.update(); }

  async function resetAll() {
    if (!confirm('Reset all progress?\nThis erases the IndexedDB store with every saved page.')) return;
    await Promise.all([idbClear(STORE_PAGES), idbClear(STORE_FAILED), idbClear(STORE_URLS)]);
    state.urls = [];
    state.completedSlugs.clear();
    state.failedSlugs.clear();
    state.cursor = 0;
    state.running = false;
    state.paused = false;
    state.cancelled = false;
    ui.update();
    ui.log('Reset complete.');
  }

  // ---------- download ----------
  async function downloadZip() {
    if (state.completedSlugs.size === 0) { alert('Nothing to download yet.'); return; }
    ui.log(`Reading ${state.completedSlugs.size} pages from IndexedDB…`);
    const all = await idbGetAll(STORE_PAGES);
    const failed = await idbGetAll(STORE_FAILED);
    ui.log(`Building zip…`);
    const zip = new JSZip();
    for (const entry of all) zip.file(`${entry.slug}.html`, entry.html);
    zip.file('manifest.json', JSON.stringify({
      generatedAt: new Date().toISOString(),
      totalQueued: state.urls.length,
      completed: all.map((e) => ({ slug: e.slug, url: e.url, size: e.size, savedAt: e.savedAt })),
      failed,
    }, null, 2));
    const blob = await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    }, (meta) => {
      if (meta.percent && Math.round(meta.percent) % 10 === 0) {
        ui.setBuildPct(meta.percent);
      }
    });
    ui.setBuildPct(null);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dcm26-pages-${all.length}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    ui.log(`Downloaded ${a.download}`);
  }

  async function downloadFailedList() {
    const failed = await idbGetAll(STORE_FAILED);
    if (!failed.length) { alert('No failures.'); return; }
    const lines = failed.map((f) => `${f.slug}\t${f.url}\t${f.error}`);
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'dcm26-failed.txt';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function retryFailed() {
    const failed = await idbGetAll(STORE_FAILED);
    if (!failed.length) { alert('No failures.'); return; }
    // Drop failed entries from queue position bookkeeping and re-queue them.
    for (const f of failed) await idbDelete(STORE_FAILED, f.slug);
    state.failedSlugs.clear();
    // Move cursor back so workers retry these. Easiest: rebuild queue from IDB urls minus completed.
    const allUrls = await idbGetAll(STORE_URLS);
    state.urls = allUrls.filter((u) => !state.completedSlugs.has(u.slug));
    state.cursor = 0;
    ui.log(`Retrying ${state.urls.length} pages (failed + not-yet-fetched).`);
    await startRun();
  }

  // ---------- UI ----------
  const ui = (() => {
    const root = document.createElement('div');
    root.id = 'dcm26-saver-panel';
    root.innerHTML = `
      <style>
        #dcm26-saver-panel {
          position: fixed; bottom: 16px; right: 16px; z-index: 2147483647;
          width: 380px; background: #14141a; color: #f4f4f5;
          border: 1px solid #2a2a32; border-radius: 10px;
          font: 13px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          box-shadow: 0 12px 32px rgba(0,0,0,0.5);
          padding: 14px;
        }
        #dcm26-saver-panel h3 {
          margin: 0 0 8px; font-size: 13px; letter-spacing: 0.05em; text-transform: uppercase; color: #ff3344;
        }
        #dcm26-saver-panel .row { display: flex; gap: 6px; margin-top: 8px; flex-wrap: wrap; }
        #dcm26-saver-panel button {
          background: #1f1f25; color: #f4f4f5; border: 1px solid #2a2a32;
          border-radius: 5px; padding: 6px 10px; font-size: 12px; cursor: pointer;
          font-family: inherit;
        }
        #dcm26-saver-panel button:hover { border-color: #6f6f78; }
        #dcm26-saver-panel button.primary { background: #ff3344; border-color: #ff3344; color: #fff; }
        #dcm26-saver-panel button.primary:hover { background: #c81b29; border-color: #c81b29; }
        #dcm26-saver-panel button.accent { background: #ffd84d; border-color: #ffd84d; color: #1a1300; }
        #dcm26-saver-panel button:disabled { opacity: 0.4; cursor: not-allowed; }
        #dcm26-saver-panel .meter {
          height: 6px; background: #2a2a32; border-radius: 3px; overflow: hidden; margin-top: 8px;
        }
        #dcm26-saver-panel .meter > div {
          height: 100%; background: linear-gradient(90deg, #ffd84d, #ff3344); transition: width 0.2s;
        }
        #dcm26-saver-panel .stats { font-size: 11px; color: #a3a3ad; margin-top: 6px; font-family: ui-monospace, Menlo, monospace; }
        #dcm26-saver-panel .log {
          font-family: ui-monospace, Menlo, monospace; font-size: 11px;
          background: #0e0e10; border: 1px solid #2a2a32; padding: 6px;
          border-radius: 4px; max-height: 110px; overflow-y: auto; margin-top: 8px;
          color: #a3a3ad; white-space: pre-wrap; word-break: break-all;
        }
        #dcm26-saver-panel .hint { font-size: 11px; color: #6f6f78; margin-top: 6px; }
        #dcm26-saver-panel .min-toggle {
          position: absolute; top: 8px; right: 10px; background: transparent; border: none; color: #a3a3ad; cursor: pointer; font-size: 16px;
        }
        #dcm26-saver-panel.minimized { width: auto; padding: 8px 12px; }
        #dcm26-saver-panel.minimized > *:not(h3):not(.min-toggle) { display: none; }
        #dcm26-saver-panel.minimized h3 { margin: 0; }
      </style>
      <button class="min-toggle" title="Toggle">▾</button>
      <h3>DCM26 Page Saver</h3>
      <div class="stats" id="dcm-stats">loading…</div>
      <div class="meter"><div id="dcm-bar" style="width:0%"></div></div>
      <div class="row">
        <button id="dcm-rescan" class="accent">⟲ Re-scan DOM</button>
        <button id="dcm-start" class="primary">▶ Start</button>
        <button id="dcm-pause" disabled>⏸ Pause</button>
        <button id="dcm-cancel" disabled>■ Stop</button>
      </div>
      <div class="row">
        <button id="dcm-download">⬇ Download ZIP</button>
        <button id="dcm-retry">↻ Retry failed</button>
        <button id="dcm-fail-list">⬇ Failed list</button>
        <button id="dcm-reset">Reset</button>
      </div>
      <div class="log" id="dcm-log"></div>
      <div class="hint">Scroll the page to load more cards, then click <b>Re-scan DOM</b> to add them to the queue. Progress is saved to IndexedDB — closing the tab is safe.</div>
    `;
    document.body.appendChild(root);

    const $ = (id) => document.getElementById(id);

    $('dcm-rescan').onclick = async () => {
      const { added, totalInDOM } = await rescan();
      ui.log(`Re-scan: ${totalInDOM} cards in DOM, added ${added} new.`);
    };
    $('dcm-start').onclick = () => startRun();
    $('dcm-pause').onclick = () => pauseRun();
    $('dcm-cancel').onclick = () => cancelRun();
    $('dcm-download').onclick = () => downloadZip();
    $('dcm-retry').onclick = () => retryFailed();
    $('dcm-fail-list').onclick = () => downloadFailedList();
    $('dcm-reset').onclick = () => resetAll();

    root.querySelector('.min-toggle').onclick = () => root.classList.toggle('minimized');

    let buildPct = null;
    return {
      setBuildPct(p) { buildPct = p; this.update(); },
      update() {
        const total = state.urls.length || 1;
        const done = state.completedSlugs.size;
        const failed = state.failedSlugs.size;
        const pct = buildPct != null
          ? Math.round(buildPct)
          : Math.round((done / total) * 100);
        $('dcm-bar').style.width = `${Math.min(100, pct)}%`;
        const buildSuffix = buildPct != null ? ` · zip ${Math.round(buildPct)}%` : '';
        $('dcm-stats').textContent =
          `${done}/${state.urls.length} done · ${failed} failed · ${state.inFlight} in flight` +
          (state.paused ? ' · PAUSED' : state.running ? ' · running' : '') + buildSuffix;
        $('dcm-start').disabled = state.running || state.urls.length === 0;
        $('dcm-pause').disabled = !state.running;
        $('dcm-pause').textContent = state.paused ? '▶ Resume' : '⏸ Pause';
        $('dcm-cancel').disabled = !state.running;
        $('dcm-download').disabled = done === 0;
        $('dcm-retry').disabled = failed === 0 || state.running;
        $('dcm-fail-list').disabled = failed === 0;
      },
      log(msg) {
        const el = $('dcm-log');
        const time = new Date().toTimeString().slice(0, 8);
        el.textContent = `[${time}] ${msg}\n` + el.textContent;
        if (el.textContent.length > 4000) el.textContent = el.textContent.slice(0, 4000);
      },
    };
  })();

  // ---------- boot ----------
  async function boot() {
    try {
      const [completed, failed, queued] = await Promise.all([
        idbGetAllKeys(STORE_PAGES),
        idbGetAllKeys(STORE_FAILED),
        idbGetAll(STORE_URLS),
      ]);
      for (const s of completed) state.completedSlugs.add(s);
      for (const s of failed) state.failedSlugs.add(s);
      state.urls = queued;

      // Always merge in anything currently in the DOM.
      const { added, totalInDOM } = await rescan();
      ui.update();
      ui.log(`Restored: ${state.completedSlugs.size} saved, ${state.failedSlugs.size} failed, ${state.urls.length} in queue.`);
      if (added) ui.log(`Auto-scan added ${added} new URLs from current DOM.`);
      else if (state.urls.length === 0) ui.log(`Scroll the page to load cards, then click Re-scan DOM.`);
    } catch (err) {
      ui.log(`Boot error: ${err.message}`);
      console.error(err);
    }
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') boot();
  else window.addEventListener('DOMContentLoaded', boot);
})();
