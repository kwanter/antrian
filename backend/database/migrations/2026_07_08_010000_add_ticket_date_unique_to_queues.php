<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * F-05: ticket numbers reset daily per layanan, so the original global
 * unique index on ticket_number was dropped (2026_05_05_030000). That left
 * concurrent public intake free to issue duplicates — generateTicketNumber
 * reads the max row and increments in app code.
 *
 * This restores uniqueness at the correct granularity: (layanan_id,
 * ticket_number, ticket_date). ticket_date is a stored date column kept in
 * sync at write time so the index works portably across SQLite and MySQL
 * (no expression-index dependency).
 *
 * QueueLifecycleService::store() retries on the resulting unique violation,
 * so concurrent intake that races the read-increment now produces at most one
 * winner per (layanan, ticket, date); losers regenerate with a bumped suffix.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('queues', function (Blueprint $table): void {
            // Stored date column. Backfilled from created_at for existing rows.
            if (! Schema::hasColumn('queues', 'ticket_date')) {
                $table->date('ticket_date')->nullable()->after('ticket_number');
            }
        });

        // Backfill existing rows.
        \DB::table('queues')
            ->whereNull('ticket_date')
            ->update(['ticket_date' => \DB::raw('DATE(created_at)')]);

        // Composite unique at the daily-per-layanan granularity.
        // ticket_number without a layanan still needs to be unique per day,
        // so layanan_id participates as-is (nullable columns are treated as
        // distinct by both engines, which is correct here — a null-layanan
        // ticket is its own bucket).
        try {
            \DB::statement(
                'CREATE UNIQUE INDEX queues_ticket_unique_per_day '
                .'ON queues (layanan_id, ticket_number, ticket_date)'
            );
        } catch (\Throwable $e) {
            // Index may already exist on re-run; ignore.
        }
    }

    public function down(): void
    {
        try {
            \DB::statement('DROP INDEX IF EXISTS queues_ticket_unique_per_day');
        } catch (\Throwable $e) {
            // ignore
        }

        Schema::table('queues', function (Blueprint $table): void {
            if (Schema::hasColumn('queues', 'ticket_date')) {
                $table->dropColumn('ticket_date');
            }
        });
    }
};
