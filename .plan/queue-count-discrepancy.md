# Plan: Fix Queue Count Discrepancy

## Problem

"22 antrian lagi" doesn't match actual queue count.

**Root Cause**: Backend `index()` defaults to `whereDate('created_at', today())` but `stats()` has NO date filter.

| Source | Date Filter | Result |
|--------|-------------|--------|
| `useQueues({ status: "waiting" })` | None → defaults to today | Only today's waiting |
| `stats()` endpoint | None | ALL queues |

Queues from yesterday+ exist but don't show in frontend list.

## Fix: Sync date filtering

**Option A (Recommended)**: Pass explicit date to ALL loket queries

File: `frontend/app/loket/page.tsx`

```typescript
const todayDate = new Date().toISOString().split('T')[0];

const { data: waitingQueues } = useQueues({ status: "waiting", date: todayDate });
const { data: calledQueues } = useQueues({ status: "called", date: todayDate });
const { data: completedQueues } = useQueues({ status: "completed", date: todayDate });
const { data: skippedQueues } = useQueues({ status: "skipped", date: todayDate });
```

**Option B**: Remove default date filter from backend

File: `backend/app/Http/Controllers/Api/QueuesController.php`

Remove lines 33-36 (default date filter in index method).

## Verification

1. Query database: `SELECT status, COUNT(*) FROM queues GROUP BY status;`
2. Compare with frontend "22 antrian lagi" count
3. If counts match after fix, done

## Files to Modify

| File | Change |
|------|--------|
| `frontend/app/loket/page.tsx` | Add `date: todayDate` to waitingQueues + calledQueues queries |
