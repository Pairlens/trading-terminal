// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The gate the three LP panes share, and the line that keeps their empty state
 * from reading as a bug.
 *
 * Order matters. A wallet comes first: with nothing connected, "connect an
 * account" is the true and actionable answer, and it is the one the LP
 * template's `workspace:active-wallet` requirement is already asking for.
 * Only once a wallet IS connected does the honest statement become "no source
 * can read your positions yet" — and then the pane names the wallet and the
 * pool it would read, so the reader can tell a missing feature from a failure.
 *
 * A hook rather than three copies: the three panes differ in what they would
 * DRAW, never in whether they can.
 */
import { useTranslation } from 'react-i18next'

import { PaneCredentialsRequired } from '@/components/layout/pane-credentials-required'
import { dexChain } from '@/lib/dex/chain-catalog'
import { splitPairKey } from '@/lib/dex/pair-legs'
import { useActiveWallet } from '@/lib/active-wallet-context'
import { useWalletsStore } from '@/stores/wallets-store'

export type LpSourceState = {
  /** Rendered instead of the pane when there is no wallet to read. */
  gate: React.ReactElement | null
  /** "Would read <wallet> on <pool>" — null when there is nothing to name. */
  readsLabel: string | null
}

export function useLpSourceState(
  activePair: { market: string; pairKey: string } | null,
): LpSourceState {
  const { t } = useTranslation()
  const { activeWallet } = useActiveWallet()
  const wallets = useWalletsStore((s) => s.wallets)

  const chain = dexChain(activePair?.market)
  // The bound wallet first, then any wallet of the chain's SIGNING family:
  // one EVM key covers every EVM chain, which is why this matches on
  // `walletChain` and not on the market. With no chain in play at all (the
  // in-flight pane requires a wallet and no pair), any wallet answers, or the
  // pane would gate on "connect an account" with one already connected.
  const wallet =
    wallets.find((w) => w.id === activeWallet?.walletId) ??
    (chain === null
      ? (wallets[0] ?? null)
      : (wallets.find((w) => w.chain === chain.walletChain) ?? null))

  if (!wallet) {
    return {
      gate: (
        <PaneCredentialsRequired
          compact
          state="missing"
          market={activePair?.market ?? ''}
          venueLabel={chain?.displayName ?? t('lpPanes.venueFallback')}
        />
      ),
      readsLabel: null,
    }
  }

  const legs = splitPairKey(activePair?.pairKey)
  return {
    gate: null,
    readsLabel: t('lpPanes.wouldRead', {
      wallet: shortWallet(wallet.address),
      pool: legs ? `${legs.base}/${legs.quote}` : (activePair?.pairKey ?? ''),
      chain: chain?.displayName ?? activePair?.market ?? '',
    }),
  }
}

function shortWallet(address: string | undefined): string {
  if (!address) return ''
  return address.length > 12
    ? `${address.slice(0, 6)}…${address.slice(-4)}`
    : address
}
