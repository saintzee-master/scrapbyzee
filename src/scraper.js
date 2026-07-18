'use strict';

const cheerio = require('cheerio');
const { fetchPage } = require('./fetcher');
const { isAllowed } = require('./robots');
const { TTLCache } = require('./cache');
const { extractPhotos } = require('./extractors/photos');
const { extractVideos } = require('./extractors/videos');
const { extractCategories } = require('./extractors/categories');
const { extractMetadata } = require('./extractors/metadata');
const { extractStructured } = require('./extractors/structured');
const { absoluteUrl, unique } = require('./extractors/utils');

// Cache hasil scrape (default 5 menit).
const cache = new TTLCache(5 * 60 * 1000, 500);

/** Ekstrak semua link <a href> menjadi URL absolut. */
function extractLinks($, baseUrl) {
  const links = [];
  $('a[href]').each((_, el) => {
    const url = absoluteUrl($(el).attr('href'), baseUrl);
    if (url && /^https?:/.test(url)) {
      links.push({ url, text: $(el).text().trim() || null });
    }
  });
  return unique(links, (l) => l.url);
}

/** Validasi URL & pastikan protokolnya http/https. */
function validateUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch (_) {
    const err = new Error('URL tidak valid. Sertakan skema, contoh: https://contoh.com');
    err.statusCode = 400;
    throw err;
  }
  if (!/^https?:$/.test(parsed.protocol)) {
    const err = new Error('Hanya protokol http/https yang didukung.');
    err.statusCode = 400;
    throw err;
  }
  return parsed;
}

/**
 * Scrape sebuah URL dan kembalikan data terstruktur.
 * @param {string} url
 * @param {object} [options]
 * @param {boolean} [options.render=false]       Render pakai headless browser.
 * @param {boolean} [options.respectRobots=true] Hormati robots.txt.
 * @param {boolean} [options.insecure=false]     Abaikan error sertifikat SSL.
 * @param {boolean} [options.useCache=true]      Pakai cache hasil.
 * @param {boolean} [options.includeLinks=false] Sertakan daftar link.
 * @param {string}  [options.waitFor]            Selector yang ditunggu (mode render).
 * @param {number}  [options.retries]            Jumlah retry.
 * @param {number}  [options.minDelay]           Jeda minimal antar-request per-host (ms).
 * @returns {Promise<object>}
 */
async function scrape(url, options = {}) {
  const {
    render = false,
    respectRobots = true,
    insecure = false,
    useCache = true,
    includeLinks = false,
    waitFor,
    retries,
    minDelay,
  } = options;

  validateUrl(url);

  const cacheKey = JSON.stringify({ url, render, includeLinks });
  if (useCache) {
    const hit = cache.get(cacheKey);
    if (hit) return { ...hit, cached: true };
  }

  if (respectRobots) {
    const verdict = await isAllowed(url);
    if (!verdict.allowed) {
      const err = new Error(verdict.reason);
      err.statusCode = 403;
      throw err;
    }
  }

  const startedAt = Date.now();
  let page;
  try {
    page = await fetchPage(url, { render, insecure, waitFor, retries, minDelay });
  } catch (err) {
    if (err.code === 'PUPPETEER_NOT_INSTALLED') {
      err.statusCode = 501;
      throw err;
    }
    const e = new Error(`Gagal mengambil halaman: ${err.message}`);
    e.statusCode = 502;
    throw e;
  }

  const $ = cheerio.load(page.html);
  const baseUrl = page.finalUrl || url;

  const photos = extractPhotos($, baseUrl);
  const videos = extractVideos($, baseUrl);
  const { categories, breadcrumb, keywords } = extractCategories($);
  const metadata = extractMetadata($, baseUrl);
  const structured = extractStructured($);
  const links = includeLinks ? extractLinks($, baseUrl) : undefined;

  const result = {
    success: true,
    url,
    finalUrl: baseUrl,
    status: page.status,
    rendered: render,
    cached: false,
    fetchedAt: new Date().toISOString(),
    elapsedMs: Date.now() - startedAt,
    metadata,
    categories,
    breadcrumb,
    keywords,
    photos,
    photoUrls: photos.map((p) => p.url),
    videos,
    videoUrls: videos.map((v) => v.url),
    structured,
    ...(links ? { links } : {}),
    counts: {
      photos: photos.length,
      videos: videos.length,
      categories: categories.length,
      structured: structured.count,
      ...(links ? { links: links.length } : {}),
    },
  };

  if (useCache) cache.set(cacheKey, result);
  return result;
}

/**
 * Crawl beberapa halaman mengikuti link "next"/paginasi.
 * @param {string} startUrl
 * @param {object} [options]
 * @param {number} [options.maxPages=5]  Batas jumlah halaman.
 * @param {string} [options.nextSelector] Selector link halaman berikutnya.
 * @returns {Promise<{ success: boolean, pages: object[], count: number }>}
 */
async function crawl(startUrl, options = {}) {
  const { maxPages = 5, nextSelector, ...scrapeOpts } = options;
  const limit = Math.min(Math.max(parseInt(maxPages, 10) || 5, 1), 20);

  const pages = [];
  const visited = new Set();
  let current = startUrl;

  for (let i = 0; i < limit && current && !visited.has(current); i++) {
    visited.add(current);
    // Butuh link untuk mencari "next".
    const data = await scrape(current, { ...scrapeOpts, includeLinks: true });
    pages.push(data);

    // Cari URL halaman berikutnya.
    let next = null;
    if (nextSelector) {
      // Ambil ulang HTML ringan untuk mengevaluasi selector custom.
      const links = data.links || [];
      next =
        links.find((l) => /next|berikut|»|›/i.test(l.text || ''))?.url || null;
    } else {
      next =
        (data.links || []).find((l) => /next|berikut|»|›|selanjutnya/i.test(l.text || ''))
          ?.url || null;
    }
    current = next && !visited.has(next) ? next : null;
  }

  return { success: true, count: pages.length, pages };
}

module.exports = { scrape, crawl, extractLinks, clearCache: () => cache.clear() };
