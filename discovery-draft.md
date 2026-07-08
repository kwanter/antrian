# Project Discovery Draft
> Date: 2026-06-08 | Project: Antrian
> Source: read-only codebase exploration + authoritative `antrian-codebase` skill

## 1. Snapshot

- Tech stack: Laravel 13 backend (`backend/composer.json:10`), Sanctum (`backend/composer.json:12`), PHPUnit 12 (`backend/composer.json:23`), Next.js 16 (`frontend/package.json:20`), React 19 (`frontend/package.json:23-24`), TanStack Query (`frontend/package.json:13`), axios (`frontend/package.json:14`), Laravel Echo/Reverb + Pusher protocol (`frontend/lib/websocket.ts:1-2`, `frontend/lib/websocket.ts:29-34`).
- Primary languages: PHP backend + TypeScript/TSX frontend. Approx 2026-06-08 tree count: 34 backend app PHP files, 19 migrations, 9 PHP tests, 71 frontend TS/TSX app/component/hook/lib/provider files.
- Architecture style: pragmatic Laravel MVC/API + Next.js App Router frontend. Controllers directly coordinate validation, ORM, audit/log writes, queue state transitions, broadcasts, and responses (`backend/app/Http/Controllers/Api/QueuesController.php:18`, `backend/app/Http/Controllers/Api/QueuesController.php:121-129`, `backend/app/Http/Controllers/Api/QueuesController.php:189-208`). No broad service/repository layer is present in the controller evidence.
- Test coverage: partial. Critical backend flows have feature tests: announcer, dynamic announcer service, layanan, printer profiles, queue date safety, role access (`backend/tests/Feature/AnnouncerFlowTest.php`, `backend/tests/Feature/DynamicAnnouncerServiceTest.php`, `backend/tests/Feature/LayananTest.php`, `backend/tests/Feature/PrinterProfileTest.php`, `backend/tests/Feature/QueueDateSafetyTest.php`, `backend/tests/Feature/RoleAccessTest.php`). Frontend test signal was not found in app/package scripts; frontend quality gate is lint/build (`frontend/package.json:6-8`).
- Business source of truth: `prd.md` exists and is substantial (172 lines), but it still states Laravel 11 in its overview while code uses Laravel 13 (`prd.md:4`, `backend/composer.json:10`). Treat PRD as business intent, not stack inventory.

## 2. Entry points

| Surface | Path | Purpose |
|---------|------|---------|
| HTTP API routes | `backend/routes/api.php:23-129` | Versioned `/api/v1` public + Sanctum-protected API route map. |
| Laravel app bootstrap | `backend/bootstrap/app.php:14-39` | Registers web/api/console/channels routing, middleware aliases, API JSON exception behavior. |
| Broadcast channels | `backend/routes/channels.php:5-32` | Public queue/display channels plus protected loket/queue/kiosk/admin channels. |
| HTTP front controller | `backend/public/index.php` | Laravel HTTP entry point. |
| Queue controller | `backend/app/Http/Controllers/Api/QueuesController.php:18-555` | Queue listing, creation, call/recall/complete/skip/call-next, stats, ticket generation. |
| Auth/session provider | `frontend/providers/auth-provider.tsx:44-166` | Browser auth state, CSRF cookie fetch, login/logout, impersonation state. |
| Axios API client | `frontend/lib/api.ts:3-40` | API base URL, credentials, FormData handling, 401 redirect policy. |
| WebSocket client | `frontend/lib/websocket.ts:13-46` | Echo singleton configured from `NEXT_PUBLIC_PUSHER_*` env vars. |
| Frontend admin shell | `frontend/app/(admin)/layout.tsx:10-46` | Admin route guard and loket redirect behavior. |
| Frontend loket shell | `frontend/app/loket/layout.tsx:10-34` | Loket route guard, impersonation exception. |
| Public kiosk UI | `frontend/app/kiosk/page.tsx` | Public ticket/printing flow. |
| Public display UI | `frontend/app/display/page.tsx` | React display monitor flow. |
| Legacy Samsung TV display | `frontend/public/tv.html:103-388` | Plain HTML/XHR display fallback for old Tizen TV. |

## 3. Architecture map

### Backend layers

- Routes define public endpoints for auth login, ticket creation/stats, displays/sync, videos, layanans, TTS, and printer default profile (`backend/routes/api.php:25-46`).
- Protected routes use `auth:sanctum` for logout/me/refresh/queue lifecycle/video show (`backend/routes/api.php:50-69`).
- Admin/super-only routes wrap counters, users, display writes, video writes, printer profiles, kiosk stations, layanans writes, audit logs, and impersonation (`backend/routes/api.php:72-129`).
- Middleware aliases are registered in bootstrap: `role`, `counter.assign`, `auth` (`backend/bootstrap/app.php:21-25`).
- `CheckRole` enforces role membership with 401/403 JSON responses (`backend/app/Http/Middleware/CheckRole.php:11-23`).
- `AssignCounter` lets admin/super pass and checks loket has direct or assigned counter (`backend/app/Http/Middleware/AssignCounter.php:11-33`).
- Models are Eloquent entities. `Queue` defines relationships to counter, layanan, calledByUser, logs (`backend/app/Models/Queue.php:36-53`) and status helpers/actions (`backend/app/Models/Queue.php:57-103`).
- Queue lifecycle currently lives mostly in `QueuesController`, including ORM queries, state transitions, logs, audit logs, and broadcasts (`backend/app/Http/Controllers/Api/QueuesController.php:18-555`).

### Frontend layers

- API transport is centralized in `frontend/lib/api.ts`, with `NEXT_PUBLIC_API_URL` defaulting to local Laravel (`frontend/lib/api.ts:3-4`) and `withCredentials` enabled (`frontend/lib/api.ts:9`).
- Auth provider fetches Sanctum CSRF cookie before login (`frontend/providers/auth-provider.tsx:72-76`), stores user state (`frontend/providers/auth-provider.tsx:77-81`), maps login errors to friendly Indonesian messages (`frontend/providers/auth-provider.tsx:85-99`).
- Queue server state/cache is mediated through TanStack Query hooks and mutation cache updates (`frontend/hooks/use-queue.ts:4-9`, `frontend/hooks/use-queue.ts:102-114`, `frontend/hooks/use-queue.ts:136-214`).
- Realtime client is a browser-only Echo singleton; missing `NEXT_PUBLIC_PUSHER_KEY` disables WebSocket with warning (`frontend/lib/websocket.ts:13-18`).
- Role UX is enforced in route layouts: admin layout redirects authenticated loket users away (`frontend/app/(admin)/layout.tsx:26-46`); loket layout rejects non-loket unless impersonating (`frontend/app/loket/layout.tsx:29-34`).

### Realtime/data flow

- `QueueCalled` broadcasts immediately (`ShouldBroadcastNow`) (`backend/app/Events/QueueCalled.php:8-13`).
- `QueueCalled` emits on `queue-updates`, `loket.{counter_id}`, and `display-sync` (`backend/app/Events/QueueCalled.php:24-31`).
- Event payload contains `announcement_id`, queue ID/ticket/status/layanan/counter timestamps, and previous status (`backend/app/Events/QueueCalled.php:38-58`).
- Broadcast channels include public `queue-updates`, `display-sync`, `display-volume-updates`, `display.{displayId}` plus authenticated loket/queue/kiosk and admin-only admin channel (`backend/routes/channels.php:5-32`).

### Device-specific architecture

- Legacy TV is deliberately not React. It uses plain DOM helpers and XHR (`frontend/public/tv.html:103-123`).
- Tizen decoder workaround recreates the `<video>` element rather than reviving the same node (`frontend/public/tv.html:152-170`).
- TV-safe video layout avoids `object-fit` and uses max-width/max-height with manual fitting (`frontend/public/tv.html:155`, `frontend/public/tv.html:180-194`).

## 4. Tech debt (top 5)

1. Fat queue controller / low separation of concerns. `QueuesController` is 555 lines and mixes query scoping, validation-adjacent checks, state transitions, `QueueLog`, `AuditLog`, broadcast dispatch, stats, and ticket-number generation (`backend/app/Http/Controllers/Api/QueuesController.php:18-555`, `backend/app/Http/Controllers/Api/QueuesController.php:121-129`, `backend/app/Http/Controllers/Api/QueuesController.php:189-208`, `backend/app/Http/Controllers/Api/QueuesController.php:496-520`). This increases regression risk for core queue behavior.
2. Controller layer imports and manipulates domain models directly across many APIs. Example: `LayananController` directly builds `Layanan::with('counter')`, writes audit logs, soft-deactivates, and queries queues (`backend/app/Http/Controllers/Api/LayananController.php:14-30`, `backend/app/Http/Controllers/Api/LayananController.php:45-54`, `backend/app/Http/Controllers/Api/LayananController.php:98-125`). This is standard Laravel, but limits reuse and makes policy/business rule drift easier.
3. `Queue.called_by` relationship ambiguity. `Queue::calledByUser()` declares `called_by` as a `User` FK (`backend/app/Models/Queue.php:46-49`), while `Queue::call()` accepts a string `$calledBy` and stores it into `called_by` (`backend/app/Models/Queue.php:83-91`). The loaded antrian skill explicitly warns `Queue.called_by` stores user name string, not numeric FK. This model relationship is misleading for future engineers.
4. Auth/RBAC correctness depends on careful dual enforcement. Backend route middleware scopes admin/super APIs (`backend/routes/api.php:72-129`), frontend guards separately redirect roles (`frontend/app/(admin)/layout.tsx:26-46`, `frontend/app/loket/layout.tsx:29-34`), and axios 401 routing has public-route exclusions (`frontend/lib/api.ts:21-40`). The skill warns prior pitfalls #14/#15/#19/#20 around login interceptor, RBAC, and impersonation; future auth edits are high-risk.
5. Device compatibility code is necessarily bespoke and fragile. `tv.html` has 388 lines, XHR polling, dynamic queue rendering, announcer unlocking, and video DOM recreation (`frontend/public/tv.html:103-388`, `frontend/public/tv.html:147-170`, `frontend/public/tv.html:211-233`). This is justified for Samsung UA55MU6100/Tizen 3, but should be treated as a separate platform target with its own smoke checklist.

## 5. Constraints that affect new work

- Do not bypass PRD business intent; `prd.md` is business source of truth (`prd.md:1-4`). Use this draft only for architecture/onboarding.
- All API routes live under `/api/v1` (`backend/routes/api.php:23`, `backend/routes/api.php:50`).
- Public surfaces are intentional: ticket creation/stats, displays/sync, videos, layanans, TTS, default printer profile are public (`backend/routes/api.php:25-46`). Do not wrap them in auth without product decision.
- Admin/super-only write/admin surfaces are grouped under `role:admin,super` (`backend/routes/api.php:72-129`).
- Browser auth is cookie/session-style Sanctum; login fetches `/sanctum/csrf-cookie` before `/auth/login` (`frontend/providers/auth-provider.tsx:72-76`).
- Queue mutations must preserve full payload/cache expectations; frontend cache updates use mutation payloads (`frontend/hooks/use-queue.ts:102-114`, `frontend/hooks/use-queue.ts:136-214`).
- Queue called event payload drives display/loket behavior; payload shape is explicit in `QueueCalled::broadcastWith` (`backend/app/Events/QueueCalled.php:38-58`).
- `LayananController::destroy` deactivates with `is_active=false`; it does not hard-delete (`backend/app/Http/Controllers/Api/LayananController.php:98-112`).
- Legacy TV must remain plain `frontend/public/tv.html` for old Samsung/Tizen; it uses XHR and direct DOM (`frontend/public/tv.html:103-123`) plus video recreation (`frontend/public/tv.html:152-170`).
- FormData uploads rely on the axios request interceptor deleting `Content-Type` so the browser sets multipart boundaries (`frontend/lib/api.ts:13-18`).

## 6. Conventions to follow

- Backend JSON responses come from controllers via `response()->json(...)` patterns, e.g. queue/loket actions and layanan destroy (`backend/app/Http/Controllers/Api/QueuesController.php:158-478`, `backend/app/Http/Controllers/Api/LayananController.php:108-112`).
- Prefer FormRequest validation for non-trivial create/update inputs; current examples are `StoreQueueRequest` and `LayananRequest` (`backend/app/Http/Requests/StoreQueueRequest.php`, `backend/app/Http/Requests/LayananRequest.php`).
- Preserve audit logging for admin/lifecycle changes (`backend/app/Http/Controllers/Api/QueuesController.php:197-204`, `backend/app/Http/Controllers/Api/LayananController.php:45-54`, `backend/app/Http/Controllers/Api/LayananController.php:102-108`).
- Preserve queue logs on lifecycle transitions (`backend/app/Http/Controllers/Api/QueuesController.php:121-126`, `backend/app/Http/Controllers/Api/QueuesController.php:189-194`, `backend/app/Http/Controllers/Api/QueuesController.php:303-307`).
- Preserve broadcast try/catch patterns around queue events (`backend/app/Http/Controllers/Api/QueuesController.php:129`, `backend/app/Http/Controllers/Api/QueuesController.php:208`, `backend/app/Http/Controllers/Api/QueuesController.php:329`, `backend/app/Http/Controllers/Api/QueuesController.php:467`).
- Frontend API calls should go through `frontend/lib/api.ts` so credentials, FormData, and auth redirects are consistent (`frontend/lib/api.ts:3-40`).
- Frontend server state should use TanStack Query hooks in `frontend/hooks/*` (`frontend/hooks/use-queue.ts:4-9`, `frontend/hooks/use-queue.ts:116-250`).
- Realtime config should use `NEXT_PUBLIC_PUSHER_*` env variables read in `frontend/lib/websocket.ts` (`frontend/lib/websocket.ts:16-34`).

## 7. Open questions

- Should the PRD stack statement be updated from Laravel 11 to Laravel 13, or is that intentional historical text? (`prd.md:4`, `backend/composer.json:10`)
- Should `Queue.called_by` become a real FK, or should the misleading `calledByUser()` relationship be removed/renamed to reflect string storage? (`backend/app/Models/Queue.php:46-49`, `backend/app/Models/Queue.php:83-91`)
- Is there an intended service layer boundary for queue lifecycle rules, or is controller-centric Laravel acceptable for the current project size? (`backend/app/Http/Controllers/Api/QueuesController.php:18-555`)
- Is frontend E2E/browser coverage planned for kiosk/display/loket flows? Current discovered tests are backend feature/unit tests, while frontend package scripts expose lint/build/start/dev (`frontend/package.json:6-8`).
- Should legacy `tv.html` have a documented manual smoke script/checklist in repo docs, separate from React display QA? (`frontend/public/tv.html:103-388`)

## 8. Recommended next step

- Recommend: parallel.
- Track A: PRD/spec alignment first for business/version drift and current supported surfaces. Fix wording like Laravel 11 vs Laravel 13 in a docs-only pass after human confirmation (`prd.md:4`, `backend/composer.json:10`).
- Track B: small architecture hardening spike around queue lifecycle extraction. Start with read-only design of a `QueueLifecycleService` boundary, then migrate one low-risk method with existing `QueueDateSafetyTest`/`RoleAccessTest` coverage (`backend/tests/Feature/QueueDateSafetyTest.php`, `backend/tests/Feature/RoleAccessTest.php`, `backend/app/Http/Controllers/Api/QueuesController.php:158-478`).
- Track C: auth/RBAC regression safety. Any auth/login/impersonation route change should first run/extend `RoleAccessTest` because route middleware, frontend guards, and axios 401 redirect exclusions are coupled (`backend/routes/api.php:50-129`, `frontend/lib/api.ts:21-40`, `frontend/app/(admin)/layout.tsx:26-46`, `frontend/app/loket/layout.tsx:29-34`).
