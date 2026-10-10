import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, expect, it, vi } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import { todoKeys } from '../api/queryKeys'
import { todosApi } from '../api/todos'
import { useTodosQuery } from './useTodosQuery'

vi.mock('../api/todos', () => ({
  todosApi: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  },
}))

function setup() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return { queryClient, wrapper }
}

beforeEach(() => vi.clearAllMocks())

it('resolves data from todosApi.list and caches it under the list key', async () => {
  const { wrapper, queryClient } = setup()
  vi.mocked(todosApi.list).mockResolvedValue([todoFixture])
  const { result } = renderHook(() => useTodosQuery(), { wrapper })
  await waitFor(() => expect(result.current.isSuccess).toBe(true))
  expect(result.current.data).toEqual([todoFixture])
  expect(queryClient.getQueryData(todoKeys.list)).toEqual([todoFixture])
})

it('passes an AbortSignal to todosApi.list', async () => {
  const { wrapper } = setup()
  vi.mocked(todosApi.list).mockResolvedValue([])
  const { result } = renderHook(() => useTodosQuery(), { wrapper })
  await waitFor(() => expect(result.current.isSuccess).toBe(true))
  expect(todosApi.list).toHaveBeenCalledWith(expect.any(AbortSignal))
})

it('exposes the error when todosApi.list rejects', async () => {
  const { wrapper } = setup()
  vi.mocked(todosApi.list).mockRejectedValue(
    new Error('Cannot connect to the server. Please try again.'),
  )
  const { result } = renderHook(() => useTodosQuery(), { wrapper })
  await waitFor(() => expect(result.current.isError).toBe(true))
  expect(result.current.error?.message).toBe(
    'Cannot connect to the server. Please try again.',
  )
})
