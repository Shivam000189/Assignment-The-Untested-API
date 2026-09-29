# Take-Home Assignment — The Untested API

A 2-day take-home assignment. You'll read unfamiliar code, write tests, track down bugs, and ship a small feature.

Read **[ASSIGNMENT.md](./ASSIGNMENT.md)** for the full brief before you start.

---

## A note on AI tools

You're welcome to use AI tools. What we're evaluating is your ability to read and reason about unfamiliar code — so your submission should reflect your own understanding, not just generated output.

Concretely:
- For each bug you report: include where in the code it lives and why it happens
- For the feature you implement: briefly explain the design decisions you made
- If something surprised you or you had to make a tradeoff, say so

---

## Getting Started

**Prerequisites:** Node.js 18+

```bash
cd task-api
npm install
npm start        # runs on http://localhost:3000
```

**Tests:**

```bash
npm test           # run test suite
npm run coverage   # run with coverage report
```

---

## Project Structure

```
task-api/
  src/
    app.js                  # Express app setup
    routes/tasks.js         # Route handlers
    services/taskService.js # Business logic + in-memory data store
    utils/validators.js     # Input validation helpers
  tests/                    # Your tests go here
  package.json
  jest.config.js
ASSIGNMENT.md               # Full brief — read this first
```

> The data store is in-memory. It resets every time the server restarts.

---

## API Reference

| Method   | Path                      | Description                              |
|----------|---------------------------|------------------------------------------|
| `GET`    | `/tasks`                  | List all tasks. Supports `?status=`, `?page=`, `?limit=` |
| `POST`   | `/tasks`                  | Create a new task                        |
| `PUT`    | `/tasks/:id`              | Full update of a task                    |
| `DELETE` | `/tasks/:id`              | Delete a task (returns 204)              |
| `PATCH`  | `/tasks/:id/complete`     | Mark a task as complete                  |
| `GET`    | `/tasks/stats`            | Counts by status + overdue count         |
| `PATCH`  | `/tasks/:id/assign`       | **Assign a task to a user** _(to implement)_ |

### Task shape

```json
{
  "id": "uuid",
  "title": "string",
  "description": "string",
  "status": "pending | in-progress | completed",
  "priority": "low | medium | high",
  "dueDate": "ISO 8601 or null",
  "completedAt": "ISO 8601 or null",
  "assignee": "string or null",
  "createdAt": "ISO 8601"
}
```

### Assign endpoint (`PATCH /tasks/:id/assign`)

**Design Decisions & Behavior**:
- **Field Default**: Every newly created task defaults to `"assignee": null`.
- **Whitespace Handling**: Assignee names are trimmed of leading and trailing whitespace before persistence.
- **Validation Rules**:
  - Missing `assignee`, empty string, or whitespace-only input returns `400 Bad Request`.
  - Non-string types (e.g., numbers, null, objects) return `400 Bad Request`.
  - Max length enforced at 100 characters; values longer than 100 return `400 Bad Request`.
- **Resource Not Found**: Calling `/tasks/:id/assign` with an unknown task ID returns `404 Not Found`.
- **Reassignment**: Tasks can be reassigned; the new assignee overwrites the previous assignee and returns `200 OK` with the complete updated task.
- **Field Integrity**: Assigning a task never mutates existing task fields (`title`, `description`, `status`, `priority`, `dueDate`, `completedAt`, `createdAt`).

### Sample requests

**Create a task**
```bash
curl -X POST http://localhost:3000/tasks \
  -H "Content-Type: application/json" \
  -d '{"title": "Write tests", "priority": "high"}'
```

**List tasks with filter**
```bash
curl "http://localhost:3000/tasks?status=pending&page=1&limit=10"
```

**Mark complete**
```bash
curl -X PATCH http://localhost:3000/tasks/<id>/complete
```

**Assign a task**
```bash
curl -X PATCH http://localhost:3000/tasks/<id>/assign \
  -H "Content-Type: application/json" \
  -d '{"assignee": "Alex Doe"}'
```

---

## What to Submit

See [ASSIGNMENT.md](./ASSIGNMENT.md) for full submission requirements. At minimum, include:

- **Test files** — covering the endpoints and edge cases you identified
- **Bug report** — what you found, where in the code, and why it's a bug (not just symptoms)
- **At least one fix** — with a note on your approach
- **`PATCH /tasks/:id/assign` implementation** — plus a short explanation of any design decisions (validation, edge cases, etc.)

---

## Submission Notes

### What I'd test next
Concurrent updates and deletes, and more validation edge cases (very long titles, unusual dueDate formats). I'd also add tests for malformed JSON and unknown routes.

### What surprised me
The pagination bug was one small line but broke every paged response. The overdue logic looked suspicious but was correct, which is why I let tests confirm it. PUT letting clients overwrite id and createdAt was also unexpected.

### Questions before production
1. Is reassigning an already-assigned task meant to be allowed?
2. Should assignee be validated against real users?
3. Should the API return pagination metadata, and should invalid page/limit values return 400 instead of silently defaulting?
4. What is the persistence plan, since the store is in-memory?
