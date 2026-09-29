const request = require('supertest');
const app = require('../src/app');
const taskService = require('../src/services/taskService');

describe('Tasks API Integration Tests', () => {
  beforeEach(() => {
    taskService._reset();
  });

  describe('GET /tasks', () => {
    test('returns empty list when no tasks exist', async () => {
      const res = await request(app).get('/tasks');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    test('returns all tasks (happy path)', async () => {
      taskService.create({ title: 'Task 1' });
      taskService.create({ title: 'Task 2' });

      const res = await request(app).get('/tasks');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0].title).toBe('Task 1');
      expect(res.body[1].title).toBe('Task 2');
    });

    test('handles internal server error with 500 status code', async () => {
      const spy = jest.spyOn(taskService, 'getAll').mockImplementationOnce(() => {
        throw new Error('Database failure');
      });
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const res = await request(app).get('/tasks');
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Internal server error' });

      spy.mockRestore();
      consoleSpy.mockRestore();
    });

    test('filters tasks by exact status (happy path)', async () => {
      taskService.create({ title: 'T1', status: 'todo' });
      taskService.create({ title: 'T2', status: 'in_progress' });

      const res = await request(app).get('/tasks?status=in_progress');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].title).toBe('T2');
    });

    test('does not return tasks for partial status match', async () => {
      taskService.create({ title: 'T1', status: 'todo' });
      taskService.create({ title: 'T2', status: 'done' });

      const res = await request(app).get('/tasks?status=do');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    test('paginates tasks correctly (happy path)', async () => {
      const t1 = taskService.create({ title: 'T1' });
      const t2 = taskService.create({ title: 'T2' });
      taskService.create({ title: 'T3' });

      const res = await request(app).get('/tasks?page=1&limit=2');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0].id).toBe(t1.id);
      expect(res.body[1].id).toBe(t2.id);
    });

    test('returns first page when page=1', async () => {
      const t1 = taskService.create({ title: 'First Task' });
      const t2 = taskService.create({ title: 'Second Task' });
      taskService.create({ title: 'Third Task' });

      const res = await request(app).get('/tasks?page=1&limit=2');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0].id).toBe(t1.id);
    });

    test('applies pagination when filtering by status with page and limit', async () => {
      taskService.create({ title: 'T1', status: 'todo' });
      taskService.create({ title: 'T2', status: 'todo' });
      taskService.create({ title: 'T3', status: 'todo' });

      const res = await request(app).get('/tasks?status=todo&page=1&limit=2');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
    });

    test('returns 400 for invalid or negative pagination parameters', async () => {
      const res = await request(app).get('/tasks?page=-1&limit=10');
      expect(res.status).toBe(400);
    });

    test('returns 400 when limit is 0', async () => {
      const res = await request(app).get('/tasks?limit=0');
      expect(res.status).toBe(400);
    });

    test('returns 400 when limit is non-numeric', async () => {
      const res = await request(app).get('/tasks?limit=abc');
      expect(res.status).toBe(400);
    });

    test('returns empty array when page is beyond total tasks', async () => {
      taskService.create({ title: 'T1' });
      const res = await request(app).get('/tasks?page=10&limit=10');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  describe('POST /tasks', () => {
    test('creates a task with valid body (happy path)', async () => {
      const payload = {
        title: 'New API Task',
        description: 'Testing POST endpoint',
        priority: 'high',
        status: 'todo',
      };
      const res = await request(app).post('/tasks').send(payload);
      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.title).toBe(payload.title);
      expect(res.body.description).toBe(payload.description);
      expect(res.body.priority).toBe('high');
      expect(res.body.status).toBe('todo');
      expect(res.body.createdAt).toBeDefined();
    });

    test('returns 400 when title is missing', async () => {
      const res = await request(app).post('/tasks').send({ description: 'No title' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/title is required/i);
    });

    test('returns 400 when title is empty or only whitespace', async () => {
      const res = await request(app).post('/tasks').send({ title: '   ' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/title is required/i);
    });

    test('returns 400 when status is invalid', async () => {
      const res = await request(app).post('/tasks').send({
        title: 'Task with bad status',
        status: 'invalid_status',
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/status must be one of/i);
    });

    test('returns 400 when priority is invalid', async () => {
      const res = await request(app).post('/tasks').send({
        title: 'Task with bad priority',
        priority: 'urgent',
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/priority must be one of/i);
    });

    test('returns 400 when dueDate is an invalid date string', async () => {
      const res = await request(app).post('/tasks').send({
        title: 'Task with bad dueDate',
        dueDate: 'not-a-valid-date',
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/dueDate must be a valid ISO date string/i);
    });
  });

  describe('PUT /tasks/:id', () => {
    test('updates an existing task (happy path)', async () => {
      const created = taskService.create({ title: 'Old Title', priority: 'low' });
      const updateData = {
        title: 'Updated Title',
        priority: 'high',
        status: 'in_progress',
      };

      const res = await request(app).put(`/tasks/${created.id}`).send(updateData);
      expect(res.status).toBe(200);
      expect(res.body.title).toBe('Updated Title');
      expect(res.body.priority).toBe('high');
      expect(res.body.status).toBe('in_progress');
    });

    test('returns 404 for unknown task id', async () => {
      const res = await request(app).put('/tasks/non-existent-id').send({ title: 'Updated' });
      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/task not found/i);
    });

    test('returns 400 when title is empty string', async () => {
      const created = taskService.create({ title: 'Valid Title' });
      const res = await request(app).put(`/tasks/${created.id}`).send({ title: '' });
      expect(res.status).toBe(400);
    });

    test('returns 400 when updated status is invalid', async () => {
      const created = taskService.create({ title: 'Valid Title' });
      const res = await request(app).put(`/tasks/${created.id}`).send({ status: 'done_done' });
      expect(res.status).toBe(400);
    });

    test('returns 400 when updated priority is invalid', async () => {
      const created = taskService.create({ title: 'Valid Title' });
      const res = await request(app).put(`/tasks/${created.id}`).send({ priority: 'highest' });
      expect(res.status).toBe(400);
    });

    test('returns 400 when updated dueDate is invalid', async () => {
      const created = taskService.create({ title: 'Valid Title' });
      const res = await request(app).put(`/tasks/${created.id}`).send({ dueDate: 'bad-date' });
      expect(res.status).toBe(400);
    });

    test('clears completedAt when task is updated back to todo', async () => {
      const created = taskService.create({ title: 'Task to be finished' });
      taskService.completeTask(created.id);

      const res = await request(app).put(`/tasks/${created.id}`).send({ status: 'todo' });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('todo');
      expect(res.body.completedAt).toBeNull();
    });

    test('cannot overwrite id or createdAt', async () => {
      const created = taskService.create({ title: 'Immutable fields test' });
      const originalId = created.id;
      const originalCreatedAt = created.createdAt;

      const res = await request(app).put(`/tasks/${originalId}`).send({
        id: 'new-id-attempt',
        createdAt: '2020-01-01T00:00:00.000Z',
        title: 'Updated Title',
      });

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(originalId);
      expect(res.body.createdAt).toBe(originalCreatedAt);
      const stored = taskService.findById(originalId);
      expect(stored.id).toBe(originalId);
      expect(stored.createdAt).toBe(originalCreatedAt);
    });
  });

  describe('DELETE /tasks/:id', () => {
    test('deletes an existing task (happy path)', async () => {
      const created = taskService.create({ title: 'To Delete' });
      const res = await request(app).delete(`/tasks/${created.id}`);
      expect(res.status).toBe(204);
      expect(taskService.findById(created.id)).toBeUndefined();
    });

    test('returns 404 for unknown task id', async () => {
      const res = await request(app).delete('/tasks/non-existent-id');
      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/task not found/i);
    });
  });

  describe('PATCH /tasks/:id/complete', () => {
    test('marks task as completed (happy path)', async () => {
      const created = taskService.create({ title: 'Task to complete' });
      const res = await request(app).patch(`/tasks/${created.id}/complete`);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('done');
      expect(res.body.completedAt).toBeDefined();
      expect(new Date(res.body.completedAt).getTime()).not.toBeNaN();
    });

    test('preserves priority when completing task', async () => {
      const created = taskService.create({ title: 'High priority task', priority: 'high' });
      const res = await request(app).patch(`/tasks/${created.id}/complete`);
      expect(res.status).toBe(200);
      expect(res.body.priority).toBe('high');
    });

    test('returns 404 for unknown task id', async () => {
      const res = await request(app).patch('/tasks/non-existent-id/complete');
      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/task not found/i);
    });

    test('returns 200 when completing an already completed task', async () => {
      const created = taskService.create({ title: 'Task' });
      await request(app).patch(`/tasks/${created.id}/complete`);
      const res = await request(app).patch(`/tasks/${created.id}/complete`);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('done');
    });
  });

  describe('GET /tasks/stats', () => {
    test('returns status counts and overdue count (happy path)', async () => {
      taskService.create({ title: 'T1', status: 'todo' });
      taskService.create({ title: 'T2', status: 'in_progress' });
      taskService.create({ title: 'T3', status: 'done' });

      const res = await request(app).get('/tasks/stats');
      expect(res.status).toBe(200);
      expect(res.body.todo).toBe(1);
      expect(res.body.in_progress).toBe(1);
      expect(res.body.done).toBe(1);
      expect(res.body.overdue).toBe(0);
    });

    test('calculates stats without counting completed tasks as overdue', async () => {
      const pastDate = new Date(Date.now() - 500000).toISOString();
      taskService.create({ title: 'Completed Past Due', status: 'done', dueDate: pastDate });

      const res = await request(app).get('/tasks/stats');
      expect(res.status).toBe(200);
      expect(res.body.done).toBe(1);
      expect(res.body.overdue).toBe(0);
    });
  });
});
