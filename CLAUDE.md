# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Antrian** is a queue management system for service counters (banking, government offices, etc.).

- **Backend**: Laravel 13 API (PHP 8.3+) with real-time WebSocket support via Laravel Reverb
- **Frontend**: Next.js 16 (React 19/TypeScript) with shadcn/ui components and Zustand state

## Development Commands

### Backend (Laravel)

```bash
# Install dependencies, run migrations, build frontend
composer setup

# Run concurrent dev servers (API, queue worker, vite, reverb logs)
composer dev

# Run tests (via php artisan test)
composer test
```

### Frontend (Next.js)

```bash
npm run dev      # Development server
npm run build    # Production build
npm run start    # Production server
npm run lint     # Lint with ESLint
```

## Architecture & Data Flow

### Backend Structure

```
backend/
├── app/
│   ├── Http/Controllers/Api/   # API controllers (QueuesController, AuthController, etc.)
│   ├── Http/Middleware/        # CheckRole, AssignCounter
│   ├── Models/                 # Eloquent models (Queue, Counter, Display, User, etc.)
│   ├── Events/                # Broadcasting events (QueueCreated, QueueCalled, etc.)
│   └── Services/              # Business logic (add here)
├── database/migrations/       # Database schema
├── routes/api.php             # API route definitions
├── config/                    # Laravel configs (reverb, broadcasting, database)
└── tests/                     # PHPUnit tests (Unit/, Feature/)
```

### Frontend Structure

```
frontend/          # Git submodule
├── src/
│   ├── app/          # Next.js App Router
│   ├── components/    # React components (ui/, features/)
│   ├── lib/          # Utilities, API clients, Zustand stores
│   └── styles/       # Global CSS, Tailwind config
└── public/           # Static assets
```

### Real-time Broadcasting Events

| Event | Trigger | Use Case |
|-------|---------|----------|
| `QueueCreated` | New ticket generated | Kiosk/display sync |
| `QueueCalled` | Ticket called by counter | TV display update |
| `QueueCompleted` | Service finished | Stats/update |
| `QueueSkipped` | Ticket skipped | Display refresh |
| `VolumeUpdate` | Display volume changed | Remote control |

### Roles & Middleware

| Role | Permissions |
|------|-------------|
| `admin` | Full access: users, audit logs, counters, displays, all queue operations |
| `loket` | Counter-specific: call/complete/skip queue, assigned counter only |
| `super` | All counter operations, no user management |

**Middleware**: `CheckRole` (role-based access), `AssignCounter` (auto-assign counter to loket session)

## Core Entities

- **Users & Auth**: `users`, `counters`, `counters_users` (pivot)
- **Queue Management**: `queues` (waiting/called/serving/completed/skipped), `queue_logs`
- **Display & Media**: `displays`, `videos`, `video_configs`
- **Printer & Kiosk**: `printer_profiles`, `kiosk_stations`
- **Audit & System**: `audit_logs`

## Common Patterns

### Creating a New API Resource

1. Create controller in `app/Http/Controllers/Api/`
2. Add routes in `routes/api.php` with middleware
3. Create model in `app/Models/`
4. Add migration in `database/migrations/`
5. Register model in `app/Providers/AppServiceProvider` if needed

### Adding Real-time Events

1. Create event class in `app/Events/` implementing `ShouldBroadcast`
2. Configure channel authorization in `routes/channels.php`
3. Frontend listens via `Laravel Echo` + Pusher protocol

### Role-Based Access

```php
->middleware('auth:sanctum', 'role:admin,super')
```

## Code Conventions

### PHP/Laravel
- Classes/methods: PascalCase / camelCase
- Use Form Request classes for complex validation
- Return API resources via JsonResponse

### TypeScript/React
- Components: PascalCase, Hooks: camelCase with `use` prefix
- State: Zustand for global, React hooks for local
- Prefer shadcn/ui primitives

## Testing

- Backend: PHPUnit with in-memory SQLite
- Frontend: Vitest + Playwright (planned)
- Test env: `APP_ENV=testing`, `BCRYPT_ROUNDS=4`, array-based queue/cache

## Notes

- Frontend is a Git submodule at `frontend/`
- Reverb runs on separate port for WebSocket connections
- Queue worker must run for async operations (printing, audit logging)
- All state changes should trigger appropriate broadcast events
