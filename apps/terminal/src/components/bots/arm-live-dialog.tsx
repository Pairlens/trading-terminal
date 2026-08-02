// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useEffect, useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { KeyRound, MonitorSmartphone, TriangleAlert } from 'lucide-react'
import { useTranslation } from 'react-i18next'

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

import type { BotDefinition } from '@pairlens/bot-engine/types'
import { useAvailableMarkets } from '@/hooks/use-available-markets'
import { useBotsStore } from '@/stores/bots-store'
import {
  CREDENTIAL_SCHEMAS,
  useCredentialsStore,
} from '@/stores/credentials-store'

type ArmLiveDialogProps = {
  /** Null closes the dialog — mirrors the export dialog's shape. */
  bot: BotDefinition | null
  onOpenChange: (open: boolean) => void
  /** Fired after the bot is armed, so the caller can select or scroll to it. */
  onArmed?: (botId: string) => void
}

/**
 * The one door between paper and real money.
 *
 * Everything here exists to make sure nobody arrives at a live bot by accident:
 * the venue and the exact credential are named, the machine-must-stay-on
 * caveat is restated at the moment it matters, and the confirm button stays
 * dead until the user has typed the phrase. With no credential for the venue
 * there is nothing to confirm — the dialog refuses and points at /accounts.
 */
export function ArmLiveDialog({
  bot,
  onOpenChange,
  onArmed,
}: ArmLiveDialogProps) {
  const { t } = useTranslation()
  const [typed, setTyped] = useState('')
  const credentials = useCredentialsStore((s) => s.credentials)
  const loadCredentials = useCredentialsStore((s) => s.load)
  const updateBot = useBotsStore((s) => s.updateBot)
  const setEnabled = useBotsStore((s) => s.setEnabled)
  const { markets } = useAvailableMarkets()

  // Credentials live in the OS keychain, so the store is empty until asked.
  useEffect(() => {
    void loadCredentials()
  }, [loadCredentials])

  // Reset the typed phrase whenever a different bot is put up for arming.
  useEffect(() => {
    setTyped('')
  }, [bot?.id])

  const credential = useMemo(
    () => credentials.find((c) => c.market === bot?.market),
    [credentials, bot?.market],
  )

  const venueLabel = useMemo(() => {
    if (!bot) return ''
    return (
      markets.find((m) => m.value === bot.market)?.label ??
      CREDENTIAL_SCHEMAS[bot.market]?.label ??
      bot.market.toUpperCase()
    )
  }, [markets, bot])

  const phrase = t('botsPage.armConfirmPhrase')
  const confirmed = typed.trim().toUpperCase() === phrase.toUpperCase()

  const handleArm = () => {
    if (!bot || !credential || !confirmed) return
    // Mode first, then enable: `setEnabled` also clears `needsRearm`, so a
    // re-armed bot and a newly promoted one end in the same state.
    updateBot(bot.id, { mode: 'live' })
    setEnabled(bot.id, true)
    onArmed?.(bot.id)
    onOpenChange(false)
  }

  return (
    <Dialog open={bot !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('botsPage.armTitle')}</DialogTitle>
          <DialogDescription>
            {t('botsPage.armDescription', {
              name: bot?.name ?? '',
              pair: bot?.pair ?? '',
              venue: venueLabel,
            })}
          </DialogDescription>
        </DialogHeader>

        {credential ? (
          <div className="grid gap-3">
            <div className="grid gap-1.5 rounded-lg border border-border bg-muted/40 p-3 text-xs">
              <div className="flex items-center gap-2">
                <KeyRound className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="text-muted-foreground">
                  {t('botsPage.armCredentialLabel')}
                </span>
                <span className="ml-auto truncate font-medium">
                  {credential.label}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="size-3.5 shrink-0" />
                <span className="text-muted-foreground">
                  {t('botsPage.armVenueLabel')}
                </span>
                <span className="ml-auto truncate font-medium">
                  {venueLabel}
                </span>
              </div>
            </div>

            <p className="flex gap-2 text-xs text-amber-500">
              <MonitorSmartphone className="mt-px size-3.5 shrink-0" />
              {t('botsPage.armMachineCaveat')}
            </p>

            <div className="grid gap-1.5">
              <Label htmlFor="arm-confirm" className="text-xs">
                {t('botsPage.armConfirmLabel', { phrase })}
              </Label>
              <Input
                id="arm-confirm"
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') handleArm()
                }}
                placeholder={phrase}
                autoComplete="off"
                className="font-mono"
              />
            </div>
          </div>
        ) : (
          <div className="grid gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
            <p className="flex gap-2 text-xs text-amber-500">
              <TriangleAlert className="mt-px size-3.5 shrink-0" />
              {t('botsPage.armNoCredential', { venue: venueLabel })}
            </p>
            <Button
              size="sm"
              variant="outline"
              className="justify-self-start"
              render={<Link to="/accounts" />}
              onClick={() => onOpenChange(false)}
            >
              {t('botsPage.armAddCredential')}
            </Button>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            {t('common.cancel')}
          </Button>
          <Button
            size="sm"
            onClick={handleArm}
            disabled={!credential || !confirmed}
          >
            {t('botsPage.armConfirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
