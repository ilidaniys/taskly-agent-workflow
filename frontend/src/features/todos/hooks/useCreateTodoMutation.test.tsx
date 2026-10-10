import { act, renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { beforeEach, expect, it, vi } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import { todoKeys } from '../api/queryKeys'
import { todosApi } from '../api/todos'
import type { TodoInput } from '../types'
import { useCreateTodoMutation } from './useCreateTodoMutation'

vi.mock('../api/todos', () => ({
  todosApi: {
    create: vi.fn(),
    list: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  },
}))

const input: TodoInput = {
  title: 'Plan the sprint',
  description: '',
  priority: 'low',
  due_date: null,
  completed: false,
}
const other: typeof todoFixture = { ...todoFixture, id: 8, title: 'Other task' }
const saved = {
  ...todoFixture,
  id: 9,
  title: 'Plan the sprint',
  priority: 'low' as const,
}

let queryClient: QueryClient
function setup() {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return renderHook(() => useCreateTodoMutation(), { wrapper })
}

beforeEach(() => {
  vi.clearAllMocks()
})

it('calls todosApi.create with the input', async () => {
  vi.mocked(todosApi.create).mockResolvedValue(saved)
  const { result } = setup()
  await act(async () => {
    await result.current.mutateAsync(input)
  })
  expect(todosApi.create).toHaveBeenCalledWith(input)
})

it('prepends the saved todo to the cached list', async () => {
  vi.mocked(todosApi.create).mockResolvedValue(saved)
  const { result } = setup()
  queryClient.setQueryData(todoKeys.list, [todoFixture])
  await act(async () => {
    await result.current.mutateAsync(input)
  })
  expect(queryClient.getQueryData(todoKeys.list)).toEqual([saved, todoFixture])
})

it('replaces an existing todo with the same id instead of duplicating it', async () => {
  const updated = { ...todoFixture, title: 'Renamed on the server' }
  vi.mocked(todosApi.create).mockResolvedValue(updated)
  const { result } = setup()
  queryClient.setQueryData(todoKeys.list, [other, todoFixture])
  await act(async () => {
    await result.current.mutateAsync(input)
  })
  expect(queryClient.getQueryData(todoKeys.list)).toEqual([updated, other])
})

it('seeds the list with just the saved todo when the cache is empty', async () => {
  vi.mocked(todosApi.create).mockResolvedValue(saved)
  const { result } = setup()
  await act(async () => {
    await result.current.mutateAsync(input)
  })
  expect(queryClient.getQueryData(todoKeys.list)).toEqual([saved])
})

it('cancels in-flight list queries before writing to the cache', async () => {
  vi.mocked(todosApi.create).mockResolvedValue(saved)
  const { result } = setup()
  const cancel = vi.spyOn(queryClient, 'cancelQueries')
  const write = vi.spyOn(queryClient, 'setQueryData')
  await act(async () => {
    await result.current.mutateAsync(input)
  })
  expect(cancel).toHaveBeenCalledWith({ queryKey: todoKeys.list })
  expect(cancel.mock.invocationCallOrder[0]).toBeLessThan(
    write.mock.invocationCallOrder[0],
  )
})

it('leaves the cache untouched when create rejects', async () => {
  vi.mocked(todosApi.create).mockRejectedValue(new Error('Server error'))
  const { result } = setup()
  queryClient.setQueryData(todoKeys.list, [todoFixture])
  await act(async () => {
    await expect(result.current.mutateAsync(input)).rejects.toThrow(
      'Server error',
    )
  })
  expect(queryClient.getQueryData(todoKeys.list)).toEqual([todoFixture])
})
