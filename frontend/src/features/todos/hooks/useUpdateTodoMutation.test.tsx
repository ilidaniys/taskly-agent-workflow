import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, expect, it, vi } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import { todoKeys } from '../api/queryKeys'
import { todosApi } from '../api/todos'
import { useUpdateTodoMutation } from './useUpdateTodoMutation'

vi.mock('../api/todos', () => ({
  todosApi: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  },
}))

const saved = { ...todoFixture, completed: true }
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

it('mutateAsync calls todosApi.update with the id and input', async () => {
  const { wrapper } = setup()
  vi.mocked(todosApi.update).mockResolvedValue(saved)
  const { result } = renderHook(() => useUpdateTodoMutation(), { wrapper })
  await act(async () => {
    await result.current.mutateAsync({ id: 7, input: { completed: true } })
  })
  expect(todosApi.update).toHaveBeenCalledWith(7, { completed: true })
})

it('replaces only the saved todo in the cached list, keeping order', async () => {
  const { wrapper, queryClient } = setup()
  queryClient.setQueryData(todoKeys.list, [other, todoFixture])
  vi.mocked(todosApi.update).mockResolvedValue(saved)
  const { result } = renderHook(() => useUpdateTodoMutation(), { wrapper })
  await act(async () => {
    await result.current.mutateAsync({ id: 7, input: { completed: true } })
  })
  expect(queryClient.getQueryData(todoKeys.list)).toEqual([other, saved])
})

it('leaves the cache undefined when no list was cached', async () => {
  const { wrapper, queryClient } = setup()
  vi.mocked(todosApi.update).mockResolvedValue(saved)
  const { result } = renderHook(() => useUpdateTodoMutation(), { wrapper })
  await act(async () => {
    await result.current.mutateAsync({ id: 7, input: { completed: true } })
  })
  expect(queryClient.getQueryData(todoKeys.list)).toBeUndefined()
})

it('leaves the cache unchanged on rejection and exposes the error', async () => {
  const { wrapper, queryClient } = setup()
  queryClient.setQueryData(todoKeys.list, [todoFixture])
  vi.mocked(todosApi.update).mockRejectedValue(new Error('Task not found.'))
  const { result } = renderHook(() => useUpdateTodoMutation(), { wrapper })
  await act(async () => {
    await result.current
      .mutateAsync({ id: 7, input: { completed: true } })
      .catch(() => undefined)
  })
  await waitFor(() => expect(result.current.isError).toBe(true))
  expect(result.current.error?.message).toBe('Task not found.')
  expect(queryClient.getQueryData(todoKeys.list)).toEqual([todoFixture])
})
