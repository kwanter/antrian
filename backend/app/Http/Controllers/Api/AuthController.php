<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function login(Request $request): JsonResponse
    {
        $request->validate([
            'email' => 'required|email',
            'password' => 'required|string',
        ]);

        $user = \App\Models\User::where('email', $request->email)->first();

        if (!$user || !Hash::check($request->password, $user->password)) {
            throw ValidationException::withMessages([
                'email' => ['The provided credentials are incorrect.'],
            ]);
        }

        if (!$user->is_active) {
            throw ValidationException::withMessages([
                'email' => ['This account is inactive.'],
            ]);
        }

        // Check counter assignment for loket users
        if ($user->isLoket() && !$user->counter_id && $user->assignedCounters()->count() === 0) {
            throw ValidationException::withMessages([
                'email' => ['This account is not assigned to any counter.'],
            ]);
        }

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
        return response()->json([
            'data' => $request->user()->load('counter.layanan', 'assignedCounters'),
        ]);
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
}