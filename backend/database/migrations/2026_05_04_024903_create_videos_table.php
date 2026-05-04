<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('videos', function (Blueprint $table) {
            $table->id();
            $table->foreignId('display_id')->constrained()->cascadeOnDelete();
            $table->string('file_url');
            $table->string('title');
            $table->integer('duration')->nullable();
            $table->decimal('volume_level', 3, 2)->default(1.00);
            $table->boolean('is_active')->default(true);
            $table->integer('playlist_order')->default(0);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('videos');
    }
};