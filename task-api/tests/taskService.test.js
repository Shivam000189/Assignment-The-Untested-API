const taskService = require('../src/services/taskService');

describe('taskService', () => {
  beforeEach(() => {
    taskService._reset();
  });

  describe('create', () => {
    test('creates a task with defaults', () => {
      const task = taskService.create({ title: 'Test Task' });
      expect(task).toBeDefined();
      expect(task.id).toBeDefined();
      expect(task.title).toBe('Test Task');
      expect(task.description).toBe('');
      expect(task.status).toBe('todo');
      expect(task.priority).toBe('medium');
      expect(task.dueDate).toBeNull();
      expect(task.completedAt).toBeNull();
      expect(task.createdAt).toBeDefined();
    });

    test('creates a task with custom fields', () => {
      const taskData = {
        title: 'Complete assignment',
        description: 'Writing unit and integration tests',
        status: 'in_progress',
        priority: 'high',
        dueDate: '2026-10-01T00:00:00.000Z',
      };
      const task = taskService.create(taskData);
      expect(task.title).toBe(taskData.title);
      expect(task.description).toBe(taskData.description);
      expect(task.status).toBe('in_progress');
      expect(task.priority).toBe('high');
      expect(task.dueDate).toBe(taskData.dueDate);
      expect(task.completedAt).toBeNull();
    });
  });

  describe('getAll', () => {
    test('returns an empty array when no tasks exist', () => {
      expect(taskService.getAll()).toEqual([]);
    });

    test('returns all tasks', () => {
      taskService.create({ title: 'Task 1' });
      taskService.create({ title: 'Task 2' });
      const tasks = taskService.getAll();
      expect(tasks).toHaveLength(2);
      expect(tasks[0].title).toBe('Task 1');
      expect(tasks[1].title).toBe('Task 2');
    });

    test('returns a shallow copy of tasks array', () => {
      taskService.create({ title: 'Task 1' });
      const tasks = taskService.getAll();
      tasks.push({ title: 'Fake Task' });
      expect(taskService.getAll()).toHaveLength(1);
    });
  });

  describe('findById', () => {
    test('returns the task with the matching id', () => {
      const created = taskService.create({ title: 'Target Task' });
      const found = taskService.findById(created.id);
      expect(found).toBeDefined();
      expect(found.id).toBe(created.id);
      expect(found.title).toBe('Target Task');
    });

    test('returns undefined for non-existent id', () => {
      const found = taskService.findById('non-existent-uuid');
      expect(found).toBeUndefined();
    });
  });

  describe('getByStatus', () => {
    test('filters tasks matching the exact status', () => {
      taskService.create({ title: 'Task 1', status: 'todo' });
      taskService.create({ title: 'Task 2', status: 'in_progress' });
      taskService.create({ title: 'Task 3', status: 'done' });

      const inProgress = taskService.getByStatus('in_progress');
      expect(inProgress).toHaveLength(1);
      expect(inProgress[0].title).toBe('Task 2');
    });

    test('does not match tasks where status is only a substring', () => {
      taskService.create({ title: 'Todo Task', status: 'todo' });
      taskService.create({ title: 'Done Task', status: 'done' });

      const matched = taskService.getByStatus('do');
      expect(matched).toEqual([]);
    });
  });

  describe('getPaginated', () => {
    test('returns first page when page=1', () => {
      const t1 = taskService.create({ title: 'Task 1' });
      const t2 = taskService.create({ title: 'Task 2' });
      taskService.create({ title: 'Task 3' });

      const page1 = taskService.getPaginated(1, 2);
      expect(page1).toHaveLength(2);
      expect(page1[0].id).toBe(t1.id);
      expect(page1[1].id).toBe(t2.id);
    });

    test('returns second page when page=2', () => {
      taskService.create({ title: 'Task 1' });
      taskService.create({ title: 'Task 2' });
      const t3 = taskService.create({ title: 'Task 3' });

      const page2 = taskService.getPaginated(2, 2);
      expect(page2).toHaveLength(1);
      expect(page2[0].id).toBe(t3.id);
    });

    test('returns empty array when page is beyond last page', () => {
      taskService.create({ title: 'Task 1' });
      const result = taskService.getPaginated(5, 10);
      expect(result).toEqual([]);
    });
  });

  describe('update', () => {
    test('updates fields of an existing task', () => {
      const created = taskService.create({ title: 'Initial' });
      const updated = taskService.update(created.id, {
        title: 'Updated Title',
        priority: 'high',
      });
      expect(updated).toBeDefined();
      expect(updated.title).toBe('Updated Title');
      expect(updated.priority).toBe('high');
      expect(taskService.findById(created.id).title).toBe('Updated Title');
    });

    test('returns null when updating non-existent id', () => {
      const result = taskService.update('non-existent-uuid', { title: 'New' });
      expect(result).toBeNull();
    });

    test('clears completedAt when task status is updated back to todo or in_progress', () => {
      const task = taskService.create({ title: 'Done Task' });
      taskService.completeTask(task.id);
      expect(taskService.findById(task.id).completedAt).not.toBeNull();

      const reverted = taskService.update(task.id, { status: 'todo' });
      expect(reverted.status).toBe('todo');
      expect(reverted.completedAt).toBeNull();
    });

    test('cannot overwrite id or createdAt', () => {
      const created = taskService.create({ title: 'Immutable' });
      const updated = taskService.update(created.id, {
        id: 'hacked-id',
        createdAt: '2000-01-01T00:00:00.000Z',
        title: 'Valid New Title',
      });
      expect(updated.id).toBe(created.id);
      expect(updated.createdAt).toBe(created.createdAt);
    });
  });

  describe('remove', () => {
    test('deletes existing task and returns true', () => {
      const task = taskService.create({ title: 'To Delete' });
      const deleted = taskService.remove(task.id);
      expect(deleted).toBe(true);
      expect(taskService.findById(task.id)).toBeUndefined();
      expect(taskService.getAll()).toHaveLength(0);
    });

    test('returns false when deleting non-existent id', () => {
      const deleted = taskService.remove('non-existent-uuid');
      expect(deleted).toBe(false);
    });
  });

  describe('completeTask', () => {
    test('marks task as done and sets completedAt timestamp', () => {
      const task = taskService.create({ title: 'Task to finish' });
      const completed = taskService.completeTask(task.id);
      expect(completed).toBeDefined();
      expect(completed.status).toBe('done');
      expect(completed.completedAt).toBeDefined();
      expect(new Date(completed.completedAt).getTime()).not.toBeNaN();
    });

    test('preserves original task priority when completing task', () => {
      const task = taskService.create({ title: 'Urgent Task', priority: 'high' });
      const completed = taskService.completeTask(task.id);
      expect(completed.priority).toBe('high');
    });

    test('returns null when completing non-existent task', () => {
      const result = taskService.completeTask('non-existent-uuid');
      expect(result).toBeNull();
    });

    test('can complete an already-completed task without throwing', () => {
      const task = taskService.create({ title: 'Task' });
      taskService.completeTask(task.id);
      const reCompleted = taskService.completeTask(task.id);
      expect(reCompleted.status).toBe('done');
    });
  });

  describe('getStats', () => {
    test('counts tasks by status correctly', () => {
      taskService.create({ title: 'T1', status: 'todo' });
      taskService.create({ title: 'T2', status: 'todo' });
      taskService.create({ title: 'T3', status: 'in_progress' });
      taskService.create({ title: 'T4', status: 'done' });

      const stats = taskService.getStats();
      expect(stats.todo).toBe(2);
      expect(stats.in_progress).toBe(1);
      expect(stats.done).toBe(1);
    });

    test('counts overdue tasks correctly for past due date with status todo or in_progress', () => {
      const pastDate = new Date(Date.now() - 100000).toISOString();
      taskService.create({ title: 'Overdue Todo', status: 'todo', dueDate: pastDate });
      taskService.create({ title: 'Overdue In Progress', status: 'in_progress', dueDate: pastDate });

      const stats = taskService.getStats();
      expect(stats.overdue).toBe(2);
    });

    test('does not count done tasks as overdue even if dueDate has passed', () => {
      const pastDate = new Date(Date.now() - 100000).toISOString();
      taskService.create({ title: 'Done Task', status: 'done', dueDate: pastDate });

      const stats = taskService.getStats();
      expect(stats.overdue).toBe(0);
    });

    test('does not count tasks with null or future dueDate as overdue', () => {
      const futureDate = new Date(Date.now() + 100000).toISOString();
      taskService.create({ title: 'No due date', status: 'todo', dueDate: null });
      taskService.create({ title: 'Future task', status: 'todo', dueDate: futureDate });

      const stats = taskService.getStats();
      expect(stats.overdue).toBe(0);
    });

    test('handles tasks with unknown status gracefully', () => {
      taskService.create({ title: 'Unknown status task', status: 'archived' });
      const stats = taskService.getStats();
      expect(stats.todo).toBe(0);
      expect(stats.in_progress).toBe(0);
      expect(stats.done).toBe(0);
    });
  });
});
