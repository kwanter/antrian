<?php

namespace Tests\Feature;

use App\Models\Counter;
use App\Models\Layanan;
use App\Models\Queue;
use App\Models\User;
use App\Services\Exceptions\QueueLifecycleException;
use App\Services\QueueLifecycleService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Unit-style coverage for the extracted QueueLifecycleService::recall().
 *
 * Complements RoleAccessTest (HTTP-level RBAC) and QueueDateSafetyTest
 * (date guards) by exercising the service directly, including the audit
 * crediting behavior that matters for admin impersonation.
 */
class QueueLifecycleServiceTest extends TestCase
{
    use RefreshDatabase;

    private QueueLifecycleService $service;

    protected function setUp(): void
    {
        parent::setUp();
        $this->service = app(QueueLifecycleService::class);
    }

    private function loketWithCounter(): User
    {
        $counter = Counter::factory()->create();
        $user = User::factory()->create([
            'role' => 'loket',
            'is_active' => true,
            'counter_id' => $counter->id,
        ]);
        $counter->users()->attach($user->id, ['assigned_at' => now()]);

        return $user;
    }

    private function queueFor(Counter $counter, string $status = 'called'): Queue
    {
        return Queue::create([
            'ticket_number' => 'T001',
            'service_type' => 'CS',
            'counter_id' => $counter->id,
            'customer_name' => 'Test',
            'status' => $status,
            'created_at' => now(),
        ]);
    }

    public function test_recall_throws_for_old_day_queue(): void
    {
        $loket = $this->loketWithCounter();
        $queue = $this->queueFor($loket->counter, 'called');
        // Force the queue to look like yesterday.
        $queue->forceFill(['created_at' => now()->subDay()])->saveQuietly();
        $queue->refresh();

        $this->expectException(QueueLifecycleException::class);
        $this->expectExceptionMessage('Queue is not from today');

        try {
            $this->service->recall($queue, $loket);
        } catch (QueueLifecycleException $e) {
            $this->assertSame('QUEUE_NOT_TODAY', $e->errorCode());
            $this->assertSame(422, $e->statusCode());
            throw $e;
        }
    }

    public function test_recall_throws_forbidden_for_foreign_counter(): void
    {
        $loket = $this->loketWithCounter();
        $otherCounter = Counter::factory()->create();
        $foreign = $this->queueFor($otherCounter, 'called');

        try {
            $this->service->recall($foreign, $loket);
            $this->fail('Expected QueueLifecycleException for foreign counter');
        } catch (QueueLifecycleException $e) {
            $this->assertSame('FORBIDDEN', $e->errorCode());
            $this->assertSame(403, $e->statusCode());
        }
    }

    public function test_recall_transitions_skipped_queue_back_to_called(): void
    {
        $loket = $this->loketWithCounter();
        $queue = $this->queueFor($loket->counter, 'skipped');

        $result = $this->service->recall($queue, $loket);

        $this->assertSame('called', $result->status);
        $this->assertDatabaseHas('queues', [
            'id' => $queue->id,
            'status' => 'called',
        ]);
        // QueueLog records the recall action.
        $this->assertDatabaseHas('queue_logs', [
            'queue_id' => $queue->id,
            'action' => QueueLifecycleService::LOG_RECALLED,
        ]);
    }

    public function test_recall_credits_explicit_audit_user_id(): void
    {
        // Simulates an admin previewing as loket: the acting identity is the
        // loket, but the audit log must credit the real admin (impersonator).
        $loket = $this->loketWithCounter();
        $admin = User::factory()->create(['role' => 'admin', 'is_active' => true]);
        $queue = $this->queueFor($loket->counter, 'called');

        $this->service->recall(
            queue: $queue,
            actor: $loket,
            auditUserId: $admin->id,
        );

        $this->assertDatabaseHas('audit_logs', [
            'action' => QueueLifecycleService::AUDIT_RECALL,
            'model_id' => $queue->id,
            'user_id' => $admin->id,
        ]);
        // And must NOT credit the impersonated loket.
        $this->assertDatabaseMissing('audit_logs', [
            'action' => QueueLifecycleService::AUDIT_RECALL,
            'model_id' => $queue->id,
            'user_id' => $loket->id,
        ]);
    }

    public function test_recall_defaults_audit_credit_to_actor(): void
    {
        $loket = $this->loketWithCounter();
        $queue = $this->queueFor($loket->counter, 'called');

        $this->service->recall($queue, $loket);

        $this->assertDatabaseHas('audit_logs', [
            'action' => QueueLifecycleService::AUDIT_RECALL,
            'model_id' => $queue->id,
            'user_id' => $loket->id,
        ]);
    }

    public function test_skip_throws_for_foreign_counter(): void
    {
        $loket = $this->loketWithCounter();
        $otherCounter = Counter::factory()->create();
        $foreign = $this->queueFor($otherCounter, 'waiting');

        try {
            $this->service->skip($foreign, $loket);
            $this->fail('Expected QueueLifecycleException for foreign counter');
        } catch (QueueLifecycleException $e) {
            $this->assertSame('FORBIDDEN', $e->errorCode());
            $this->assertSame(403, $e->statusCode());
        }
    }

    public function test_skip_throws_for_invalid_status(): void
    {
        $loket = $this->loketWithCounter();
        $queue = $this->queueFor($loket->counter, 'completed');

        try {
            $this->service->skip($queue, $loket);
            $this->fail('Expected QueueLifecycleException for invalid status');
        } catch (QueueLifecycleException $e) {
            $this->assertSame('INVALID_STATUS', $e->errorCode());
            $this->assertSame(400, $e->statusCode());
            $this->assertSame('Queue cannot be skipped in current status', $e->getMessage());
        }
    }

    public function test_skip_transitions_waiting_queue_to_skipped(): void
    {
        $loket = $this->loketWithCounter();
        $queue = $this->queueFor($loket->counter, 'waiting');

        $result = $this->service->skip($queue, $loket);

        $this->assertSame('skipped', $result->status);
        $this->assertDatabaseHas('queues', [
            'id' => $queue->id,
            'status' => 'skipped',
        ]);
        $this->assertDatabaseHas('queue_logs', [
            'queue_id' => $queue->id,
            'action' => QueueLifecycleService::LOG_SKIPPED,
            'performed_by' => $loket->name,
        ]);
    }

    public function test_skip_credits_explicit_audit_user_id(): void
    {
        $loket = $this->loketWithCounter();
        $admin = User::factory()->create(['role' => 'admin', 'is_active' => true]);
        $queue = $this->queueFor($loket->counter, 'called');

        $this->service->skip(
            queue: $queue,
            actor: $loket,
            auditUserId: $admin->id,
        );

        $this->assertDatabaseHas('audit_logs', [
            'action' => QueueLifecycleService::AUDIT_SKIP,
            'model_id' => $queue->id,
            'user_id' => $admin->id,
        ]);
        $this->assertDatabaseMissing('audit_logs', [
            'action' => QueueLifecycleService::AUDIT_SKIP,
            'model_id' => $queue->id,
            'user_id' => $loket->id,
        ]);
    }

    // ── call() tests ──────────────────────────────────────────────

    public function test_call_throws_for_foreign_counter_loket(): void
    {
        $loket = $this->loketWithCounter();
        $otherCounter = Counter::factory()->create();
        $foreign = $this->queueFor($otherCounter, 'waiting');

        try {
            $this->service->call($foreign, $loket);
            $this->fail('Expected QueueLifecycleException for foreign counter');
        } catch (QueueLifecycleException $e) {
            $this->assertSame('FORBIDDEN', $e->errorCode());
            $this->assertSame(403, $e->statusCode());
        }
    }

    public function test_call_throws_for_old_day_queue(): void
    {
        $loket = $this->loketWithCounter();
        $queue = $this->queueFor($loket->counter, 'waiting');
        $queue->forceFill(['created_at' => now()->subDay()])->saveQuietly();
        $queue->refresh();

        try {
            $this->service->call($queue, $loket);
        } catch (QueueLifecycleException $e) {
            $this->assertSame('QUEUE_NOT_TODAY', $e->errorCode());
            $this->assertSame(422, $e->statusCode());

            return;
        }
        $this->fail('Expected QueueLifecycleException for old-day queue');
    }

    public function test_call_throws_for_non_waiting_status(): void
    {
        $loket = $this->loketWithCounter();
        $queue = $this->queueFor($loket->counter, 'called');

        try {
            $this->service->call($queue, $loket);
        } catch (QueueLifecycleException $e) {
            $this->assertSame('INVALID_STATUS', $e->errorCode());
            $this->assertSame(400, $e->statusCode());

            return;
        }
        $this->fail('Expected QueueLifecycleException for non-waiting status');
    }

    public function test_call_transitions_waiting_to_called(): void
    {
        $loket = $this->loketWithCounter();
        $queue = $this->queueFor($loket->counter, 'waiting');

        $result = $this->service->call($queue, $loket);

        $this->assertSame('called', $result->status);
        $this->assertDatabaseHas('queues', [
            'id' => $queue->id,
            'status' => 'called',
        ]);
        $this->assertDatabaseHas('queue_logs', [
            'queue_id' => $queue->id,
            'action' => QueueLifecycleService::LOG_CALLED,
            'performed_by' => $loket->name,
        ]);
        $this->assertDatabaseHas('audit_logs', [
            'action' => QueueLifecycleService::AUDIT_CALL,
            'model_id' => $queue->id,
            'user_id' => $loket->id,
        ]);
    }

    public function test_call_uses_counter_id_override(): void
    {
        $admin = User::factory()->create(['role' => 'admin', 'is_active' => true]);
        $counter = Counter::factory()->create();
        $overrideCounter = Counter::factory()->create();
        $queue = $this->queueFor($counter, 'waiting');

        $result = $this->service->call($queue, $admin, counterIdOverride: $overrideCounter->id);

        // Admin has no fixed counter_id, so the override is used for the call.
        $this->assertSame('called', $result->status);
        $this->assertDatabaseHas('queues', [
            'id' => $queue->id,
            'status' => 'called',
            'counter_id' => $overrideCounter->id,
        ]);
    }

    // ── callNext() tests ──────────────────────────────────────────

    public function test_call_next_throws_for_foreign_counter(): void
    {
        $loket = $this->loketWithCounter();
        $otherCounter = Counter::factory()->create();

        try {
            $this->service->callNext($otherCounter->id, $loket);
        } catch (QueueLifecycleException $e) {
            $this->assertSame('FORBIDDEN', $e->errorCode());
            $this->assertSame(403, $e->statusCode());

            return;
        }
        $this->fail('Expected QueueLifecycleException for foreign counter');
    }

    public function test_call_next_throws_for_missing_counter(): void
    {
        $admin = User::factory()->create(['role' => 'admin', 'is_active' => true]);

        try {
            $this->service->callNext(999_999, $admin);
        } catch (QueueLifecycleException $e) {
            $this->assertSame('NOT_FOUND', $e->errorCode());
            $this->assertSame(404, $e->statusCode());
            $this->assertSame('Counter not found', $e->getMessage());

            return;
        }
        $this->fail('Expected QueueLifecycleException for missing counter');
    }

    public function test_call_next_throws_when_no_waiting_queue(): void
    {
        $loket = $this->loketWithCounter();

        try {
            $this->service->callNext($loket->counter_id, $loket);
        } catch (QueueLifecycleException $e) {
            $this->assertSame('NOT_FOUND', $e->errorCode());
            $this->assertSame(404, $e->statusCode());
            $this->assertSame('No waiting queue found', $e->getMessage());

            return;
        }
        $this->fail('Expected QueueLifecycleException for empty queue');
    }

    public function test_call_next_picks_oldest_waiting_queue(): void
    {
        $loket = $this->loketWithCounter();
        $old = $this->queueFor($loket->counter, 'waiting');
        $old->forceFill(['created_at' => now()->subMinutes(10)])->saveQuietly();
        $old->refresh();
        $new = $this->queueFor($loket->counter, 'waiting');

        $result = $this->service->callNext($loket->counter_id, $loket);

        $this->assertSame($old->id, $result->id);
        $this->assertDatabaseHas('queues', ['id' => $old->id, 'status' => 'called']);
        $this->assertDatabaseHas('queues', ['id' => $new->id, 'status' => 'waiting']);
        $this->assertDatabaseHas('queue_logs', [
            'queue_id' => $old->id,
            'action' => QueueLifecycleService::LOG_CALLED,
            'performed_by' => $loket->name,
        ]);
        $this->assertDatabaseHas('audit_logs', [
            'action' => QueueLifecycleService::AUDIT_CALL_NEXT,
            'model_id' => $old->id,
            'user_id' => $loket->id,
        ]);
    }

    // ── complete() tests ──────────────────────────────────────────

    public function test_complete_throws_for_foreign_counter(): void
    {
        $loket = $this->loketWithCounter();
        $otherCounter = Counter::factory()->create();
        $foreign = $this->queueFor($otherCounter, 'called');

        try {
            $this->service->complete($foreign, $loket);
        } catch (QueueLifecycleException $e) {
            $this->assertSame('FORBIDDEN', $e->errorCode());
            $this->assertSame(403, $e->statusCode());

            return;
        }
        $this->fail('Expected QueueLifecycleException for foreign counter');
    }

    public function test_complete_throws_for_invalid_status(): void
    {
        $loket = $this->loketWithCounter();
        $queue = $this->queueFor($loket->counter, 'waiting');

        try {
            $this->service->complete($queue, $loket);
        } catch (QueueLifecycleException $e) {
            $this->assertSame('INVALID_STATUS', $e->errorCode());
            $this->assertSame(400, $e->statusCode());
            $this->assertSame('Queue is not in called or serving status', $e->getMessage());

            return;
        }
        $this->fail('Expected QueueLifecycleException for invalid status');
    }

    public function test_complete_transitions_called_queue_to_completed(): void
    {
        $loket = $this->loketWithCounter();
        $queue = $this->queueFor($loket->counter, 'called');
        $queue->forceFill(['called_at' => now()->subMinutes(3)])->saveQuietly();
        $queue->refresh();

        $result = $this->service->complete($queue, $loket);

        $this->assertSame('completed', $result->status);
        $this->assertNotNull($result->completed_at);
        $this->assertDatabaseHas('queues', [
            'id' => $queue->id,
            'status' => 'completed',
        ]);
        // QueueLog records completed action with a duration metadata entry.
        $this->assertDatabaseHas('queue_logs', [
            'queue_id' => $queue->id,
            'action' => QueueLifecycleService::LOG_COMPLETED,
            'performed_by' => $loket->name,
        ]);
        $this->assertDatabaseHas('audit_logs', [
            'action' => QueueLifecycleService::AUDIT_COMPLETE,
            'model_id' => $queue->id,
            'user_id' => $loket->id,
        ]);
    }

    public function test_complete_credits_explicit_audit_user_id(): void
    {
        $loket = $this->loketWithCounter();
        $admin = User::factory()->create(['role' => 'admin', 'is_active' => true]);
        $queue = $this->queueFor($loket->counter, 'serving');

        $this->service->complete(
            queue: $queue,
            actor: $loket,
            auditUserId: $admin->id,
        );

        $this->assertDatabaseHas('audit_logs', [
            'action' => QueueLifecycleService::AUDIT_COMPLETE,
            'model_id' => $queue->id,
            'user_id' => $admin->id,
        ]);
        $this->assertDatabaseMissing('audit_logs', [
            'action' => QueueLifecycleService::AUDIT_COMPLETE,
            'model_id' => $queue->id,
            'user_id' => $loket->id,
        ]);
    }

    // ── store() tests ─────────────────────────────────────────────

    public function test_store_creates_queue_with_default_ticket_prefix(): void
    {
        $queue = $this->service->store([
            'service_type' => 'Consultation',
        ]);

        $this->assertSame('waiting', $queue->status);
        $this->assertStringStartsWith('A', $queue->ticket_number);
        $this->assertSame('Consultation', $queue->service_type);
        $this->assertNull($queue->layanan_id);
        $this->assertDatabaseHas('queue_logs', [
            'queue_id' => $queue->id,
            'action' => QueueLifecycleService::LOG_CREATED,
            'performed_by' => 'kiosk',
        ]);
    }

    public function test_store_creates_queue_with_layanan_prefix(): void
    {
        $counter = Counter::factory()->create();
        $layanan = Layanan::factory()->create([
            'code' => 'TELLER',
            'counter_id' => $counter->id,
        ]);

        $queue = $this->service->store([
            'layanan_id' => $layanan->id,
        ]);

        $this->assertStringStartsWith('TEL', $queue->ticket_number);
        $this->assertSame($layanan->id, $queue->layanan_id);
        $this->assertSame($counter->id, $queue->counter_id);
    }

    public function test_store_increments_ticket_number(): void
    {
        // First ticket
        $q1 = $this->service->store(['service_type' => 'A']);
        // Second ticket
        $q2 = $this->service->store(['service_type' => 'B']);

        preg_match('/(\d+)$/', $q1->ticket_number, $m1);
        preg_match('/(\d+)$/', $q2->ticket_number, $m2);

        $this->assertSame((int) $m1[1] + 1, (int) $m2[1]);
    }
}
