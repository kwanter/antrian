# Repository Guidelines

## Project Overview

**Antrian** is a queue management system for service counters (banking, government offices, etc.). It consists of:
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
- **API Versioning**: All routes under `/api/v1/*`
- **Authentication**: Laravel Sanctum token-based auth
- **Real-time**: Laravel Reverb WebSocket server (port 8080), events broadcast to frontend via Pusher-js protocol
- **Database**: SQLite for development, MySQL/PostgreSQL for production

### Key Events (Real-time Broadcasting)
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

## Key Directories

```
backend/
├── app/
│   ├── Http/Controllers/Api/   # API controllers (QueuesController, AuthController, etc.)
│   ├── Http/Middleware/        # CheckRole, AssignCounter
│   ├── Models/                 # Eloquent models (Queue, Counter, Display, User, etc.)
│   ├── Events/                # Broadcasting events (QueueCreated, QueueCalled, etc.)
│   └── Services/              # (none yet—add business logic here)
├── database/migrations/       # Database schema
├── routes/api.php             # API route definitions
├── config/                    # Laravel configs (reverb, broadcasting, database)
└── tests/                     # PHPUnit tests (Unit/, Feature/)
```

## Key Files

| File | Purpose |
|------|---------|
| `backend/public/index.php` | HTTP entry point |
| `backend/bootstrap/app.php` | App config, middleware aliases |
| `backend/routes/api.php` | API routes (all v1 prefixed) |
| `backend/composer.json` | Dependencies, dev scripts |
| `frontend/package.json` | Frontend scripts, dependencies |
| `prd.md` | Product Requirements (Indonesian) |

## Data Models

### Core Entities
- **Queue**: ticket_number, service_type, customer_name, status (waiting/called/serving/completed/skipped), counter_id, called_by, called_at, completed_at
- **Counter**: name, code, status (active/inactive), assigned users
- **Display**: name, location, is_active, settings (JSON), videos
- **User**: name, email, role (admin/loket/super), is_active, assigned counters
- **KioskStation**: token-based auth for ticket printing stations
- **PrinterProfile**: printer configuration profiles
- **AuditLog**: tracks all create/update/delete/login actions
- **QueueLog**: tracks queue state changes

## Code Conventions

### PHP/Laravel
- **Controllers**: Return JSON with `response()->json()`
- **Naming**: PascalCase for classes, camelCase for methods, snake_case for DB columns
- **Validation**: Form Request classes in `app/Http/Requests/`
- **Models**: Use `$fillable` for mass assignment, define relationships explicitly
- **Error Handling**: Throw exceptions, let Laravel handle HTTP responses
- **Formatting**: Laravel Pint (run `composer lint`)

### TypeScript/React
- **Components**: PascalCase `.tsx` files, functional components with hooks
- **Naming**: camelCase variables, PascalCase components, kebab-case file names
- **State**: Zustand for global state, TanStack Query for server state
- **Styling**: Tailwind CSS v4 with shadcn/ui components

## Testing

### Framework
- **PHPUnit 12** with Laravel TestCase
- **Test Structure**: `tests/Unit/` and `tests/Feature/` directories
- **Execution**: `composer test` (runs `php artisan test`)

### Test Configuration
- In-memory SQLite for database tests
- Array-based cache/session/queue drivers
- Environment: `APP_ENV=testing`, `BCRYPT_ROUNDS=4`

## Runtime & Tooling

| Component | Version | Notes |
|-----------|---------|-------|
| PHP | 8.3+ | Required |
| Node.js | 18+ | For frontend build |
| Laravel | 13.x | Backend framework |
| Next.js | 16.x | Frontend framework |
| Laravel Reverb | latest | WebSocket server (port 8080) |
| SQLite | default dev | MySQL/PostgreSQL for production |

## Common Patterns

### Creating a New API Resource
1. Create controller in `app/Http/Controllers/Api/`
2. Add routes in `routes/api.php` with middleware
3. Create model in `app/Models/`
4. Add migration in `database/migrations/`
5. Register model in `app/Providers/AppServiceProvider` if needed

### Adding Real-time Events
1. Create event class in `app/Events/`
2. Implement `ShouldBroadcast` interface
3. Use `Broadcast::channel()` for authorization in `routes/channels.php`
4. Frontend listens via `Laravel Echo` + Pusher protocol

### Role-Based Access
```php
Route::middleware(['auth:sanctum', 'role:admin'])->group(function () {
    // Admin-only routes
});
```

## Environment Variables

Key variables in `.env.example`:
```
DB_CONNECTION=sqlite
BROADCAST_CONNECTION=reverb
CACHE_STORE=array
SESSION_DRIVER=array
QUEUE_CONNECTION=redis  # or database
REVERB_SERVER_PORT=8080
```

## Notes

- PRD is documented in Indonesian (`prd.md`)
- No custom test utilities—use Laravel's built-in assertions
- No scripts/ or docs/ directories exist—add when needed
- Frontend AGENTS.md only contains Next.js version warning; backend has no AGENTS.md