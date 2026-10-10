import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { start } from '../src/core/lifespan.ts';
import { createDatabase, initialize } from '../src/core/database.ts';
import { resolveDatabaseUrl } from '../src/core/config.ts';
import { createApp } from '../src/factory.ts';

vi.mock('../src/core/database.ts', () => ({ createDatabase: vi.fn(), initialize: vi.fn() }));
vi.mock('../src/core/config.ts', () => ({ resolveDatabaseUrl: vi.fn() }));
vi.mock('../src/factory.ts', () => ({ createApp: vi.fn() }));

// A listener that reports its port and closes through a mock.
function fakeServer(port: number) {
  return Object.assign(new EventEmitter(), {
    address: () => ({ address: '0.0.0.0', family: 'IPv4', port }),
    close: vi.fn((callback?: () => void) => callback?.()),
  });
}

let database: { $connect: ReturnType<typeof vi.fn>; $disconnect: ReturnType<typeof vi.fn> };
let server: ReturnType<typeof fakeServer>;
let listen: ReturnType<typeof vi.fn>;
let once: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  database = { $connect: vi.fn().mockResolvedValue(undefined), $disconnect: vi.fn().mockResolvedValue(undefined) };
  vi.mocked(createDatabase).mockReturnValue(database as never);
  vi.mocked(resolveDatabaseUrl).mockReturnValue('postgresql://test:test@localhost:5432/test');
  vi.mocked(initialize).mockResolvedValue(undefined);
  // Call the listen callback on a microtask: the source reads the listener inside it.
  server = fakeServer(8000);
  listen = vi.fn((port: number, host: string, callback: () => void) => {
    server = fakeServer(port);
    queueMicrotask(callback);
    return server;
  });
  vi.mocked(createApp).mockReturnValue({ listen } as never);
  once = vi.spyOn(process, 'once').mockImplementation(() => process);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.stubEnv('API_PORT', '');
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  process.exitCode = undefined;
});

function handlerFor(signal: string) {
  const call = once.mock.calls.find((args: unknown[]) => args[0] === signal);
  return call?.[1] as () => void;
}

it('connects, initializes the database and returns the server and database', async () => {
  const result = await start();
  expect(database.$connect).toHaveBeenCalledOnce();
  expect(initialize).toHaveBeenCalledWith(database);
  expect(result).toEqual({ server, database });
});

it('listens on API_PORT on 0.0.0.0 when set', async () => {
  vi.stubEnv('API_PORT', '9001');
  await start();
  expect(listen).toHaveBeenCalledWith(9001, '0.0.0.0', expect.any(Function));
});

it('listens on port 8000 when API_PORT is unset', async () => {
  await start();
  expect(listen).toHaveBeenCalledWith(8000, '0.0.0.0', expect.any(Function));
});

it('logs the port the server is listening on', async () => {
  vi.stubEnv('API_PORT', '9001');
  await start();
  expect(console.log).toHaveBeenCalledWith('Taskly App Node API listening on port 9001');
});

it('registers SIGTERM and SIGINT handlers with process.once', async () => {
  await start();
  expect(once).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
  expect(once).toHaveBeenCalledWith('SIGINT', expect.any(Function));
});

it('the SIGTERM handler closes the server and then disconnects the database', async () => {
  await start();
  handlerFor('SIGTERM')();
  await vi.waitFor(() => expect(database.$disconnect).toHaveBeenCalledOnce());
  expect(server.close).toHaveBeenCalledOnce();
  expect(process.exitCode).toBeUndefined();
});

it('logs the error and sets exitCode to 1 when disconnecting fails during shutdown', async () => {
  const failure = new Error('disconnect failed');
  database.$disconnect.mockRejectedValueOnce(failure);
  await start();
  handlerFor('SIGINT')();
  await vi.waitFor(() => expect(console.error).toHaveBeenCalledWith(failure));
  expect(process.exitCode).toBe(1);
});

it('when connecting fails, disconnects the database and rethrows', async () => {
  const failure = new Error('connection refused');
  database.$connect.mockRejectedValueOnce(failure);
  await expect(start()).rejects.toBe(failure);
  expect(database.$disconnect).toHaveBeenCalledOnce();
  expect(listen).not.toHaveBeenCalled();
});

it('when listen emits an error, rejects, disconnects the database and rethrows', async () => {
  const failure = new Error('EADDRINUSE');
  listen.mockImplementationOnce(() => {
    const failing = fakeServer(8000);
    queueMicrotask(() => failing.emit('error', failure));
    return failing;
  });
  await expect(start()).rejects.toBe(failure);
  expect(database.$disconnect).toHaveBeenCalledOnce();
});
