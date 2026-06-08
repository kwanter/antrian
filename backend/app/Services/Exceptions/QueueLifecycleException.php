<?php

namespace App\Services\Exceptions;

use RuntimeException;

/**
 * Domain exception for queue lifecycle operations.
 *
 * Carries an HTTP status code and a stable machine-readable error code so
 * controllers can translate the failure into a consistent JSON envelope
 * without duplicating business rules.
 */
class QueueLifecycleException extends RuntimeException
{
    public function __construct(
        public readonly string $errorCode,
        string $message,
        public readonly int $statusCode = 400,
    ) {
        parent::__construct($message);
    }

    public static function forbidden(string $message): self
    {
        return new self('FORBIDDEN', $message, 403);
    }

    public static function notToday(string $message = 'Queue is not from today'): self
    {
        return new self('QUEUE_NOT_TODAY', $message, 422);
    }

    public static function invalidStatus(string $message): self
    {
        return new self('INVALID_STATUS', $message, 400);
    }

    public static function notFound(string $message): self
    {
        return new self('NOT_FOUND', $message, 404);
    }

    public function statusCode(): int
    {
        return $this->statusCode;
    }

    public function errorCode(): string
    {
        return $this->errorCode;
    }
}
