<?php

namespace App\Services;

use App\Events\QueueCalled;
use App\Events\QueueSkipped;
use App\Models\AuditLog;
use App\Models\Queue;
use App\Models\QueueLog;
use App\Models\User;
use App\Services\Exceptions\QueueLifecycleException;
use Illuminate\Support\Facades\Log;

/**
 * Encapsulates queue lifecycle state transitions (call/recall/complete/skip/...).
 *
 * Extracted from QueuesController to separate business rules (authorization
 * scope, date-safety, state transitions, logging, broadcasting) from HTTP
 * concerns (request parsing, JSON envelopes, status codes).
 *
 * `recall()` and `skip()` are migrated so far. The remaining lifecycle
 * methods stay in the controller until they are extracted incrementally,
 * each with its own test coverage.
 */
class QueueLifecycleService
{
    /** QueueLog action strings, centralized to prevent drift across methods. */
    public const LOG_RECALLED = 'recalled';

    public const LOG_SKIPPED = 'skipped';

    /** AuditLog action strings. */
    public const AUDIT_RECALL = 'recall';

    public const AUDIT_SKIP = 'skip';

    /**
     * Recall a previously called/serving/skipped queue back to "called".
     *
     * @param  Queue  $queue  The queue to recall.
     * @param  User  $actor  The acting user (loket/admin/super).
     * @param  int|null  $auditUserId  The real user id to credit in the audit
     *                                 log. Pass the impersonator's id when an
     *                                 admin is previewing as loket so the audit
     *                                 trail attributes the action to the real
     *                                 admin (see impersonation pitfall #19).
     *                                 Defaults to $actor->id when null.
     * @param  string|null  $ipAddress  Request IP for the audit log.
     *
     * @throws QueueLifecycleException On auth failure, old-day queue, or invalid status.
     */
    public function recall(
        Queue $queue,
        User $actor,
        ?int $auditUserId = null,
        ?string $ipAddress = null,
    ): Queue {
        if (! $this->canOperateOnCounter($actor, $queue->counter_id)) {
            throw QueueLifecycleException::forbidden('You are not authorized to recall this queue');
        }

        if (! $queue->created_at->isToday()) {
            throw QueueLifecycleException::notToday();
        }

        if (! $queue->isCalled() && ! $queue->isServing() && ! $queue->isSkipped()) {
            throw QueueLifecycleException::invalidStatus('Queue is not in called, serving, or skipped status');
        }

        $fromStatus = $queue->status;
        $counterId = $actor->counter_id ?? $queue->counter_id;

        $queue->call($actor->name, $counterId);

        QueueLog::create([
            'queue_id' => $queue->id,
            'action' => self::LOG_RECALLED,
            'performed_by' => $actor->name,
            'metadata' => ['counter_id' => $counterId],
        ]);

        AuditLog::log(
            action: self::AUDIT_RECALL,
            model: 'Queue',
            modelId: $queue->id,
            changes: ['status' => ['from' => $fromStatus, 'to' => 'called']],
            ipAddress: $ipAddress,
            userId: $auditUserId ?? $actor->id,
        );

        try {
            broadcast(new QueueCalled($queue));
        } catch (\Throwable $e) {
            Log::warning('Broadcast failed: '.$e->getMessage());
        }

        return $queue->load('counter');
    }

    /**
     * Skip a waiting or called queue.
     *
     * Note: unlike `recall()`, the original controller implementation does
     * NOT enforce a today-only guard for skip. That behavior is preserved
     * here; do not add a date-safety check without also adding the
     * corresponding regression test and reviewing `QueueDateSafetyTest`.
     *
     * @param  Queue  $queue  The queue to skip.
     * @param  User  $actor  The acting user (loket/admin/super).
     * @param  int|null  $auditUserId  The real user id to credit in the audit
     *                                 log. Defaults to $actor->id.
     * @param  string|null  $ipAddress  Request IP for the audit log.
     *
     * @throws QueueLifecycleException On auth failure or invalid status.
     */
    public function skip(
        Queue $queue,
        User $actor,
        ?int $auditUserId = null,
        ?string $ipAddress = null,
    ): Queue {
        if (! $this->canOperateOnCounter($actor, $queue->counter_id)) {
            throw QueueLifecycleException::forbidden('You are not authorized to skip this queue');
        }

        if (! $queue->isWaiting() && ! $queue->isCalled()) {
            throw QueueLifecycleException::invalidStatus('Queue cannot be skipped in current status');
        }

        $previousStatus = $queue->status;
        $queue->skip();

        QueueLog::create([
            'queue_id' => $queue->id,
            'action' => self::LOG_SKIPPED,
            'performed_by' => $actor->name,
        ]);

        AuditLog::log(
            action: self::AUDIT_SKIP,
            model: 'Queue',
            modelId: $queue->id,
            changes: ['status' => ['from' => $previousStatus, 'to' => 'skipped']],
            ipAddress: $ipAddress,
            userId: $auditUserId ?? $actor->id,
        );

        try {
            broadcast(new QueueSkipped($queue));
        } catch (\Throwable $e) {
            Log::warning('Broadcast failed: '.$e->getMessage());
        }

        return $queue->load('counter');
    }

    /**
     * Authorization scope check for counter-bound operations.
     *
     * Mirrors QueuesController::canOperateOnCounter exactly so behavior is
     * preserved during extraction. admin/super pass; loket must own or be
     * assigned to the counter; a null counter is permissive for loket.
     */
    public function canOperateOnCounter(User $user, ?int $counterId): bool
    {
        if ($user->isAdmin() || $user->isSuper()) {
            return true;
        }

        if (! $user->isLoket()) {
            return false;
        }

        if ($counterId === null) {
            return true;
        }

        if ((int) $counterId === (int) $user->counter_id) {
            return true;
        }

        return $user->assignedCounters()->where('counter_id', $counterId)->exists();
    }
}
