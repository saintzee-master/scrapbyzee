'use strict';

const { absoluteUrl, unique, pickFromSrcset } = require('./utils');

/**
 * Ekstrak semua foto/gambar dari halaman.
 * Menangani <img> (src, data-src, srcset), <source>, og:image, dan
 * background-image inline sederhana.
 * @param {import('cheerio').CheerioAPI} $
 * @param {string} baseUrl
 * @returns {Array<{ url: string, alt: string|null, width: string|null, height: string|null }>}
 */
function extractPhotos($, baseUrl) {
  const photos = [];

  $('img').each((_, el) => {
    const $el = $(el);
    const raw =
      $el.attr('src') ||
      $el.attr('data-src') ||
      $el.attr('data-original') ||
      $el.attr('data-lazy-src') ||
      pickFromSrcset($el.attr('srcset') || $el.attr('data-srcset'));
    const url = absoluteUrl(raw, baseUrl);
    if (!url) return;
    photos.push({
      url,
      alt: $el.attr('alt') || null,
      width: $el.attr('width') || null,
      height: $el.attr('height') || null,
    });
  });

  // <picture><source srcset="..."></picture>
  $('picture source').each((_, el) => {
    const url = absoluteUrl(pickFromSrcset($(el).attr('srcset')), baseUrl);
    if (url) photos.push({ url, alt: null, width: null, height: null });
  });

  // Open Graph / Twitter image
  $('meta[property="og:image"], meta[name="twitter:image"]').each((_, el) => {
    const url = absoluteUrl($(el).attr('content'), baseUrl);
    if (url) photos.push({ url, alt: 'og:image', width: null, height: null });
  });

  // background-image: url(...) inline
  $('[style*="background"]').each((_, el) => {
    const style = $(el).attr('style') || '';
    const m = style.match(/background(?:-image)?\s*:\s*url\(([^)]+)\)/i);
    if (m) {
      const url = absoluteUrl(m[1].replace(/['"]/g, ''), baseUrl);
      if (url) photos.push({ url, alt: null, width: null, height: null });
    }
  });

  return unique(photos, (p) => p.url);
}

module.exports = { extractPhotos };
