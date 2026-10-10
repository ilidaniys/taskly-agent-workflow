import { afterEach, expect, it, vi } from 'vitest'
import { request } from './http'

afterEach(() => {
  vi.unstubAllGlobals()
})

function stubFetch(impl: () => Promise<Response>) {
  const fetchMock = vi.fn(impl)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

it('prefixes the path with /api and sends a JSON content type', async () => {
  const fetchMock = stubFetch(async () => new Response('[]', { status: 200 }))
  await request('/todos')
  expect(fetchMock).toHaveBeenCalledWith('/api/todos', {
    headers: { 'Content-Type': 'application/json' },
  })
})

it('merges caller headers over the default and forwards other init options', async () => {
  const fetchMock = stubFetch(async () => new Response('{}', { status: 200 }))
  await request('/todos/7', {
    method: 'PATCH',
    body: '{}',
    headers: { 'Content-Type': 'text/plain', 'X-Trace': 'abc' },
  })
  expect(fetchMock).toHaveBeenCalledWith('/api/todos/7', {
    method: 'PATCH',
    body: '{}',
    headers: { 'Content-Type': 'text/plain', 'X-Trace': 'abc' },
  })
})

it('returns the parsed JSON body for a successful response', async () => {
  stubFetch(async () => Response.json({ id: 7 }, { status: 200 }))
  await expect(request<{ id: number }>('/todos/7')).resolves.toEqual({ id: 7 })
})

it('returns undefined for a 204 response', async () => {
  stubFetch(async () => new Response(null, { status: 204 }))
  await expect(
    request('/todos/7', { method: 'DELETE' }),
  ).resolves.toBeUndefined()
})

it('rejects with the connection message when fetch throws', async () => {
  stubFetch(async () => {
    throw new TypeError('Failed to fetch')
  })
  await expect(request('/todos')).rejects.toThrow(
    'Cannot connect to the server. Please try again.',
  )
})

it('rethrows the original error when fetch throws and init.signal is aborted', async () => {
  const controller = new AbortController()
  const abortError = new DOMException(
    'The operation was aborted.',
    'AbortError',
  )
  stubFetch(async () => {
    controller.abort()
    throw abortError
  })
  await expect(request('/todos', { signal: controller.signal })).rejects.toBe(
    abortError,
  )
})

it('rejects a 422 with the task-details validation message regardless of the body', async () => {
  const expected =
    'Check the task details: title up to 120 characters, description up to 2000 characters, and a valid due date.'
  stubFetch(async () => Response.json({ detail: 'ignored' }, { status: 422 }))
  await expect(request('/todos')).rejects.toThrow(expected)
  stubFetch(async () => new Response('not json', { status: 422 }))
  await expect(request('/todos')).rejects.toThrow(expected)
})

it('rejects a non-ok response with a string detail using that detail', async () => {
  stubFetch(async () =>
    Response.json({ detail: 'Task not found.' }, { status: 404 }),
  )
  await expect(request('/todos/7')).rejects.toThrow('Task not found.')
})

it('rejects a non-ok response with a non-string detail using the generic failure message', async () => {
  stubFetch(async () =>
    Response.json({ detail: [{ msg: 'bad field' }] }, { status: 400 }),
  )
  await expect(request('/todos')).rejects.toThrow(
    'The operation failed. Please try again.',
  )
})

it('rejects a non-ok response with a non-JSON body using the generic failure message', async () => {
  stubFetch(
    async () => new Response('<html>Bad gateway</html>', { status: 502 }),
  )
  await expect(request('/todos')).rejects.toThrow(
    'The operation failed. Please try again.',
  )
})
