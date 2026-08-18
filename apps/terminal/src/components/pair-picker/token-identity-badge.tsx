// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * What tells two rows with the same ticker apart: the chain and the contract.
 *
 * Search for "accounts" and eight rows come back reading
 * `NTDA-USDC · National Trump Digital Accounts`, identical down to the logo.
 * They are eight different Solana mints, seven of them pump.fun copies of the
 * eighth. Nothing on the row said so, and selecting one PINS that exact
 * address (`pinSelectedEntry`), so the user was choosing a contract blind.
 *
 * Deliberately not deduped. A token's identity is `(chain, address)` and never
 * its symbol, so collapsing these to one row would merge a rug with the real
 * token and pick the winner on the user's behalf. The honest fix is to say
 * which is which and let them choose.
 *
 * Renders nothing for rows that are not tokens, so a CEX pair keeps the layout
 * it had. Lives beside `VenueBadge` for the same reason: both shells and both
 * pickers share it, and mobile imports from the app rather than the reverse.
 */
import type { PairEntry } from '@/components/pair-picker/pair-picker-data'
import { dexChainByNetwork } from '@/lib/dex/chain-catalog'
import { truncateAddress } from '@/lib/dex/pool-math'

export function TokenIdentityBadge({ entry }: { entry: PairEntry }) {
  if (!entry.chain || !entry.address) return null

  const chain =
    dexChainByNetwork(entry.chain)?.abbr ?? entry.chain.toUpperCase()

  return (
    <span className="shrink-0 rounded-sm bg-muted px-1.5 py-px font-mono text-[10px] leading-4 text-muted-foreground">
      {chain} {truncateAddress(entry.address, 4, 4)}
    </span>
  )
}
