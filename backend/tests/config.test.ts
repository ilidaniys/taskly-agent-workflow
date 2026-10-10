import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { resolveDatabaseUrl } from '../src/core/config.ts';

const components = {
  POSTGRES_USER: 'taskly',
  POSTGRES_PASSWORD: 'secret',
  POSTGRES_HOST: 'db.internal',
  DB_PORT: '5433',
  POSTGRES_DB: 'taskly_db',
};

beforeEach(() => {
  // Empty strings are falsy, so every variable reads as unset without touching a real .env.
  vi.stubEnv('DATABASE_URL', '');
  for (const [name, value] of Object.entries(components)) vi.stubEnv(name, value);
});
afterEach(() => {
  vi.unstubAllEnvs();
});

it('returns the override argument when given, ignoring DATABASE_URL', () => {
  vi.stubEnv('DATABASE_URL', 'postgresql://env:env@env-host:5432/env');
  expect(resolveDatabaseUrl('postgresql://override:pw@host:5432/other')).toBe('postgresql://override:pw@host:5432/other');
});

it('returns DATABASE_URL when no override is given', () => {
  vi.stubEnv('DATABASE_URL', 'postgresql://app:pw@host:5432/app');
  expect(resolveDatabaseUrl()).toBe('postgresql://app:pw@host:5432/app');
});

it('rewrites a postgresql+psycopg: prefix to postgresql:', () => {
  expect(resolveDatabaseUrl('postgresql+psycopg://app:pw@host:5432/app')).toBe('postgresql://app:pw@host:5432/app');
});

it('builds the URL from the discrete POSTGRES variables when no explicit URL exists', () => {
  const url = new URL(resolveDatabaseUrl());
  expect(url.protocol).toBe('postgresql:');
  expect(url.username).toBe('taskly');
  expect(url.password).toBe('secret');
  expect(url.hostname).toBe('db.internal');
  expect(url.port).toBe('5433');
  expect(url.pathname).toBe('/taskly_db');
});

it('percent-encodes special characters in the database name and credentials', () => {
  vi.stubEnv('POSTGRES_PASSWORD', 'p@ss:w/rd#');
  vi.stubEnv('POSTGRES_DB', 'my db/x?');
  const url = new URL(resolveDatabaseUrl());
  expect(decodeURIComponent(url.password)).toBe('p@ss:w/rd#');
  expect(decodeURIComponent(url.pathname)).toBe('/my db/x?');
  expect(url.password).not.toContain('@');
  expect(url.pathname).not.toContain('?');
});

it.each(Object.keys(components))('throws naming the first missing variable when %s is unset', (name) => {
  vi.stubEnv(name, '');
  expect(() => resolveDatabaseUrl()).toThrow(`Missing environment variable: ${name}`);
});
