// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useTranslation } from 'react-i18next'
import { ChevronRight, KeyRound, Landmark, Wallet } from 'lucide-react'

import { cn } from '@pairlens/ui'
import { Badge } from '@pairlens/ui/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@pairlens/ui/components/ui/dialog'

import { StoredLocallyDisclosure } from './stored-locally-disclosure'

// ---------------------------------------------------------------------------
// Credential type picker
// ---------------------------------------------------------------------------

export type CredentialKind = 'exchange' | 'crypto' | 'broker'

export function AddCredentialPicker({
  open,
  onOpenChange,
  hasExchanges,
  hasChains,
  hasBrokers,
  onPick,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  hasExchanges: boolean
  hasChains: boolean
  hasBrokers: boolean
  onPick: (kind: CredentialKind) => void
}) {
  const { t } = useTranslation()

  const options: Array<{
    kind: CredentialKind
    icon: typeof KeyRound
    title: string
    description: string
    enabled: boolean
    comingSoon?: boolean
  }> = [
    {
      kind: 'exchange',
      icon: KeyRound,
      title: t('accounts.typeExchange'),
      description: t('accounts.typeExchangeDesc'),
      enabled: hasExchanges,
    },
    {
      kind: 'crypto',
      icon: Wallet,
      title: t('accounts.typeCrypto'),
      description: t('accounts.typeCryptoDesc'),
      enabled: hasChains,
    },
    {
      kind: 'broker',
      icon: Landmark,
      title: t('accounts.typeBroker'),
      description: t('accounts.typeBrokerDesc'),
      enabled: hasBrokers,
      comingSoon: !hasBrokers,
    },
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('accounts.connectAccountTitle')}</DialogTitle>
          <DialogDescription>
            {t('accounts.connectAccountDesc')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {options.map((option) => (
            <button
              key={option.kind}
              type="button"
              disabled={!option.enabled}
              onClick={() => onPick(option.kind)}
              className={cn(
                'flex w-full items-center gap-3 rounded-lg border border-border p-3 text-left transition-all',
                option.enabled
                  ? 'hover:border-primary/30 hover:bg-accent/50'
                  : 'cursor-not-allowed opacity-50',
              )}
            >
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                <option.icon className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{option.title}</p>
                  {option.comingSoon && (
                    <Badge variant="outline" className="text-[10px]">
                      {t('accounts.comingSoon')}
                    </Badge>
                  )}
                </div>
                <p className="text-[11px] leading-tight text-muted-foreground">
                  {option.description}
                </p>
              </div>
              {option.enabled && (
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              )}
            </button>
          ))}
        </div>
        <StoredLocallyDisclosure />
      </DialogContent>
    </Dialog>
  )
}
