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
it('rejects a non-numeric id on GET without calling the repository', async () => {
  const { app, repository } = setup();
  expect((await request(app).get('/api/todos/abc')).status).toBe(422);
  expect(repository.get).not.toHaveBeenCalled();
});
it.each([
  ['PATCH', 'abc'], ['PATCH', '0'], ['PATCH', '-1'], ['PATCH', '1.5'],
  ['DELETE', 'abc'], ['DELETE', '0'], ['DELETE', '-1'], ['DELETE', '1.5'],
])('rejects invalid id %s on %s without touching the repository', async (method, id) => {
  const { app, repository } = setup();
  const req = method === 'PATCH' ? request(app).patch(`/api/todos/${id}`).send({ completed: true }) : request(app).delete(`/api/todos/${id}`);
  expect((await req).status).toBe(422);
  expect(repository.update).not.toHaveBeenCalled();
  expect(repository.delete).not.toHaveBeenCalled();
});
it('gets a task by id', async () => {
  const { app, repository } = setup();
  repository.get.mockResolvedValue(todo);
  const response = await request(app).get('/api/todos/1');
  expect(response.status).toBe(200);
  expect(response.body).toEqual(todo);
  expect(repository.get).toHaveBeenCalledWith(1);
});
it('responds 404 when the task to get does not exist', async () => {
  const { app, repository } = setup();
  repository.get.mockResolvedValue(null);
  const response = await request(app).get('/api/todos/1');
  expect(response.status).toBe(404);
  expect(response.body).toEqual({ detail: 'Task not found.' });
});
it('updates a task with the parsed body', async () => {
  const { app, repository } = setup();
  repository.update.mockResolvedValue({ ...todo, completed: true });
  const response = await request(app).patch('/api/todos/1').send({ completed: true });
  expect(response.status).toBe(200);
  expect(response.body).toEqual({ ...todo, completed: true });
  expect(repository.update).toHaveBeenCalledWith(1, { completed: true });
});
it('rejects an invalid update body without calling the repository', async () => {
  const { app, repository } = setup();
  expect((await request(app).patch('/api/todos/1').send({ title: '' })).status).toBe(422);
  expect(repository.update).not.toHaveBeenCalled();
});
it('responds 404 when the task to update does not exist', async () => {
  const { app, repository } = setup();
  repository.update.mockResolvedValue(null);
  const response = await request(app).patch('/api/todos/1').send({ completed: true });
  expect(response.status).toBe(404);
  expect(response.body).toEqual({ detail: 'Task not found.' });
});
it('deletes a task with an empty 204 response', async () => {
  const { app, repository } = setup();
  repository.delete.mockResolvedValue(true);
  const response = await request(app).delete('/api/todos/1');
  expect(response.status).toBe(204);
  expect(response.text).toBe('');
  expect(repository.delete).toHaveBeenCalledWith(1);
});
it('responds 404 when the task to delete does not exist', async () => {
  const { app, repository } = setup();
  repository.delete.mockResolvedValue(false);
  const response = await request(app).delete('/api/todos/1');
  expect(response.status).toBe(404);
  expect(response.body).toEqual({ detail: 'Task not found.' });
});
