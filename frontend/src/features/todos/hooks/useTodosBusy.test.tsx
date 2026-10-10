import { act, renderHook, waitFor } from '@testing-library/react'
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
} from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { expect, it } from 'vitest'
import { todoKeys } from '../api/queryKeys'
import { useTodosBusy } from './useTodosBusy'

// Renders the busy flag next to a mutation whose promise the test controls.
function setup(mutationKey: readonly unknown[]) {
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  const { result } = renderHook(
    () => ({
      busy: useTodosBusy(),
      mutation: useMutation({ mutationKey, mutationFn: () => gate }),
    }),
    { wrapper },
  )
  return { result, release }
}

it('returns false when no mutation is running', () => {
  const { result } = setup(todoKeys.create)
  expect(result.current.busy).toBe(false)
})

it('returns true while a mutation with a todoKeys key is pending', async () => {
  const { result } = setup(todoKeys.create)
  act(() => {
    result.current.mutation.mutate()
  })
  await waitFor(() => expect(result.current.busy).toBe(true))
})

it('returns false again after that mutation settles', async () => {
  const { result, release } = setup(todoKeys.create)
  act(() => {
    result.current.mutation.mutate()
  })
  await waitFor(() => expect(result.current.busy).toBe(true))
  await act(async () => {
    release()
  })
  await waitFor(() => expect(result.current.busy).toBe(false))
})

it('ignores pending mutations with an unrelated key', async () => {
  const { result } = setup(['unrelated'])
  act(() => {
    result.current.mutation.mutate()
  })
  await waitFor(() => expect(result.current.mutation.isPending).toBe(true))
  expect(result.current.busy).toBe(false)
})
