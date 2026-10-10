import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import { useCreateTodoMutation } from '../hooks/useCreateTodoMutation'
import { useUpdateTodoMutation } from '../hooks/useUpdateTodoMutation'
import type { TodoInput } from '../types'
import { TodoEditor } from './TodoEditor'

vi.mock('../../../design-system', () => import('../../../design-system/mocks'))
vi.mock('../hooks/useCreateTodoMutation', () => ({
  useCreateTodoMutation: vi.fn(),
}))
vi.mock('../hooks/useUpdateTodoMutation', () => ({
  useUpdateTodoMutation: vi.fn(),
}))
vi.mock('./TodoForm', () => ({
  TodoForm: ({
    onSubmit,
    error,
  }: {
    onSubmit: (input: TodoInput) => Promise<void>
    error: string | null
  }) => (
    <div>
      <button onClick={() => void onSubmit(todoFixture)}>Submit form</button>
      {error && <p>{error}</p>}
    </div>
  ),
}))

function mockHooks({
  create = vi.fn(),
  update = vi.fn(),
  pending = false,
  error = null,
}: {
  create?: ReturnType<typeof vi.fn>
  update?: ReturnType<typeof vi.fn>
  pending?: boolean
  error?: { message: string } | null
} = {}) {
  vi.mocked(useCreateTodoMutation).mockReturnValue({
    isPending: pending,
    error,
    mutateAsync: create,
  } as unknown as ReturnType<typeof useCreateTodoMutation>)
  vi.mocked(useUpdateTodoMutation).mockReturnValue({
    isPending: pending,
    error,
    mutateAsync: update,
  } as unknown as ReturnType<typeof useUpdateTodoMutation>)
  return { create, update }
}

it('creates a new task and reports a successful save', async () => {
  const user = userEvent.setup()
  const create = vi.fn().mockResolvedValue(todoFixture)
  const update = vi.fn()
  vi.mocked(useCreateTodoMutation).mockReturnValue({
    isPending: false,
    error: null,
    mutateAsync: create,
  } as unknown as ReturnType<typeof useCreateTodoMutation>)
  vi.mocked(useUpdateTodoMutation).mockReturnValue({
    isPending: false,
    error: null,
    mutateAsync: update,
  } as unknown as ReturnType<typeof useUpdateTodoMutation>)
  const onSaved = vi.fn()
  render(
    <TodoEditor todo="new" busy={false} onClose={vi.fn()} onSaved={onSaved} />,
  )
  expect(screen.getByRole('dialog', { name: 'New task' })).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Submit form' }))
  await waitFor(() => expect(onSaved).toHaveBeenCalledWith('New task added.'))
  expect(create).toHaveBeenCalledWith(todoFixture)
  expect(update).not.toHaveBeenCalled()
})

it('edits an existing task under the Edit task title and reports the change', async () => {
  const user = userEvent.setup()
  const { update } = mockHooks({
    update: vi.fn().mockResolvedValue(todoFixture),
  })
  const onSaved = vi.fn()
  render(
    <TodoEditor
      todo={todoFixture}
      busy={false}
      onClose={vi.fn()}
      onSaved={onSaved}
    />,
  )
  expect(screen.getByRole('dialog', { name: 'Edit task' })).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Submit form' }))
  await waitFor(() => expect(onSaved).toHaveBeenCalledWith('Changes saved.'))
  expect(update).toHaveBeenCalledWith({
    id: todoFixture.id,
    input: todoFixture,
  })
})

it('does not submit while busy', async () => {
  const user = userEvent.setup()
  const { create, update } = mockHooks({
    create: vi.fn().mockResolvedValue(todoFixture),
  })
  const onSaved = vi.fn()
  render(<TodoEditor todo="new" busy onClose={vi.fn()} onSaved={onSaved} />)
  await user.click(screen.getByRole('button', { name: 'Submit form' }))
  expect(create).not.toHaveBeenCalled()
  expect(update).not.toHaveBeenCalled()
  expect(onSaved).not.toHaveBeenCalled()
})

it('does not submit while the mutation is pending', async () => {
  const user = userEvent.setup()
  const { create } = mockHooks({
    create: vi.fn().mockResolvedValue(todoFixture),
    pending: true,
  })
  const onSaved = vi.fn()
  render(
    <TodoEditor todo="new" busy={false} onClose={vi.fn()} onSaved={onSaved} />,
  )
  await user.click(screen.getByRole('button', { name: 'Submit form' }))
  expect(create).not.toHaveBeenCalled()
  expect(onSaved).not.toHaveBeenCalled()
})

it('does not report a save when the mutation rejects', async () => {
  const user = userEvent.setup()
  const { create } = mockHooks({
    create: vi.fn().mockRejectedValue(new Error('Check the task details.')),
  })
  const onSaved = vi.fn()
  render(
    <TodoEditor todo="new" busy={false} onClose={vi.fn()} onSaved={onSaved} />,
  )
  await user.click(screen.getByRole('button', { name: 'Submit form' }))
  await waitFor(() => expect(create).toHaveBeenCalled())
  await act(async () => {})
  expect(onSaved).not.toHaveBeenCalled()
})

it('passes the mutation error message to the form for display', () => {
  mockHooks({ error: { message: 'The task could not be saved.' } })
  render(
    <TodoEditor todo="new" busy={false} onClose={vi.fn()} onSaved={vi.fn()} />,
  )
  expect(screen.getByText('The task could not be saved.')).toBeVisible()
})
