import { QueryClient, useQueryClient } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { queryClient as sharedQueryClient } from '../lib/queryClient'
import { AppProviders } from './AppProviders'

vi.mock('../design-system', () => import('../design-system/mocks'))

function ClientProbe({
  onClient,
}: {
  onClient: (client: QueryClient) => void
}) {
  onClient(useQueryClient())
  return null
}

it('renders its children', () => {
  render(
    <AppProviders>
      <p>Application content</p>
    </AppProviders>,
  )
  expect(screen.getByText('Application content')).toBeVisible()
})

it('provides the injected client to descendants', () => {
  const client = new QueryClient()
  let seen: QueryClient | undefined
  render(
    <AppProviders client={client}>
      <ClientProbe onClient={(value) => (seen = value)} />
    </AppProviders>,
  )
  expect(seen).toBe(client)
})

it('falls back to the shared query client when no client is given', () => {
  let seen: QueryClient | undefined
  render(
    <AppProviders>
      <ClientProbe onClient={(value) => (seen = value)} />
    </AppProviders>,
  )
  expect(seen).toBe(sharedQueryClient)
})
