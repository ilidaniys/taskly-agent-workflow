import express from 'express';
import request from 'supertest';
import { it, expect, vi } from 'vitest';
import { createHealthRouter } from '../src/api/health.ts';
import type { Database } from '../src/features/todos/types.ts';

function setup() {
  const findFirst = vi.fn().mockResolvedValue(null);
  const database = { todo: { findFirst } } as unknown as Database;
  const app = express();
  app.use('/api', createHealthRouter(database));
  return { app, findFirst };
}

it('GET /api/health responds 200 with status ok', async () => {
  const { app } = setup();
  const response = await request(app).get('/api/health');
  expect(response.status).toBe(200);
  expect(response.body).toEqual({ status: 'ok' });
});

it('GET /api/health probes the database once with a minimal select', async () => {
  const { app, findFirst } = setup();
  await request(app).get('/api/health');
  expect(findFirst).toHaveBeenCalledOnce();
  expect(findFirst).toHaveBeenCalledWith({ select: { id: true } });
});
