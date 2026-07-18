'use strict';

/**
 * Ubah URL relatif jadi absolut berdasarkan base URL halaman.
 * @param {string} src
 * @param {string} baseUrl
 * @returns {string|null}
 */
function absoluteUrl(src, baseUrl) {
  if (!src) return null;
  const value = String(src).trim();
  if (!value || value.startsWith('data:') || value.startsWith('javascript:')) {
    return null;
  }
  try {
    return new URL(value, baseUrl).href;
  } catch (_) {
    return null;
  }
}

/**
 * Buang duplikat dari array (berdasarkan nilai primitif atau key tertentu).
 * @param {Array} arr
 * @param {(item:any)=>string} [keyFn]
 */
function unique(arr, keyFn) {
  const seen = new Set();
  const out = [];
  for (const item of arr) {
    const key = keyFn ? keyFn(item) : item;
    if (key == null || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

/**
 * Ambil kandidat URL gambar terbesar dari atribut srcset.
 * @param {string} srcset
 * @returns {string|null}
 */
function pickFromSrcset(srcset) {
  if (!srcset) return null;
  const candidates = srcset
    .split(',')
    .map((part) => {
      const [url, size] = part.trim().split(/\s+/);
      const w = size && size.endsWith('w') ? parseInt(size, 10) : 0;
      return { url, w };
    })
    .filter((c) => c.url);
  if (!candidates.length) return null;
  candidates.sort((a, b) => b.w - a.w);
  return candidates[0].url;
}

module.exports = { absoluteUrl, unique, pickFromSrcset };
