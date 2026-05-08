# Antrian - Sistem Manajemen Antrian Digital

Sistem antrian digital untuk kantor pemerintahan dan pusat layanan publik. Mendukung pelacakan antrian real-time, pengambilan tiket via kios, dan pembaruan layar display secara instan.

## Teknologi yang Digunakan

| Layer | Teknologi |
|-------|-----------|
| Frontend | Next.js 16.2.4 + React 19 + TypeScript |
| UI | Tailwind CSS 4 + shadcn/ui |
| State | React Query + Zustand |
| Backend | Laravel 13 + PHP 8.3 |
| Autentikasi | Laravel Sanctum |
| Realtime | Laravel Reverb (WebSocket) |
| Database | MySQL 8 |

## Struktur Aplikasi

```
antrian/
├── frontend/          # Aplikasi Next.js
│   └── app/
│       ├── (admin)/   # Dashboard admin
│       │   ├── counters/   # Manajemen loket/counter
│       │   ├── displays/   # Konfigurasi layar display
│       │   ├── layanans/   # Jenis layanan
│       │   ├── login/      # Login admin
│       │   ├── printers/   # Profil printer
│       │   ├── users/      # Manajemen pengguna
│       │   ├── audit/      # Log audit
│       │   └── page.tsx    # Halaman utama dashboard
│       ├── loket/    # Antarmuka petugas loket
│       ├── kiosk/    # Terminal pengambilan tiket
│       └── display/  # Layar display antrian publik
└── backend/          # API Laravel
    └── app/
        ├── Http/Controllers/Api/
        ├── Events/           # Event broadcast
        └── Models/           # Model Eloquent
```

## Tabel Database

- `users` — Akun admin dan petugas (role: admin/super/loket)
- `counters` — Loket/counter layanan (nama, kode, status)
- `layanans` — Jenis layanan (nama, kode, is_active)
- `queues` — Tiket antrian (ticket_number, status, counter_id, layanan_id)
- `displays` — Layar monitor (nama, lokasi, settings: volume, announcer)
- `videos` — Video playlist untuk display (judul, url, durasi, playlist_order)
- `printer_profiles` — Konfigurasi printer thermal
- `kiosk_stations` — Konfigurasi terminal kios dengan token autentikasi
- `queue_logs` — Riwayat aksi antrian
- `audit_logs` — Jejak audit tindakan admin

## Role Pengguna

| Role | Akses |
|------|-------|
| `admin` / `super` | Dashboard admin penuh, CRUD display/video/layanan/loket |
| `loket` | Antarmuka loket, memanggil/melewati/menyelesaikan antrian |

## Routes API

### Publik
- `POST /api/v1/auth/login` — Login admin/petugas
- `GET /api/v1/layanans` — Daftar jenis layanan (untuk kios)
- `POST /api/v1/queues` — Buat tiket antrian (kios)
- `GET /api/v1/queues/stats` — Statistik antrian
- `GET /api/v1/displays` — Daftar layar display
- `GET /api/v1/displays/{id}/sync` — Sinkronisasi display (dengan data antrian lengkap)
- `GET /api/v1/videos` — Daftar video aktif

### Terproteksi (autentikasi Sanctum)
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/me`
- `POST /api/v1/queues/{id}/call` — Panggil antrian ke loket
- `POST /api/v1/queues/{id}/complete` — Selesaikan antrian
- `POST /api/v1/queues/{id}/skip` — Lewati antrian
- `POST /api/v1/counters/{id}/call-next` — Panggil antrian berikutnya otomatis
- CRUD lengkap untuk counters, displays, videos, layanans, printers, kiosks

## Broadcasting Realtime (Laravel Reverb)

Channel:
- `queue.updated` — Semua perubahan status antrian (dipanggil, selesai, dibuat)
- `volume.{display_id}` — Pembaruan volume per-display

## Instalasi

### Persyaratan

- PHP 8.3+
- Composer 2
- Node.js 20.9+ (disarankan 22 LTS)
- MySQL 8+
- Git

### 1. Clone dan setup

```bash
git clone <repo-url> antrian
cd antrian
```

### 2. Setup Backend

```bash
cd backend
cp .env.example .env
composer install
php artisan key:generate
```

Konfigurasi `.env`:
```env
APP_URL=http://localhost:8000
FRONTEND_URL=http://localhost:3000
CORS_ALLOWED_ORIGINS=http://localhost:3000

DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=antrian
DB_USERNAME=<user_anda>
DB_PASSWORD=<password_anda>

SESSION_DRIVER=database
SANCTUM_STATEFUL_DOMAINS=localhost:3000

BROADCAST_CONNECTION=reverb
REVERB_ENABLED=true
REVERB_APP_ID=antrian
REVERB_APP_KEY=<generate-dengan-openssl>
REVERB_APP_SECRET=<generate-dengan-openssl>
REVERB_HOST=127.0.0.1
REVERB_PORT=8080
REVERB_SCHEME=http
```

Generate kunci Reverb:
```bash
openssl rand -hex 24   # REVERB_APP_KEY
openssl rand -hex 32   # REVERB_APP_SECRET
```

Jalankan migrasi:
```bash
php artisan migrate
php artisan storage:link
```

### 3. Setup Frontend

```bash
cd frontend
```

Buat `.env.local`:
```env
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
NEXT_PUBLIC_PUSHER_KEY=<sama-dengan-REVERB_APP_KEY>
NEXT_PUBLIC_PUSHER_HOST=127.0.0.1
NEXT_PUBLIC_PUSHER_PORT=8080
NEXT_PUBLIC_PUSHER_SCHEME=http
```

Install dan build:
```bash
npm install
npm run build
```

### 4. Jalankan Service

**Terminal 1 — Backend Laravel:**
```bash
cd backend
php artisan serve --port=8000
```

**Terminal 2 — Reverb WebSocket:**
```bash
cd backend
php artisan reverb:start --host=127.0.0.1 --port=8080
```

**Terminal 3 — Queue worker:**
```bash
cd backend
php artisan queue:work --sleep=3 --tries=3
```

**Terminal 4 — Frontend:**
```bash
cd frontend
npm run dev
```

### 5. Halaman Aplikasi

| URL | Fungsi |
|-----|--------|
| `http://localhost:3000/login` | Login admin |
| `http://localhost:3000` | Dashboard admin |
| `http://localhost:3000/loket` | Antarmuka petugas loket |
| `http://localhost:3000/kiosk` | Pengambilan tiket (layar sentuh) |
| `http://localhost:3000/display` | Layar display antrian publik |

## Membuat Admin Pertama

Buat user admin via tinker:
```bash
cd backend
php artisan tinker
```

```php
App\Models\User::create([
    'name' => 'Admin',
    'email' => 'admin@antrian.local',
    'password' => bcrypt('password'),
    'role' => 'admin',
]);
```

## Deploy Produksi

Lihat [DEPLOY.md](./DEPLOY.md) untuk panduan deploy produksi di VPS Ubuntu dengan Apache, MySQL, systemd, dan HTTPS.