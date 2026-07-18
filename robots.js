'use strict';

const axios = require('axios');
const { DEFAULT_UA } = require('./fetcher');

// Cache sederhana per-origin supaya tidak mengunduh robots.txt berulang kali.
const cache = new Map();
const CACHE_TTL = 60 * 60 * 1000; // 1 jam

/**
 * Ambil & parse aturan Disallow dari robots.txt untuk user-agent '*'.
 * @param {string} origin - contoh: https://example.com
 * @returns {Promise<{ disallow: string[], allow: string[] }>}
 */
async function loadRules(origin) {
  const cached = cache.get(origin);
  if (cached && Date.now() - cached.time < CACHE_TTL) return cached.rules;

  const rules = { disallow: [], allow: [] };
  try {
    const res = await axios.get(`${origin}/robots.txt`, {
      timeout: 8000,
      responseType: 'text',
      headers: { 'User-Agent': DEFAULT_UA },
      validateStatus: (s) => s >= 200 && s < 400,
    });

    const lines = String(res.data).split(/\r?\n/);
    let appliesToAll = false;
    for (const raw of lines) {
      const line = raw.replace(/#.*$/, '').trim();
      if (!line) continue;
      const idx = line.indexOf(':');
      if (idx === -1) continue;
      const field = line.slice(0, idx).trim().toLowerCase();
      const value = line.slice(idx + 1).trim();

      if (field === 'user-agent') {
        appliesToAll = value === '*';
      } else if (appliesToAll && field === 'disallow' && value) {
        rules.disallow.push(value);
      } else if (appliesToAll && field === 'allow' && value) {
        rules.allow.push(value);
      }
    }
  } catch (_) {
    // Tidak ada robots.txt atau gagal diambil => anggap boleh.
  }

  cache.set(origin, { time: Date.now(), rules });
  return rules;
}

/**
 * Cek apakah sebuah URL boleh di-scrape menurut robots.txt.
 * @param {string} url
 * @returns {Promise<{ allowed: boolean, reason: string }>}
 */
async function isAllowed(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch (_) {
    return { allowed: false, reason: 'URL tidak valid' };
  }

  const rules = await loadRules(parsed.origin);
  const path = parsed.pathname + parsed.search;

  // Rule yang lebih panjang/spesifik menang (mendekati spesifikasi robots).
  let match = { type: null, len: -1 };
  for (const rule of rules.allow) {
    if (path.startsWith(rule) && rule.length > match.len) {
      match = { type: 'allow', len: rule.length };
    }
  }
  for (const rule of rules.disallow) {
    if (path.startsWith(rule) && rule.length > match.len) {
      match = { type: 'disallow', len: rule.length };
    }
  }

  if (match.type === 'disallow') {
    return { allowed: false, reason: 'Diblokir oleh robots.txt situs target' };
  }
  return { allowed: true, reason: 'Diizinkan' };
}

module.exports = { isAllowed, loadRules };
