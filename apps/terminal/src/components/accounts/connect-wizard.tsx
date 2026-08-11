// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, motion } from 'motion/react'
import {
  AlertTriangle,
  ChevronLeft,
  CircleCheck,
  CircleDot,
  KeyRound,
  UserPlus,
} from 'lucide-react'

import { cn } from '@pairlens/ui'
import { Alert, AlertDescription } from '@pairlens/ui/components/ui/alert'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@pairlens/ui/components/ui/select'

import { ExchangeBadge } from './venue-badges'
import { CreateAccountHint } from './create-account-links'
import { StoredLocallyDisclosure } from './stored-locally-disclosure'
import type { FormEvent } from 'react'
import { CREDENTIAL_SCHEMAS } from '@/stores/credentials-store'
import { useAffiliateLinks } from '@/hooks/use-affiliate-links'
import { getRegionLabel, getRegionSetting } from '@/lib/region-settings'

// ---------------------------------------------------------------------------
// New Wallet Wizard
// ---------------------------------------------------------------------------

// The 'account' step asks whether the user already has an account with the
// selected venue — "not yet" routes through the venue signup (affiliate)
// link. Skipped for venues with no resolvable signup URL.
type WizardStep = 'exchange' | 'account' | 'mode' | 'credentials'

export type ConnectExchangeWizardProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  availableMarkets: Array<string>
  isBusy: boolean
  feedback: { type: 'error' | 'success'; message: string } | null
  onSubmit: (event: FormEvent) => Promise<void>
  mode: 'paper' | 'live'
  setMode: (mode: 'paper' | 'live') => void
  setSelectedMarket: (market: string | null) => void
  walletName: string
  setWalletName: (name: string) => void
  formFields: Record<string, string>
  setFormFields: React.Dispatch<React.SetStateAction<Record<string, string>>>
  setFeedback: (
    fb: { type: 'error' | 'success'; message: string } | null,
  ) => void
  schema: (typeof CREDENTIAL_SCHEMAS)[string] | null
  resolvedMarket: string | null
  /** 'exchange' (crypto CEX) or 'broker' (stock broker) — copy only. */
  variant: 'exchange' | 'broker'
  /**
   * Venue to open on, skipping the picker — set when the wizard is opened from
   * somewhere that already knows the venue (the trade ticket's connect gate).
   */
  initialMarket?: string | null
}

export function ConnectExchangeWizard({
  open,
  onOpenChange,
  availableMarkets,
  isBusy,
  feedback,
  onSubmit,
  mode,
  setMode,
  setSelectedMarket,
  walletName,
  setWalletName,
  formFields,
  setFormFields,
  setFeedback,
  schema,
  resolvedMarket,
  variant,
  initialMarket,
}: ConnectExchangeWizardProps) {
  const { t } = useTranslation()
  const { getSignupUrl } = useAffiliateLinks()
  const [step, setStep] = useState<WizardStep>('exchange')
  const isBroker = variant === 'broker'
  const resolvedSignupUrl = resolvedMarket ? getSignupUrl(resolvedMarket) : null

  const availableModes = schema?.modes ?? ['paper', 'live']

  const goBack = useCallback(() => {
    if (step === 'credentials') {
      if (availableModes.length > 1) setStep('mode')
      else setStep(resolvedSignupUrl ? 'account' : 'exchange')
    } else if (step === 'mode') {
      setStep(resolvedSignupUrl ? 'account' : 'exchange')
    } else if (step === 'account') {
      setStep('exchange')
    }
  }, [step, availableModes.length, resolvedSignupUrl])

  const selectExchange = useCallback(
    (market: string) => {
      const s = CREDENTIAL_SCHEMAS[market]
      setSelectedMarket(market)
      setMode(s?.modes[0] ?? 'paper')
      setFormFields({})
      setWalletName('')
      setFeedback(null)
      // Ask "do you have an account?" when we can route a signup link;
      // if only one mode is available, the mode step is skipped
      if (getSignupUrl(market)) {
        setStep('account')
      } else if (s && s.modes.length === 1) {
        setStep('credentials')
      } else {
        setStep('mode')
      }
    },
    [
      setSelectedMarket,
      setMode,
      setFormFields,
      setWalletName,
      setFeedback,
      getSignupUrl,
    ],
  )

  // Reset wizard state when the dialog opens, or jump straight past the venue
  // picker when the caller already knows the venue. Read through refs so the
  // effect stays keyed on `open` alone — re-running it when the affiliate links
  // resolve would wipe a half-filled form.
  const openOnRef = useRef({ market: initialMarket, select: selectExchange })
  openOnRef.current = { market: initialMarket, select: selectExchange }
  useEffect(() => {
    if (!open) return
    setFormFields({})
    setWalletName('')
    setFeedback(null)
    const { market, select } = openOnRef.current
    if (market && CREDENTIAL_SCHEMAS[market]) {
      select(market)
    } else {
      setStep('exchange')
      setSelectedMarket(null)
    }
  }, [open, setSelectedMarket, setFormFields, setWalletName, setFeedback])

  // Both "yes" and "not yet" continue — "not yet" also opens the signup link
  const advanceFromAccount = useCallback(() => {
    if (schema && schema.modes.length === 1) setStep('credentials')
    else setStep('mode')
  }, [schema])

  const selectMode = useCallback(
    (m: 'paper' | 'live') => {
      setMode(m)
      setStep('credentials')
    },
    [setMode],
  )

  const stepIndex =
    step === 'exchange' ? 0 : step === 'account' ? 1 : step === 'mode' ? 2 : 3
  const stepLabels = [
    isBroker ? t('accounts.broker') : t('accounts.exchange'),
    t('accounts.account', 'Account'),
    t('accounts.mode'),
    t('accounts.credentials'),
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isBroker
              ? t('accounts.connectBroker')
              : t('accounts.connectExchange')}
          </DialogTitle>
          <DialogDescription>
            {step === 'exchange' &&
              (isBroker
                ? t('accounts.selectBroker')
                : t('accounts.selectExchange'))}
            {step === 'account' &&
              t('accounts.hasAccountLead', {
                defaultValue: 'Setting up your {{exchange}} connection',
                exchange: schema?.label ?? '',
              })}
            {step === 'mode' && t('accounts.chooseMode')}
            {step === 'credentials' && t('accounts.enterCredentials')}
          </DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-1.5 px-1">
          {stepLabels.map((label, i) => (
            <div
              key={label}
              className="flex flex-1 flex-col items-center gap-1"
            >
              <div
                className={cn(
                  'h-1 w-full rounded-full transition-colors',
                  i <= stepIndex ? 'bg-primary' : 'bg-muted',
                )}
              />
              <span
                className={cn(
                  'text-[10px] transition-colors',
                  i <= stepIndex
                    ? 'text-foreground font-medium'
                    : 'text-muted-foreground',
                )}
              >
                {label}
              </span>
            </div>
          ))}
        </div>

        <AnimatePresence mode="wait" initial={false}>
          {/* Step 1: Exchange selector */}
          {step === 'exchange' && (
            <motion.div
              key="exchange"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.15 }}
              className="space-y-2"
            >
              <div className="grid grid-cols-2 gap-2">
                {availableMarkets.map((market) => {
                  const s = CREDENTIAL_SCHEMAS[market]
                  if (!s) return null
                  return (
                    <button
                      key={market}
                      type="button"
                      onClick={() => selectExchange(market)}
                      className={cn(
                        'flex items-center gap-3 rounded-lg border p-3 text-left transition-all',
                        'hover:bg-accent/50 hover:border-primary/30',
                        'border-border',
                      )}
                    >
                      <ExchangeBadge market={market} />
                      <p className="text-sm font-medium">{s.label}</p>
                    </button>
                  )
                })}
              </div>
            </motion.div>
          )}

          {/* Step 2: Already have an account with this venue? */}
          {step === 'account' && schema && resolvedMarket && (
            <motion.div
              key="account"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.15 }}
              className="space-y-3"
            >
              {/* The question sits right on top of its two answers */}
              <p className="pt-1 text-center text-sm font-medium text-foreground">
                {t('accounts.hasAccountQuestion', {
                  defaultValue: 'Do you already have a {{exchange}} account?',
                  exchange: schema.label,
                })}
              </p>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={advanceFromAccount}
                  className="group flex flex-col items-center gap-2 rounded-lg border border-border p-4 transition-all hover:border-emerald-500/40 hover:bg-emerald-500/5"
                >
                  <KeyRound className="size-6 text-emerald-500" />
                  <span className="text-sm font-medium">
                    {t('accounts.hasAccountYes', 'Yes, I have one')}
                  </span>
                  <span className="text-center text-[11px] leading-tight text-muted-foreground">
                    {t(
                      'accounts.hasAccountYesDesc',
                      'Continue and paste your API keys',
                    )}
                  </span>
                </button>
                {resolvedSignupUrl && (
                  <a
                    href={resolvedSignupUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={advanceFromAccount}
                    className="group flex flex-col items-center gap-2 rounded-lg border border-border p-4 transition-all hover:border-primary/40 hover:bg-primary/5"
                  >
                    <UserPlus className="size-6 text-primary" />
                    <span className="text-sm font-medium">
                      {t('accounts.hasAccountNo', 'Not yet')}
                    </span>
                    <span className="text-center text-[11px] leading-tight text-muted-foreground">
                      {t('accounts.hasAccountNoDesc', {
                        defaultValue: 'Open a free {{exchange}} account',
                        exchange: schema.label,
                      })}
                    </span>
                  </a>
                )}
              </div>

              <p className="text-center text-[10px] text-muted-foreground/70">
                {t('accounts.affiliateDisclosure')}
              </p>
            </motion.div>
          )}

          {/* Step 3: Mode selector */}
          {step === 'mode' && schema && resolvedMarket && (
            <motion.div
              key="mode"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.15 }}
              className="space-y-4"
            >
              {/* Selected exchange badge */}
              <div className="flex items-center gap-3 rounded-lg bg-muted/50 px-3 py-2">
                <ExchangeBadge market={resolvedMarket} />
                <div>
                  <p className="text-sm font-medium">{schema.label}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {getRegionLabel(getRegionSetting(resolvedMarket)) ??
                      t('accounts.globalEndpoint')}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {availableModes.includes('paper') && (
                  <button
                    type="button"
                    onClick={() => selectMode('paper')}
                    className="group flex flex-col items-center gap-2 rounded-lg border border-border p-4 transition-all hover:border-amber-500/40 hover:bg-amber-500/5"
                  >
                    <CircleDot className="size-6 text-amber-500" />
                    <span className="text-sm font-medium">
                      {t('accounts.paper')}
                    </span>
                    <span className="text-center text-[11px] leading-tight text-muted-foreground">
                      {t('accounts.paperDescription')}
                    </span>
                  </button>
                )}
                {availableModes.includes('live') && (
                  <button
                    type="button"
                    onClick={() => selectMode('live')}
                    className="group flex flex-col items-center gap-2 rounded-lg border border-border p-4 transition-all hover:border-emerald-500/40 hover:bg-emerald-500/5"
                  >
                    <CircleCheck className="size-6 text-emerald-500" />
                    <span className="text-sm font-medium">
                      {t('accounts.live')}
                    </span>
                    <span className="text-center text-[11px] leading-tight text-muted-foreground">
                      {t('accounts.liveDescription')}
                    </span>
                  </button>
                )}
              </div>
            </motion.div>
          )}

          {/* Step 4: Credentials */}
          {step === 'credentials' && schema && resolvedMarket && (
            <motion.div
              key="credentials"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.15 }}
            >
              <form
                className="space-y-4"
                id="wallet-form"
                onSubmit={(e) => void onSubmit(e)}
              >
                {/* Context summary */}
                <div className="flex items-center gap-3 rounded-lg bg-muted/50 px-3 py-2">
                  <ExchangeBadge market={resolvedMarket} />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{schema.label}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {getRegionLabel(getRegionSetting(resolvedMarket)) ??
                        t('accounts.globalEndpoint')}{' '}
                      &middot;{' '}
                      <span
                        className={
                          mode === 'paper'
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-emerald-600 dark:text-emerald-400'
                        }
                      >
                        {mode === 'paper'
                          ? t('accounts.paper')
                          : t('accounts.live')}
                      </span>
                    </p>
                  </div>
                </div>

                {/* Organic assist: no account on this venue yet? */}
                <CreateAccountHint
                  market={resolvedMarket}
                  label={schema.label}
                />

                {/* Disclaimers */}
                {mode === 'paper' && (
                  <Alert className="border-blue-500/30 bg-blue-500/5">
                    <AlertTriangle className="size-4 text-blue-500" />
                    <AlertDescription className="text-xs text-blue-700 dark:text-blue-400">
                      {t('accounts.demoKeysReminder', {
                        exchange: schema.label,
                        region:
                          getRegionLabel(getRegionSetting(resolvedMarket)) ??
                          t('accounts.globalEndpoint'),
                      })}
                    </AlertDescription>
                  </Alert>
                )}

                {schema.inactivityExpiry && (
                  <Alert className="border-amber-500/30 bg-amber-500/5">
                    <AlertTriangle className="size-4 text-amber-500" />
                    <AlertDescription className="text-xs text-amber-700 dark:text-amber-400">
                      {schema.inactivityExpiry.warning}
                    </AlertDescription>
                  </Alert>
                )}

                {/* Wallet name */}
                <div className="space-y-1.5">
                  <Label htmlFor="wallet-name">{t('accounts.name')}</Label>
                  <Input
                    id="wallet-name"
                    placeholder={`${schema.label} ${mode === 'paper' ? t('accounts.paper') : t('accounts.live')}`}
                    value={walletName}
                    disabled={isBusy}
                    onChange={(e) => setWalletName(e.target.value)}
                    autoComplete="off"
                  />
                </div>

                {/* Dynamic credential fields */}
                {schema.fields.map((field) => (
                  <div key={field.key} className="space-y-1.5">
                    <Label htmlFor={`wallet-${field.key}`}>
                      {field.label}
                      {field.required && (
                        <span className="text-destructive"> *</span>
                      )}
                    </Label>
                    <Input
                      id={`wallet-${field.key}`}
                      type="password"
                      value={formFields[field.key] ?? ''}
                      disabled={isBusy}
                      onChange={(e) =>
                        setFormFields((prev) => ({
                          ...prev,
                          [field.key]: e.target.value,
                        }))
                      }
                      autoComplete="off"
                    />
                  </div>
                ))}

                {/* Account-entity selector (venues whose keys bind to one
                    regional entity — e.g. OKX). Stored as '' for Auto; Radix
                    Select items cannot carry an empty value, hence the
                    'auto' sentinel that never leaves this component. */}
                {schema.entity && (
                  <div className="space-y-1.5">
                    <Label htmlFor="wallet-entity">{schema.entity.label}</Label>
                    <Select
                      value={formFields['entity'] || 'auto'}
                      disabled={isBusy}
                      onValueChange={(value) =>
                        setFormFields((prev) => ({
                          ...prev,
                          entity: !value || value === 'auto' ? '' : value,
                        }))
                      }
                    >
                      <SelectTrigger id="wallet-entity" className="w-full">
                        {/* Explicit label, not a bare SelectValue: Radix only
                            learns an item's text once the content has mounted,
                            so an unopened trigger would show the raw value. */}
                        <SelectValue>
                          {schema.entity.options.find(
                            (option) =>
                              option.value === (formFields['entity'] ?? ''),
                          )?.label ?? schema.entity.options[0]?.label}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {schema.entity.options.map((option) => (
                          <SelectItem
                            key={option.value || 'auto'}
                            value={option.value || 'auto'}
                          >
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-[11px] text-muted-foreground">
                      {schema.entity.help}
                    </p>
                  </div>
                )}

                {/* Error feedback */}
                {feedback?.type === 'error' && (
                  <Alert variant="destructive">
                    <AlertDescription>{feedback.message}</AlertDescription>
                  </Alert>
                )}
              </form>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Security disclosure */}
        <StoredLocallyDisclosure />

        {/* Footer */}
        <DialogFooter>
          {step !== 'exchange' && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={goBack}
              disabled={isBusy}
            >
              <ChevronLeft className="size-3.5" />
              {t('accounts.back')}
            </Button>
          )}
          {step === 'exchange' && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              {t('accounts.cancel')}
            </Button>
          )}
          {step === 'credentials' && (
            <Button
              disabled={isBusy}
              type="submit"
              size="sm"
              form="wallet-form"
            >
              {isBusy ? t('accounts.saving') : t('accounts.saveApiKey')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
