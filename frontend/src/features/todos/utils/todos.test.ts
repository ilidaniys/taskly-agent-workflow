import { afterEach, describe, expect, it, vi } from 'vitest'
import { formatDate, isOverdue, selectTodos, validateTodo } from './todos'
import type { Todo, TodoInput } from '../types'

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

  it('keeps completed todos only for the completed filter and the rest for active', () => {
    const done = { ...base, id: 2, completed: true }
    expect(selectTodos([base, done], 'completed', '', 'newest')).toEqual([done])
    expect(selectTodos([base, done], 'active', '', 'newest')).toEqual([base])
  })

  it('sorts by due date ascending with undated todos last and ties by id descending', () => {
    const todos = [
      { ...base, id: 1, due_date: '2026-10-20' },
      { ...base, id: 2, due_date: null },
      { ...base, id: 3, due_date: '2026-10-05' },
      { ...base, id: 4, due_date: '2026-10-05' },
    ]
    expect(selectTodos(todos, 'all', '', 'due').map((todo) => todo.id)).toEqual(
      [4, 3, 1, 2],
    )
  })

  it('sorts by created_at descending with ties by id descending', () => {
    const todos = [
      { ...base, id: 1, created_at: '2026-10-01T12:00:00Z' },
      { ...base, id: 2, created_at: '2026-10-03T12:00:00Z' },
      { ...base, id: 3, created_at: '2026-10-03T12:00:00Z' },
    ]
    expect(
      selectTodos(todos, 'all', '', 'newest').map((todo) => todo.id),
    ).toEqual([3, 2, 1])
  })

  it('breaks priority ties by id descending', () => {
    const todos = [
      { ...base, id: 1, priority: 'high' as const },
      { ...base, id: 3, priority: 'high' as const },
      { ...base, id: 2, priority: 'low' as const },
    ]
    expect(
      selectTodos(todos, 'all', '', 'priority').map((todo) => todo.id),
    ).toEqual([3, 1, 2])
  })
})

describe('validateTodo', () => {
  const input: TodoInput = {
    title: 'Plan the sprint',
    description: '',
    priority: 'medium',
    due_date: null,
    completed: false,
  }

  it('returns no errors for a valid input', () => {
    expect(validateTodo(input)).toEqual({})
  })

  it('flags a blank title and a title over 120 characters, accepting exactly 120', () => {
    expect(validateTodo({ ...input, title: '   ' })).toEqual({
      title: 'Enter a task title.',
    })
    expect(validateTodo({ ...input, title: 'x'.repeat(121) })).toEqual({
      title: 'The title must be at most 120 characters.',
    })
    expect(validateTodo({ ...input, title: 'x'.repeat(120) })).toEqual({})
  })

  it('flags a description over 2000 characters and accepts exactly 2000 after trimming', () => {
    expect(validateTodo({ ...input, description: 'x'.repeat(2001) })).toEqual({
      description: 'The description must be at most 2000 characters.',
    })
    expect(
      validateTodo({ ...input, description: `${'x'.repeat(2000)}   ` }),
    ).toEqual({})
  })

  it.each(['2026-02-30', '2026-13-01', '10/10/2026', '2026-1-5'])(
    'flags the malformed or impossible due date %s',
    (due_date) => {
      expect(validateTodo({ ...input, due_date })).toEqual({
        due_date: 'Enter a valid date.',
      })
    },
  )

  it.each([null, ''])('accepts an empty due date (%j)', (due_date) => {
    expect(validateTodo({ ...input, due_date })).toEqual({})
  })
})

describe('isOverdue', () => {
  afterEach(() => vi.useRealTimers())

  const active: Todo = { ...base, due_date: '2026-10-09' }

  it('is true for an active todo due yesterday', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 10, 12, 0))
    expect(isOverdue(active)).toBe(true)
  })

  it('is false for an active todo due today', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 9, 12, 0))
    expect(isOverdue(active)).toBe(false)
  })

  it('is false for a completed todo and for a todo without a due date', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 10, 12, 0))
    expect(isOverdue({ ...active, completed: true })).toBe(false)
    expect(isOverdue({ ...active, due_date: null })).toBe(false)
  })
})

describe('formatDate', () => {
  it('renders an ISO date in en-GB style', () => {
    expect(formatDate('2026-10-05')).toBe('5 Oct 2026')
  })
})
