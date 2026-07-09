---
name: add-or-modify-database-table
description: Workflow command scaffold for add-or-modify-database-table in antrian.
allowed_tools: ["Bash", "Read", "Write", "Grep", "Glob"]
---

# /add-or-modify-database-table

Use this workflow when working on **add-or-modify-database-table** in `antrian`.

## Goal

Adds a new database table or modifies an existing one, including schema migration and related model updates.

## Common Files

- `backend/database/migrations/*.php`
- `backend/app/Models/*.php`
- `backend/database/factories/*.php`
- `backend/app/Http/Resources/*.php`
- `backend/app/Http/Controllers/Api/*.php`
- `backend/tests/Feature/*.php`

## Suggested Sequence

1. Understand the current state and failure mode before editing.
2. Make the smallest coherent change that satisfies the workflow goal.
3. Run the most relevant verification for touched files.
4. Summarize what changed and what still needs review.

## Typical Commit Signals

- Create or update migration file in backend/database/migrations/
- Update corresponding Eloquent model in backend/app/Models/
- Update or create related factory in backend/database/factories/ (if needed)
- Update or create related resource in backend/app/Http/Resources/ (if needed)
- Update controller logic in backend/app/Http/Controllers/Api/ (if needed)

## Notes

- Treat this as a scaffold, not a hard-coded script.
- Update the command if the workflow evolves materially.