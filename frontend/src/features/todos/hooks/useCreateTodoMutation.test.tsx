import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, expect, it, vi } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import { todoKeys } from '../api/queryKeys'
import { todosApi } from '../api/todos'
import type { TodoInput } from '../types'
import { useCreateTodoMutation } from './useCreateTodoMutation'

vi.mock('../api/todos', () => ({
  todosApi: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  },
}))

const input: TodoInput = {
  title: 'Prepare a demo',
  description: '',
  priority: 'medium',
  due_date: null,
  completed: false,
}
const saved = { ...todoFixture, id: 8, title: 'Saved task' }

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

it('mutateAsync calls todosApi.create with the input and resolves with the saved todo', async () => {
  const { wrapper } = setup()
  vi.mocked(todosApi.create).mockResolvedValue(saved)
  const { result } = renderHook(() => useCreateTodoMutation(), { wrapper })
  let returned: unknown
  await act(async () => {
    returned = await result.current.mutateAsync(input)
  })
  expect(todosApi.create).toHaveBeenCalledWith(input)
  expect(returned).toEqual(saved)
})

it('places the saved todo first in an existing cached list', async () => {
  const { wrapper, queryClient } = setup()
  queryClient.setQueryData(todoKeys.list, [todoFixture])
  vi.mocked(todosApi.create).mockResolvedValue(saved)
  const { result } = renderHook(() => useCreateTodoMutation(), { wrapper })
  await act(async () => {
    await result.current.mutateAsync(input)
  })
  expect(queryClient.getQueryData(todoKeys.list)).toEqual([saved, todoFixture])
})

it('replaces a cached todo with the same id rather than duplicating it', async () => {
  const { wrapper, queryClient } = setup()
  const other = { ...todoFixture, id: 9, title: 'Other task' }
  queryClient.setQueryData(todoKeys.list, [{ ...saved, title: 'Stale' }, other])
  vi.mocked(todosApi.create).mockResolvedValue(saved)
  const { result } = renderHook(() => useCreateTodoMutation(), { wrapper })
  await act(async () => {
    await result.current.mutateAsync(input)
  })
  expect(queryClient.getQueryData(todoKeys.list)).toEqual([saved, other])
})

it('sets the cache to [saved] when no list was cached', async () => {
  const { wrapper, queryClient } = setup()
  vi.mocked(todosApi.create).mockResolvedValue(saved)
  const { result } = renderHook(() => useCreateTodoMutation(), { wrapper })
  await act(async () => {
    await result.current.mutateAsync(input)
  })
  expect(queryClient.getQueryData(todoKeys.list)).toEqual([saved])
})

it('leaves the cache unchanged on rejection and exposes the error', async () => {
  const { wrapper, queryClient } = setup()
  queryClient.setQueryData(todoKeys.list, [todoFixture])
  vi.mocked(todosApi.create).mockRejectedValue(
    new Error('Check the task details.'),
  )
  const { result } = renderHook(() => useCreateTodoMutation(), { wrapper })
  await act(async () => {
    await result.current.mutateAsync(input).catch(() => undefined)
  })
  await waitFor(() => expect(result.current.isError).toBe(true))
  expect(result.current.error?.message).toBe('Check the task details.')
  expect(queryClient.getQueryData(todoKeys.list)).toEqual([todoFixture])
})
