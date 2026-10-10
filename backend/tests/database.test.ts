import { afterEach, expect, it, vi } from 'vitest';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.ts';
import { createDatabase, initialize } from '../src/core/database.ts';

vi.mock('@prisma/adapter-pg', () => ({ PrismaPg: vi.fn() }));
vi.mock('../src/generated/prisma/client.ts', () => ({ PrismaClient: vi.fn() }));

afterEach(() => {
  vi.clearAllMocks();
});

it('createDatabase constructs PrismaPg with the connection string and a 10 second timeout', () => {
  createDatabase('postgresql://test:test@localhost:5432/test');
  expect(PrismaPg).toHaveBeenCalledWith({ connectionString: 'postgresql://test:test@localhost:5432/test', connectionTimeoutMillis: 10000 });
});

it('createDatabase passes that adapter to PrismaClient and returns the instance', () => {
  const adapter = { adapter: true };
  vi.mocked(PrismaPg).mockImplementationOnce(function () { return adapter as unknown as PrismaPg; });
  const instance = { instance: true };
  vi.mocked(PrismaClient).mockImplementationOnce(function () { return instance as unknown as PrismaClient; });
  expect(createDatabase('postgresql://test:test@localhost:5432/test')).toBe(instance);
  expect(PrismaClient).toHaveBeenCalledWith({ adapter });
});

it('initialize issues exactly one raw statement', async () => {
  const database = { $executeRaw: vi.fn().mockResolvedValue(0) };
  await initialize(database as unknown as PrismaClient);
  expect(database.$executeRaw).toHaveBeenCalledOnce();
});

it('initialize creates the todos table only if it does not exist', async () => {
  const database = { $executeRaw: vi.fn().mockResolvedValue(0) };
  await initialize(database as unknown as PrismaClient);
  const [strings] = database.$executeRaw.mock.calls[0] as unknown as [TemplateStringsArray];
  expect(strings.join('?')).toContain('CREATE TABLE IF NOT EXISTS todos');
});

it('initialize propagates a rejection from $executeRaw', async () => {
  const failure = new Error('permission denied');
  const database = { $executeRaw: vi.fn().mockRejectedValue(failure) };
  await expect(initialize(database as unknown as PrismaClient)).rejects.toBe(failure);
});
