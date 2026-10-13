import request from 'supertest';
import { afterEach, it, expect, vi } from 'vitest';
import { createApp } from '../src/factory.ts';
import { createDatabase } from '../src/core/database.ts';
import { record, todo } from './fixture.ts';

afterEach(() => vi.restoreAllMocks());

function setup() {
  // Real Prisma delegates without connecting; each test stubs the calls it needs.
  const database = createDatabase('postgresql://test:test@localhost:5432/test');
  return { app: createApp(database), database };
}

it('responds 404 with a JSON detail for an unknown path', async () => {
  const { app } = setup();
  const response = await request(app).get('/no/such/path');
  expect(response.status).toBe(404);
  expect(response.body).toEqual({ detail: 'Not Found' });
});

it('does not expose the x-powered-by header', async () => {
  const { app } = setup();
  const response = await request(app).get('/no/such/path');
  expect(response.headers['x-powered-by']).toBeUndefined();
});

it('serves the OpenAPI document as a JSON object', async () => {
  const { app } = setup();
  const response = await request(app).get('/openapi.json');
  expect(response.status).toBe(200);
  expect(response.body).toBeTypeOf('object');
});

it('answers GET /api/health with status ok after querying the database', async () => {
  const { app, database } = setup();
  const findFirst = vi.spyOn(database.todo, 'findFirst').mockResolvedValue(record);
  const response = await request(app).get('/api/health');
  expect(response.status).toBe(200);
  expect(response.body).toEqual({ status: 'ok' });
  expect(findFirst).toHaveBeenCalledWith({ select: { id: true } });
});

it('lists tasks from the database through GET /api/todos', async () => {
  const { app, database } = setup();
  vi.spyOn(database.todo, 'findMany').mockResolvedValue([record]);
  const response = await request(app).get('/api/todos');
  expect(response.status).toBe(200);
  expect(response.body).toEqual([todo]);
});

it('rejects a malformed JSON body on POST /api/todos with 422', async () => {
  const { app } = setup();
  const response = await request(app).post('/api/todos').set('Content-Type', 'application/json').send('{"title": ');
  expect(response.status).toBe(422);
  expect(response.body).toEqual({ detail: 'Invalid JSON.' });
});

it('rejects a body above the JSON limit with 413', async () => {
  const { app } = setup();
  const body = `{"title":"${'x'.repeat(200 * 1024)}"}`;
  const response = await request(app).post('/api/todos').set('Content-Type', 'application/json').send(body);
  expect(response.status).toBe(413);
  expect(response.body).toEqual({ detail: 'Request body too large.' });
});

it('responds 500 and logs the error when a repository call fails', async () => {
  const { app, database } = setup();
  vi.spyOn(database.todo, 'findMany').mockRejectedValue(new Error('db down'));
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  const response = await request(app).get('/api/todos');
  expect(response.status).toBe(500);
  expect(response.body).toEqual({ detail: 'Internal Server Error' });
  expect(errorSpy).toHaveBeenCalled();
});
