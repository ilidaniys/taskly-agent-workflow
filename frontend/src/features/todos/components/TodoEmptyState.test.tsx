import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { TodoEmptyState } from './TodoEmptyState'

vi.mock('../../../design-system', () => import('../../../design-system/mocks'))

it('shows the first-task prompt when there are no todos', () => {
  render(
    <TodoEmptyState hasTodos={false} disabled={false} onCreate={vi.fn()} />,
  )
  expect(
    screen.getByRole('heading', { name: 'Add your first task' }),
  ).toBeVisible()
  expect(
    screen.getByText('Write down what you need to do and get started.'),
  ).toBeVisible()
})

it('shows an enabled first-task button that calls onCreate on click', async () => {
  const user = userEvent.setup()
  const onCreate = vi.fn()
  render(
    <TodoEmptyState hasTodos={false} disabled={false} onCreate={onCreate} />,
  )
  const button = screen.getByRole('button', { name: 'Add your first task' })
  expect(button).toBeEnabled()
  await user.click(button)
  expect(onCreate).toHaveBeenCalledOnce()
})

it('disables the button and does not call onCreate when disabled', async () => {
  const user = userEvent.setup()
  const onCreate = vi.fn()
  render(<TodoEmptyState hasTodos={false} disabled onCreate={onCreate} />)
  const button = screen.getByRole('button', { name: 'Add your first task' })
  expect(button).toBeDisabled()
  await user.click(button)
  expect(onCreate).not.toHaveBeenCalled()
})

it('shows the no-match heading and filter hint when todos exist but none are visible', () => {
  render(<TodoEmptyState hasTodos disabled={false} onCreate={vi.fn()} />)
  expect(
    screen.getByRole('heading', { name: 'No matching tasks' }),
  ).toBeVisible()
  expect(
    screen.getByText('Change the status filter or search to find your tasks.'),
  ).toBeVisible()
})

it('renders no button when todos exist', () => {
  render(<TodoEmptyState hasTodos disabled={false} onCreate={vi.fn()} />)
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
})
