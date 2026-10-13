import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { todoFixture } from '../../test/todoFixture'
import { useNotice } from '../../hooks/useNotice'
import { useTodoFilters } from './hooks/useTodoFilters'
import { useTodosBusy } from './hooks/useTodosBusy'
import { useTodosQuery } from './hooks/useTodosQuery'
import { useUpdateTodoMutation } from './hooks/useUpdateTodoMutation'
import type { Todo } from './types'
import { TodosPage } from './TodosPage'

vi.mock('../../design-system', () => import('../../design-system/mocks'))
vi.mock('../../hooks/useNotice', () => ({ useNotice: vi.fn() }))
vi.mock('./hooks/useTodoFilters', () => ({ useTodoFilters: vi.fn() }))
vi.mock('./hooks/useTodosBusy', () => ({ useTodosBusy: vi.fn() }))
vi.mock('./hooks/useTodosQuery', () => ({ useTodosQuery: vi.fn() }))
vi.mock('./hooks/useUpdateTodoMutation', () => ({
  useUpdateTodoMutation: vi.fn(),
}))
vi.mock('./components/TodosHeader', () => ({
  TodosHeader: ({ onCreate }: { onCreate: () => void }) => (
    <>
      <h1>Tasks</h1>
      <button onClick={onCreate}>Header create</button>
    </>
  ),
}))
vi.mock('./components/TodoFilters', () => ({ TodoFilters: () => null }))
vi.mock('./components/TodoList', () => ({
  TodoList: ({
    onCreate,
    onToggle,
    onEdit,
    onDelete,
  }: {
    onCreate: () => void
    onToggle: (todo: Todo) => void
    onEdit: (todo: Todo) => void
    onDelete: (todo: Todo) => void
  }) => (
    <div>
      <p>Task list</p>
      <button onClick={onCreate}>List create</button>
      <button onClick={() => onToggle(todoFixture)}>List toggle active</button>
      <button onClick={() => onToggle({ ...todoFixture, completed: true })}>
        List toggle completed
      </button>
      <button onClick={() => onEdit(todoFixture)}>List edit</button>
      <button onClick={() => onDelete(todoFixture)}>List delete</button>
    </div>
  ),
}))
vi.mock('./components/TodoEditor', () => ({
  TodoEditor: ({
    todo,
    onClose,
    onSaved,
  }: {
    todo: Todo | 'new'
    onClose: () => void
    onSaved: (message: string) => void
  }) => (
    <div>
      <p>{`Editor ${todo === 'new' ? 'new' : todo.title}`}</p>
      <button onClick={onClose}>Close editor</button>
      <button onClick={() => onSaved('Changes saved.')}>Save editor</button>
    </div>
  ),
}))
vi.mock('./components/DeleteTodoDialog', () => ({
  DeleteTodoDialog: ({
    onClose,
    onDeleted,
  }: {
    onClose: () => void
    onDeleted: () => void
  }) => (
    <div>
      <p>Delete dialog</p>
      <button onClick={onClose}>Close delete</button>
      <button onClick={onDeleted}>Confirm delete</button>
    </div>
  ),
}))
vi.mock('../../components/SuccessNotice', () => ({ SuccessNotice: () => null }))

function setupPage({
  queryError = null,
  mutationError = null,
  isFetching = false,
  busy = false,
  mutateAsync = vi.fn(),
}: {
  queryError?: Error | null
  mutationError?: Error | null
  isFetching?: boolean
  busy?: boolean
  mutateAsync?: ReturnType<typeof vi.fn>
} = {}) {
  const refetch = vi.fn().mockResolvedValue(undefined)
  const reset = vi.fn()
  const notify = vi.fn()
  vi.mocked(useTodosQuery).mockReturnValue({
    data: [],
    isPending: false,
    isFetching,
    isError: queryError !== null,
    error: queryError,
    refetch,
  } as unknown as ReturnType<typeof useTodosQuery>)
  vi.mocked(useUpdateTodoMutation).mockReturnValue({
    error: mutationError,
    reset,
    mutateAsync,
  } as unknown as ReturnType<typeof useUpdateTodoMutation>)
  vi.mocked(useTodosBusy).mockReturnValue(busy)
  vi.mocked(useNotice).mockReturnValue({ message: '', notify })
  vi.mocked(useTodoFilters).mockReturnValue({
    filter: 'all',
    search: '',
    sort: 'newest',
    visible: [],
    setFilter: vi.fn(),
    setSearch: vi.fn(),
    setSort: vi.fn(),
  })
  render(<TodosPage />)
  return { refetch, reset, notify, mutateAsync }
}

it('displays a query failure and resets mutation errors before retrying', async () => {
  const user = userEvent.setup()
  const { refetch, reset } = setupPage({
    queryError: new Error('The server is unavailable.'),
  })
  expect(screen.getByTestId('alert')).toHaveTextContent(
    'The server is unavailable.',
  )
  await user.click(screen.getByRole('button', { name: 'Try again' }))
  await waitFor(() => expect(refetch).toHaveBeenCalledTimes(1))
  expect(reset).toHaveBeenCalledTimes(1)
  expect(reset.mock.invocationCallOrder[0]).toBeLessThan(
    refetch.mock.invocationCallOrder[0],
  )
})

it('disables Try again while the query is fetching or a todo is busy', () => {
  setupPage({
    queryError: new Error('The server is unavailable.'),
    isFetching: true,
  })
  expect(screen.getByRole('button', { name: 'Try again' })).toBeDisabled()
})

it('disables Try again while a todo mutation is busy', () => {
  setupPage({ queryError: new Error('The server is unavailable.'), busy: true })
  expect(screen.getByRole('button', { name: 'Try again' })).toBeDisabled()
})

it('shows the mutation error message in the alert in preference to the query error', () => {
  setupPage({
    queryError: new Error('Offline.'),
    mutationError: new Error('Save failed.'),
  })
  expect(screen.getByTestId('alert')).toHaveTextContent('Save failed.')
  expect(screen.getByTestId('alert')).not.toHaveTextContent('Offline.')
})

it('notifies that the task was completed when toggling an active todo', async () => {
  const user = userEvent.setup()
  const mutateAsync = vi
    .fn()
    .mockResolvedValue({ ...todoFixture, completed: true })
  const { notify } = setupPage({ mutateAsync })
  await user.click(screen.getByRole('button', { name: 'List toggle active' }))
  await waitFor(() =>
    expect(notify).toHaveBeenCalledWith('Another task complete. Well done!'),
  )
  expect(mutateAsync).toHaveBeenCalledWith({
    id: todoFixture.id,
    input: { completed: true },
  })
})

it('notifies that the task was marked active when toggling a completed todo', async () => {
  const user = userEvent.setup()
  const mutateAsync = vi
    .fn()
    .mockResolvedValue({ ...todoFixture, completed: false })
  const { notify } = setupPage({ mutateAsync })
  await user.click(
    screen.getByRole('button', { name: 'List toggle completed' }),
  )
  await waitFor(() =>
    expect(notify).toHaveBeenCalledWith('Task marked as active.'),
  )
  expect(mutateAsync).toHaveBeenCalledWith({
    id: todoFixture.id,
    input: { completed: false },
  })
})

it('does nothing when toggling while busy', async () => {
  const user = userEvent.setup()
  const mutateAsync = vi.fn()
  const { notify } = setupPage({ mutateAsync, busy: true })
  await user.click(screen.getByRole('button', { name: 'List toggle active' }))
  expect(mutateAsync).not.toHaveBeenCalled()
  expect(notify).not.toHaveBeenCalled()
})

it('swallows a rejected toggle and does not notify', async () => {
  const user = userEvent.setup()
  const mutateAsync = vi.fn().mockRejectedValue(new Error('Save failed.'))
  const { notify } = setupPage({ mutateAsync })
  await user.click(screen.getByRole('button', { name: 'List toggle active' }))
  await waitFor(() => expect(mutateAsync).toHaveBeenCalled())
  await act(async () => {})
  expect(notify).not.toHaveBeenCalled()
})

it('opens the editor in new mode from the header and from the list', async () => {
  const user = userEvent.setup()
  setupPage()
  await user.click(screen.getByRole('button', { name: 'Header create' }))
  expect(screen.getByText('Editor new')).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Close editor' }))
  expect(screen.queryByText('Editor new')).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'List create' }))
  expect(screen.getByText('Editor new')).toBeVisible()
})

it('opens the editor with the chosen todo on edit and closes it on close', async () => {
  const user = userEvent.setup()
  setupPage()
  await user.click(screen.getByRole('button', { name: 'List edit' }))
  expect(screen.getByText(`Editor ${todoFixture.title}`)).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Close editor' }))
  expect(
    screen.queryByText(`Editor ${todoFixture.title}`),
  ).not.toBeInTheDocument()
})

it('closes the editor and notifies with the saved message', async () => {
  const user = userEvent.setup()
  const { notify } = setupPage()
  await user.click(screen.getByRole('button', { name: 'List create' }))
  await user.click(screen.getByRole('button', { name: 'Save editor' }))
  expect(screen.queryByText('Editor new')).not.toBeInTheDocument()
  expect(notify).toHaveBeenCalledWith('Changes saved.')
})

it('opens the delete dialog on delete and closes it on close', async () => {
  const user = userEvent.setup()
  setupPage()
  await user.click(screen.getByRole('button', { name: 'List delete' }))
  expect(screen.getByText('Delete dialog')).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Close delete' }))
  expect(screen.queryByText('Delete dialog')).not.toBeInTheDocument()
})

it('closes the delete dialog and notifies that the task was deleted', async () => {
  const user = userEvent.setup()
  const { notify } = setupPage()
  await user.click(screen.getByRole('button', { name: 'List delete' }))
  await user.click(screen.getByRole('button', { name: 'Confirm delete' }))
  expect(screen.queryByText('Delete dialog')).not.toBeInTheDocument()
  expect(notify).toHaveBeenCalledWith('Task deleted.')
})
