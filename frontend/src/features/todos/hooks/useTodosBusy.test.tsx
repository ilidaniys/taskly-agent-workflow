import {
  QueryClient,
  QueryClientProvider,
  useMutation,
} from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { expect, it } from 'vitest'
import { todoKeys } from '../api/queryKeys'
import { useTodosBusy } from './useTodosBusy'

function setup() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return { wrapper }
}

// A mutation whose request settles only when the test says so.
function deferred() {
  let settle!: () => void
  const promise = new Promise<void>((resolve) => {
    settle = resolve
  })
  return { promise, settle }
}

it('is false when no mutation is running', () => {
  const { wrapper } = setup()
  const { result } = renderHook(() => useTodosBusy(), { wrapper })
  expect(result.current).toBe(false)
})

it('is true while a todo mutation is pending and false once it settles', async () => {
  const { wrapper } = setup()
  const request = deferred()
  const { result } = renderHook(
    () => ({
      busy: useTodosBusy(),
      mutation: useMutation({
        mutationKey: todoKeys.create,
        mutationFn: () => request.promise,
      }),
    }),
    { wrapper },
  )
  act(() => {
    result.current.mutation.mutate()
  })
  await waitFor(() => expect(result.current.busy).toBe(true))
  await act(async () => request.settle())
  await waitFor(() => expect(result.current.busy).toBe(false))
})

it('stays false for a mutation with an unrelated key', async () => {
  const { wrapper } = setup()
  const request = deferred()
  const { result } = renderHook(
    () => ({
      busy: useTodosBusy(),
      mutation: useMutation({
        mutationKey: ['unrelated'],
        mutationFn: () => request.promise,
      }),
    }),
    { wrapper },
  )
  act(() => {
    result.current.mutation.mutate()
  })
  await waitFor(() => expect(result.current.mutation.isPending).toBe(true))
  expect(result.current.busy).toBe(false)
  await act(async () => request.settle())
})
