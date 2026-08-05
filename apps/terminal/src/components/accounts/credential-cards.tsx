// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import { motion } from 'motion/react'
import { AlertTriangle, Link2Off, ShieldCheck } from 'lucide-react'

import { cn } from '@pairlens/ui'
import { Button } from '@pairlens/ui/components/ui/button'

import { PluginPosterArt } from '../plugins/plugin-icon'
import {
  chainBrand,
  chainPosterSrc,
  venueBrand,
  venuePluginId,
  venuePosterSrc,
} from './venue-art'
import type { ExchangeCredential } from '@/stores/credentials-store'
import type { CryptoWallet } from '@/stores/wallets-store'
import { usePortfolioValue } from '@/hooks/use-portfolio-value'
import { formatValue } from '@/lib/format-price'
import { getExpiryStatus } from '@/stores/credentials-store'
import { WALLET_SCHEMAS } from '@/stores/wallets-store'

// ---------------------------------------------------------------------------
// Connected-account cards — the storefront poster language applied to
// credentials: ambient brand art on a tinted gradient, mono metadata below.
// ---------------------------------------------------------------------------

/** Inline keep/remove confirmation shared by both cards. */
function RemoveConfirm({
  onRemove,
  isBusy,
  label,
}: {
  onRemove: () => void
  isBusy: boolean
  label: string
}) {
  const { t } = useTranslation()
  const [confirming, setConfirming] = useState(false)

  if (confirming) {
    return (
      <div className="flex items-center gap-1.5">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setConfirming(false)}
          disabled={isBusy}
        >
          {t('accounts.keep')}
        </Button>
        <Button
          size="sm"
          variant="destructive"
          onClick={() => {
            onRemove()
            setConfirming(false)
          }}
          disabled={isBusy}
        >
          {t('accounts.remove')}
        </Button>
      </div>
    )
  }

  return (
    <Button
      size="sm"
      variant="ghost"
      className="gap-1.5 text-muted-foreground opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
      onClick={() => setConfirming(true)}
      disabled={isBusy}
    >
      <Link2Off className="size-3.5" />
      {label}
    </Button>
  )
}

export function ExchangeAccountCard({
  credential,
  index,
  onRemove,
  isBusy,
  currencySymbol,
}: {
  credential: ExchangeCredential
  index: number
  onRemove: () => void
  isBusy: boolean
  currencySymbol: string
}) {
  const { t } = useTranslation()
  const expiry = getExpiryStatus(credential)
  const { totalValue } = usePortfolioValue(credential.id)
  const brand = venueBrand(credential.market, credential.label)
  const isLive = credential.mode === 'live'

  const apiKeyHint = credential.apiKey
    ? credential.apiKey.length >= 8
      ? `${credential.apiKey.slice(0, 4)}…${credential.apiKey.slice(-4)}`
      : '****'
    : ''

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.38,
        delay: index * 0.06,
        ease: [0.22, 1, 0.36, 1],
      }}
      className="pl-store-lift group relative flex flex-col overflow-hidden border border-border"
      style={{
        borderRadius: 17,
        background: `linear-gradient(165deg, color-mix(in oklch, ${brand.tint} 26%, var(--card)) 0%, var(--card) 62%)`,
      }}
      role="article"
      aria-label={t('accounts.exchangeAccountAriaLabel', {
        label: credential.label,
      })}
    >
      {/* Poster band — the venue's mark as ambient art */}
      <div className="relative flex h-[124px] items-center justify-center overflow-hidden">
        <PluginPosterArt
          id={venuePluginId(credential.market)}
          name={credential.label || credential.market.toUpperCase()}
          src={venuePosterSrc(credential.market)}
          iconSize={54}
          monoSize={50}
          scrim={false}
        />
        <span
          className={cn(
            'absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] backdrop-blur-sm',
            isLive
              ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
              : 'border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-300',
          )}
        >
          <span
            className={cn(
              'size-1.5 rounded-full',
              isLive ? 'bg-emerald-500' : 'bg-amber-500',
            )}
          />
          {credential.mode}
        </span>
      </div>

      {/* Details */}
      <div className="relative flex flex-1 flex-col border-t border-border/40 bg-card/70 p-4 backdrop-blur-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">
              {credential.label || credential.market.toUpperCase()}
            </p>
            <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
              {credential.market.toUpperCase()}
              {apiKeyHint && (
                <>
                  <span className="mx-1.5 text-border">/</span>
                  {apiKeyHint}
                </>
              )}
            </p>
          </div>
          {totalValue > 0 && (
            <span className="shrink-0 font-mono text-sm font-semibold tabular-nums text-foreground">
              {formatValue(currencySymbol, totalValue)}
            </span>
          )}
        </div>

        <div className="mt-3 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
          <ShieldCheck className="size-3 text-emerald-600 dark:text-emerald-400" />
          {t('accounts.localBadge')}
          <span className="text-border">·</span>
          {credential.createdAt > 0
            ? new Date(credential.createdAt).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })
            : t('accounts.unknownDate')}
        </div>

        {/* Inactivity expiry warning */}
        {expiry?.warning && (
          <div
            className={cn(
              'mt-3 flex items-start gap-2 rounded-lg px-3 py-2 text-[11px]',
              expiry.expired
                ? 'bg-red-500/10 text-red-700 dark:text-red-400'
                : 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
            )}
          >
            <AlertTriangle className="mt-0.5 size-3 shrink-0" />
            <span>
              {expiry.expired
                ? t('accounts.keyExpiredWarning', {
                    daysInactive: expiry.daysInactive,
                    limitDays: expiry.policy.days,
                  })
                : t('accounts.keyInactiveWarning', {
                    daysInactive: expiry.daysInactive,
                    limitDays: expiry.policy.days,
                  })}
            </span>
          </div>
        )}

        {/* Footer: status + remove */}
        <div className="mt-auto flex items-center justify-between border-t border-dashed border-border/40 pt-3">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'size-2 rounded-full',
                isLive ? 'bg-emerald-500' : 'bg-amber-400',
              )}
            />
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              {t('common.active')}
            </span>
          </div>
          <RemoveConfirm
            onRemove={onRemove}
            isBusy={isBusy}
            label={t('accounts.disconnect')}
          />
        </div>
      </div>
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// Crypto wallet card
// ---------------------------------------------------------------------------

export function CryptoWalletCard({
  wallet,
  onRemove,
  isBusy,
}: {
  wallet: CryptoWallet
  onRemove: () => void
  isBusy: boolean
}) {
  const { t } = useTranslation()
  const schema = WALLET_SCHEMAS[wallet.chain]
  const brand = chainBrand(wallet.chain)
  const poster = chainPosterSrc(wallet.chain)

  return (
    <div
      className="pl-store-lift group relative flex flex-col overflow-hidden border border-border"
      style={{
        borderRadius: 17,
        background: `linear-gradient(165deg, color-mix(in oklch, ${brand.tint} 24%, var(--card)) 0%, var(--card) 62%)`,
      }}
      role="article"
      aria-label={t('accounts.cryptoWalletAriaLabel', {
        label: wallet.label,
      })}
    >
      {/* Poster band — chain mark or tinted monogram */}
      <div className="relative flex h-[96px] items-center justify-center overflow-hidden">
        {poster ? (
          <>
            <img
              aria-hidden
              src={poster}
              className="pointer-events-none absolute inset-0 size-full scale-125 object-cover opacity-60 blur-[34px] saturate-150"
            />
            <img
              src={poster}
              alt={wallet.chain}
              className="relative size-11 rounded-xl object-contain drop-shadow-[0_14px_30px_rgb(0_0_0/0.55)]"
            />
          </>
        ) : (
          <span
            role="img"
            aria-label={wallet.chain}
            className="flex size-11 items-center justify-center rounded-xl font-mono text-[13px] font-bold text-white shadow-[0_10px_30px_-8px_rgb(0_0_0/0.6)]"
            style={{ background: brand.tint }}
          >
            {brand.mono}
          </span>
        )}
        <span className="absolute right-3 top-3 rounded-full border border-border/50 bg-background/60 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground backdrop-blur-sm">
          {schema?.label ?? wallet.chain}
        </span>
      </div>

      {/* Details */}
      <div className="relative flex flex-1 flex-col border-t border-border/40 bg-card/70 p-4 backdrop-blur-sm">
        <p className="truncate text-sm font-semibold text-foreground">
          {wallet.label}
        </p>
        <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
          {wallet.address}
        </p>

        <div className="mt-3 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
          <ShieldCheck className="size-3 text-emerald-600 dark:text-emerald-400" />
          {t('accounts.localBadge')}
          <span className="text-border">·</span>
          {new Date(wallet.createdAt).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
          })}
        </div>

        <div className="mt-auto flex items-center justify-end border-t border-dashed border-border/40 pt-3">
          <RemoveConfirm
            onRemove={onRemove}
            isBusy={isBusy}
            label={t('accounts.remove')}
          />
        </div>
      </div>
    </div>
  )
}
