'use strict';

const path = require('path');
const express = require('express');
const cors = require('cors');
const { scrape, crawl } = require('./scraper');
const watcher = require('./watcher');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

/** Ubah query string 'true'/'1'/'yes' menjadi boolean. */
function toBool(value, fallback = false) {
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'zscrap', time: new Date().toISOString() });
});

/**
 * GET /api/scrape?url=...&render=false&robots=true
 * Endpoint utama: scrape sebuah URL dan kembalikan JSON terstruktur.
 */
app.get('/api/scrape', async (req, res) => {
  const { url } = req.query;
  if (!url) {
    return res
      .status(400)
      .json({ success: false, error: 'Parameter "url" wajib diisi. Contoh: /api/scrape?url=https://contoh.com' });
  }

  try {
    const data = await scrape(url, {
      render: toBool(req.query.render, false),
      respectRobots: toBool(req.query.robots, true),
      insecure: toBool(req.query.insecure, false),
      useCache: toBool(req.query.cache, true),
      includeLinks: toBool(req.query.links, false),
      waitFor: req.query.waitFor || undefined,
      retries: req.query.retries ? parseInt(req.query.retries, 10) : undefined,
      minDelay: req.query.minDelay ? parseInt(req.query.minDelay, 10) : undefined,
    });
    res.json(data);
  } catch (err) {
    res.status(err.statusCode || 500).json({ success: false, url, error: err.message });
  }
});

/**
 * GET /api/crawl?url=...&maxPages=5
 * Crawl beberapa halaman mengikuti link paginasi "next".
 */
app.get('/api/crawl', async (req, res) => {
  const { url } = req.query;
  if (!url) {
    return res.status(400).json({ success: false, error: 'Parameter "url" wajib diisi.' });
  }
  try {
    const data = await crawl(url, {
      maxPages: req.query.maxPages ? parseInt(req.query.maxPages, 10) : 5,
      render: toBool(req.query.render, false),
      respectRobots: toBool(req.query.robots, true),
      insecure: toBool(req.query.insecure, false),
    });
    res.json(data);
  } catch (err) {
    res.status(err.statusCode || 500).json({ success: false, url, error: err.message });
  }
});

/**
 * POST /api/scrape
 * Body JSON: { "url": "...", "render": false, "respectRobots": true }
 * Berguna untuk scrape banyak URL sekaligus jika "urls" berupa array.
 */
app.post('/api/scrape', async (req, res) => {
  const {
    url,
    urls,
    render = false,
    respectRobots = true,
    insecure = false,
    useCache = true,
    includeLinks = false,
    waitFor,
  } = req.body || {};
  const opts = { render, respectRobots, insecure, useCache, includeLinks, waitFor };

  // Mode batch
  if (Array.isArray(urls) && urls.length) {
    const results = await Promise.all(
      urls.map(async (u) => {
        try {
          return await scrape(u, opts);
        } catch (err) {
          return { success: false, url: u, error: err.message };
        }
      })
    );
    return res.json({ success: true, count: results.length, results });
  }

  // Mode tunggal
  if (!url) {
    return res.status(400).json({ success: false, error: 'Field "url" atau "urls" wajib diisi.' });
  }
  try {
    const data = await scrape(url, opts);
    res.json(data);
  } catch (err) {
    res.status(err.statusCode || 500).json({ success: false, url, error: err.message });
  }
});

/**
 * WATCHER — pemantau otomatis (update berkala, hemat & anti-numpuk).
 *   GET    /api/watch            daftar semua pantauan (ringkas)
 *   GET    /api/watch?url=...    snapshot terbaru sebuah pantauan (lengkap)
 *   POST   /api/watch            { url, intervalMinutes, render, insecure } tambah
 *   DELETE /api/watch?url=...    hapus pantauan
 */
app.get('/api/watch', (req, res) => {
  const { url } = req.query;
  if (url) {
    const data = watcher.getWatchData(url);
    if (!data) return res.status(404).json({ success: false, error: 'Pantauan tidak ditemukan.' });
    return res.json({ success: true, ...data });
  }
  res.json({ success: true, count: watcher.listWatches().length, watches: watcher.listWatches() });
});

app.post('/api/watch', (req, res) => {
  const { url, intervalMinutes, render, insecure, respectRobots } = req.body || {};
  if (!url) return res.status(400).json({ success: false, error: 'Field "url" wajib diisi.' });
  try {
    const w = watcher.addWatch(url, { intervalMinutes, render, insecure, respectRobots });
    res.json({ success: true, watch: w });
  } catch (err) {
    res.status(err.statusCode || 500).json({ success: false, error: err.message });
  }
});

app.delete('/api/watch', (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ success: false, error: 'Parameter "url" wajib diisi.' });
  const ok = watcher.removeWatch(url);
  res.json({ success: ok, removed: ok });
});

// Fallback 404 untuk rute API yang tidak dikenal
app.use('/api', (req, res) => {
  res.status(404).json({ success: false, error: 'Endpoint tidak ditemukan.' });
});

app.listen(PORT, () => {
  watcher.start();
  console.log(`\n  zscrap API berjalan di http://localhost:${PORT}`);
  console.log(`  Coba: http://localhost:${PORT}/api/scrape?url=https://example.com`);
  console.log(`  UI tester: http://localhost:${PORT}/\n`);
});

module.exports = app;
