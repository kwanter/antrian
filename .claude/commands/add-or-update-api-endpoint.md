---
name: add-or-update-api-endpoint
description: Workflow command scaffold for add-or-update-api-endpoint in antrian.
allowed_tools: ["Bash", "Read", "Write", "Grep", "Glob"]
---

# /add-or-update-api-endpoint

Use this workflow when working on **add-or-update-api-endpoint** in `antrian`.

## Goal

Adds a new API endpoint or updates an existing one, including routing, controller, and tests.

## Common Files

- `backend/routes/api.php`
- `backend/app/Http/Controllers/Api/*.php`
- `backend/app/Http/Resources/*.php`
- `backend/tests/Feature/*.php`

## Suggested Sequence

1. Understand the current state and failure mode before editing.
2. Make the smallest coherent change that satisfies the workflow goal.
3. Run the most relevant verification for touched files.
4. Summarize what changed and what still needs review.

## Typical Commit Signals

- Add or update route in backend/routes/api.php
- Implement or modify controller method in backend/app/Http/Controllers/Api/
- Update or create resource/DTO in backend/app/Http/Resources/ (if needed)
- Write or update feature tests in backend/tests/Feature/

## Notes

- Treat this as a scaffold, not a hard-coded script.
- Update the command if the workflow evolves materially.