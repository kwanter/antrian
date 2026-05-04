<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->enum('role', ['admin', 'loket', 'super'])->default('loket')->after('email');
            $table->boolean('is_active')->default(true)->after('role');
            $table->foreignId('counter_id')->nullable()->constrained('counters')->nullOnDelete()->after('is_active');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropForeign(['counter_id']);
            $table->dropColumn(['role', 'is_active', 'counter_id']);
        });
    }
};