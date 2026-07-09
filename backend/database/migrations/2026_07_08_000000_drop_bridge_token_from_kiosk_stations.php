<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Drops the unused KioskStation bridge_token infrastructure (F-14 / Decision
 * Log decision-kiosk-token). The column was generated and rotated but never
 * consumed by POST /queues or any kiosk client. Removal is the chosen
 * remediation (Option B).
 *
 * AuditLog.changes central redaction still mentions bridge_token as
 * defense-in-depth for historical log rows written before this migration.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('kiosk_stations', function (Blueprint $table): void {
            if (Schema::hasColumn('kiosk_stations', 'bridge_token')) {
                $table->dropUnique(['bridge_token']);
                $table->dropColumn('bridge_token');
            }
        });
    }

    public function down(): void
    {
        Schema::table('kiosk_stations', function (Blueprint $table): void {
            if (! Schema::hasColumn('kiosk_stations', 'bridge_token')) {
                $table->string('bridge_token')->unique()->nullable();
            }
        });
    }
};
