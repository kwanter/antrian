<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

class UsersController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = User::with('counter', 'assignedCounters');

        if ($request->has('role')) {
            $query->where('role', $request->role);
        }

        if ($request->has('is_active')) {
            $query->where('is_active', $request->boolean('is_active'));
        }

        if ($request->has('search')) {
            $query->where('name', 'like', '%' . $request->search . '%')
                ->orWhere('email', 'like', '%' . $request->search . '%');
        }

        $users = $query->latest()->paginate($request->get('per_page', 15));

        return response()->json([
            'data' => $users->items(),
            'meta' => [
                'current_page' => $users->currentPage(),
                'last_page' => $users->lastPage(),
                'per_page' => $users->perPage(),
                'total' => $users->total(),
            ],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $request->validate([
            'name' => 'required|string|max:100',
            'email' => 'required|email|unique:users,email',
            'password' => 'required|string|min:6',
            'role' => 'required|in:admin,loket,super',
            'is_active' => 'sometimes|boolean',
            'counter_id' => 'nullable|exists:counters,id',
        ]);

        $user = User::create([
            'name' => $request->name,
            'email' => $request->email,
            'password' => Hash::make($request->password),
            'role' => $request->role,
            'is_active' => $request->boolean('is_active', true),
            'counter_id' => $request->counter_id,
        ]);

        AuditLog::log(
            action: 'create',
            model: 'User',
            modelId: $user->id,
            changes: ['name' => $user->name, 'email' => $user->email, 'role' => $user->role],
            ipAddress: $request->ip(),
            userId: $request->user()?->id
        );

        return response()->json([
            'data' => $user->load('counter', 'assignedCounters'),
            'message' => 'User created successfully',
        ], 201);
    }

    public function show(User $user): JsonResponse
    {
        return response()->json([
            'data' => $user->load('counter', 'assignedCounters'),
        ]);
    }

    public function update(Request $request, User $user): JsonResponse
    {
        $oldData = $user->toArray();

        $rules = [
            'name' => 'sometimes|string|max:100',
            'email' => 'sometimes|email|unique:users,email,' . $user->id,
            'role' => 'sometimes|in:admin,loket,super',
            'is_active' => 'sometimes|boolean',
            'counter_id' => 'nullable|exists:counters,id',
        ];

        // Only validate password if provided
        if ($request->has('password')) {
            $rules['password'] = 'string|min:6';
        }

        $request->validate($rules);

        $updateData = $request->only(['name', 'email', 'role', 'is_active', 'counter_id']);
        
        if ($request->has('password')) {
            $updateData['password'] = Hash::make($request->password);
        }

        $user->update($updateData);

        AuditLog::log(
            action: 'update',
            model: 'User',
            modelId: $user->id,
            changes: ['before' => $oldData, 'after' => $user->toArray()],
            ipAddress: $request->ip(),
            userId: $request->user()?->id
        );

        return response()->json([
            'data' => $user->load('counter', 'assignedCounters'),
            'message' => 'User updated successfully',
        ]);
    }

    public function destroy(Request $request, User $user): JsonResponse
    {
        // Prevent self-delete
        if ($user->id === $request->user()?->id) {
            return response()->json([
                'message' => 'Cannot delete your own account',
            ], 400);
        }

        $oldData = $user->toArray();
        $user->delete();

        AuditLog::log(
            action: 'delete',
            model: 'User',
            modelId: $user->id,
            changes: $oldData,
            ipAddress: $request->ip(),
            userId: $request->user()?->id
        );

        return response()->json([
            'message' => 'User deleted successfully',
        ]);
    }
}