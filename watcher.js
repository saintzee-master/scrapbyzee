'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { scrape } = require('./scraper');

/**
 * WATCHER — pemantau situs otomatis yang RINGAN & ANTI-NUMPUK.
 *
 * Prinsip agar tidak jadi sampah / membebani sistem:
 *   - Hanya menyimpan 1 snapshot TERBARU per URL (selalu ditimpa, tanpa histori).
 *   - Dibatasi jumlah pantauan (MAX_WATCHES) & interval minimal (MIN_INTERVAL_MIN).
 *   - Satu timer global; tiap siklus hanya memproses URL yang sudah "jatuh tempo",
 *     dan diproses berurutan (bukan paralel) supaya beban tetap kecil.
 *   - Persistensi ke satu file JSON yang ditulis-ulang (tidak pernah bertambah baris).
 */

const DATA_DIR = path.join(__dirname, '..', 'data');
const STORE_FILE = path.join(DATA_DIR, 'watches.json');

const MAX_WATCHES = 20;
const MIN_INTERVAL_MIN = 5;
const DEFAULT_INTERVAL_MIN = 15;
const TICK_MS = 60 * 1000; // cek jatuh tempo tiap 1 menit

/** @type {Map<string, object>} url -> state */
const watches = new Map();
let timer = null;

/** Sidik jari isi penting halaman untuk mendeteksi perubahan. */
function fingerprint(data) {
  const core = {
    title: data.metadata && data.metadata.title,
    photos: data.photoUrls,
    videos: data.videoUrls,
    categories: data.categories,
    structuredCount: data.counts && data.counts.structured,
  };
  return crypto.createHash('sha1').update(JSON.stringify(core)).digest('hex');
}

/** Bentuk ringkas untuk daftar (tanpa payload besar). */
function summarize(w) {
  return {
    url: w.url,
    intervalMinutes: Math.round(w.intervalMs / 60000),
    render: !!w.options.render,
    lastRun: w.lastRun || null,
    lastStatus: w.lastStatus || null,
    changedAt: w.changedAt || null,
    error: w.error || null,
    counts: w.latest ? w.latest.counts : null,
  };
}

function persist() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    const out = [];
    for (const w of watches.values()) {
      out.push({
        url: w.url,
        intervalMs: w.intervalMs,
        options: w.options,
        lastRun: w.lastRun,
        lastStatus: w.lastStatus,
        lastHash: w.lastHash,
        changedAt: w.changedAt,
        latest: w.latest, // hanya 1 snapshot terbaru; ditimpa tiap kali
      });
    }
    fs.writeFileSync(STORE_FILE, JSON.stringify(out));
  } catch (_) {
    /* abaikan kegagalan tulis; watcher tetap jalan di memori */
  }
}

function load() {
  try {
    if (!fs.existsSync(STORE_FILE)) return;
    const arr = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
    for (const w of arr) {
      watches.set(w.url, {
        url: w.url,
        intervalMs: w.intervalMs,
        options: w.options || {},
        lastRun: w.lastRun || 0,
        lastStatus: w.lastStatus || null,
        lastHash: w.lastHash || null,
        changedAt: w.changedAt || null,
        latest: w.latest || null,
        error: null,
      });
    }
  } catch (_) {
    /* file rusak; mulai bersih */
  }
}

/** Jalankan satu kali scrape untuk sebuah pantauan & perbarui snapshot. */
async function runOne(w) {
  try {
    const data = await scrape(w.url, {
      ...w.options,
      useCache: false, // selalu ambil kondisi terbaru
    });
    const hash = fingerprint(data);
    const changed = hash !== w.lastHash;
    w.latest = data;
    w.lastRun = Date.now();
    w.lastStatus = data.status || 200;
    w.error = null;
    if (changed) {
      w.lastHash = hash;
      w.changedAt = new Date().toISOString();
    }
  } catch (err) {
    w.lastRun = Date.now();
    w.error = err.message;
  }
  persist();
}

/** Timer global: proses URL yang jatuh tempo secara berurutan. */
async function tick() {
  const now = Date.now();
  for (const w of watches.values()) {
    if (now - (w.lastRun || 0) >= w.intervalMs) {
      await runOne(w); // berurutan → beban kecil
    }
  }
}

function start() {
  if (timer) return;
  load();
  timer = setInterval(() => { tick().catch(() => {}); }, TICK_MS);
  if (timer.unref) timer.unref();
  // Jalankan sekali di awal (tanpa memblokir boot).
  setTimeout(() => { tick().catch(() => {}); }, 3000);
}

/** Tambah/replace pantauan. */
function addWatch(url, opts = {}) {
  if (!/^https?:\/\//i.test(url)) {
    const e = new Error('URL harus diawali http/https.'); e.statusCode = 400; throw e;
  }
  const exists = watches.has(url);
  if (!exists && watches.size >= MAX_WATCHES) {
    const e = new Error(`Maksimal ${MAX_WATCHES} pantauan. Hapus salah satu dulu.`);
    e.statusCode = 400; throw e;
  }
  let mins = parseInt(opts.intervalMinutes, 10) || DEFAULT_INTERVAL_MIN;
  if (mins < MIN_INTERVAL_MIN) mins = MIN_INTERVAL_MIN;
  const state = watches.get(url) || { url, lastRun: 0, lastHash: null, changedAt: null, latest: null };
  state.intervalMs = mins * 60000;
  state.options = {
    render: !!opts.render,
    respectRobots: opts.respectRobots !== false,
    insecure: !!opts.insecure,
  };
  state.error = null;
  watches.set(url, state);
  persist();
  // Langsung ambil sekali di latar belakang agar data cepat tersedia
  // (tanpa menunggu tick berikutnya).
  runOne(state).catch(() => {});
  return summarize(state);
}

function removeWatch(url) {
  const ok = watches.delete(url);
  persist();
  return ok;
}

function listWatches() {
  return Array.from(watches.values()).map(summarize);
}

/** Ambil snapshot terbaru sebuah pantauan (payload penuh). */
function getWatchData(url) {
  const w = watches.get(url);
  if (!w) return null;
  return { ...summarize(w), data: w.latest };
}

module.exports = {
  start, addWatch, removeWatch, listWatches, getWatchData,
  MAX_WATCHES, MIN_INTERVAL_MIN,
};
