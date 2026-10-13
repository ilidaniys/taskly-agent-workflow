import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, it, expect, vi } from 'vitest';
import { start } from '../src/core/lifespan.ts';

const mocks = vi.hoisted(() => ({
  createDatabase: vi.fn(),
  initialize: vi.fn(),
  resolveDatabaseUrl: vi.fn(),
  createApp: vi.fn(),
}));

vi.mock('../src/core/database.ts', () => ({ createDatabase: mocks.createDatabase, initialize: mocks.initialize }));
vi.mock('../src/core/config.ts', () => ({ resolveDatabaseUrl: mocks.resolveDatabaseUrl }));
vi.mock('../src/factory.ts', () => ({ createApp: mocks.createApp }));

let database: { $connect: ReturnType<typeof vi.fn>; $disconnect: ReturnType<typeof vi.fn> };
let app: { listen: ReturnType<typeof vi.fn> };
let listenMode: 'listen' | 'error';
let listener: EventEmitter & { address: () => { port: number }; close: ReturnType<typeof vi.fn> };
let once: ReturnType<typeof vi.spyOn>;
let log: ReturnType<typeof vi.spyOn>;
const originalExitCode = process.exitCode;

function handlerFor(signal: string): () => void {
  const call = once.mock.calls.find((args: unknown[]) => args[0] === signal);
  return call![1] as () => void;
}

beforeEach(() => {
  listenMode = 'listen';
  database = { $connect: vi.fn().mockResolvedValue(undefined), $disconnect: vi.fn().mockResolvedValue(undefined) };
  app = {
    listen: vi.fn((port: number, host: string, callback: () => void) => {
      listener = Object.assign(new EventEmitter(), {
        address: () => ({ port }),
        close: vi.fn((done?: () => void) => done?.()),
      });
      if (listenMode === 'error') queueMicrotask(() => listener.emit('error', new Error('EADDRINUSE')));
      else queueMicrotask(callback);
      return listener;
    }),
  };
  mocks.createDatabase.mockReturnValue(database);
  mocks.initialize.mockResolvedValue(undefined);
  mocks.resolveDatabaseUrl.mockReturnValue('postgresql://test');
  mocks.createApp.mockReturnValue(app);
  // Spy so that no real signal handler is registered on the test process.
  once = vi.spyOn(process, 'once').mockReturnValue(process);
  log = vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  process.exitCode = originalExitCode;
});

it('connects, initializes the database, creates the app and resolves with the server and database', async () => {
  const result = await start();
  expect(mocks.createDatabase).toHaveBeenCalledWith('postgresql://test');
  expect(database.$connect).toHaveBeenCalledOnce();
  expect(mocks.initialize).toHaveBeenCalledWith(database);
  expect(mocks.createApp).toHaveBeenCalledWith(database);
  expect(result).toEqual({ server: listener, database });
});

it('listens on API_PORT when set', async () => {
  vi.stubEnv('API_PORT', '9000');
  await start();
  expect(app.listen).toHaveBeenCalledWith(9000, '0.0.0.0', expect.any(Function));
});

it('listens on port 8000 when API_PORT is unset', async () => {
  vi.stubEnv('API_PORT', '');
  await start();
  expect(app.listen).toHaveBeenCalledWith(8000, '0.0.0.0', expect.any(Function));
});

it('logs the port reported by server.address()', async () => {
  vi.stubEnv('API_PORT', '9000');
  await start();
  expect(log).toHaveBeenCalledWith('Taskly App Node API listening on port 9000');
});

it('registers SIGTERM and SIGINT shutdown handlers with process.once', async () => {
  await start();
  expect(once).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
  expect(once).toHaveBeenCalledWith('SIGINT', expect.any(Function));
});

it('a captured shutdown handler closes the server and disconnects the database', async () => {
  await start();
  handlerFor('SIGTERM')();
  await vi.waitFor(() => expect(database.$disconnect).toHaveBeenCalledOnce());
  expect(listener.close).toHaveBeenCalledOnce();
});

it('shutdown logs the error and sets exitCode to 1 when $disconnect rejects', async () => {
  await start();
  const failure = new Error('disconnect failed');
  database.$disconnect.mockRejectedValueOnce(failure);
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  handlerFor('SIGINT')();
  await vi.waitFor(() => expect(errorSpy).toHaveBeenCalledWith(failure));
  expect(process.exitCode).toBe(1);
});

it('when $connect rejects, disconnects the database and rethrows the error', async () => {
  const failure = new Error('no database');
  database.$connect.mockRejectedValueOnce(failure);
  await expect(start()).rejects.toThrow('no database');
  expect(database.$disconnect).toHaveBeenCalledOnce();
  expect(app.listen).not.toHaveBeenCalled();
});

it('when the listener emits error, rejects, disconnects and rethrows', async () => {
  listenMode = 'error';
  await expect(start()).rejects.toThrow('EADDRINUSE');
  expect(database.$disconnect).toHaveBeenCalledOnce();
});
