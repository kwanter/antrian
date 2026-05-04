<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class KioskStation extends Model
{
    use HasFactory;

    protected $fillable = [
        'name',
        'bridge_token',
        'status',
        'last_heartbeat',
        'printer_profile_id',
    ];

    protected function casts(): array
    {
        return [
            'last_heartbeat' => 'datetime',
        ];
    }

    // Relationships
    public function printerProfile(): BelongsTo
    {
        return $this->belongsTo(PrinterProfile::class, 'printer_profile_id');
    }

    // Helpers
    public function isOnline(): bool
    {
        return $this->status === 'online';
    }

    public function isOffline(): bool
    {
        return $this->status === 'offline';
    }

    public function updateHeartbeat(): void
    {
        $this->update([
            'status' => 'online',
            'last_heartbeat' => now(),
        ]);
    }
}