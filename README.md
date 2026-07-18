# 🕷️ zscrap — Web Scraper API

> API scraper generik & on-demand untuk mengambil **foto, video embed, kategori, metadata, dan data terstruktur** dari halaman web mana pun — hasilnya dikembalikan sebagai **JSON** yang siap dipakai.

<p align="center">
  <img src="public/favicon.svg" width="90" alt="zscrap logo" />
</p>

<p align="center">
  <img alt="Node" src="https://img.shields.io/badge/Node.js-%3E%3D18-3c873a" />
  <img alt="Express" src="https://img.shields.io/badge/Express-4.x-000000" />
  <img alt="License" src="https://img.shields.io/badge/License-MIT-blue" />
  <img alt="Status" src="https://img.shields.io/badge/status-active-brightgreen" />
</p>

---

## ✨ Fitur Utama

| Fitur | Keterangan |
|---|---|
| 🖼️ **Ekstraksi Foto** | `img`, `srcset`, `data-src`/lazy, `<picture>`, `og:image`, `twitter:image`, `background-image` inline. Tersedia juga `photoUrls` (list URL saja). |
| 🎬 **Deteksi Video Generik** | Tidak perlu daftar situs! Menangkap: 13+ provider resmi (YouTube, Vimeo, Instagram, Facebook, TikTok, Twitch, dll.), **file media langsung** (`.mp4`, `.m3u8`, `.mpd`, `.webm`, …), pola **embed/player universal**, `og:video`, `<video>`/`<source>`, JSON-LD `VideoObject`, & pemindaian `<script>`. |
| 🗂️ **Kategori & Tag** | meta keywords, `article:tag`, `rel=tag`, breadcrumb, class-based, JSON-LD `BreadcrumbList`. |
| 🧾 **Metadata** | judul, deskripsi, canonical, bahasa, author, favicon, Open Graph & Twitter Card. |
| 📊 **Structured Data** | Menangkap **semua** JSON-LD (tipe apa pun: Product, Article, Recipe, Event…) + Microdata secara otomatis. |
| 🔗 **Ekstraksi Link** | Daftar semua tautan `http/https` (opsional). |
| 📄 **Crawl Paginasi** | Mengikuti link "next / berikutnya" untuk beberapa halaman. |
| 🔁 **Watcher Otomatis** | Pantau URL berkala (update sendiri saat situs berubah). Ringan & anti-numpuk (1 snapshot/URL). |
| ⚡ **Cache TTL** | Hasil di-cache 5 menit untuk respons cepat (bisa dimatikan). |
| 🛡️ **Robust** | Rotasi User-Agent, retry + backoff, rate-limit opsional, bypass SSL, mode render (Puppeteer), hormati `robots.txt`. |
| 🎨 **UI Tester** | Antarmuka modern (glassmorphism) di `/` untuk mencoba scrape lewat browser. |

---

## 🚀 Instalasi & Menjalankan (Lokal)

**Prasyarat:** [Node.js](https://nodejs.org) versi **18 ke atas**.

```bash
# 1. Clone repo
git clone https://github.com/ZxLanz/Z-SCRAP.git
cd Z-SCRAP

# 2. Install dependency
npm install

# 3. Jalankan
npm start
```

Server berjalan di **http://localhost:3000**

- 🌐 UI tester: `http://localhost:3000/`
- ❤️ Health check: `http://localhost:3000/api/health`

> Mode pengembangan (auto-reload): `npm run dev`

---

## 📡 Dokumentasi API

### 1. Scrape sebuah URL

```http
GET /api/scrape?url=https://contoh.com
```

**Query parameter:**

| Parameter | Tipe | Default | Keterangan |
|---|---|---|---|
| `url` | string | — | **(wajib)** URL yang akan di-scrape |
| `render` | bool | `false` | Render JavaScript pakai headless browser (Puppeteer) |
| `robots` | bool | `true` | Hormati `robots.txt` |
| `insecure` | bool | `false` | Abaikan error sertifikat SSL |
| `cache` | bool | `true` | Pakai cache hasil (5 menit) |
| `links` | bool | `false` | Sertakan daftar semua link |
| `waitFor` | string | — | Selector CSS yang ditunggu (mode render) |
| `retries` | number | `2` | Jumlah percobaan ulang |
| `minDelay` | number | `0` | Jeda minimal antar-request per-host (ms) |

**Contoh:**
```bash
curl "http://localhost:3000/api/scrape?url=https://quotes.toscrape.com/&links=true"
```

**Contoh respons (dipersingkat):**
```json
{
  "success": true,
  "url": "https://quotes.toscrape.com/",
  "finalUrl": "https://quotes.toscrape.com/",
  "status": 200,
  "rendered": false,
  "cached": false,
  "fetchedAt": "2026-07-19T10:00:00.000Z",
  "elapsedMs": 340,
  "metadata": { "title": "Quotes to Scrape", "description": "...", "openGraph": {}, "twitter": {} },
  "categories": ["love", "inspirational", "life"],
  "breadcrumb": [],
  "keywords": [],
  "photos": [{ "url": "https://.../img.jpg", "alt": "..." }],
  "photoUrls": ["https://.../img.jpg"],
  "videos": [{ "provider": "youtube", "id": "abc123", "url": "https://www.youtube.com/embed/abc123" }],
  "videoUrls": ["https://www.youtube.com/embed/abc123"],
  "structured": { "jsonLd": [], "jsonLdTypes": {}, "microdata": [], "count": 0 },
  "counts": { "photos": 1, "videos": 1, "categories": 3, "structured": 0 }
}
```

---

### 2. Scrape banyak URL (batch) / lewat body

```http
POST /api/scrape
Content-Type: application/json
```
```json
{
  "urls": ["https://situs-a.com", "https://situs-b.com"],
  "render": false,
  "includeLinks": true
}
```
> Kirim `"url"` (tunggal) atau `"urls"` (array untuk batch).

---

### 3. Crawl beberapa halaman (paginasi)

```http
GET /api/crawl?url=https://situs.com&maxPages=5
```

| Parameter | Default | Keterangan |
|---|---|---|
| `url` | — | **(wajib)** URL awal |
| `maxPages` | `5` | Batas jumlah halaman (1–20) |
| `render`, `robots`, `insecure` | — | Sama seperti `/api/scrape` |

Mengikuti otomatis link bertuliskan *next / berikutnya / » / ›*.

---

### 4. Watcher — Pemantau Otomatis 🔁

Pantau sebuah URL secara berkala; `zscrap` akan scrape sendiri dan menandai `changedAt` bila isinya berubah. **Hemat & anti-numpuk**: hanya menyimpan **1 snapshot terbaru per URL** (maksimal 20 URL, interval minimal 5 menit).

| Method | Endpoint | Fungsi |
|---|---|---|
| `POST` | `/api/watch` | Tambah pantauan: `{ "url": "...", "intervalMinutes": 15 }` |
| `GET` | `/api/watch` | Daftar semua pantauan (ringkas) |
| `GET` | `/api/watch?url=...` | Ambil snapshot terbaru sebuah URL |
| `DELETE` | `/api/watch?url=...` | Hapus pantauan |

**Contoh menambah pantauan:**
```bash
curl -X POST http://localhost:3000/api/watch \
  -H "Content-Type: application/json" \
  -d '{"url":"https://quotes.toscrape.com/","intervalMinutes":15}'
```

---

### 5. Health Check

```http
GET /api/health
```
```json
{ "status": "ok", "service": "zscrap", "time": "2026-07-19T10:00:00.000Z" }
```

---

## 🧑‍💻 Contoh Pemakaian dari Kode

**JavaScript (fetch):**
```js
const res = await fetch("http://localhost:3000/api/scrape?url=https://contoh.com");
const data = await res.json();
console.log(data.photoUrls, data.videos);
```

**Python (requests):**
```python
import requests
data = requests.get("http://localhost:3000/api/scrape",
                    params={"url": "https://contoh.com"}).json()
print(data["photoUrls"], data["videos"])
```

---

## ☁️ Deploy ke Railway

1. Login ke **[railway.com](https://railway.com)** dengan GitHub (tanpa kartu kredit).
2. **New Project → Deploy from GitHub repo →** pilih `ZxLanz/Z-SCRAP`.
3. Tambah Environment Variable: `PUPPETEER_SKIP_DOWNLOAD = true` (melewati unduhan Chromium yang berat).
4. **Settings → Networking → Generate Domain** untuk mendapat URL publik.
5. Selesai! Akses: `https://<nama>.up.railway.app/api/scrape?url=...`

> Auto re-deploy setiap ada push baru ke branch `main`.
> Di instance gratis, mode `render=true` dinonaktifkan (RAM terbatas), namun scrape statis berjalan penuh.

---

## 🗂️ Struktur Proyek

```
zscrap/
├── src/
│   ├── index.js            # Server Express + rute API
│   ├── scraper.js          # Orkestrator scrape & crawl
│   ├── fetcher.js          # Lapisan HTTP (UA rotation, retry, render)
│   ├── robots.js           # Pengecekan robots.txt
│   ├── cache.js            # Cache TTL in-memory
│   ├── watcher.js          # Pemantau otomatis
│   └── extractors/
│       ├── photos.js       # Ekstraksi foto
│       ├── videos.js       # Deteksi video generik
│       ├── categories.js   # Kategori & tag
│       ├── metadata.js     # Metadata & Open Graph
│       ├── structured.js   # JSON-LD + Microdata
│       └── utils.js        # Utilitas (URL absolut, dedup, srcset)
├── public/                 # UI tester + favicon
├── Procfile                # Konfigurasi start untuk deploy
└── package.json
```

---

## 🛠️ Teknologi

- **Node.js** + **Express** — server & routing
- **Cheerio** — parsing HTML statis (jQuery di sisi server)
- **axios** — HTTP client
- **Puppeteer** *(opsional)* — render halaman JavaScript

---

## ⚖️ Etika & Batasan

- Gunakan hanya untuk **situs legal** dan menghormati **Ketentuan Layanan** masing-masing situs.
- `robots.txt` dihormati secara default (`robots=true`).
- Beberapa situs (mis. Instagram, Facebook) memblokir scraper dengan tembok login/anti-bot — untuk itu gunakan **API resmi** mereka.
- Proyek ini dibuat untuk keperluan **belajar/tugas** dan pemakaian pribadi.

---

## 📄 Lisensi

Dirilis di bawah lisensi **MIT**.
