// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useTranslation } from 'react-i18next'
import { cn } from '@pairlens/ui'
import { Button } from '@pairlens/ui/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@pairlens/ui/components/ui/dialog'
import { Input } from '@pairlens/ui/components/ui/input'
import { Label } from '@pairlens/ui/components/ui/label'

import { ChainBadge } from './venue-badges'
import { StoredLocallyDisclosure } from './stored-locally-disclosure'
import type { FormEvent } from 'react'
import { WALLET_SCHEMAS } from '@/stores/wallets-store'

// ---------------------------------------------------------------------------
// Add crypto wallet dialog
// ---------------------------------------------------------------------------

export function AddCryptoWalletDialog({
  open,
  onOpenChange,
  availableChains,
  cryptoChain,
  setCryptoChain,
  cryptoLabel,
  setCryptoLabel,
  cryptoPrivateKey,
  setCryptoPrivateKey,
  isBusy,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  availableChains: Array<string>
  cryptoChain: string | null
  setCryptoChain: (chain: string | null) => void
  cryptoLabel: string
  setCryptoLabel: (label: string) => void
  cryptoPrivateKey: string
  setCryptoPrivateKey: (key: string) => void
  isBusy: boolean
  onSubmit: (event: FormEvent) => Promise<void>
}) {
  const { t } = useTranslation()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('accounts.addWalletDialogTitle')}</DialogTitle>
          <DialogDescription>
            {t('accounts.addWalletDialogDescription')}
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={(e) => void onSubmit(e)}>
          {/* Chain selector */}
          <div className="space-y-1.5">
            <Label>{t('accounts.blockchainLabel')}</Label>
            <div className="grid grid-cols-3 gap-2">
              {availableChains.map((chain) => {
                const schema =
                  WALLET_SCHEMAS[chain as keyof typeof WALLET_SCHEMAS]
                return (
                  <button
                    key={chain}
                    type="button"
                    onClick={() => setCryptoChain(chain)}
                    className={cn(
                      'flex flex-col items-center gap-2 rounded-lg border p-3 text-center text-sm font-medium transition-all',
                      cryptoChain === chain
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:bg-accent/50',
                    )}
                  >
                    <ChainBadge chain={chain} className="size-7" />
                    {schema?.label ?? chain}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Label */}
          <div className="space-y-1.5">
            <Label htmlFor="crypto-label">
              {t('accounts.walletLabelField')}
            </Label>
            <Input
              id="crypto-label"
              placeholder={t('accounts.walletLabelPlaceholder')}
              value={cryptoLabel}
              onChange={(e) => setCryptoLabel(e.target.value)}
              disabled={isBusy}
              autoComplete="off"
            />
          </div>

          {/* Private key */}
          <div className="space-y-1.5">
            <Label htmlFor="crypto-key">
              {t('accounts.privateKeyField')}
              <span className="text-destructive"> *</span>
            </Label>
            <Input
              id="crypto-key"
              type="password"
              value={cryptoPrivateKey}
              onChange={(e) => setCryptoPrivateKey(e.target.value)}
              disabled={isBusy}
              autoComplete="off"
            />
          </div>

          <StoredLocallyDisclosure />

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              {t('accounts.cancel')}
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isBusy || !cryptoPrivateKey.trim()}
            >
              {isBusy ? t('accounts.saving') : t('accounts.saveWallet')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
