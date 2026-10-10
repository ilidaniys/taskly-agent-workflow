import { act, renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { beforeEach, expect, it, vi } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import { todoKeys } from '../api/queryKeys'
import { todosApi } from '../api/todos'
import { useDeleteTodoMutation } from './useDeleteTodoMutation'

vi.mock('../api/todos', () => ({
  todosApi: {
    create: vi.fn(),
    list: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  },
}))

const other = { ...todoFixture, id: 8, title: 'Other task' }

let queryClient: QueryClient
function setup() {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return renderHook(() => useDeleteTodoMutation(), { wrapper })
}

beforeEach(() => {
  vi.clearAllMocks()
})

it('calls todosApi.remove with the id', async () => {
  vi.mocked(todosApi.remove).mockResolvedValue(undefined)
  const { result } = setup()
  await act(async () => {
    await result.current.mutateAsync(todoFixture.id)
  })
  expect(todosApi.remove).toHaveBeenCalledWith(todoFixture.id)
})

it('removes only the deleted todo from the cached list', async () => {
  vi.mocked(todosApi.remove).mockResolvedValue(undefined)
  const { result } = setup()
  queryClient.setQueryData(todoKeys.list, [todoFixture, other])
  await act(async () => {
    await result.current.mutateAsync(todoFixture.id)
  })
  expect(queryClient.getQueryData(todoKeys.list)).toEqual([other])
})

it('leaves the list cache undefined when nothing is cached', async () => {
  vi.mocked(todosApi.remove).mockResolvedValue(undefined)
  const { result } = setup()
  await act(async () => {
    await result.current.mutateAsync(todoFixture.id)
  })
  expect(queryClient.getQueryData(todoKeys.list)).toBeUndefined()
})

it('cancels in-flight list queries before writing to the cache', async () => {
  vi.mocked(todosApi.remove).mockResolvedValue(undefined)
  const { result } = setup()
  const cancel = vi.spyOn(queryClient, 'cancelQueries')
  const write = vi.spyOn(queryClient, 'setQueryData')
  await act(async () => {
    await result.current.mutateAsync(todoFixture.id)
  })
  expect(cancel).toHaveBeenCalledWith({ queryKey: todoKeys.list })
  expect(cancel.mock.invocationCallOrder[0]).toBeLessThan(
    write.mock.invocationCallOrder[0],
  )
})

it('keeps the cache unchanged when remove rejects', async () => {
  vi.mocked(todosApi.remove).mockRejectedValue(new Error('Server error'))
  const { result } = setup()
  queryClient.setQueryData(todoKeys.list, [todoFixture, other])
  await act(async () => {
    await expect(result.current.mutateAsync(todoFixture.id)).rejects.toThrow(
      'Server error',
    )
  })
  expect(queryClient.getQueryData(todoKeys.list)).toEqual([todoFixture, other])
})
