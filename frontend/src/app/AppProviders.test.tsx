import { render, screen } from '@testing-library/react'
import { QueryClient, useQueryClient } from '@tanstack/react-query'
import { useTheme } from 'styled-components'
import { expect, it, vi } from 'vitest'
import { theme } from '../design-system/theme/theme'
import { queryClient } from '../lib/queryClient'
import { AppProviders } from './AppProviders'

vi.mock('../design-system', () => import('../design-system/mocks'))

it('renders its children', () => {
  render(
    <AppProviders>
      <p>Child content</p>
    </AppProviders>,
  )
  expect(screen.getByText('Child content')).toBeVisible()
})

it('supplies the injected client to descendants via useQueryClient', () => {
  const client = new QueryClient()
  let seen: QueryClient | undefined
  function Probe() {
    seen = useQueryClient()
    return null
  }
  render(
    <AppProviders client={client}>
      <Probe />
    </AppProviders>,
  )
  expect(seen).toBe(client)
})

it('falls back to the shared queryClient when no client prop is given', () => {
  let seen: QueryClient | undefined
  function Probe() {
    seen = useQueryClient()
    return null
  }
  render(
    <AppProviders>
      <Probe />
    </AppProviders>,
  )
  expect(seen).toBe(queryClient)
})

it('makes the design-system theme available to descendants via useTheme', () => {
  let seen: unknown
  function Probe() {
    seen = useTheme()
    return null
  }
  render(
    <AppProviders>
      <Probe />
    </AppProviders>,
  )
  expect(seen).toBe(theme)
})
