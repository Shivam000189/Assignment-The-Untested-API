# Bug Report — The Untested API

This report documents bugs and design discrepancies identified in Day 1 test coverage across `src/services/taskService.js` and `src/routes/tasks.js`.

---

## Definite Bugs

### 1. Pagination Offset Calculation Skips First Page [FIXED]
- **Status**: Fixed — Updated `offset = page * limit` to `offset = (page - 1) * limit` in `taskService.getPaginated`.
- **Expected Behavior**: With 1-indexed pages, page 1 should return items starting at index 0 (`(page - 1) * limit`).
- **Actual Behavior**: The service calculates `offset = page * limit`. When `page = 1` and `limit = 10`, `offset` is 10, completely skipping the first 10 items.
- **Discovered By**:
  - `tests/taskService.test.js` → `taskService › getPaginated › returns first page when page=1`
  - `tests/tasks.api.test.js` → `GET /tasks › returns first page when page=1`
- **Suggested Fix**:
  In `src/services/taskService.js` (`getPaginated`), calculate the offset using 1-indexed math:
  ```javascript
  const offset = (page - 1) * limit;
  ```

---

### 2. Loose Substring Matching on Status Filter
- **Expected Behavior**: Status filtering must match exact statuses (`'todo'`, `'in_progress'`, or `'done'`).
- **Actual Behavior**: `getByStatus` uses `tasks.filter((t) => t.status.includes(status))`. An input like `status=do` matches both `todo` and `done`.
- **Discovered By**:
  - `tests/taskService.test.js` → `taskService › getByStatus › does not match tasks where status is only a substring`
  - `tests/tasks.api.test.js` → `GET /tasks › does not return tasks for partial status match`
- **Suggested Fix**:
  In `src/services/taskService.js` (`getByStatus`), use strict equality:
  ```javascript
  const getByStatus = (status) => tasks.filter((t) => t.status === status);
  ```

---

### 3. Priority Reset on Task Completion
- **Expected Behavior**: Calling `completeTask` (or `PATCH /tasks/:id/complete`) should mark status as `done` and record `completedAt`, preserving the task's existing priority.
- **Actual Behavior**: `completeTask` hardcodes `priority: 'medium'`, silently overwriting `high` or `low` priority tasks upon completion.
- **Discovered By**:
  - `tests/taskService.test.js` → `taskService › completeTask › preserves original task priority when completing task`
  - `tests/tasks.api.test.js` → `PATCH /tasks/:id/complete › preserves priority when completing task`
- **Suggested Fix**:
  In `src/services/taskService.js` (`completeTask`), remove `priority: 'medium'` from the updated object payload.

---

### 4. Stale `completedAt` Retained When Reopening Tasks
- **Expected Behavior**: When a task's status is changed from `done` back to `todo` or `in_progress`, `completedAt` should be reset to `null`.
- **Actual Behavior**: Object spread `{ ...tasks[index], ...fields }` retains the old `completedAt` timestamp, leaving incomplete tasks with completion timestamps.
- **Discovered By**:
  - `tests/taskService.test.js` → `taskService › update › clears completedAt when task status is updated back to todo or in_progress`
  - `tests/tasks.api.test.js` → `PUT /tasks/:id › clears completedAt when task is updated back to todo`
- **Suggested Fix**:
  In `src/services/taskService.js` (`update`), conditionally adjust `completedAt` based on the new status without mutating the input `fields` object:
  ```javascript
  let completedAt = tasks[index].completedAt;
  if (fields.status && fields.status !== 'done') {
    completedAt = null;
  }
  const updated = { ...tasks[index], ...fields, completedAt };
  ```

---

### 5. `PUT` with Status `'done'` Fails to Set `completedAt`
- **Expected Behavior**: When updating a task's status to `done` via `PUT /tasks/:id` (or `taskService.update`), `completedAt` should be recorded with the current ISO timestamp if previously unset.
- **Actual Behavior**: `taskService.update` simply merges `fields`. Unless `completedAt` is explicitly supplied in the request body, `completedAt` remains `null`.
- **Discovered By**:
  - Code inspection of `taskService.update` vs `completeTask`
  - `tests/taskService.test.js` → `taskService › update › sets completedAt when task status is updated to done`
  - `tests/tasks.api.test.js` → `PUT /tasks/:id › sets completedAt when task status is updated to done`
- **Suggested Fix**:
  In `src/services/taskService.js` (`update`), set `completedAt` when moving to `done` without mutating the incoming `fields` object:
  ```javascript
  let completedAt = tasks[index].completedAt;
  if (fields.status === 'done') {
    completedAt = completedAt || new Date().toISOString();
  } else if (fields.status) {
    completedAt = null;
  }
  const updated = { ...tasks[index], ...fields, completedAt };
  ```

---

### 6. Data Integrity: `id` and `createdAt` Overwritable on Update
- **Expected Behavior**: System-managed metadata (`id` and `createdAt`) are immutable and should not be modified by `PUT /tasks/:id` or `taskService.update`.
- **Actual Behavior**: Passing `{ id: "...", createdAt: "..." }` in the PUT body overwrites the task's primary key and initial creation timestamp in the store.
- **Discovered By**:
  - `tests/taskService.test.js` → `taskService › update › cannot overwrite id or createdAt`
  - `tests/tasks.api.test.js` → `PUT /tasks/:id › cannot overwrite id or createdAt`
- **Suggested Fix**:
  In `src/services/taskService.js` (`update`), destructure and discard `id` and `createdAt` before applying updates:
  ```javascript
  const { id: _id, createdAt: _createdAt, ...safeFields } = fields;
  const updated = { ...tasks[index], ...safeFields };
  ```

---

## Design Decisions / Suggested Behavior (Not Definite Bugs)

### 7. Explicit 400 Bad Request on Invalid Pagination Parameters
- **Expected / Suggested Behavior**: Non-numeric values (`limit=abc`), zero (`limit=0`), or negative numbers (`page=-1`) should return `400 Bad Request` with an informative error message.
- **Current Behavior**: `parseInt(page) || 1` and `parseInt(limit) || 10` silently fall back to defaults, returning `200 OK`.
- **Discovered By**:
  - `tests/tasks.api.test.js` → `GET /tasks › returns 400 for invalid or negative pagination parameters`
  - `tests/tasks.api.test.js` → `GET /tasks › returns 400 when limit is 0`
  - `tests/tasks.api.test.js` → `GET /tasks › returns 400 when limit is non-numeric`
- **Classification**: Design decision. Silent fallback is common in loose APIs, but returning 400 prevents silent client bugs and misconfigurations.
- **Suggested Fix**: Add query validation in `src/routes/tasks.js` before calling `taskService.getPaginated`.

---

### 8. Composing Status Filter with Pagination
- **Expected / Suggested Behavior**: `GET /tasks?status=todo&page=1&limit=2` should return a paginated slice of tasks matching the status filter.
- **Actual Behavior**: The route checks `if (status)` and returns immediately with `taskService.getByStatus(status)`, completely bypassing `page` and `limit`.
- **Discovered By**:
  - `tests/tasks.api.test.js` → `GET /tasks › applies pagination when filtering by status with page and limit`
- **Classification**: Design decision / API feature gap. The route currently treats `status` and pagination as mutually exclusive query modes.
- **Suggested Fix**: Filter by status first, and then apply pagination slicing on the filtered results.
