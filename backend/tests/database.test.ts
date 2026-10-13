import { afterEach, it, expect, vi } from 'vitest';
import { createDatabase, initialize } from '../src/core/database.ts';

afterEach(() => vi.restoreAllMocks());

function setup() {
  // Builds a real Prisma client without connecting; $executeRaw is stubbed below.
  return createDatabase('postgresql://test:test@localhost:5432/test');
}

it('initialize creates the todos table if it does not exist', async () => {
  const database = setup();
  const executeRaw = vi.spyOn(database, '$executeRaw').mockResolvedValue(0);
  await initialize(database);
  expect(executeRaw).toHaveBeenCalledOnce();
  const [strings] = executeRaw.mock.calls[0] as unknown as [TemplateStringsArray];
  expect(strings.join('')).toMatch(/CREATE TABLE IF NOT EXISTS todos/);
});

it('initialize resolves to undefined', async () => {
  const database = setup();
  vi.spyOn(database, '$executeRaw').mockResolvedValue(0);
  await expect(initialize(database)).resolves.toBeUndefined();
});

it('initialize propagates a rejection from $executeRaw', async () => {
  const database = setup();
  vi.spyOn(database, '$executeRaw').mockRejectedValue(new Error('table failed'));
  await expect(initialize(database)).rejects.toThrow('table failed');
});
