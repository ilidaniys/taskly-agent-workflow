import { act, renderHook } from '@testing-library/react'
import { expect, it } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import type { Todo } from '../types'
import { useTodoFilters } from './useTodoFilters'

const low: Todo = {
  ...todoFixture,
  id: 8,
  title: 'Review notes',
  priority: 'low',
  completed: true,
  created_at: '2026-10-03T12:00:00Z',
}
const high: Todo = { ...todoFixture, priority: 'high' }
const todos = [high, low]

it('starts with filter all, empty search, newest sort and all todos visible', () => {
  const { result } = renderHook(() => useTodoFilters(todos))
  expect(result.current.filter).toBe('all')
  expect(result.current.search).toBe('')
  expect(result.current.sort).toBe('newest')
  expect(result.current.visible).toEqual([low, high])
})

it('limits visible todos to completed ones when the filter is completed', () => {
  const { result } = renderHook(() => useTodoFilters(todos))
  act(() => result.current.setFilter('completed'))
  expect(result.current.visible).toEqual([low])
})

it('narrows visible todos by title text when searching', () => {
  const { result } = renderHook(() => useTodoFilters(todos))
  act(() => result.current.setSearch('demo'))
  expect(result.current.visible).toEqual([high])
})

it('orders high priority todos first when sorting by priority', () => {
  const { result } = renderHook(() => useTodoFilters(todos))
  act(() => result.current.setSort('priority'))
  expect(result.current.visible).toEqual([high, low])
})
