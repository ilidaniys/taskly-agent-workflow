import { act, renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { beforeEach, expect, it, vi } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import { todoKeys } from '../api/queryKeys'
import { todosApi } from '../api/todos'
import { useUpdateTodoMutation } from './useUpdateTodoMutation'

vi.mock('../api/todos', () => ({
  todosApi: {
    create: vi.fn(),
    list: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  },
}))

const other = { ...todoFixture, id: 8, title: 'Other task' }
const renamed = { ...todoFixture, title: 'Renamed task' }

let queryClient: QueryClient
function setup() {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return renderHook(() => useUpdateTodoMutation(), { wrapper })
}

beforeEach(() => {
  vi.clearAllMocks()
})

it('calls todosApi.update with the id and the partial input', async () => {
  vi.mocked(todosApi.update).mockResolvedValue(renamed)
  const { result } = setup()
  await act(async () => {
    await result.current.mutateAsync({
      id: todoFixture.id,
      input: { title: 'Renamed task' },
    })
  })
  expect(todosApi.update).toHaveBeenCalledWith(todoFixture.id, {
    title: 'Renamed task',
  })
})

it('replaces the todo with the same id in the cached list and leaves the others', async () => {
  vi.mocked(todosApi.update).mockResolvedValue(renamed)
  const { result } = setup()
  queryClient.setQueryData(todoKeys.list, [other, todoFixture])
  await act(async () => {
    await result.current.mutateAsync({
      id: todoFixture.id,
      input: { title: 'Renamed task' },
    })
  })
  expect(queryClient.getQueryData(todoKeys.list)).toEqual([other, renamed])
})

it('leaves the list cache undefined when nothing is cached', async () => {
  vi.mocked(todosApi.update).mockResolvedValue(renamed)
  const { result } = setup()
  await act(async () => {
    await result.current.mutateAsync({
      id: todoFixture.id,
      input: { title: 'Renamed task' },
    })
  })
  expect(queryClient.getQueryData(todoKeys.list)).toBeUndefined()
})

it('cancels in-flight list queries before writing to the cache', async () => {
  vi.mocked(todosApi.update).mockResolvedValue(renamed)
  const { result } = setup()
  const cancel = vi.spyOn(queryClient, 'cancelQueries')
  const write = vi.spyOn(queryClient, 'setQueryData')
  await act(async () => {
    await result.current.mutateAsync({
      id: todoFixture.id,
      input: { title: 'Renamed task' },
    })
  })
  expect(cancel).toHaveBeenCalledWith({ queryKey: todoKeys.list })
  expect(cancel.mock.invocationCallOrder[0]).toBeLessThan(
    write.mock.invocationCallOrder[0],
  )
})

it('keeps the cache unchanged when update rejects', async () => {
  vi.mocked(todosApi.update).mockRejectedValue(new Error('Server error'))
  const { result } = setup()
  queryClient.setQueryData(todoKeys.list, [other, todoFixture])
  await act(async () => {
    await expect(
      result.current.mutateAsync({
        id: todoFixture.id,
        input: { title: 'Renamed task' },
      }),
    ).rejects.toThrow('Server error')
  })
  expect(queryClient.getQueryData(todoKeys.list)).toEqual([other, todoFixture])
})
