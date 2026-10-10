import { act, renderHook } from '@testing-library/react'
import { expect, it } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import type { Todo } from '../types'
import { useTodoFilters } from './useTodoFilters'

const older: Todo = {
  ...todoFixture,
  id: 8,
  title: 'Ship release',
  priority: 'high',
  completed: true,
  created_at: '2026-10-01T12:00:00Z',
}
const newer: Todo = {
  ...todoFixture,
  id: 7,
  title: 'Prepare a demo',
  priority: 'low',
  completed: false,
  created_at: '2026-10-02T12:00:00Z',
}
const ids = (todos: Todo[]) => todos.map((todo) => todo.id)

it("defaults to filter 'all', an empty search and sort 'newest'", () => {
  const { result } = renderHook(() => useTodoFilters([]))
  expect(result.current.filter).toBe('all')
  expect(result.current.search).toBe('')
  expect(result.current.sort).toBe('newest')
})

it('shows every todo by default, newest first', () => {
  const { result } = renderHook(() => useTodoFilters([older, newer]))
  expect(ids(result.current.visible)).toEqual([7, 8])
})

it('setFilter updates the filter and narrows the visible todos', () => {
  const { result } = renderHook(() => useTodoFilters([older, newer]))
  act(() => result.current.setFilter('completed'))
  expect(result.current.filter).toBe('completed')
  expect(ids(result.current.visible)).toEqual([8])
  act(() => result.current.setFilter('active'))
  expect(ids(result.current.visible)).toEqual([7])
})

it('setSearch updates the search and narrows the visible todos by text', () => {
  const { result } = renderHook(() => useTodoFilters([older, newer]))
  act(() => result.current.setSearch('RELEASE'))
  expect(result.current.search).toBe('RELEASE')
  expect(ids(result.current.visible)).toEqual([8])
})

it('setSort updates the sort and reorders the visible todos', () => {
  const { result } = renderHook(() => useTodoFilters([older, newer]))
  act(() => result.current.setSort('priority'))
  expect(result.current.sort).toBe('priority')
  expect(ids(result.current.visible)).toEqual([8, 7])
})

it('recomputes visible todos when the todos argument changes on rerender', () => {
  const { result, rerender } = renderHook(
    (todos: Todo[]) => useTodoFilters(todos),
    { initialProps: [newer] },
  )
  expect(ids(result.current.visible)).toEqual([7])
  rerender([newer, older])
  expect(ids(result.current.visible)).toEqual([7, 8])
})
