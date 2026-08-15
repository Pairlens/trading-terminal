// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Connect an account (design flow A) — a controller, not a screen.
 *
 * A1 is `AddCredentialPicker` and A2/A3 are `ConnectExchangeWizard`, both
 * mounted unchanged: they are already dialogs that portal to the body, the
 * wizard's four-step rail survives 402px, its venue grid is two columns at
 * every width, and `StoredLocallyDisclosure` already follows the flow to the
 * field where a key is actually pasted. Rebuilding any of that as mobile
 * chrome would fork the one screen in the product where a mistake means a
 * user's API key.
 *
 * So this file owns exactly two things: which dialog is open, and the fact
 * that closing the last one pops the overlay. The state that drives them is
 * `useConnectWizardState`.
 *
 * Opened from two places, both landing here: Settings → Accounts → Add
 * account (no venue, so it starts at the type picker), and the Trade panel's
 * connect card. That card sends a VENUE for an exchange or broker and a CHAIN
 * for a DEX — the two credentials are different objects, and a chain that took
 * the venue path would open an API-key wizard with no wallet form behind it.
 */
import { memo, useEffect, useRef } from 'react'

import type { MobileOverlay } from '../mobile-focus-context'
import { useConnectWizardState } from '@/hooks/use-connect-wizard-state'
import { AddCredentialPicker } from '@/components/accounts/add-credential-picker'
import { AddCryptoWalletDialog } from '@/components/accounts/add-crypto-wallet-dialog'
import { ConnectExchangeWizard } from '@/components/accounts/connect-wizard'
import { VaultEnrollmentDialog } from '@/components/security/vault-enrollment-dialog'
import { VaultUnlockDialog } from '@/components/security/vault-unlock-dialog'
import { VaultPasskeyNudgeDialog } from '@/components/security/vault-passkey-nudge-dialog'

type ConnectAccountSheetProps = {
  overlay: Extract<MobileOverlay, { kind: 'connect' }>
  onClose: () => void
}

export default memo(function ConnectAccountSheet({
  overlay,
  onClose,
}: ConnectAccountSheetProps) {
  const wizard = useConnectWizardState({ initialMarket: overlay.market })

  const {
    showTypePicker,
    setShowTypePicker,
    pickKind,
    showForm,
    closeWizard,
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
    exchangeSchemaMarkets,
    brokerSchemaMarkets,
    isBusy,
    feedback,
    setFeedback,
    gateBusy,
    enrollOpen,
    setEnrollOpen,
    unlockOpen,
    setUnlockOpen,
    resumePending,
  } = wizard

  // Entry: a chain goes straight into the wallet dialog, a venue straight into
  // the wizard, and neither starts at the type picker. Once, on mount —
  // reopening after a close is what `onClose` is for.
  const openedRef = useRef(false)
  useEffect(() => {
    if (openedRef.current) return
    openedRef.current = true
    if (overlay.chain) openForChain(overlay.chain)
    else if (overlay.market) openForMarket(overlay.market)
    else setShowTypePicker(true)
  }, [
    overlay.chain,
    overlay.market,
    openForChain,
    openForMarket,
    setShowTypePicker,
  ])

  // When the last dialog closes, the overlay is done. The enrollment gate is
  // part of the flow, so it counts as open; without that the overlay would pop
  // out from under the user mid-enrollment and take the resume closure with it.
  //
  // `wasOpen` is what keeps this from firing on the first frame: the opening
  // effect above runs AFTER the render that computed `anyOpen`, so on mount
  // nothing is open yet and a naive check would close the overlay it just
  // opened. It also covers the vault detour, where the first dialog to appear
  // is the enrollment gate a tick later.
  // `gateBusy` covers the gap between one dialog closing and the next opening
  // while the vault check runs — see the flag's own note in the hook.
  const anyOpen =
    showTypePicker ||
    showForm ||
    showCryptoForm ||
    enrollOpen ||
    unlockOpen ||
    gateBusy
  const wasOpenRef = useRef(false)
  useEffect(() => {
    if (anyOpen) {
      wasOpenRef.current = true
      return
    }
    if (wasOpenRef.current) onClose()
  }, [anyOpen, onClose])

  return (
    <>
      <AddCredentialPicker
        hasBrokers={brokerSchemaMarkets.length > 0}
        hasChains={availableChains.length > 0}
        hasExchanges={exchangeSchemaMarkets.length > 0}
        onOpenChange={setShowTypePicker}
        onPick={pickKind}
        open={showTypePicker}
      />

      <ConnectExchangeWizard
        availableMarkets={wizardMarkets}
        feedback={feedback}
        formFields={formFields}
        initialMarket={wizardInitialMarket}
        isBusy={isBusy}
        mode={mode}
        onOpenChange={closeWizard}
        onSubmit={handleSubmit}
        open={showForm}
        resolvedMarket={resolvedMarket}
        schema={schema}
        setFeedback={setFeedback}
        setFormFields={setFormFields}
        setMode={setMode}
        setSelectedMarket={setSelectedMarket}
        setWalletName={setWalletName}
        variant={formKind}
        walletName={walletName}
      />

      <AddCryptoWalletDialog
        availableChains={availableChains}
        cryptoChain={cryptoChain}
        cryptoLabel={cryptoLabel}
        cryptoPrivateKey={cryptoPrivateKey}
        isBusy={isBusy}
        onOpenChange={setShowCryptoForm}
        onSubmit={handleAddCryptoWallet}
        open={showCryptoForm}
        setCryptoChain={setCryptoChain}
        setCryptoLabel={setCryptoLabel}
        setCryptoPrivateKey={setCryptoPrivateKey}
      />

      <VaultEnrollmentDialog
        onEnrolled={resumePending}
        onOpenChange={setEnrollOpen}
        open={enrollOpen}
      />

      {/* A sealed vault is a locked door, not a failed save: unlocking resumes
          the submit that hit it, with the form still filled in. */}
      <VaultUnlockDialog
        onOpenChange={setUnlockOpen}
        onUnlocked={resumePending}
        open={unlockOpen}
      />

      {/* Offered after the save, never before it: the key is stored either
          way, and a security prompt in front of Save is how people abandon
          the connect flow. */}
      <VaultPasskeyNudgeDialog
        onOpenChange={(next) =>
          wizard.setPasskeyNudgeVenue(next ? wizard.passkeyNudgeVenue : null)
        }
        open={wizard.passkeyNudgeVenue !== null}
        venueLabel={wizard.passkeyNudgeVenue ?? ''}
      />
    </>
  )
})
