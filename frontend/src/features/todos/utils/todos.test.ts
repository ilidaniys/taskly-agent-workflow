import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isOverdue, selectTodos } from './todos'
import type { Todo } from '../types'

const base: Todo = {
  id: 1,
  title: 'Sprint plan',
  description: '',
  priority: 'medium',
  completed: false,
  due_date: null,
  created_at: '2026-10-01T12:00:00Z',
  updated_at: '2026-10-01T12:00:00Z',
}

describe('selectTodos', () => {
  it('combines status with a case-insensitive search in the description', () => {
    const matching = { ...base, description: 'Discuss the API' }
    const todos = [
      matching,
      { ...matching, id: 2, completed: true },
      { ...base, id: 3 },
    ]
    expect(selectTodos(todos, 'active', ' api ', 'newest')).toEqual([matching])
  })

  it('sorts by priority without changing the source array', () => {
    const high: Todo = { ...base, id: 2, priority: 'high' }
    const todos = [base, high]
    expect(selectTodos(todos, 'all', '', 'priority')).toEqual([high, base])
    expect(todos).toEqual([base, high])
  })

  describe('with a fixed date of 2026-10-10', () => {
    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date(2026, 9, 10, 12))
    })
    afterEach(() => vi.useRealTimers())

    const past = { ...base, id: 2, due_date: '2026-10-09' }

    it('filter overdue keeps only incomplete todos whose due_date is before today', () => {
      expect(selectTodos([past, base], 'overdue', '', 'newest')).toEqual([past])
    })
    it('filter overdue excludes completed todos with a past due date', () => {
      expect(
        selectTodos([{ ...past, completed: true }], 'overdue', '', 'newest'),
      ).toEqual([])
    })
    it('filter overdue excludes todos with no due_date and todos due today or later', () => {
      const today = { ...base, id: 3, due_date: '2026-10-10' }
      const later = { ...base, id: 4, due_date: '2026-10-11' }
      expect(
        selectTodos([base, today, later], 'overdue', '', 'newest'),
      ).toEqual([])
    })
    it('filter completed keeps only completed todos', () => {
      const done = { ...base, id: 5, completed: true }
      expect(selectTodos([base, done], 'completed', '', 'newest')).toEqual([
        done,
      ])
    })
    it('filter active keeps only incomplete todos', () => {
      const done = { ...base, id: 6, completed: true }
      expect(selectTodos([base, done], 'active', '', 'newest')).toEqual([base])
    })
    it('isOverdue is false for a todo due today and true for one due yesterday', () => {
      expect(isOverdue({ ...base, due_date: '2026-10-10' })).toBe(false)
      expect(isOverdue({ ...base, due_date: '2026-10-09' })).toBe(true)
    })
    it('sort due orders by due_date ascending with null due dates last, ties by id descending', () => {
      const early = { ...base, id: 7, due_date: '2026-10-01' }
      const tieA = { ...base, id: 8, due_date: '2026-10-05' }
      const tieB = { ...base, id: 9, due_date: '2026-10-05' }
      const none = { ...base, id: 10, due_date: null }
      expect(
        selectTodos([none, tieA, early, tieB], 'all', '', 'due').map(
          (t) => t.id,
        ),
      ).toEqual([7, 9, 8, 10])
    })
    it('sort priority orders high, medium, low with ties by id descending', () => {
      const low = { ...base, id: 11, priority: 'low' as const }
      const highA = { ...base, id: 12, priority: 'high' as const }
      const highB = { ...base, id: 13, priority: 'high' as const }
      const medium = { ...base, id: 14, priority: 'medium' as const }
      expect(
        selectTodos([low, highA, medium, highB], 'all', '', 'priority').map(
          (t) => t.id,
        ),
      ).toEqual([13, 12, 14, 11])
    })
  })
})
