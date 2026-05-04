<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('kiosk_stations', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('bridge_token')->unique();
            $table->enum('status', ['online', 'offline'])->default('offline');
            $table->timestamp('last_heartbeat')->nullable();
            $table->foreignId('printer_profile_id')->nullable()->constrained('printer_profiles')->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('kiosk_stations');
    }
};