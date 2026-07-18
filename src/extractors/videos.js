'use strict';

const { absoluteUrl, unique } = require('./utils');

// Pola host video populer + cara mengambil ID & URL embed resminya.
const PROVIDERS = [
  {
    name: 'youtube',
    test: (h) => /(^|\.)(youtube\.com|youtube-nocookie\.com)$/.test(h),
    parse: (u) => {
      const id =
        u.searchParams.get('v') ||
        (u.pathname.match(/\/(embed|shorts|v)\/([^/?]+)/) || [])[2] ||
        u.pathname.split('/').filter(Boolean).pop();
      return { id, embedUrl: id ? `https://www.youtube.com/embed/${id}` : u.href };
    },
  },
  {
    name: 'youtube',
    test: (h) => h === 'youtu.be',
    parse: (u) => {
      const id = u.pathname.split('/').filter(Boolean)[0];
      return { id, embedUrl: id ? `https://www.youtube.com/embed/${id}` : u.href };
    },
  },
  {
    name: 'vimeo',
    test: (h) => /(^|\.)vimeo\.com$/.test(h),
    parse: (u) => {
      const id = u.pathname.split('/').filter(Boolean).pop();
      return { id, embedUrl: id ? `https://player.vimeo.com/video/${id}` : u.href };
    },
  },
  {
    name: 'dailymotion',
    test: (h) => /(^|\.)(dailymotion\.com|dai\.ly)$/.test(h),
    parse: (u) => {
      const id = u.pathname.split('/').filter(Boolean).pop();
      return { id, embedUrl: id ? `https://www.dailymotion.com/embed/video/${id}` : u.href };
    },
  },
  {
    name: 'twitch',
    test: (h) => /(^|\.)twitch\.tv$/.test(h),
    parse: (u) => ({ id: u.pathname.split('/').filter(Boolean).pop(), embedUrl: u.href }),
  },
  {
    name: 'facebook',
    test: (h) => /(^|\.)facebook\.com$/.test(h),
    parse: (u) => ({ id: null, embedUrl: u.href }),
  },
  {
    name: 'tiktok',
    test: (h) => /(^|\.)tiktok\.com$/.test(h),
    parse: (u) => ({ id: u.pathname.split('/').filter(Boolean).pop(), embedUrl: u.href }),
  },
  {
    name: 'instagram',
    test: (h) => /(^|\.)instagram\.com$/.test(h),
    parse: (u) => {
      const id = (u.pathname.match(/\/(?:p|reel|reels|tv)\/([\w-]+)/) || [])[1] || null;
      return { id, embedUrl: id ? `https://www.instagram.com/p/${id}/embed` : u.href };
    },
  },
  {
    name: 'streamable',
    test: (h) => /(^|\.)streamable\.com$/.test(h),
    parse: (u) => ({ id: u.pathname.split('/').filter(Boolean).pop(), embedUrl: u.href }),
  },
  {
    name: 'wistia',
    test: (h) => /(^|\.)(wistia\.com|wistia\.net|wi\.st)$/.test(h),
    parse: (u) => ({ id: u.pathname.split('/').filter(Boolean).pop(), embedUrl: u.href }),
  },
  {
    name: 'soundcloud',
    test: (h) => /(^|\.)soundcloud\.com$/.test(h),
    parse: (u) => ({ id: null, embedUrl: u.href }),
  },
  {
    name: 'spotify',
    test: (h) => /(^|\.)spotify\.com$/.test(h),
    parse: (u) => ({ id: u.pathname.split('/').filter(Boolean).pop(), embedUrl: u.href }),
  },
  {
    name: 'bilibili',
    test: (h) => /(^|\.)bilibili\.com$/.test(h),
    parse: (u) => ({ id: null, embedUrl: u.href }),
  },
  {
    name: 'rumble',
    test: (h) => /(^|\.)rumble\.com$/.test(h),
    parse: (u) => ({ id: null, embedUrl: u.href }),
  },
];

/**
 * Kenali platform video dari URL & susun info embed resminya.
 * @param {string} url
 * @returns {{ provider: string, id: string|null, embedUrl: string }|null}
 */
function identifyProvider(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    for (const p of PROVIDERS) {
      if (p.test(host)) {
        const { id, embedUrl } = p.parse(u);
        return { provider: p.name, id: id || null, embedUrl };
      }
    }
    return { provider: host, id: null, embedUrl: url };
  } catch (_) {
    return null;
  }
}

/** Apakah URL mengarah ke salah satu provider video yang dikenal. */
function isKnownProvider(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return PROVIDERS.some((p) => p.test(host));
  } catch (_) {
    return false;
  }
}

// Pola URL yang benar-benar menunjuk ke sebuah VIDEO (bukan sekadar link ke
// domain provider seperti footer nav youtube.com/about).
const VIDEO_URL_PATTERNS = [
  /youtube(?:-nocookie)?\.com\/(?:watch\?[^"']*\bv=|embed\/|shorts\/|v\/|live\/)[\w-]{6,}/i,
  /youtu\.be\/[\w-]{6,}/i,
  /player\.vimeo\.com\/video\/\d+/i,
  /vimeo\.com\/\d{6,}/i,
  /dailymotion\.com\/(?:embed\/)?video\/[a-z0-9]+/i,
  /dai\.ly\/[a-z0-9]+/i,
  /twitch\.tv\/videos\/\d+/i,
  /streamable\.com\/[a-z0-9]+/i,
  /facebook\.com\/[^"'\s]+\/videos\/\d+/i,
  /tiktok\.com\/@[\w.]+\/video\/\d+/i,
  /instagram\.com\/(?:p|reel|reels|tv)\/[\w-]+/i,
  /(?:wistia\.com|wistia\.net|wi\.st)\/(?:medias|embed)\/[\w-]+/i,
];

/** Apakah URL benar-benar sebuah link video (bukan cuma link ke domain provider). */
function isVideoLink(url) {
  return VIDEO_URL_PATTERNS.some((p) => p.test(url));
}

// --- Deteksi GENERIK (tanpa perlu daftar provider) ---
// File media / manifest streaming yang umum.
const VIDEO_FILE_RE = /\.(mp4|m4v|webm|ogv|ogg|mov|mkv|avi|flv|m3u8|mpd|ts)(\?[^"'\s]*)?($|["'\s#])/i;
// Pola path embed/player universal (situs apa pun): /embed/, /player, /e/xxxx, /iframe.
const GENERIC_EMBED_RE = /\/(?:embed|iframe|player|e|v)\/[\w-]{3,}|player\.[\w.-]+\/|\/embed\?|\/player\?/i;

/**
 * Heuristik: apakah sebuah URL "terlihat seperti" video, tanpa harus tahu
 * provider-nya. Menangkap: provider dikenal, file media langsung, manifest
 * streaming (HLS/DASH), atau pola URL embed/player umum.
 */
function looksLikeVideo(url) {
  if (!url) return false;
  return isVideoLink(url) || VIDEO_FILE_RE.test(url) || GENERIC_EMBED_RE.test(url);
}

/** Tebak label provider dari host, atau 'file'/'embed' untuk yang generik. */
function guessKind(url) {
  if (VIDEO_FILE_RE.test(url)) return 'file';
  return 'embed';
}

/** Apakah URL video layak ditampilkan (bisa diklik/dipakai). */
function isUsableVideoUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const u = url.trim().toLowerCase();
  if (!u || u === 'about:blank') return false;
  // blob:/data:/javascript: hanya berlaku internal di browser, tak bisa diakses ulang.
  if (u.startsWith('blob:') || u.startsWith('data:') || u.startsWith('javascript:')) return false;
  return /^https?:\/\//.test(u);
}

function push(list, video) {
  if (video && isUsableVideoUrl(video.url)) list.push(video);
}

/**
 * Ekstrak video embed & native dari halaman — versi "sakti":
 * iframe, <video>, og:video, <a> ke provider, data-* attribute,
 * JSON-LD VideoObject, dan pemindaian URL embed di dalam <script>.
 * @param {import('cheerio').CheerioAPI} $
 * @param {string} baseUrl
 * @returns {Array<object>}
 */
function extractVideos($, baseUrl) {
  const videos = [];

  // 1) <iframe> embed
  $('iframe').each((_, el) => {
    const url = absoluteUrl($(el).attr('src') || $(el).attr('data-src'), baseUrl);
    if (!url) return;
    const info = identifyProvider(url);
    push(videos, {
      type: 'embed',
      source: 'iframe',
      provider: info ? info.provider : null,
      id: info ? info.id : null,
      url: info ? info.embedUrl : url,
      title: $(el).attr('title') || null,
    });
  });

  // 2) <video> native + <source>
  $('video').each((_, el) => {
    const $el = $(el);
    const direct = absoluteUrl($el.attr('src'), baseUrl);
    push(videos, direct && {
      type: 'native', source: 'video', provider: 'html5', id: null,
      url: direct, poster: absoluteUrl($el.attr('poster'), baseUrl),
    });
    $el.find('source').each((__, s) => {
      const url = absoluteUrl($(s).attr('src'), baseUrl);
      push(videos, url && {
        type: 'native', source: 'source', provider: 'html5', id: null,
        url, mime: $(s).attr('type') || null,
      });
    });
  });

  // 3) og:video / twitter:player
  $('meta[property="og:video"], meta[property="og:video:url"], meta[property="og:video:secure_url"], meta[name="twitter:player"]').each(
    (_, el) => {
      const url = absoluteUrl($(el).attr('content'), baseUrl);
      if (!url) return;
      const info = identifyProvider(url);
      push(videos, {
        type: 'og:video', source: 'meta',
        provider: info ? info.provider : null, id: info ? info.id : null,
        url: info ? info.embedUrl : url,
      });
    }
  );

  // 4) <a href> yang mengarah ke sebuah VIDEO (provider dikenal, file media,
  //    atau pola embed/player generik — tanpa perlu daftar situs).
  $('a[href]').each((_, el) => {
    const url = absoluteUrl($(el).attr('href'), baseUrl);
    if (url && looksLikeVideo(url)) {
      const info = identifyProvider(url);
      push(videos, {
        type: 'link', source: 'anchor',
        provider: info ? info.provider : guessKind(url), id: info ? info.id : null,
        url: info ? info.embedUrl : url,
        title: $(el).text().trim() || null,
      });
    }
  });

  // 5) data-* attribute yang memuat URL video (data-video, data-embed, dll.)
  $('[data-video], [data-video-url], [data-embed], [data-embed-url], [data-src], [data-url], [data-file], [data-mp4], [data-hls]').each((_, el) => {
    const $el = $(el);
    const raw =
      $el.attr('data-video') || $el.attr('data-video-url') ||
      $el.attr('data-embed') || $el.attr('data-embed-url') ||
      $el.attr('data-src') || $el.attr('data-url') ||
      $el.attr('data-file') || $el.attr('data-mp4') || $el.attr('data-hls');
    const url = absoluteUrl(raw, baseUrl);
    if (url && looksLikeVideo(url)) {
      const info = identifyProvider(url);
      push(videos, {
        type: 'data-attr', source: 'data',
        provider: info ? info.provider : guessKind(url), id: info ? info.id : null,
        url: info ? info.embedUrl : url,
      });
    }
  });

  // 6) JSON-LD VideoObject
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).contents().text());
      const stack = Array.isArray(data) ? [...data] : [data];
      while (stack.length) {
        const node = stack.pop();
        if (!node || typeof node !== 'object') continue;
        if (node['@graph']) stack.push(...[].concat(node['@graph']));
        const type = node['@type'];
        if (type === 'VideoObject' || (Array.isArray(type) && type.includes('VideoObject'))) {
          const url = absoluteUrl(node.embedUrl || node.contentUrl, baseUrl);
          if (url) {
            const info = identifyProvider(url);
            push(videos, {
              type: 'json-ld', source: 'ld+json',
              provider: info ? info.provider : null, id: info ? info.id : null,
              url: info ? info.embedUrl : url, title: node.name || null,
            });
          }
        }
      }
    } catch (_) {
      /* JSON-LD tidak valid; abaikan */
    }
  });

  // 7) Pindai URL embed provider di dalam seluruh <script> (lazy-load/JSON inline)
  const scriptText = $('script').map((_, el) => $(el).contents().text()).get().join('\n');
  const embedRegex =
    /https?:\\?\/\\?\/(?:www\.)?(?:youtube(?:-nocookie)?\.com\/embed\/[\w-]+|youtu\.be\/[\w-]+|player\.vimeo\.com\/video\/\d+|dailymotion\.com\/embed\/video\/\w+)/gi;
  let m;
  while ((m = embedRegex.exec(scriptText)) !== null) {
    const url = m[0].replace(/\\\//g, '/');
    const info = identifyProvider(url);
    push(videos, {
      type: 'script', source: 'script',
      provider: info ? info.provider : null, id: info ? info.id : null,
      url: info ? info.embedUrl : url,
    });
  }

  // 8) Pindai file media / manifest streaming (.mp4/.m3u8/.mpd/dll) di SELURUH
  //    HTML + script secara generik — menangkap player yang menaruh sumber di JS.
  const fullText = $.html();
  const mediaRegex = /https?:\\?\/\\?\/[^"'\s<>()]+\.(?:mp4|m4v|webm|ogv|mov|mkv|flv|m3u8|mpd)(?:\?[^"'\s<>()]*)?/gi;
  let mm;
  while ((mm = mediaRegex.exec(fullText)) !== null) {
    const url = mm[0].replace(/\\\//g, '/');
    push(videos, { type: 'file', source: 'media-scan', provider: 'file', id: null, url });
  }

  return unique(videos, (v) => (v.id ? v.provider + ':' + v.id : v.url));
}

module.exports = {
  extractVideos, identifyProvider, isKnownProvider,
  isVideoLink, isUsableVideoUrl, looksLikeVideo,
};
