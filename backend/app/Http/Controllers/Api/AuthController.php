<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;

class AuthController extends Controller
{
    public function login(Request $request): JsonResponse
    {
        $request->validate([
            'email' => 'required|email',
            'password' => 'required|string',
        ]);

        // Rate limit: 5 attempts per 60 seconds per email+IP
        $throttleKey = 'login:' . Str::lower($request->email) . '|' . $request->ip();

        if (RateLimiter::tooManyAttempts($throttleKey, 5)) {
            $seconds = RateLimiter::availableIn($throttleKey);
            return response()->json([
                'message' => 'Terlalu banyak percobaan login. Coba lagi dalam ' . $seconds . ' detik.',
                'code' => 'TOO_MANY_ATTEMPTS',
            ], 429);
        }

        $user = \App\Models\User::where('email', $request->email)->first();

        if (!$user || !Hash::check($request->password, $user->password)) {
            RateLimiter::hit($throttleKey, 60);
            return response()->json([
                'message' => 'Email atau password salah.',
                'code' => 'INVALID_CREDENTIALS',
            ], 401);
        }

        if (!$user->is_active) {
            return response()->json([
                'message' => 'Akun Anda tidak aktif. Hubungi admin.',
                'code' => 'ACCOUNT_INACTIVE',
            ], 403);
        }

        // Check counter assignment for loket users
        if ($user->isLoket() && !$user->counter_id && $user->assignedCounters()->count() === 0) {
            return response()->json([
                'message' => 'Akun loket belum ditugaskan ke loket manapun. Hubungi admin.',
                'code' => 'COUNTER_NOT_ASSIGNED',
            ], 403);
        }

        RateLimiter::clear($throttleKey);

        Auth::login($user);
        $request->session()->regenerate();

        // Audit log
        AuditLog::log(
            action: 'login',
            model: 'User',
            modelId: $user->id,
            changes: null,
            ipAddress: $request->ip(),
            userId: $user->id
        );

        return response()->json([
            'data' => [
                'user' => $user->load('counter.layanan', 'assignedCounters'),
            ],
            'message' => 'Login successful',
        ]);
    }

    public function logout(Request $request): JsonResponse
    {
        $user = $request->user();

        // Audit log
        AuditLog::log(
            action: 'logout',
            model: 'User',
            modelId: $user->id,
            changes: null,
            ipAddress: $request->ip(),
            userId: $user->id
        );

        // Logout from web session (Sanctum session cookie auth)
        Auth::guard('web')->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->json([
            'message' => 'Logout successful',
        ]);
    }

    public function me(Request $request): JsonResponse
    {
        $user = $request->user()->load('counter.layanan', 'assignedCounters');
        $impersonatorId = $request->session()->get('impersonator_id');

        $response = ['data' => $user];

        if ($impersonatorId) {
            $impersonator = \App\Models\User::find($impersonatorId);
            $response['is_impersonating'] = true;
            $response['impersonator'] = $impersonator ? [
                'id' => $impersonator->id,
                'name' => $impersonator->name,
                'email' => $impersonator->email,
                'role' => $impersonator->role,
            ] : null;
        }

        return response()->json($response);
    }

    public function refreshToken(Request $request): JsonResponse
    {
        $user = $request->user();

        // Regenerate session to rotate session ID
        $request->session()->regenerate();

        return response()->json([
            'data' => [
                'user' => $user->load('counter.layanan', 'assignedCounters'),
            ],
            'message' => 'Session refreshed',
        ]);
    }

    /**
     * Admin/super: temporarily assume a loket user's identity for preview.
     * Original admin session is preserved in session storage so it can be
     * restored via stopImpersonation().
     */
    public function impersonate(Request $request, int $userId): JsonResponse
    {
        $admin = $request->user();

        // Defense in depth: route middleware already enforces admin/super.
        if (!$admin->isAdmin() && !$admin->isSuper()) {
            return response()->json([
                'message' => 'Hanya admin/super yang dapat mengimpersonasi.',
            ], 403);
        }

        $target = \App\Models\User::find($userId);
        if (!$target) {
            return response()->json([
                'message' => 'User target tidak ditemukan.',
                'code' => 'USER_NOT_FOUND',
            ], 404);
        }

        // Only loket users can be impersonated; admin can never preview as
        // another admin (would mask their own identity for audit purposes).
        if (!$target->isLoket()) {
            return response()->json([
                'message' => 'Hanya akun loket yang dapat di-preview.',
                'code' => 'NOT_LOKET_USER',
            ], 422);
        }

        if (!$target->is_active) {
            return response()->json([
                'message' => 'Akun target tidak aktif.',
                'code' => 'TARGET_INACTIVE',
            ], 422);
        }

        if (!$target->counter_id && $target->assignedCounters()->count() === 0) {
            return response()->json([
                'message' => 'Akun loket target belum ditugaskan ke loket manapun.',
                'code' => 'TARGET_COUNTER_NOT_ASSIGNED',
            ], 422);
        }

        // Prevent nested impersonation
        if ($request->session()->has('impersonator_id')) {
            return response()->json([
                'message' => 'Sudah dalam mode impersonasi. Stop dulu sebelum impersonasi lagi.',
                'code' => 'ALREADY_IMPERSONATING',
            ], 409);
        }

        // Save current admin id, then log in as the target.
        $request->session()->put('impersonator_id', $admin->id);
        Auth::guard('web')->login($target);
        $request->session()->regenerate();

        AuditLog::log(
            action: 'impersonate.start',
            model: 'User',
            modelId: $target->id,
            changes: ['impersonator_id' => $admin->id, 'target_id' => $target->id],
            ipAddress: $request->ip(),
            userId: $admin->id, // credited to the real admin, not the target
        );

        return response()->json([
            'data' => [
                'user' => $target->load('counter.layanan', 'assignedCounters'),
                'impersonator' => [
                    'id' => $admin->id,
                    'name' => $admin->name,
                    'email' => $admin->email,
                    'role' => $admin->role,
                ],
            ],
            'message' => 'Impersonation started',
        ]);
    }

    /**
     * End impersonation and restore the original admin session.
     */
    public function stopImpersonation(Request $request): JsonResponse
    {
        $impersonatorId = $request->session()->get('impersonator_id');

        if (!$impersonatorId) {
            return response()->json([
                'message' => 'Tidak dalam mode impersonasi.',
                'code' => 'NOT_IMPERSONATING',
            ], 400);
        }

        $impersonator = \App\Models\User::find($impersonatorId);
        if (!$impersonator) {
            // Stale session — just clear it
            $request->session()->forget('impersonator_id');
            return response()->json([
                'message' => 'Impersonator tidak ditemukan. Session dibersihkan.',
            ], 200);
        }

        $target = $request->user();
        $targetId = $target ? $target->id : null;

        // Restore original admin identity
        Auth::guard('web')->login($impersonator);
        $request->session()->forget('impersonator_id');
        $request->session()->regenerate();

        AuditLog::log(
            action: 'impersonate.stop',
            model: 'User',
            modelId: $targetId,
            changes: ['impersonator_id' => $impersonator->id, 'target_id' => $targetId],
            ipAddress: $request->ip(),
            userId: $impersonator->id,
        );

        return response()->json([
            'data' => [
                'user' => $impersonator->load('counter.layanan', 'assignedCounters'),
            ],
            'message' => 'Impersonation stopped',
        ]);
    }
}