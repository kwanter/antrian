```markdown
# antrian Development Patterns

> Auto-generated skill from repository analysis

## Overview

This skill provides a comprehensive guide to the development patterns, coding conventions, and common workflows used in the `antrian` repository. The codebase is primarily written in TypeScript, with a backend (likely PHP/Laravel) and a frontend. The repository emphasizes clear workflow processes for database migrations, API development, security hardening, and testing, ensuring maintainable and secure code.

## Coding Conventions

- **File Naming:**  
  Use PascalCase for file names.  
  _Example:_  
  ```
  UserController.ts
  QueueService.ts
  ```

- **Import Style:**  
  Use alias imports for modules.  
  _Example:_  
  ```typescript
  import { QueueService } from '@services/QueueService';
  ```

- **Export Style:**  
  Use named exports for functions, classes, and constants.  
  _Example:_  
  ```typescript
  export function getQueueStatus() { ... }
  export class UserController { ... }
  ```

- **Commit Patterns:**  
  - Freeform commit messages, sometimes prefixed (e.g., `security:`).
  - Average commit message length: ~65 characters.

## Workflows

### Add or Modify Database Table
**Trigger:** When you need to add a new database table or change the structure of an existing one.  
**Command:** `/new-table`

1. **Create or update migration file**  
   - Location: `backend/database/migrations/`
   - _Example:_  
     ```php
     // 2024_06_01_000000_create_queues_table.php
     Schema::create('queues', function (Blueprint $table) {
         $table->id();
         $table->string('name');
         $table->timestamps();
     });
     ```
2. **Update corresponding Eloquent model**  
   - Location: `backend/app/Models/`
   - _Example:_  
     ```php
     class Queue extends Model
     {
         protected $fillable = ['name'];
     }
     ```
3. **Update or create related factory** (if needed)  
   - Location: `backend/database/factories/`
4. **Update or create related resource** (if needed)  
   - Location: `backend/app/Http/Resources/`
5. **Update controller logic** (if needed)  
   - Location: `backend/app/Http/Controllers/Api/`
6. **Write or update tests**  
   - Location: `backend/tests/Feature/`

---

### Add or Update API Endpoint
**Trigger:** When you want to expose new functionality or modify existing API behavior.  
**Command:** `/new-endpoint`

1. **Add or update route**  
   - File: `backend/routes/api.php`
   - _Example:_  
     ```php
     Route::post('/queue', [QueueController::class, 'store']);
     ```
2. **Implement or modify controller method**  
   - Location: `backend/app/Http/Controllers/Api/`
   - _Example:_  
     ```php
     public function store(Request $request)
     {
         // logic here
     }
     ```
3. **Update or create resource/DTO** (if needed)  
   - Location: `backend/app/Http/Resources/`
4. **Write or update feature tests**  
   - Location: `backend/tests/Feature/`

---

### Security Hardening or Audit Remediation
**Trigger:** When addressing security findings or proactively hardening the codebase.  
**Command:** `/security-remediation`

1. **Update controllers and models for security fixes**  
   - Locations:  
     - `backend/app/Http/Controllers/Api/`
     - `backend/app/Models/`
2. **Modify middleware and channel security**  
   - Files:  
     - `backend/bootstrap/app.php`
     - `backend/routes/channels.php`
3. **Update environment and configuration files**  
   - File: `backend/.env.example`
4. **Add or update CI workflow**  
   - Location: `.github/workflows/`
5. **Update dependencies**  
   - Files:  
     - `backend/composer.json`, `backend/composer.lock`
     - `frontend/package.json`, `frontend/package-lock.json`
6. **Write or update security-focused tests**  
   - Location: `backend/tests/Feature/`

---

### Add or Update Feature Tests
**Trigger:** When adding a new feature or modifying existing logic and needing to ensure correctness.  
**Command:** `/add-test`

1. **Write or update test file**  
   - Location: `backend/tests/Feature/`
   - _Example:_  
     ```php
     public function test_queue_creation()
     {
         $response = $this->postJson('/api/queue', ['name' => 'Test Queue']);
         $response->assertStatus(201);
     }
     ```
2. **Ensure tests cover new/changed logic**  
   - Controllers, models, or resources as needed.
3. **Run test suite to verify correctness**

---

## Testing Patterns

- **Framework:** Unknown (likely PHP testing framework for backend, e.g., PHPUnit).
- **File Pattern:**  
  - Test files are named with a `.test.ts` suffix for TypeScript, and `.php` for backend feature tests.
- **Location:**  
  - Backend feature tests: `backend/tests/Feature/`
- **Example:**  
  ```php
  public function test_api_returns_queues()
  {
      $response = $this->getJson('/api/queues');
      $response->assertStatus(200)
               ->assertJsonStructure(['data' => [['id', 'name']]]);
  }
  ```

## Commands

| Command                | Purpose                                                      |
|------------------------|--------------------------------------------------------------|
| /new-table             | Add or modify a database table and related backend logic     |
| /new-endpoint          | Add or update an API endpoint and its tests                  |
| /security-remediation  | Apply security fixes or hardening across the codebase        |
| /add-test              | Add or update feature tests for new or changed functionality |
```
