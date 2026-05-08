# Antrian - Queue Management System

Digital queue management system for government offices and service centers. Enables real-time queue tracking, ticket dispensing via kiosk, and instant display updates.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 16.2.4 + React 19 + TypeScript |
| UI | Tailwind CSS 4 + shadcn/ui |
| State | React Query + Zustand |
| Backend | Laravel 13 + PHP 8.3 |
| Auth | Laravel Sanctum |
| Realtime | Laravel Reverb (WebSocket) |
| Database | MySQL 8 |

## Application Structure

```
antrian/
├── frontend/          # Next.js application
│   └── app/
│       ├── (admin)/   # Admin dashboard
│       │   ├── counters/   # Counter/loket management
│       │   ├── displays/  # Display monitor config
│       │   ├── layanans/  # Service types (layanan)
│       │   ├── login/     # Admin authentication
│       │   ├── printers/  # Printer profiles
│       │   ├── users/     # User management
│       │   ├── audit/     # Audit logs
│       │   └── page.tsx   # Dashboard home
│       ├── loket/    # Petugas counter interface
│       ├── kiosk/    # Ticket dispensing terminal
│       └── display/  # Public queue display monitor
└── backend/          # Laravel API
    └── app/
        ├── Http/Controllers/Api/
        ├── Events/           # Broadcast events
        └── Models/           # Eloquent models
```

## Database Tables

- `users` — Admin and petugas accounts (role: admin/super/loket)
- `counters` — Service counters (name, code, status)
- `layanans` — Service types (name, code, is_active)
- `queues` — Queue tickets (ticket_number, status, counter_id, layanan_id)
- `displays` — Display monitors (name, location, settings: volume, announcer)
- `videos` — Playlist videos for display (title, url, duration, playlist_order)
- `printer_profiles` — Thermal printer configs
- `kiosk_stations` — Kiosk terminal configs with auth tokens
- `queue_logs` — Queue action history
- `audit_logs` — Admin action audit trail

## User Roles

| Role | Access |
|------|--------|
| `admin` / `super` | Full admin dashboard, display/video/layanan/counter CRUD |
| `loket` | Counter interface, call/skip/complete queue |

## API Routes

### Public
- `POST /api/v1/auth/login` — Admin/loket login
- `GET /api/v1/layanans` — List service types (for kiosk)
- `POST /api/v1/queues` — Create queue ticket (kiosk)
- `GET /api/v1/queues/stats` — Queue statistics
- `GET /api/v1/displays` — List display monitors
- `GET /api/v1/displays/{id}/sync` — Display sync (with full queue payload)
- `GET /api/v1/videos` — List active videos

### Protected (Sanctum auth)
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/me`
- `POST /api/v1/queues/{id}/call` — Call queue to counter
- `POST /api/v1/queues/{id}/complete` — Mark queue done
- `POST /api/v1/queues/{id}/skip` — Skip queue
- `POST /api/v1/counters/{id}/call-next` — Auto-call next waiting
- Full CRUD for counters, displays, videos, layanans, printers, kiosks

## Realtime Broadcasting (Laravel Reverb)

Channels:
- `queue.updated` — All queue state changes (called, completed, created)
- `volume.{display_id}` — Per-display volume updates

## Installation

### Prerequisites

- PHP 8.3+
- Composer 2
- Node.js 20.9+ (22 LTS recommended)
- MySQL 8+
- Git

### 1. Clone and setup

```bash
git clone <repo-url> antrian
cd antrian
```

### 2. Backend setup

```bash
cd backend
cp .env.example .env
composer install
php artisan key:generate
```

Configure `.env`:
```env
APP_URL=http://localhost:8000
FRONTEND_URL=http://localhost:3000
CORS_ALLOWED_ORIGINS=http://localhost:3000

DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=antrian
DB_USERNAME=<your_user>
DB_PASSWORD=<your_password>

SESSION_DRIVER=database
SANCTUM_STATEFUL_DOMAINS=localhost:3000

BROADCAST_CONNECTION=reverb
REVERB_ENABLED=true
REVERB_APP_ID=antrian
REVERB_APP_KEY=<generate-with-openssl>
REVERB_APP_SECRET=<generate-with-openssl>
REVERB_HOST=127.0.0.1
REVERB_PORT=8080
REVERB_SCHEME=http
```

Generate Reverb keys:
```bash
openssl rand -hex 24   # REVERB_APP_KEY
openssl rand -hex 32  # REVERB_APP_SECRET
```

Run migrations:
```bash
php artisan migrate
php artisan storage:link
```

### 3. Frontend setup

```bash
cd frontend
```

Create `.env.local`:
```env
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
NEXT_PUBLIC_PUSHER_KEY=<same-as-REVERB_APP_KEY>
NEXT_PUBLIC_PUSHER_HOST=127.0.0.1
NEXT_PUBLIC_PUSHER_PORT=8080
NEXT_PUBLIC_PUSHER_SCHEME=http
```

Install and build:
```bash
npm install
npm run build
```

### 4. Start services

**Terminal 1 — Laravel backend:**
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

### 5. Access points

| URL | Purpose |
|-----|---------|
| `http://localhost:3000/login` | Admin login |
| `http://localhost:3000` | Admin dashboard |
| `http://localhost:3000/loket` | Counter/petugas interface |
| `http://localhost:3000/kiosk` | Ticket dispensing (touchscreen) |
| `http://localhost:3000/display` | Public queue display |

## Default Credentials

Create admin user via tinker:
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

## Production Deployment

See [DEPLOY.md](./DEPLOY.md) for full production deployment guide on Ubuntu VPS with Apache, MySQL, systemd services, and HTTPS.