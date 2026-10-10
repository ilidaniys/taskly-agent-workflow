import express from 'express';
import request from 'supertest';
import { it, expect, vi } from 'vitest';
import { createTodosRouter } from '../src/features/todos/router.ts';
import { todo } from './fixture.ts';

function setup() {
  const repository = { list: vi.fn().mockResolvedValue([todo]), create: vi.fn().mockResolvedValue(todo), get: vi.fn(), update: vi.fn(), delete: vi.fn() };
  const app = express();
  app.use(express.json());
  app.use('/api/todos', createTodosRouter(repository));
  return { app, repository };
}
it('lists tasks from the repository', async () => {
  const { app, repository } = setup();
  const response = await request(app).get('/api/todos');
  expect(response.status).toBe(200);
  expect(response.body).toEqual([todo]);
  expect(repository.list).toHaveBeenCalledOnce();
  expect(repository.list).toHaveBeenCalledWith({});
});
it('passes a priority filter to the repository', async () => {
  const { app, repository } = setup();
  expect((await request(app).get('/api/todos?priority=high')).status).toBe(200);
  expect(repository.list).toHaveBeenCalledWith({ priority: 'high' });
});
it('passes a completed filter as a boolean to the repository', async () => {
  const { app, repository } = setup();
  expect((await request(app).get('/api/todos?completed=true')).status).toBe(200);
  expect(repository.list).toHaveBeenLastCalledWith({ completed: true });
  expect((await request(app).get('/api/todos?completed=false')).status).toBe(200);
  expect(repository.list).toHaveBeenLastCalledWith({ completed: false });
});
it.each(['?priority=urgent', '?completed=yes'])('rejects invalid list query %s without calling the repository', async (query) => {
  const { app, repository } = setup();
  expect((await request(app).get(`/api/todos${query}`)).status).toBe(422);
  expect(repository.list).not.toHaveBeenCalled();
});
it('creates tasks with trimmed input and defaults', async () => {
  const { app, repository } = setup();
  const response = await request(app).post('/api/todos').send({ title: '  Plan the sprint  ', priority: 'high' });
  expect(response.status).toBe(201);
  expect(response.body).toEqual(todo);
  expect(repository.create).toHaveBeenCalledWith({ title: 'Plan the sprint', description: '', priority: 'high', due_date: null, completed: false });
});
it.each([{ title: '  ' }, { title: 'x'.repeat(121) }, { title: 'Task', priority: 'urgent' }, { title: 'Task', due_date: '2026-02-30' }])(
  'rejects invalid create input without calling the repository: %j', async (payload) => {
    const { app, repository } = setup();
    expect((await request(app).post('/api/todos').send(payload)).status).toBe(422);
    expect(repository.create).not.toHaveBeenCalled();
  },
);
