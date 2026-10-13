import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { TodoEmptyState } from './TodoEmptyState'

vi.mock('../../../design-system', () => import('../../../design-system/mocks'))

it('shows the first-task onboarding when there are no tasks', () => {
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

it('calls onCreate when the Add your first task button is clicked', async () => {
  const user = userEvent.setup()
  const onCreate = vi.fn()
  render(
    <TodoEmptyState hasTodos={false} disabled={false} onCreate={onCreate} />,
  )
  await user.click(screen.getByRole('button', { name: 'Add your first task' }))
  expect(onCreate).toHaveBeenCalledTimes(1)
})

it('disables the button and ignores clicks when disabled', async () => {
  const user = userEvent.setup()
  const onCreate = vi.fn()
  render(<TodoEmptyState hasTodos={false} disabled onCreate={onCreate} />)
  const button = screen.getByRole('button', { name: 'Add your first task' })
  expect(button).toBeDisabled()
  await user.click(button)
  expect(onCreate).not.toHaveBeenCalled()
})

it('shows the no-match message with filter advice and no create button when tasks exist', () => {
  render(<TodoEmptyState hasTodos disabled={false} onCreate={vi.fn()} />)
  expect(
    screen.getByRole('heading', { name: 'No matching tasks' }),
  ).toBeVisible()
  expect(
    screen.getByText('Change the status filter or search to find your tasks.'),
  ).toBeVisible()
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
})
