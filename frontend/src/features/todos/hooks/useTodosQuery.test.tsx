import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { beforeEach, expect, it, vi } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import { todoKeys } from '../api/queryKeys'
import { todosApi } from '../api/todos'
import { useTodosQuery } from './useTodosQuery'

vi.mock('../api/todos', () => ({
  todosApi: {
    create: vi.fn(),
    list: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  },
}))

let queryClient: QueryClient
function setup() {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return renderHook(() => useTodosQuery(), { wrapper })
}

beforeEach(() => {
  vi.clearAllMocks()
})

it('returns todos from todosApi.list once resolved', async () => {
  vi.mocked(todosApi.list).mockResolvedValue([todoFixture])
  const { result } = setup()
  await waitFor(() => expect(result.current.isSuccess).toBe(true))
  expect(result.current.data).toEqual([todoFixture])
})

it('passes an AbortSignal to todosApi.list', async () => {
  vi.mocked(todosApi.list).mockResolvedValue([])
  const { result } = setup()
  await waitFor(() => expect(result.current.isSuccess).toBe(true))
  expect(todosApi.list).toHaveBeenCalledWith(expect.any(AbortSignal))
})

it('stores the result in the cache under todoKeys.list', async () => {
  vi.mocked(todosApi.list).mockResolvedValue([todoFixture])
  const { result } = setup()
  await waitFor(() => expect(result.current.isSuccess).toBe(true))
  expect(queryClient.getQueryData(todoKeys.list)).toEqual([todoFixture])
})

it('exposes the error when todosApi.list rejects', async () => {
  vi.mocked(todosApi.list).mockRejectedValue(
    new Error('Cannot connect to the server. Please try again.'),
  )
  const { result } = setup()
  await waitFor(() => expect(result.current.isError).toBe(true))
  expect(result.current.error?.message).toBe(
    'Cannot connect to the server. Please try again.',
  )
})
