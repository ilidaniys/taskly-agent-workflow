import request from 'supertest';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createApp } from '../src/factory.ts';
import type { Database } from '../src/features/todos/types.ts';
import { record } from './fixture.ts';

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

function setup() {
  const todo = {
    findFirst: vi.fn().mockResolvedValue(record),
    findMany: vi.fn().mockResolvedValue([record]),
    findUnique: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue(record),
    updateManyAndReturn: vi.fn().mockResolvedValue([]),
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
  };
  const database = { todo } as unknown as Database;
  return { app: createApp(database), todo };
}

it('serves the OpenAPI document as JSON', async () => {
  const { app } = setup();
  const response = await request(app).get('/openapi.json');
  expect(response.status).toBe(200);
  expect(response.headers['content-type']).toMatch(/json/);
  expect(response.body.openapi).toBe('3.0.3');
});

it('mounts the health route under /api', async () => {
  const { app } = setup();
  const response = await request(app).get('/api/health');
  expect(response.status).toBe(200);
  expect(response.body).toEqual({ status: 'ok' });
});

it('mounts the swagger UI under /docs', async () => {
  const { app } = setup();
  const response = await request(app).get('/docs/');
  expect(response.status).toBe(200);
  expect(response.headers['content-type']).toMatch(/html/);
});

it('responds 404 with detail Not Found for unknown routes', async () => {
  const { app } = setup();
  const response = await request(app).get('/api/unknown');
  expect(response.status).toBe(404);
  expect(response.body).toEqual({ detail: 'Not Found' });
});

it('omits the x-powered-by header', async () => {
  const { app } = setup();
  const response = await request(app).get('/api/health');
  expect(response.headers).not.toHaveProperty('x-powered-by');
});

it('responds 422 with detail Invalid JSON. for a malformed JSON body without reaching the repository', async () => {
  const { app, todo } = setup();
  const response = await request(app)
    .post('/api/todos')
    .set('Content-Type', 'application/json')
    .send('{"title": ');
  expect(response.status).toBe(422);
  expect(response.body).toEqual({ detail: 'Invalid JSON.' });
  expect(todo.create).not.toHaveBeenCalled();
});

it('responds 413 with detail Request body too large. when the body exceeds the JSON limit', async () => {
  const { app, todo } = setup();
  const response = await request(app)
    .post('/api/todos')
    .set('Content-Type', 'application/json')
    .send(JSON.stringify({ title: 'x'.repeat(200_000) }));
  expect(response.status).toBe(413);
  expect(response.body).toEqual({ detail: 'Request body too large.' });
  expect(todo.create).not.toHaveBeenCalled();
});

it('responds 500 with detail Internal Server Error and logs an unexpected repository error', async () => {
  const { app, todo } = setup();
  const failure = new Error('connection lost');
  todo.findMany.mockRejectedValueOnce(failure);
  const response = await request(app).get('/api/todos');
  expect(response.status).toBe(500);
  expect(response.body).toEqual({ detail: 'Internal Server Error' });
  expect(console.error).toHaveBeenCalledWith(failure);
});
