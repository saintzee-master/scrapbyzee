'use strict';

const { unique } = require('./utils');

/**
 * Ekstrak kategori / tag / topik dari halaman.
 * Menggabungkan beberapa sinyal umum: meta keywords, article:tag,
 * breadcrumb, rel="tag", dan class umum seperti .category / .tag.
 * @param {import('cheerio').CheerioAPI} $
 * @returns {{ categories: string[], breadcrumb: string[], keywords: string[] }}
 */
function extractCategories($) {
  const categories = [];
  const keywords = [];
  const breadcrumb = [];

  // meta keywords
  const metaKw = $('meta[name="keywords"]').attr('content');
  if (metaKw) {
    metaKw.split(',').forEach((k) => {
      const v = k.trim();
      if (v) keywords.push(v);
    });
  }

  // Open Graph article tags & section
  $('meta[property="article:tag"]').each((_, el) => {
    const v = ($(el).attr('content') || '').trim();
    if (v) categories.push(v);
  });
  const section = $('meta[property="article:section"]').attr('content');
  if (section) categories.push(section.trim());

  // rel="tag" & link kategori umum
  $('a[rel~="tag"], a[rel~="category"]').each((_, el) => {
    const v = $(el).text().trim();
    if (v) categories.push(v);
  });

  // Class umum: .category, .categories, .tag, .tags, .post-category
  $('.category a, .categories a, .tag a, .tags a, .post-category a, [class*="categor"] a, [class*="tag"] a').each(
    (_, el) => {
      const v = $(el).text().trim();
      if (v && v.length <= 60) categories.push(v);
    }
  );

  // Breadcrumb (schema.org & pola umum)
  $('[class*="breadcrumb"] a, nav[aria-label*="readcrumb"] a, ol.breadcrumb li').each((_, el) => {
    const v = $(el).text().trim();
    if (v) breadcrumb.push(v);
  });

  // JSON-LD BreadcrumbList
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).contents().text());
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        if (item && item['@type'] === 'BreadcrumbList' && Array.isArray(item.itemListElement)) {
          item.itemListElement.forEach((li) => {
            const name = li && (li.name || (li.item && li.item.name));
            if (name) breadcrumb.push(String(name).trim());
          });
        }
      }
    } catch (_) {
      /* abaikan JSON-LD yang tidak valid */
    }
  });

  return {
    categories: unique(categories),
    breadcrumb: unique(breadcrumb),
    keywords: unique(keywords),
  };
}

module.exports = { extractCategories };
