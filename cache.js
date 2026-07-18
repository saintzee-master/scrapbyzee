'use strict';

/**
 * Cache in-memory sederhana dengan TTL (time-to-live).
 * Cocok untuk scrape on-demand: hasil URL yang sama dalam rentang waktu
 * tertentu dikembalikan dari memori, sehingga cepat & hemat request.
 */
class TTLCache {
  constructor(ttlMs = 5 * 60 * 1000, maxEntries = 500) {
    this.ttl = ttlMs;
    this.max = maxEntries;
    this.store = new Map();
  }

  _isExpired(entry) {
    return Date.now() - entry.time > this.ttl;
  }

  get(key) {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (this._isExpired(entry)) {
      this.store.delete(key);
      return undefined;
    }
    // Refresh urutan LRU: pindahkan ke posisi terbaru.
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.value;
  }

  set(key, value) {
    if (this.store.has(key)) this.store.delete(key);
    this.store.set(key, { time: Date.now(), value });
    // Buang entry terlama jika melebihi kapasitas.
    while (this.store.size > this.max) {
      const oldest = this.store.keys().next().value;
      this.store.delete(oldest);
    }
  }

  clear() {
    this.store.clear();
  }
}

module.exports = { TTLCache };
