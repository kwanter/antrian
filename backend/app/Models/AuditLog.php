<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AuditLog extends Model
{
    use HasFactory;

    public $timestamps = false;

    /**
     * Keys redacted from the `changes` payload before persistence. Even when
     * a model hides a field via $hidden, controllers snapshot raw rows via
     * toArray() before/after updates. This central redaction is the
     * last-line guarantee that secrets never enter the audit trail.
     * Closes F-18 / T6 F-S2 / T8 F-4.
     */
    private const REDACTED_KEYS = [
        'bridge_token',
        'password',
        'remember_token',
    ];

    /** Replacement value for any redacted key. */
    private const REDACTED_VALUE = '(redacted)';

    protected $fillable = [
        'user_id',
        'action',
        'model',
        'model_id',
        'changes',
        'ip_address',
        'created_at',
    ];

    protected function casts(): array
    {
        return [
            'changes' => 'array',
            'created_at' => 'datetime',
        ];
    }

    // Relationships
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    // Static helpers
    public static function log(
        string $action,
        string $model,
        ?int $modelId = null,
        ?array $changes = null,
        ?string $ipAddress = null,
        ?int $userId = null
    ): self {
        return self::create([
            'user_id' => $userId,
            'action' => $action,
            'model' => $model,
            'model_id' => $modelId,
            'changes' => self::redact($changes),
            'ip_address' => $ipAddress,
            'created_at' => now(),
        ]);
    }

    /**
     * Recursively replace any REDACTED_KEYS value with REDACTED_VALUE.
     * Handles before/after nested snapshots and flat arrays.
     */
    private static function redact(?array $changes): ?array
    {
        if ($changes === null) {
            return null;
        }

        foreach ($changes as $key => $value) {
            if (is_string($key) && in_array($key, self::REDACTED_KEYS, true)) {
                $changes[$key] = self::REDACTED_VALUE;
            } elseif (is_array($value)) {
                $changes[$key] = self::redact($value);
            }
        }

        return $changes;
    }
}