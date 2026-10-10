import express from 'express';
import request from 'supertest';
import { it, expect, vi } from 'vitest';
import { createHealthRouter } from '../src/api/health.ts';
import type { Database } from '../src/features/todos/types.ts';

function setup(findFirst = vi.fn().mockResolvedValue({ id: 1 })) {
  const database = { todo: { findFirst } } as unknown as Database;
  const app = express();
  app.use('/api', createHealthRouter(database));
  return { app, findFirst };
}

it('responds 200 with status ok after querying the database', async () => {
  const { app, findFirst } = setup();
  const response = await request(app).get('/api/health');
  expect(response.status).toBe(200);
  expect(response.body).toEqual({ status: 'ok' });
  expect(findFirst).toHaveBeenCalledWith({ select: { id: true } });
});

it('does not answer 200 when the database query rejects', async () => {
  const { app } = setup(vi.fn().mockRejectedValue(new Error('down')));
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  const response = await request(app).get('/api/health');
  expect(response.status).toBe(500);
  errorSpy.mockRestore();
});
