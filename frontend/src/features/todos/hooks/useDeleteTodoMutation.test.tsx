import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, expect, it, vi } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import { todoKeys } from '../api/queryKeys'
import { todosApi } from '../api/todos'
import { useDeleteTodoMutation } from './useDeleteTodoMutation'

vi.mock('../api/todos', () => ({
  todosApi: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  },
}))

const other = { ...todoFixture, id: 9, title: 'Other task' }

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

it('mutateAsync calls todosApi.remove with the id', async () => {
  const { wrapper } = setup()
  vi.mocked(todosApi.remove).mockResolvedValue(undefined)
  const { result } = renderHook(() => useDeleteTodoMutation(), { wrapper })
  await act(async () => {
    await result.current.mutateAsync(7)
  })
  expect(todosApi.remove).toHaveBeenCalledWith(7)
})

it('removes only the matching todo from the cached list', async () => {
  const { wrapper, queryClient } = setup()
  queryClient.setQueryData(todoKeys.list, [todoFixture, other])
  vi.mocked(todosApi.remove).mockResolvedValue(undefined)
  const { result } = renderHook(() => useDeleteTodoMutation(), { wrapper })
  await act(async () => {
    await result.current.mutateAsync(7)
  })
  expect(queryClient.getQueryData(todoKeys.list)).toEqual([other])
})

it('leaves the cache undefined when no list was cached', async () => {
  const { wrapper, queryClient } = setup()
  vi.mocked(todosApi.remove).mockResolvedValue(undefined)
  const { result } = renderHook(() => useDeleteTodoMutation(), { wrapper })
  await act(async () => {
    await result.current.mutateAsync(7)
  })
  expect(queryClient.getQueryData(todoKeys.list)).toBeUndefined()
})

it('leaves the cached list unchanged when the deletion is rejected', async () => {
  const { wrapper, queryClient } = setup()
  queryClient.setQueryData(todoKeys.list, [todoFixture, other])
  vi.mocked(todosApi.remove).mockRejectedValue(new Error('Task not found.'))
  const { result } = renderHook(() => useDeleteTodoMutation(), { wrapper })
  await act(async () => {
    await result.current.mutateAsync(7).catch(() => undefined)
  })
  await waitFor(() => expect(result.current.isError).toBe(true))
  expect(queryClient.getQueryData(todoKeys.list)).toEqual([todoFixture, other])
})
