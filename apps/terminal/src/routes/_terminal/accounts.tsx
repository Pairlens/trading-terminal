// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { createFileRoute } from '@tanstack/react-router'

import { AccountsPage } from '@/components/accounts/accounts-page'

/**
 * `connect` / `connectChain` deep-link straight into a venue's connect flow —
 * the trade ticket's connect gate sends the user here with the venue already
 * chosen, so they don't have to pick it out of the wizard's list again.
 */
type AccountsSearch = {
  /** Market id whose exchange/broker credential wizard should open. */
  connect?: string
  /** Wallet chain whose crypto-wallet dialog should open. */
  connectChain?: string
}

export const Route = createFileRoute('/_terminal/accounts')({
  component: AccountsPage,
  validateSearch: (search: Record<string, unknown>): AccountsSearch => ({
    connect: typeof search.connect === 'string' ? search.connect : undefined,
    connectChain:
      typeof search.connectChain === 'string' ? search.connectChain : undefined,
  }),
})
