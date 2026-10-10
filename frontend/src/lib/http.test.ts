import { afterEach, expect, it, vi } from 'vitest'
import { request } from './http'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

function stubFetch(impl: () => Promise<Response>) {
  const fetchMock = vi.fn(impl)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => vi.unstubAllGlobals())

it('calls fetch with the /api prefix and a JSON content type, and returns parsed JSON', async () => {
  const fetchMock = stubFetch(async () => json({ status: 'ok' }))
  await expect(request<{ status: string }>('/health')).resolves.toEqual({
    status: 'ok',
  })
  expect(fetchMock).toHaveBeenCalledWith('/api/health', {
    headers: { 'Content-Type': 'application/json' },
  })
})

it('merges caller headers and lets them override the default content type', async () => {
  const fetchMock = stubFetch(async () => json({}))
  await request('/todos', {
    headers: { 'Content-Type': 'text/plain', 'X-Trace': '1' },
  })
  expect(fetchMock).toHaveBeenCalledWith('/api/todos', {
    headers: { 'Content-Type': 'text/plain', 'X-Trace': '1' },
  })
})

it('passes method and body through to fetch', async () => {
  const fetchMock = stubFetch(async () => json({}, 201))
  await request('/todos', { method: 'POST', body: '{"title":"A"}' })
  expect(fetchMock).toHaveBeenCalledWith(
    '/api/todos',
    expect.objectContaining({ method: 'POST', body: '{"title":"A"}' }),
  )
})

it('returns undefined for a 204 response', async () => {
  stubFetch(async () => new Response(null, { status: 204 }))
  await expect(
    request('/todos/7', { method: 'DELETE' }),
  ).resolves.toBeUndefined()
})

it('throws the connection message when the network fails', async () => {
  stubFetch(async () => {
    throw new TypeError('Failed to fetch')
  })
  await expect(request('/todos')).rejects.toThrow(
    'Cannot connect to the server. Please try again.',
  )
})

it('rethrows the original error when the request was aborted', async () => {
  const controller = new AbortController()
  controller.abort()
  const abortError = new DOMException(
    'The operation was aborted.',
    'AbortError',
  )
  stubFetch(async () => {
    throw abortError
  })
  await expect(request('/todos', { signal: controller.signal })).rejects.toBe(
    abortError,
  )
})

it('throws the check-details message for a 422 response', async () => {
  stubFetch(async () => json({ detail: [{ msg: 'invalid' }] }, 422))
  await expect(request('/todos')).rejects.toThrow(
    'Check the task details: title up to 120 characters, description up to 2000 characters, and a valid due date.',
  )
})

it('throws the string detail of a non-ok response', async () => {
  stubFetch(async () => json({ detail: 'Task not found.' }, 404))
  await expect(request('/todos/1')).rejects.toThrow('Task not found.')
})

it('throws the generic message when a non-ok response detail is not a string', async () => {
  stubFetch(async () => json({ detail: [{ msg: 'bad' }] }, 400))
  await expect(request('/todos')).rejects.toThrow(
    'The operation failed. Please try again.',
  )
})

it('throws the generic message when a non-ok response body is not JSON', async () => {
  stubFetch(
    async () => new Response('<html>Bad gateway</html>', { status: 502 }),
  )
  await expect(request('/todos')).rejects.toThrow(
    'The operation failed. Please try again.',
  )
})
