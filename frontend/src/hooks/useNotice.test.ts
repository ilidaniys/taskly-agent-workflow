import { act, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useNotice } from './useNotice'

afterEach(() => vi.useRealTimers())

it('starts without a notice and exposes a notification callback', () => {
  const { result } = renderHook(() => useNotice())
  expect(result.current.message).toBe('')
  expect(result.current.notify).toEqual(expect.any(Function))
})

it('shows the notified message', () => {
  const { result } = renderHook(() => useNotice())
  act(() => result.current.notify('Saved'))
  expect(result.current.message).toBe('Saved')
})

it('clears the message after 4000 ms and not before', () => {
  vi.useFakeTimers()
  const { result } = renderHook(() => useNotice())
  act(() => result.current.notify('Saved'))
  act(() => vi.advanceTimersByTime(3999))
  expect(result.current.message).toBe('Saved')
  act(() => vi.advanceTimersByTime(1))
  expect(result.current.message).toBe('')
})

it('restarts the timer when a second notice arrives before expiry', () => {
  vi.useFakeTimers()
  const { result } = renderHook(() => useNotice())
  act(() => result.current.notify('First'))
  act(() => vi.advanceTimersByTime(3000))
  act(() => result.current.notify('Second'))
  act(() => vi.advanceTimersByTime(3000))
  expect(result.current.message).toBe('Second')
  act(() => vi.advanceTimersByTime(1000))
  expect(result.current.message).toBe('')
})

it('clears the pending timer on unmount without error', () => {
  vi.useFakeTimers()
  const { result, unmount } = renderHook(() => useNotice())
  act(() => result.current.notify('Saved'))
  expect(() => unmount()).not.toThrow()
  expect(vi.getTimerCount()).toBe(0)
})
