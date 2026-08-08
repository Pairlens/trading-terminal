// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Everything `AddCredentialPicker`, `ConnectExchangeWizard` and
 * `AddCryptoWalletDialog` need to be driven, as a hook.
 *
 * All three are fully controlled — eighteen props between them — and this is
 * the single place their state lives. Both surfaces consume it: the desktop
 * Accounts page (`components/accounts/accounts-page.tsx`) and the mobile
 * connect overlay (`mobile/screens/connect-account-sheet.tsx`). The mobile
 * shell shipped with a copy of the page's state block; that copy is gone, and
 * this file is what replaced it. Anything that opens a credential flow goes
 * through here — a second copy is how the vault gate ends up guarding one
 * surface and not the other.
 *
 * It deliberately owns only the CONNECT flow. Listing, renaming and removing
 * credentials stay with the screen that shows them.
 *
 * Lives outside `src/mobile/` on purpose: the mobile tree is separable, so
 * nothing in the desktop tree may import from it (see
 * `mobile/__tests__/separability.test.ts`).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { CredentialKind } from '@/components/accounts/add-credential-picker'
import type { FormEvent } from 'react'
import { track } from '@/lib/analytics-events'
import {
  WALLET_SCHEMAS,
  deriveEvmAddress,
  deriveSolanaAddress,
  useWalletsStore,
} from '@/stores/wallets-store'
import {
  CREDENTIAL_SCHEMAS,
  isBrokerMarket,
  useCredentialsStore,
} from '@/stores/credentials-store'
import { useAvailableMarkets } from '@/hooks/use-available-markets'
import { useMarketData } from '@/lib/market-data-provider'
import {
  isVaultEnrollmentRequired,
  isVaultSealed,
} from '@/lib/security/vault/vault-errors'
import { mustEnrollFirst } from '@/lib/security/vault/vault-policy'

export type ConnectFeedback = {
  type: 'error' | 'success'
  message: string
} | null

export function useConnectWizardState({
  initialMarket,
  onConnected,
}: {
  /** Venue to open the wizard on directly (the trade ticket's connect gate). */
  initialMarket?: string
  /** Fired once a credential or wallet is saved. */
  onConnected?: () => void
} = {}) {
  const { t } = useTranslation()
  const { availableMarkets: adapterInfos } = useMarketData()
  const { markets } = useAvailableMarkets()

  const { load, addCredential } = useCredentialsStore()
  const {
    load: loadWallets,
    addWallet: addCryptoWallet,
    wallets,
  } = useWalletsStore()

  const allMarketIds = useMemo(() => markets.map((m) => m.value), [markets])
  // A venue this build cannot reach is not a venue the user can connect: the
  // wizard would take their key and then fail every call behind it. Already
  // platform-aware — on desktop `desktopOnly` is false for all fifteen, so
  // this filter only ever bites in a browser.
  const reachableMarketIds = useMemo(
    () => markets.filter((m) => !m.desktopOnly).map((m) => m.value),
    [markets],
  )

  const [showTypePicker, setShowTypePicker] = useState(false)
  const [showForm, setShowForm] = useState(false)
  // Which flavor of the credential wizard is open — crypto CEX or stock broker
  const [formKind, setFormKind] = useState<'exchange' | 'broker'>('exchange')
  const [selectedMarket, setSelectedMarket] = useState<string | null>(null)
  const [wizardInitialMarket, setWizardInitialMarket] = useState<string | null>(
    initialMarket ?? null,
  )
  const [mode, setMode] = useState<'paper' | 'live'>('paper')
  const [walletName, setWalletName] = useState('')
  const [formFields, setFormFields] = useState<Record<string, string>>({})
  const [feedback, setFeedback] = useState<ConnectFeedback>(null)
  const [isBusy, setIsBusy] = useState(false)

  const [showCryptoForm, setShowCryptoForm] = useState(false)
  const [cryptoChain, setCryptoChain] = useState<string | null>(null)
  const [cryptoLabel, setCryptoLabel] = useState('')
  const [cryptoPrivateKey, setCryptoPrivateKey] = useState('')

  // Vault enrollment gate. `pendingAction` is what to resume once the user has
  // a protector — the wizard they were opening, or the submit that was
  // rejected. Without it the enrollment dialog would be a dead end that
  // silently discards a filled-in form.
  const [enrollOpen, setEnrollOpen] = useState(false)
  const [unlockOpen, setUnlockOpen] = useState(false)
  const pendingAction = useRef<(() => void) | null>(null)
  /**
   * True while the vault check is in flight — the window between "the picker
   * closed" and "the next dialog opened", during which NOTHING is on screen.
   *
   * The desktop page can ignore that window; the mobile host cannot, because
   * it treats "no dialog open" as "the flow is finished" and pops the overlay.
   * Without this flag, picking a credential type dismissed the whole flow and
   * the wizard opened into an unmounted tree.
   */
  const [gateBusy, setGateBusy] = useState(false)

  useEffect(() => {
    void load()
    void loadWallets()
  }, [load, loadWallets])

  /**
   * Run `action`, or open enrollment first when this device requires a vault
   * and does not have one.
   *
   * Proactive: the user meets the "set up a way to unlock" step before typing
   * an API key, not after. The submit handlers keep their own reactive catch
   * as a safety net for any path that skips this.
   */
  const withVault = useCallback(async (action: () => void) => {
    setGateBusy(true)
    try {
      if (await mustEnrollFirst()) {
        pendingAction.current = action
        setEnrollOpen(true)
        return
      }
      action()
    } finally {
      setGateBusy(false)
    }
  }, [])

  // Available chains from DEX connectors
  const availableChains = useMemo(() => {
    const chains = new Set<string>()
    for (const m of adapterInfos) {
      if (m.walletChain) chains.add(m.walletChain)
    }
    return [...chains]
  }, [adapterInfos])

  const exchangeSchemaMarkets = useMemo(
    () =>
      reachableMarketIds.filter(
        (m) => m in CREDENTIAL_SCHEMAS && !isBrokerMarket(m),
      ),
    [reachableMarketIds],
  )
  const brokerSchemaMarkets = useMemo(
    () =>
      reachableMarketIds.filter(
        (m) => m in CREDENTIAL_SCHEMAS && isBrokerMarket(m),
      ),
    [reachableMarketIds],
  )

  // The same two lists over every venue this build knows about, reachable or
  // not. What you can SIGN UP with is a wider set than what you can connect a
  // key to from here: opening a Coinbase account in the browser and finishing
  // on the desktop app is a real path, so the signup rails read these.
  const allExchangeSchemaMarkets = useMemo(
    () =>
      allMarketIds.filter((m) => m in CREDENTIAL_SCHEMAS && !isBrokerMarket(m)),
    [allMarketIds],
  )
  const allBrokerSchemaMarkets = useMemo(
    () =>
      allMarketIds.filter((m) => m in CREDENTIAL_SCHEMAS && isBrokerMarket(m)),
    [allMarketIds],
  )

  const wizardMarkets =
    formKind === 'broker' ? brokerSchemaMarkets : exchangeSchemaMarkets
  const resolvedMarket = selectedMarket ?? wizardMarkets[0] ?? null
  const schema = resolvedMarket ? CREDENTIAL_SCHEMAS[resolvedMarket] : null

  const pickKind = useCallback(
    (kind: CredentialKind) => {
      setShowTypePicker(false)
      setFeedback(null)
      void withVault(() => {
        if (kind === 'exchange') {
          setFormKind('exchange')
          setShowForm(true)
        } else if (kind === 'crypto') {
          setCryptoChain(availableChains[0] ?? null)
          setShowCryptoForm(true)
        } else if (kind === 'broker') {
          setFormKind('broker')
          setShowForm(true)
        }
      })
    },
    [withVault, availableChains],
  )

  /** Start at the credential-type picker (the generic "Connect" button). */
  const openTypePicker = useCallback(() => {
    setFeedback(null)
    setShowTypePicker(true)
  }, [])

  /** Skip the type picker and open the API-key wizard on a known flavor. */
  const openWizard = useCallback(
    (variant: 'exchange' | 'broker') => {
      setFeedback(null)
      void withVault(() => {
        setFormKind(variant)
        setShowForm(true)
      })
    },
    [withVault],
  )

  /** Open straight on a venue, skipping the type picker (the connect gate). */
  const openForMarket = useCallback(
    (market: string) => {
      setFeedback(null)
      void withVault(() => {
        // A venue with no credential schema is not an API-key venue: the
        // wizard would silently reset to its own venue grid and ask for a key
        // the connector never wanted. DEX venues arrive through `openForChain`
        // instead; anything else that gets here (a third-party connector, say)
        // is better served by the type picker than by the wrong form.
        if (!(market in CREDENTIAL_SCHEMAS)) {
          setShowTypePicker(true)
          return
        }
        setFormKind(isBrokerMarket(market) ? 'broker' : 'exchange')
        setWizardInitialMarket(market)
        setShowForm(true)
      })
    },
    [withVault],
  )

  /**
   * Open straight on the wallet dialog, on `chain` or on the first available
   * one (the DEX connect gate, and the plain "Add wallet" button).
   *
   * The counterpart to `openForMarket`: a DEX venue signs with a chain wallet,
   * so its gate has to reach `AddCryptoWalletDialog`, never the API-key wizard.
   */
  const openForChain = useCallback(
    (chain?: string) => {
      setFeedback(null)
      void withVault(() => {
        setCryptoChain(chain ?? availableChains[0] ?? null)
        setShowCryptoForm(true)
      })
    },
    [withVault, availableChains],
  )

  // Annotated because the vault retry closes over `handleSubmit` itself, and
  // an unannotated const referenced inside its own initializer infers `any`.
  const handleSubmit: (event: FormEvent) => Promise<void> = useCallback(
    async (event: FormEvent) => {
      event.preventDefault()
      if (!resolvedMarket || !schema) return
      setFeedback(null)

      // Validate required fields
      for (const field of schema.fields) {
        if (field.required && !formFields[field.key]?.trim()) {
          setFeedback({
            type: 'error',
            message: t('accounts.fieldRequired', { field: field.label }),
          })
          return
        }
      }

      setIsBusy(true)
      try {
        const name =
          walletName.trim() ||
          // A default NAME, not a sentence — composing venue + mode is fine,
          // and the user can rename it.
          `${schema.label} ${mode === 'paper' ? t('accounts.paper') : t('accounts.live')}`
        await addCredential({
          market: resolvedMarket,
          label: name,
          mode,
          apiKey: formFields['apiKey'] ?? '',
          apiSecret: formFields['apiSecret'] ?? '',
          passphrase: formFields['passphrase'],
        })
        track('venue_connected', { venue: resolvedMarket })
        setFeedback({
          type: 'success',
          message: t('accounts.accountConnectedFeedback', {
            label: schema.label,
            mode: t(mode === 'paper' ? 'accounts.paper' : 'accounts.live'),
          }),
        })
        setFormFields({})
        setWalletName('')
        setShowForm(false)
        onConnected?.()
      } catch (error) {
        if (isVaultEnrollmentRequired(error)) {
          pendingAction.current = () => void handleSubmit(event)
          setEnrollOpen(true)
          return
        }
        // A sealed vault is a locked door, not a failure: the same retry
        // mechanism that serves enrollment serves unlocking, and the user's
        // filled-in form survives it.
        if (isVaultSealed(error)) {
          pendingAction.current = () => void handleSubmit(event)
          setUnlockOpen(true)
          return
        }
        setFeedback({
          type: 'error',
          message:
            error instanceof Error
              ? error.message
              : t('accounts.accountConnectFailed'),
        })
      } finally {
        setIsBusy(false)
      }
    },
    [
      resolvedMarket,
      schema,
      formFields,
      walletName,
      mode,
      addCredential,
      onConnected,
      t,
    ],
  )

  const handleAddCryptoWallet: (event: FormEvent) => Promise<void> =
    useCallback(
      async (event: FormEvent) => {
        event.preventDefault()
        if (!cryptoChain || !cryptoPrivateKey.trim()) return
        setIsBusy(true)
        try {
          // Derive public address from private key
          let address: string
          if (cryptoChain === 'solana') {
            address = await deriveSolanaAddress(cryptoPrivateKey.trim())
          } else if (cryptoChain === 'ethereum') {
            // One EVM key covers Ethereum, Base, Arbitrum, BSC, Polygon, etc.
            address = await deriveEvmAddress(cryptoPrivateKey.trim())
          } else {
            // Bitcoin: placeholder until chain-specific derivation is added
            throw new Error(
              `${cryptoChain} address derivation not yet supported`,
            )
          }
          const label =
            cryptoLabel.trim() ||
            t('accounts.defaultWalletName', {
              chain:
                WALLET_SCHEMAS[cryptoChain as keyof typeof WALLET_SCHEMAS]
                  ?.label ?? cryptoChain,
            })
          await addCryptoWallet(
            {
              chain: cryptoChain as 'solana' | 'ethereum' | 'bitcoin',
              address,
              label,
            },
            cryptoPrivateKey,
          )
          track('wallet_connected', { chain: cryptoChain })
          setFeedback({
            type: 'success',
            message: t('accounts.walletSavedFeedback'),
          })
          setShowCryptoForm(false)
          setCryptoLabel('')
          setCryptoPrivateKey('')
          setCryptoChain(null)
          onConnected?.()
        } catch (error) {
          // The reactive half of the gate. Anything that reaches `addWallet`
          // without going through `withVault` lands here rather than showing the
          // user a raw error for a state they can simply fix.
          if (isVaultEnrollmentRequired(error)) {
            pendingAction.current = () => void handleAddCryptoWallet(event)
            setEnrollOpen(true)
            return
          }
          if (isVaultSealed(error)) {
            pendingAction.current = () => void handleAddCryptoWallet(event)
            setUnlockOpen(true)
            return
          }
          setFeedback({
            type: 'error',
            message:
              error instanceof Error
                ? error.message
                : t('accounts.walletSaveFailed'),
          })
        } finally {
          setIsBusy(false)
        }
      },
      [
        cryptoChain,
        cryptoPrivateKey,
        cryptoLabel,
        addCryptoWallet,
        onConnected,
        t,
      ],
    )

  /**
   * Resume whatever the vault interrupted — the wizard that was opening, or
   * the submit that was rejected.
   *
   * Both dialogs close themselves BEFORE they report success, so clearing
   * `pendingAction` on close would drop the very retry this exists for. Only
   * a real enrollment/unlock calls this; a cancelled dialog just leaves a
   * closure nothing invokes, and the next attempt overwrites it.
   */
  const resumePending = useCallback(() => {
    const resume = pendingAction.current
    pendingAction.current = null
    resume?.()
  }, [])

  const closeWizard = useCallback((next: boolean) => {
    setShowForm(next)
    // The pre-picked venue belongs to that one open — the next manual open
    // starts at the picker.
    if (!next) setWizardInitialMarket(null)
  }, [])

  return {
    // Type picker
    showTypePicker,
    setShowTypePicker,
    openTypePicker,
    pickKind,
    // Exchange / broker wizard
    showForm,
    closeWizard,
    openWizard,
    openForMarket,
    openForChain,
    formKind,
    wizardMarkets,
    wizardInitialMarket,
    resolvedMarket,
    schema,
    mode,
    setMode,
    setSelectedMarket,
    walletName,
    setWalletName,
    formFields,
    setFormFields,
    handleSubmit,
    // Crypto wallet
    showCryptoForm,
    setShowCryptoForm,
    cryptoChain,
    setCryptoChain,
    cryptoLabel,
    setCryptoLabel,
    cryptoPrivateKey,
    setCryptoPrivateKey,
    handleAddCryptoWallet,
    availableChains,
    wallets,
    // Venue universes
    exchangeSchemaMarkets,
    brokerSchemaMarkets,
    allExchangeSchemaMarkets,
    allBrokerSchemaMarkets,
    // Shared
    isBusy,
    setIsBusy,
    feedback,
    setFeedback,
    // Vault gate
    gateBusy,
    enrollOpen,
    setEnrollOpen,
    unlockOpen,
    setUnlockOpen,
    resumePending,
  }
}
