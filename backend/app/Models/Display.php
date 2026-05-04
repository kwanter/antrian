<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Display extends Model
{
    use HasFactory;

    protected $fillable = ['name', 'location', 'is_active', 'settings'];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
            'settings' => 'array',
        ];
    }

    // Relationships
    public function videos(): HasMany
    {
        return $this->hasMany(Video::class)->orderBy('playlist_order');
    }

    public function activeVideos(): HasMany
    {
        return $this->hasMany(Video::class)->where('is_active', true)->orderBy('playlist_order');
    }

    // Helpers
    public function isActive(): bool
    {
        return $this->is_active;
    }
}