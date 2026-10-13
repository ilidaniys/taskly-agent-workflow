import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import type { Todo } from '../types'
import { TodoItem } from './TodoItem'

vi.mock('../../../design-system', () => import('../../../design-system/mocks'))

afterEach(() => vi.useRealTimers())

function renderItem(overrides: Partial<Todo> = {}, busy = false) {
  const onToggle = vi.fn()
  const onEdit = vi.fn()
  const onDelete = vi.fn()
  render(
    <TodoItem
      todo={{ ...todoFixture, ...overrides }}
      busy={busy}
      onToggle={onToggle}
      onEdit={onEdit}
      onDelete={onDelete}
    />,
  )
  return { onToggle, onEdit, onDelete }
}

it('shows an active task and forwards edit requests', async () => {
  const user = userEvent.setup()
  const onEdit = vi.fn()
  const onToggle = vi.fn()
  const onDelete = vi.fn()
  render(
    <TodoItem
      todo={todoFixture}
      busy={false}
      onEdit={onEdit}
      onToggle={onToggle}
      onDelete={onDelete}
    />,
  )
  expect(screen.getByRole('heading', { name: todoFixture.title })).toBeVisible()
  expect(screen.getByText('To do')).toBeVisible()
  expect(screen.getByText('Medium')).toBeVisible()
  expect(screen.getByRole('checkbox')).not.toBeChecked()
  await user.click(
    screen.getByRole('button', { name: `Edit: ${todoFixture.title}` }),
  )
  expect(onEdit).toHaveBeenCalledTimes(1)
  expect(onToggle).not.toHaveBeenCalled()
  expect(onDelete).not.toHaveBeenCalled()
})

it('renders the description only when it is non-empty', () => {
  renderItem({ description: 'Gather the slides' })
  expect(screen.getByText('Gather the slides')).toBeVisible()
})

it('omits the description when it is empty', () => {
  renderItem({ description: '' })
  expect(document.querySelector('p')).toBeNull()
})

it('shows To do and the Complete checkbox label for an active task', () => {
  renderItem()
  expect(screen.getByText('To do')).toBeVisible()
  expect(
    screen.getByRole('checkbox', { name: `Complete: ${todoFixture.title}` }),
  ).not.toBeChecked()
})

it('shows Completed and the Mark as active checkbox label for a completed task', () => {
  renderItem({ completed: true })
  expect(screen.getByText('Completed')).toBeVisible()
  expect(
    screen.getByRole('checkbox', {
      name: `Mark as active: ${todoFixture.title}`,
    }),
  ).toBeChecked()
})

it.each([
  ['low', 'Low'],
  ['medium', 'Medium'],
  ['high', 'High'],
] as const)('shows the %s priority as %s', (priority, label) => {
  renderItem({ priority })
  expect(screen.getByText(label)).toBeVisible()
})

it('renders no date badge when there is no due date', () => {
  renderItem({ due_date: null })
  expect(screen.queryByText(/overdue/)).not.toBeInTheDocument()
  expect(screen.queryByText(/2026/)).not.toBeInTheDocument()
})

it('marks an active task overdue when its due date has passed', () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 9, 10, 12, 0))
  renderItem({ due_date: '2026-10-01' })
  expect(screen.getByText('1 Oct 2026 · overdue')).toBeVisible()
})

it('shows a future due date without overdue text', () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 9, 10, 12, 0))
  renderItem({ due_date: '2026-12-01' })
  expect(screen.getByText('1 Dec 2026')).toBeVisible()
  expect(screen.queryByText(/overdue/)).not.toBeInTheDocument()
})

it('does not mark a completed task overdue even when its due date has passed', () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 9, 10, 12, 0))
  renderItem({ due_date: '2026-10-01', completed: true })
  expect(screen.getByText('1 Oct 2026')).toBeVisible()
  expect(screen.queryByText(/overdue/)).not.toBeInTheDocument()
})

it('disables the checkbox, edit and delete buttons while busy', () => {
  renderItem({}, true)
  expect(screen.getByRole('checkbox')).toBeDisabled()
  expect(
    screen.getByRole('button', { name: `Edit: ${todoFixture.title}` }),
  ).toBeDisabled()
  expect(
    screen.getByRole('button', { name: `Delete: ${todoFixture.title}` }),
  ).toBeDisabled()
})

it('forwards checkbox and delete clicks to onToggle and onDelete', async () => {
  const user = userEvent.setup()
  const { onToggle, onDelete } = renderItem()
  await user.click(screen.getByRole('checkbox'))
  expect(onToggle).toHaveBeenCalledTimes(1)
  await user.click(
    screen.getByRole('button', { name: `Delete: ${todoFixture.title}` }),
  )
  expect(onDelete).toHaveBeenCalledTimes(1)
})
