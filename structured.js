'use strict';

/**
 * Extractor DATA TERSTRUKTUR generik.
 *
 * Tidak terikat pada tipe tertentu — menangkap SEMUA data terstruktur yang
 * diekspos halaman, apa pun jenisnya (Product, Article, Recipe, Event, dll.):
 *   1. JSON-LD  (<script type="application/ld+json">) — sumber terkaya.
 *   2. Microdata (itemscope/itemprop) — schema.org di dalam HTML.
 *
 * Dengan begitu script "tahu sendiri" cara mengambil data tanpa harus
 * didaftarkan per situs.
 */

/** Ratakan @graph & array agar semua node bisa diperiksa. */
function flattenNodes(data) {
  const out = [];
  const stack = Array.isArray(data) ? [...data] : [data];
  while (stack.length) {
    const node = stack.pop();
    if (!node || typeof node !== 'object') continue;
    if (Array.isArray(node['@graph'])) stack.push(...node['@graph']);
    out.push(node);
  }
  return out;
}

/** Ambil label @type sebagai string (bisa berupa array). */
function typeOf(node) {
  const t = node['@type'];
  if (!t) return null;
  return Array.isArray(t) ? t.join(', ') : String(t);
}

function extractJsonLd($) {
  const blocks = [];
  const types = {};
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text();
    if (!raw || !raw.trim()) return;
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (_) {
      // Sebagian situs menaruh beberapa objek JSON berturut-turut; coba perbaiki.
      try {
        parsed = JSON.parse('[' + raw.replace(/}\s*{/g, '},{') + ']');
      } catch (__) {
        return; // benar-benar tak valid; lewati
      }
    }
    for (const node of flattenNodes(parsed)) {
      const t = typeOf(node);
      if (t) types[t] = (types[t] || 0) + 1;
      blocks.push(node);
    }
  });
  return { blocks, types };
}

/** Microdata sederhana: kumpulkan setiap itemscope beserta itemprop di dalamnya. */
function extractMicrodata($) {
  const items = [];
  $('[itemscope]').each((_, el) => {
    const $el = $(el);
    // Lewati itemscope bersarang (akan ikut terbaca oleh induknya).
    if ($el.parents('[itemscope]').length) return;
    const item = { type: $el.attr('itemtype') || null, props: {} };
    $el.find('[itemprop]').each((__, p) => {
      const $p = $(p);
      if ($p.closest('[itemscope]').get(0) !== el && $p.parents('[itemscope]').get(0) !== el) {
        // hanya prop level pertama
      }
      const name = $p.attr('itemprop');
      if (!name) return;
      const val =
        $p.attr('content') ||
        $p.attr('src') || $p.attr('href') ||
        $p.attr('datetime') ||
        $p.text().trim();
      if (val && item.props[name] === undefined) item.props[name] = val;
    });
    if (Object.keys(item.props).length) items.push(item);
  });
  return items;
}

/**
 * @returns {{ jsonLd: object[], jsonLdTypes: object, microdata: object[], count: number }}
 */
function extractStructured($) {
  const { blocks, types } = extractJsonLd($);
  const microdata = extractMicrodata($);
  return {
    jsonLd: blocks,
    jsonLdTypes: types,
    microdata,
    count: blocks.length + microdata.length,
  };
}

module.exports = { extractStructured };
