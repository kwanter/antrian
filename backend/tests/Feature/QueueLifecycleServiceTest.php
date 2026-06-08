<?php

namespace Tests\Feature;

use App\Models\Counter;
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
}
