<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Video extends Model
{
    use HasFactory;

    protected $fillable = [
        'display_id',
        'file_url',
        'title',
        'duration',
        'volume_level',
        'is_active',
        'playlist_order',
    ];

    protected function casts(): array
    {
        return [
            'volume_level' => 'decimal:2',
            'is_active' => 'boolean',
            'duration' => 'integer',
            'playlist_order' => 'integer',
        ];
    }

    // Relationships
    public function display(): BelongsTo
    {
        return $this->belongsTo(Display::class);
    }

    // Helpers
    public function isActive(): bool
    {
        return $this->is_active;
    }
}