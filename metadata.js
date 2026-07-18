'use strict';

const { absoluteUrl } = require('./utils');

/**
 * Ekstrak metadata umum halaman: judul, deskripsi, Open Graph, Twitter Card,
 * canonical, favicon, bahasa, dan author.
 * @param {import('cheerio').CheerioAPI} $
 * @param {string} baseUrl
 * @returns {object}
 */
function extractMetadata($, baseUrl) {
  const meta = (selector, attr = 'content') => $(selector).attr(attr) || null;

  const openGraph = {};
  $('meta[property^="og:"]').each((_, el) => {
    const key = $(el).attr('property');
    const val = $(el).attr('content');
    if (key && val) openGraph[key] = val;
  });

  const twitter = {};
  $('meta[name^="twitter:"]').each((_, el) => {
    const key = $(el).attr('name');
    const val = $(el).attr('content');
    if (key && val) twitter[key] = val;
  });

  const faviconRaw =
    meta('link[rel="icon"]', 'href') ||
    meta('link[rel="shortcut icon"]', 'href') ||
    meta('link[rel="apple-touch-icon"]', 'href');

  return {
    title: ($('title').first().text() || meta('meta[property="og:title"]') || '').trim() || null,
    description:
      meta('meta[name="description"]') || meta('meta[property="og:description"]') || null,
    canonical: absoluteUrl(meta('link[rel="canonical"]', 'href'), baseUrl),
    language: $('html').attr('lang') || null,
    author: meta('meta[name="author"]') || meta('meta[property="article:author"]') || null,
    siteName: meta('meta[property="og:site_name"]') || null,
    favicon: absoluteUrl(faviconRaw, baseUrl),
    openGraph,
    twitter,
  };
}

module.exports = { extractMetadata };
