---
name: security-hardening-or-audit-remediation
description: Workflow command scaffold for security-hardening-or-audit-remediation in antrian.
allowed_tools: ["Bash", "Read", "Write", "Grep", "Glob"]
---

# /security-hardening-or-audit-remediation

Use this workflow when working on **security-hardening-or-audit-remediation** in `antrian`.

## Goal

Implements security fixes or hardening in response to audits, including code, configuration, and tests.

## Common Files

- `backend/app/Http/Controllers/Api/*.php`
- `backend/app/Models/*.php`
- `backend/bootstrap/app.php`
- `backend/routes/channels.php`
- `backend/.env.example`
- `.github/workflows/*.yml`

## Suggested Sequence

1. Understand the current state and failure mode before editing.
2. Make the smallest coherent change that satisfies the workflow goal.
3. Run the most relevant verification for touched files.
4. Summarize what changed and what still needs review.

## Typical Commit Signals

- Update backend/app/Http/Controllers/Api/ and backend/app/Models/ for security fixes
- Modify backend/bootstrap/app.php or backend/routes/channels.php for middleware and channel security
- Update .env.example and configuration files
- Add or update CI workflow in .github/workflows/
- Update dependencies in backend/composer.json and composer.lock, frontend/package.json and package-lock.json

## Notes

- Treat this as a scaffold, not a hard-coded script.
- Update the command if the workflow evolves materially.