// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import { Shield, Wallet } from 'lucide-react'

import { Button } from '@pairlens/ui/components/ui/button'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@pairlens/ui/components/ui/empty'

import type { WalletChain } from '@pairlens/market-engine/adapter'
import { PluginBrandTile } from '@/components/plugins/plugin-icon'
import { KeySecurityDialog } from '@/components/security/key-security-dialog'
import {
  chainBrand,
  chainPosterSrc,
  venuePluginId,
  venuePosterSrc,
} from '@/components/accounts/venue-art'

/**
 * Venue mark, hero sized. Reuses the storefront brand pipeline so the venue
 * reads the same here as on its Plugin Store poster and its Accounts card;
 * chains keep their own official tint when no mark ships with the build.
 */
function VenueMark({
  market,
  chain,
  label,
}: {
  market: string
  chain?: WalletChain
  label: string
}) {
  const poster = chain ? chainPosterSrc(chain) : venuePosterSrc(market)

  if (chain && !poster) {
    const brand = chainBrand(chain)
    return (
      <span
        role="img"
        aria-label={label}
        className="flex size-12 items-center justify-center rounded-[14px] font-mono text-xs font-bold text-white shadow-[0_10px_30px_-8px_rgb(0_0_0/0.6)]"
        style={{ background: brand.tint }}
      >
        {brand.mono}
      </span>
    )
  }

  return (
    <PluginBrandTile
      id={venuePluginId(market)}
      name={label}
      src={poster}
      size={48}
      iconSize={30}
    />
  )
}

/**
 * Overlay for a trade ticket that cannot place an order: the venue is selected
 * but nothing can sign for it — no API keys for the exchange, no wallet for the
 * chain — or the connector is data-only.
 *
 * It sits over the blurred ticket rather than replacing it, so the pane keeps
 * its shape and the user can see what connecting unlocks. The CTA deep-links
 * into the venue's own connect flow on the Accounts page instead of dropping
 * the user on a page where they have to find the venue again.
 */
export function TradeConnectGate({
  market,
  venueLabel,
  chain,
  readOnly = false,
}: {
  market: string
  /** Exchange or broker name, or the chain name for a DEX venue. */
  venueLabel: string
  /** Set for DEX venues — they sign with a chain wallet, not API keys. */
  chain?: WalletChain
  /** The connector streams prices but cannot route orders. */
  readOnly?: boolean
}) {
  const { t } = useTranslation()
  const [securityOpen, setSecurityOpen] = useState(false)
  const isDex = chain != null

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center p-3">
      <Empty className="max-w-[15.5rem] gap-3 rounded-2xl border border-border/60 bg-card/80 p-4 shadow-lg backdrop-blur-[2px]">
        <EmptyHeader className="gap-2">
          <VenueMark market={market} chain={chain} label={venueLabel} />
          <EmptyTitle className="text-xs leading-snug">
            {readOnly
              ? venueLabel
              : isDex
                ? t('terminal.wallet.connectHintWallet', { chain: venueLabel })
                : t('terminal.wallet.connectHintAccount', {
                    venue: venueLabel,
                  })}
          </EmptyTitle>
          {readOnly && (
            <EmptyDescription className="text-[11px] leading-snug">
              {t('terminal.wallet.gateNoTrading')}
            </EmptyDescription>
          )}
        </EmptyHeader>

        {!readOnly && (
          <>
            <Button
              size="sm"
              className="w-full"
              nativeButton={false}
              render={
                <Link
                  to="/accounts"
                  search={isDex ? { connectChain: chain } : { connect: market }}
                />
              }
            >
              <Wallet className="size-3.5" />
              {isDex
                ? t('terminal.wallet.connectWallet')
                : t('terminal.wallet.connectAccount')}
            </Button>
            {/*
              The claim is clickable. Telling someone their keys are safe and
              giving them no way to ask "how?" is the part that reads as a
              slogan; the same explainer the Accounts badge opens is one tap
              away right where they are being asked to hand over an API key.
            */}
            <button
              type="button"
              onClick={() => setSecurityOpen(true)}
              aria-label={t('accounts.localOnly.badgeAria')}
              className="flex items-center justify-center gap-1 rounded text-[10px] leading-snug text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <Shield className="size-2.5 shrink-0" />
              {t('accounts.storedSecurely')}
            </button>
          </>
        )}
      </Empty>

      <KeySecurityDialog open={securityOpen} onOpenChange={setSecurityOpen} />
    </div>
  )
}
