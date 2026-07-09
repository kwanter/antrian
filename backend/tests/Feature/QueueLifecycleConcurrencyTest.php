<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Counter;
use App\Models\Queue;
use App\Models\QueueLog;
use App\Services\Exceptions\QueueLifecycleException;
use App\Services\QueueLifecycleService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Regression tests for Cluster 4 (Queue Race Safety).
 *
 * These tests verify the transaction + lockForUpdate + status-recheck guards
 * that wrap call/recall/skip/complete/store (F-05, F-06, F-07, F-27, F-37).
 *
 * Concurrency within a single PHP process cannot truly race two requests, so
 * these tests instead prove the recheck guard: after simulating a transition
 * that lands the queue into a state the method no longer accepts, the second
 * attempt must be rejected, not silently double-apply. Live multi-process
 * races on MySQL/Postgres still warrant a separate load test (deferred).
 */
class QueueLifecycleConcurrencyTest extends TestCase
{
    use RefreshDatabase;

    private QueueLifecycleService $service;

    protected function setUp(): void
    {
        parent::setUp();
        $this->service = app(QueueLifecycleService::class);
    }

    public function test_call_rejects_when_queue_already_called_under_lock(): void
    {
        [$counter, $loket, $queue] = $this->setupCalledQueue();

        // The queue is already called. A second call() must be rejected by
        // the locked recheck, not double-transition.
        try {
            $this->service->call($queue->fresh(), $loket);
            $this->fail('Expected invalid-status exception on second call.');
        } catch (QueueLifecycleException $e) {
            $this->assertStringContainsStringIgnoringCase('waiting', $e->getMessage());
        }

        // Exactly one QueueLog for call (the first one), no duplicate.
        $this->assertSame(
            1,
            QueueLog::where('queue_id', $queue->id)->where('action', 'called')->count(),
            'Second call must not create a duplicate QueueLog.'
        );
    }

    public function test_skip_rejects_when_queue_already_skipped(): void
    {
        [$counter, $loket, $queue] = $this->setupSkippedQueue();

        try {
            $this->service->skip($queue->fresh(), $loket);
            $this->fail('Expected invalid-status exception on second skip.');
        } catch (QueueLifecycleException $e) {
            $this->assertStringContainsStringIgnoringCase('skip', $e->getMessage());
        }

        $this->assertSame(
            1,
            QueueLog::where('queue_id', $queue->id)->where('action', 'skipped')->count()
        );
    }

    public function test_skip_applies_today_only_guard(): void
    {
        [$counter, $loket, $queue] = $this->setupWaitingQueue();
        // Force the queue to yesterday.
        Queue::whereKey($queue->id)->update(['created_at' => now()->subDay()]);

        try {
            $this->service->skip($queue->fresh(), $loket);
            $this->fail('Expected not-today exception.');
        } catch (QueueLifecycleException $e) {
            $this->assertStringContainsStringIgnoringCase('today', $e->getMessage());
        }

        $this->assertSame('waiting', $queue->fresh()->status);
    }

    public function test_recall_rejects_when_queue_is_waiting(): void
    {
        // recall only accepts called/serving/skipped. A waiting queue must
        // be rejected by the locked recheck.
        [$counter, $loket, $queue] = $this->setupWaitingQueue();

        try {
            $this->service->recall($queue->fresh(), $loket);
            $this->fail('Expected invalid-status exception on recall of waiting queue.');
        } catch (QueueLifecycleException $e) {
            $this->assertStringContainsStringIgnoringCase('called', $e->getMessage());
        }

        $this->assertSame(
            0,
            QueueLog::where('queue_id', $queue->id)->where('action', 'recalled')->count()
        );
    }

    public function test_store_writes_ticket_under_transaction(): void
    {
        // F-05: ticket generation + Queue::create are inside a transaction.
        // If the create fails partway, the QueueLog should not be orphaned.
        // This is a smoke test of the transaction wrapping; a true race
        // requires a separate load harness.
        $layanan = \App\Models\Layanan::factory()->create();
        $layanan->counter()->associate(Counter::factory()->create());
        $layanan->save();

        $queue = $this->service->store([
            'layanan_id' => $layanan->id,
            'service_type' => null,
        ]);

        $this->assertNotNull($queue->ticket_number);
        $this->assertSame('waiting', $queue->status);
        $this->assertDatabaseHas('queue_logs', [
            'queue_id' => $queue->id,
            'action' => 'created',
        ]);
    }

    /**
     * @return array{0:Counter,1:\App\Models\User,2:Queue}
     */
    private function setupWaitingQueue(): array
    {
        $counter = Counter::factory()->create();
        $loket = \App\Models\User::factory()->create([
            'role' => 'loket',
            'is_active' => true,
            'counter_id' => $counter->id,
        ]);
        $counter->users()->attach($loket->id, ['assigned_at' => now()]);

        $queue = Queue::create([
            'ticket_number' => 'A001',
            'service_type' => 'CS',
            'counter_id' => $counter->id,
            'status' => 'waiting',
            'created_at' => now(),
        ]);

        return [$counter, $loket, $queue];
    }

    /**
     * @return array{0:Counter,1:\App\Models\User,2:Queue}
     */
    private function setupCalledQueue(): array
    {
        [$counter, $loket, $queue] = $this->setupWaitingQueue();
        $this->service->call($queue, $loket);

        return [$counter, $loket, $queue];
    }

    /**
     * @return array{0:Counter,1:\App\Models\User,2:Queue}
     */
    private function setupSkippedQueue(): array
    {
        [$counter, $loket, $queue] = $this->setupWaitingQueue();
        $this->service->skip($queue, $loket);

        return [$counter, $loket, $queue];
    }
}
