'use strict';

const axios = require('axios');
const https = require('https');

// Kumpulan User-Agent realistis untuk dirotasi (mengurangi kemungkinan diblok).
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
];

const DEFAULT_UA = USER_AGENTS[0];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Ambil satu User-Agent acak dari pool. */
function randomUA() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/** Susun header request yang meyakinkan (mirip browser sungguhan). */
function buildHeaders(url, userAgent, extra = {}) {
  let origin;
  try {
    origin = new URL(url).origin;
  } catch (_) {
    origin = undefined;
  }
  return {
    'User-Agent': userAgent || randomUA(),
    Accept:
      'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9,id;q=0.8',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    ...(origin ? { Referer: origin + '/' } : {}),
    ...extra,
  };
}

// --- Rate limiting sederhana per-host: beri jeda minimal antar-request. ---
const lastHit = new Map();
async function throttle(url, minDelay) {
  if (!minDelay) return;
  let host;
  try {
    host = new URL(url).host;
  } catch (_) {
    return;
  }
  const prev = lastHit.get(host) || 0;
  const wait = prev + minDelay - Date.now();
  if (wait > 0) await sleep(wait);
  lastHit.set(host, Date.now());
}

/**
 * Ambil HTML lewat HTTP dengan retry + backoff dan opsi keamanan.
 * @param {string} url
 * @param {object} [opts]
 * @returns {Promise<{ html: string, finalUrl: string, status: number }>}
 */
async function fetchStatic(url, opts = {}) {
  const {
    timeout = 20000,
    userAgent,
    headers = {},
    retries = 2,
    retryDelay = 800,
    minDelay = 0,
    insecure = false,
  } = opts;

  const httpsAgent = insecure
    ? new https.Agent({ rejectUnauthorized: false })
    : undefined;

  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    await throttle(url, minDelay);
    try {
      const res = await axios.get(url, {
        timeout,
        maxRedirects: 5,
        responseType: 'text',
        httpsAgent,
        validateStatus: (s) => s >= 200 && s < 400,
        headers: buildHeaders(url, userAgent, headers),
      });
      return {
        html: typeof res.data === 'string' ? res.data : String(res.data),
        finalUrl: res.request?.res?.responseUrl || url,
        status: res.status,
      };
    } catch (err) {
      lastErr = err;
      const status = err.response?.status;
      // Jangan retry untuk error klien permanen (kecuali 429 Too Many Requests).
      if (status && status !== 429 && status < 500) break;
      if (attempt < retries) await sleep(retryDelay * (attempt + 1));
    }
  }
  throw lastErr;
}

/**
 * Render halaman memakai Puppeteer (situs JavaScript). Mendukung menunggu
 * selector tertentu, mengabaikan error sertifikat (insecure), dan menggabung
 * konten dari iframe berlapis agar extractor melihat semuanya.
 * @param {string} url
 * @param {object} [opts]
 */
async function fetchRendered(url, opts = {}) {
  const {
    timeout = 45000,
    userAgent,
    waitUntil = 'networkidle2',
    waitFor,
    insecure = false,
    includeFrames = true,
  } = opts;

  let puppeteer;
  try {
    puppeteer = require('puppeteer');
  } catch (_) {
    const e = new Error('Mode render (JavaScript) butuh Puppeteer. Jalankan: npm install puppeteer');
    e.code = 'PUPPETEER_NOT_INSTALLED';
    throw e;
  }

  const browser = await puppeteer.launch({
    headless: 'new',
    acceptInsecureCerts: insecure,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(userAgent || randomUA());
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9,id;q=0.8' });

    const response = await page.goto(url, { timeout, waitUntil });

    if (waitFor) {
      try {
        await page.waitForSelector(waitFor, { timeout: 10000 });
      } catch (_) {
        /* selector tidak muncul; lanjut dengan konten yang ada */
      }
    }

    let html = await page.content();

    // Gabungkan konten dari semua iframe (yang bisa diakses) di dalam halaman.
    if (includeFrames) {
      for (const frame of page.frames()) {
        if (frame === page.mainFrame()) continue;
        try {
          const frameHtml = await frame.content();
          if (frameHtml) html += `\n<!-- frame: ${frame.url()} -->\n${frameHtml}`;
        } catch (_) {
          /* cross-origin frame tidak bisa dibaca; abaikan */
        }
      }
    }

    return { html, finalUrl: page.url(), status: response ? response.status() : 200 };
  } finally {
    await browser.close();
  }
}

async function fetchPage(url, opts = {}) {
  return opts.render ? fetchRendered(url, opts) : fetchStatic(url, opts);
}

module.exports = {
  fetchPage,
  fetchStatic,
  fetchRendered,
  DEFAULT_UA,
  USER_AGENTS,
  randomUA,
};
