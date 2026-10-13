import { afterEach, beforeEach, it, expect, vi } from 'vitest';
import { resolveDatabaseUrl } from '../src/core/config.ts';

const parts = {
  POSTGRES_USER: 'taskly',
  POSTGRES_PASSWORD: 'secret',
  POSTGRES_HOST: 'localhost',
  DB_PORT: '5432',
  POSTGRES_DB: 'taskly',
};

beforeEach(() => {
  // Start every test from a clean slate so no real .env value leaks in.
  vi.stubEnv('DATABASE_URL', '');
  for (const name of Object.keys(parts)) vi.stubEnv(name, '');
});
afterEach(() => vi.unstubAllEnvs());

it('returns the override argument unchanged when given, even if DATABASE_URL is set', () => {
  vi.stubEnv('DATABASE_URL', 'postgresql://env:env@envhost:5432/env');
  expect(resolveDatabaseUrl('postgresql://arg:arg@argvhost:5432/arg')).toBe('postgresql://arg:arg@argvhost:5432/arg');
});

it('returns DATABASE_URL when no override is given', () => {
  vi.stubEnv('DATABASE_URL', 'postgresql://env:env@envhost:5432/env');
  expect(resolveDatabaseUrl()).toBe('postgresql://env:env@envhost:5432/env');
});

it('rewrites a postgresql+psycopg: scheme prefix to postgresql:', () => {
  expect(resolveDatabaseUrl('postgresql+psycopg://u:p@localhost:5432/db')).toBe('postgresql://u:p@localhost:5432/db');
});

it.each(Object.keys(parts))('throws for a missing %s when DATABASE_URL is unset', (name) => {
  for (const [key, value] of Object.entries(parts)) vi.stubEnv(key, key === name ? '' : value);
  expect(() => resolveDatabaseUrl()).toThrow(`Missing environment variable: ${name}`);
});

it('builds the URL from the five variables', () => {
  for (const [key, value] of Object.entries(parts)) vi.stubEnv(key, value);
  expect(resolveDatabaseUrl()).toBe('postgresql://taskly:secret@localhost:5432/taskly');
});

it('percent-encodes special characters in the password and database name', () => {
  for (const [key, value] of Object.entries(parts)) vi.stubEnv(key, value);
  vi.stubEnv('POSTGRES_PASSWORD', 'p@ss:w/rd#');
  vi.stubEnv('POSTGRES_DB', 'my db');
  const url = new URL(resolveDatabaseUrl());
  expect(decodeURIComponent(url.password)).toBe('p@ss:w/rd#');
  expect(url.pathname).toBe('/my%20db');
  expect(url.hostname).toBe('localhost');
  expect(url.port).toBe('5432');
});
