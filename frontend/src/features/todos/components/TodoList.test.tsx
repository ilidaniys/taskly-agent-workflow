import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { expect, it, vi } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import type { Todo } from '../types'
import { TodoList } from './TodoList'

vi.mock('../../../design-system', () => import('../../../design-system/mocks'))
vi.mock('./TodoEmptyState', () => ({
  TodoEmptyState: ({ hasTodos }: { hasTodos: boolean }) => (
    <p>{hasTodos ? 'No matching tasks' : 'Empty task list'}</p>
  ),
}))
vi.mock('./TodoItem', () => ({
  TodoItem: ({
    todo,
    busy,
    onToggle,
    onEdit,
    onDelete,
  }: {
    todo: Todo
    busy: boolean
    onToggle: () => void
    onEdit: () => void
    onDelete: () => void
  }) => (
    <li>
      <span>{todo.title}</span>
      <span>{busy ? 'busy' : 'idle'}</span>
      <button onClick={onToggle}>Toggle {todo.title}</button>
      <button onClick={onEdit}>Edit {todo.title}</button>
      <button onClick={onDelete}>Delete {todo.title}</button>
    </li>
  ),
}))

const other: Todo = { ...todoFixture, id: 9, title: 'Other task' }

function renderList(overrides: Partial<ComponentProps<typeof TodoList>> = {}) {
  const props = {
    todos: [] as Todo[],
    hasTodos: false,
    loading: false,
    failed: false,
    busy: false,
    onCreate: vi.fn(),
    onToggle: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  }
  render(<TodoList {...props} />)
  return props
}

it('shows loading feedback before showing an empty list', () => {
  const props = {
    todos: [],
    hasTodos: false,
    failed: false,
    busy: false,
    onCreate: vi.fn(),
    onToggle: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
  }
  const { rerender } = render(<TodoList {...props} loading />)
  expect(screen.getByRole('status')).toHaveTextContent('Loading your tasks…')
  expect(screen.queryByText('Empty task list')).not.toBeInTheDocument()
  rerender(<TodoList {...props} loading={false} />)
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
  expect(screen.getByText('Empty task list')).toBeVisible()
})

it('renders one item per todo', () => {
  renderList({ todos: [todoFixture, other], hasTodos: true })
  expect(screen.getByText(todoFixture.title)).toBeVisible()
  expect(screen.getByText(other.title)).toBeVisible()
})

it('passes toggle, edit and delete callbacks the matching todo', async () => {
  const user = userEvent.setup()
  const props = renderList({ todos: [todoFixture, other], hasTodos: true })
  await user.click(
    screen.getByRole('button', { name: `Toggle ${other.title}` }),
  )
  expect(props.onToggle).toHaveBeenCalledWith(other)
  await user.click(
    screen.getByRole('button', { name: `Edit ${todoFixture.title}` }),
  )
  expect(props.onEdit).toHaveBeenCalledWith(todoFixture)
  await user.click(
    screen.getByRole('button', { name: `Delete ${todoFixture.title}` }),
  )
  expect(props.onDelete).toHaveBeenCalledWith(todoFixture)
})

it('passes busy down to every item', () => {
  renderList({ todos: [todoFixture, other], hasTodos: true, busy: true })
  expect(screen.getAllByText('busy')).toHaveLength(2)
})

it('shows the unavailable message when failed with no todos', () => {
  renderList({ failed: true, hasTodos: false })
  expect(
    screen.getByRole('heading', {
      name: 'The task list is temporarily unavailable',
    }),
  ).toBeVisible()
})

it('still shows the list when failed but hasTodos is true', () => {
  renderList({ todos: [todoFixture], failed: true, hasTodos: true })
  expect(screen.getByText(todoFixture.title)).toBeVisible()
  expect(
    screen.queryByText('The task list is temporarily unavailable'),
  ).not.toBeInTheDocument()
})

it('shows the no-match state for an empty list when hasTodos is true', () => {
  renderList({ hasTodos: true })
  expect(screen.getByText('No matching tasks')).toBeVisible()
})
