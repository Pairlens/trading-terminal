// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { AnimatePresence } from 'motion/react'
import {
  CircleCheck,
  KeyRound,
  Landmark,
  Loader2,
  Plus,
  TriangleAlert,
  Unplug,
  Wallet,
} from 'lucide-react'

import { Alert, AlertDescription } from '@pairlens/ui/components/ui/alert'
import { Button } from '@pairlens/ui/components/ui/button'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@pairlens/ui/components/ui/empty'
import { SidebarInset } from '@pairlens/ui/components/ui/sidebar'

import { SectionEyebrow, StoreAurora } from '../store/store-shell'
import { AddCredentialPicker } from './add-credential-picker'
import {
  AllVenuesPage,
  VenueRail,
  useOpenableVenues,
} from './create-account-links'
import { AddCryptoWalletDialog } from './add-crypto-wallet-dialog'
import { ConnectExchangeWizard } from './connect-wizard'
import { CryptoWalletCard, ExchangeAccountCard } from './credential-cards'
import { LocalOnlyBadge } from './local-only-badge'
import { PortfolioOverview } from './portfolio-overview'
import { SectionHeader } from './section-header'
import { chainBrand, chainPosterSrc } from './venue-art'
import type { KeyRound as LucideIcon } from 'lucide-react'
import { track } from '@/lib/analytics-events'
import { WALLET_SCHEMAS, useWalletsStore } from '@/stores/wallets-store'
import { isBrokerMarket, useCredentialsStore } from '@/stores/credentials-store'
import { useConnectWizardState } from '@/hooks/use-connect-wizard-state'
import { usePortfolioValue } from '@/hooks/use-portfolio-value'
import { PageHeader } from '@/components/page-header'
import { VaultEnrollmentDialog } from '@/components/security/vault-enrollment-dialog'
import { VaultUnlockDialog } from '@/components/security/vault-unlock-dialog'

// ---------------------------------------------------------------------------
// Empty section panel — dashed storefront-style placeholder
// ---------------------------------------------------------------------------

function EmptyPanel({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: typeof LucideIcon
  title: string
  description: string
  action?: React.ReactNode
}) {
  return (
    <div className="rounded-[17px] border border-dashed border-border/70 bg-card/40 px-6 py-10">
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Icon className="size-4" />
          </EmptyMedia>
          <EmptyTitle>{title}</EmptyTitle>
          <EmptyDescription>{description}</EmptyDescription>
        </EmptyHeader>
        {action}
      </Empty>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Two-column section body: the user's keys on the left, the matching venue
// rail (open a new account / add a wallet) on the right.
// ---------------------------------------------------------------------------

function SectionColumns({
  children,
  rail,
}: {
  children: React.ReactNode
  rail?: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-7 max-lg:flex-col">
      <div className="min-w-0 flex-1">{children}</div>
      {rail && (
        <aside className="w-[300px] shrink-0 max-lg:w-full">{rail}</aside>
      )}
    </div>
  )
}

/**
 * Wallet-section rail — chains the user can import a key for. Mirrors the
 * venue rails visually, but rows are actions (open the add-wallet dialog
 * preset to that chain) rather than signup links.
 */
function ChainRail({
  chains,
  onAdd,
}: {
  chains: Array<string>
  onAdd: (chain: string) => void
}) {
  const { t } = useTranslation()
  if (chains.length === 0) return null

  return (
    <div className="rounded-[17px] border border-border/70 bg-card/50 p-4 backdrop-blur-sm">
      <SectionEyebrow className="text-[10px]">
        {t('accounts.addWallet')}
      </SectionEyebrow>
      <div className="mt-3 space-y-2">
        {chains.map((chain) => {
          const brand = chainBrand(chain)
          const poster = chainPosterSrc(chain)
          const label =
            WALLET_SCHEMAS[chain as keyof typeof WALLET_SCHEMAS]?.label ?? chain
          return (
            <button
              key={chain}
              type="button"
              onClick={() => onAdd(chain)}
              className="group flex w-full items-center gap-3 border border-border/70 p-2.5 text-left transition-colors hover:border-primary/30"
              style={{
                borderRadius: 14,
                background: `linear-gradient(120deg, color-mix(in oklch, ${brand.tint} 16%, var(--card)) 0%, var(--card) 70%)`,
              }}
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] border border-border/40 bg-background/85">
                {poster ? (
                  <img
                    src={poster}
                    alt={label}
                    className="size-6 rounded-sm object-contain"
                  />
                ) : (
                  <span
                    className="flex size-6 items-center justify-center rounded-sm font-mono text-[9px] font-bold text-white"
                    style={{ background: brand.tint }}
                  >
                    {brand.mono}
                  </span>
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold text-foreground">
                  {label}
                </span>
                <span className="block truncate text-[10px] text-muted-foreground/80">
                  {t('accounts.importKey', 'Import a private key')}
                </span>
              </span>
              <Plus className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function AccountsPage() {
  const { t } = useTranslation()
  const { holdings, totalValue, currencySymbol, displayCurrency } =
    usePortfolioValue()
  const {
    credentials,
    loaded,
    sealed,
    status: credentialsStatus,
    reload,
    removeCredential,
  } = useCredentialsStore()
  const { removeWallet: removeCryptoWallet } = useWalletsStore()

  /**
   * The whole connect flow — type picker, API-key wizard, wallet dialog, and
   * the vault gate in front of all three — including the loading of both
   * stores. Shared verbatim with the mobile connect overlay, which is the
   * point: a second copy is how the gate ends up guarding one surface and not
   * the other. This page owns only what it shows: the lists, and removal.
   */
  const {
    showTypePicker,
    setShowTypePicker,
    openTypePicker,
    pickKind,
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
    wallets: cryptoWallets,
    exchangeSchemaMarkets,
    brokerSchemaMarkets,
    allExchangeSchemaMarkets,
    allBrokerSchemaMarkets,
    isBusy,
    setIsBusy,
    feedback,
    setFeedback,
    enrollOpen,
    setEnrollOpen,
    unlockOpen,
    setUnlockOpen,
    resumePending,
  } = useConnectWizardState()

  // Full-screen "all venues" page (opened from the section rails)
  const [venuesOpen, setVenuesOpen] = useState(false)

  // Deep link — /accounts?connect=<market> or ?connectChain=<chain> opens that
  // venue's connect flow directly. The trade ticket's connect gate sends users
  // here, so they land in the form for the venue they were looking at instead
  // of having to find it again. Consumed once and stripped from the URL: a
  // refresh or a back-nav shouldn't reopen a dialog the user just closed.
  const { connect: connectMarket, connectChain } = useSearch({
    from: '/_terminal/accounts',
  })
  const navigate = useNavigate()
  const deepLinkConsumed = useRef(false)
  useEffect(() => {
    if (deepLinkConsumed.current) return
    if (!connectMarket && !connectChain) return
    deepLinkConsumed.current = true
    void navigate({ to: '/accounts', search: {}, replace: true })
    if (connectChain) openForChain(connectChain)
    else if (connectMarket) openForMarket(connectMarket)
  }, [connectMarket, connectChain, navigate, openForChain, openForMarket])

  const handleRemoveCryptoWallet = async (id: string) => {
    setIsBusy(true)
    try {
      await removeCryptoWallet(id)
      setFeedback({
        type: 'success',
        message: t('accounts.walletRemovedFeedback'),
      })
    } catch (error) {
      setFeedback({
        type: 'error',
        message:
          error instanceof Error
            ? error.message
            : t('accounts.walletRemoveFailed'),
      })
    } finally {
      setIsBusy(false)
    }
  }

  const availableSchemaMarkets = useMemo(
    () => [...exchangeSchemaMarkets, ...brokerSchemaMarkets],
    [exchangeSchemaMarkets, brokerSchemaMarkets],
  )

  // Credentials split by venue kind (classification is static, so broker
  // accounts stay in their section even if a connector is disabled)
  const exchangeCredentials = useMemo(
    () => credentials.filter((c) => !isBrokerMarket(c.market)),
    [credentials],
  )
  const brokerCredentials = useMemo(
    () => credentials.filter((c) => isBrokerMarket(c.market)),
    [credentials],
  )
  const connectedMarkets = useMemo(
    () => new Set(credentials.map((c) => c.market)),
    [credentials],
  )

  // Venues the user could open a new account with, per asset class. The FULL
  // catalogue, not the connectable one: signing up at a venue this build can't
  // reach and finishing on the desktop app is a real path.
  const cexVenues = useOpenableVenues(
    allExchangeSchemaMarkets,
    connectedMarkets,
  )
  const brokerVenues = useOpenableVenues(
    allBrokerSchemaMarkets,
    connectedMarkets,
  )

  const handleRemove = async (id: string) => {
    setFeedback(null)
    setIsBusy(true)
    try {
      const venue = credentials.find((c) => c.id === id)?.market
      await removeCredential(id)
      if (venue) track('venue_disconnected', { venue })
      setFeedback({
        type: 'success',
        message: t('accounts.accountRemovedFeedback'),
      })
    } catch (error) {
      setFeedback({
        type: 'error',
        message:
          error instanceof Error
            ? error.message
            : t('accounts.accountRemoveFailed'),
      })
    } finally {
      setIsBusy(false)
    }
  }

  // A read that FAILED is not an empty account list either. `error` empties the
  // store for a reason that has nothing to do with the user's keys — a keychain
  // that would not answer, one corrupted slot — and it deserves its own answer
  // rather than the sealed one, because unlocking is not what fixes it.
  const readFailed = credentialsStatus === 'error'

  // A sealed vault must never present the first-run hero: "Trade with your own
  // keys / connect a venue" in front of somebody who already has keys is how a
  // user ends up re-entering credentials on top of a vault they can't open.
  const hasAnyCredential =
    sealed || readFailed || credentials.length > 0 || cryptoWallets.length > 0

  return (
    <SidebarInset className="h-svh min-h-svh overflow-hidden">
      {/* Compact header */}
      <PageHeader
        actions={
          <div className="flex items-center gap-2">
            <LocalOnlyBadge />
            {(availableSchemaMarkets.length > 0 ||
              availableChains.length > 0) && (
              <Button size="sm" onClick={openTypePicker}>
                <Plus className="size-3.5" />
                {t('accounts.connect')}
              </Button>
            )}
          </div>
        }
      >
        <Wallet className="size-4" />
        <h1 className="text-sm font-semibold">{t('accounts.pageTitle')}</h1>
      </PageHeader>

      {/* Content */}
      <section className="relative min-h-0 flex-1 overflow-hidden">
        <StoreAurora />
        <div className="relative z-10 h-full overflow-y-auto">
          <div className="mx-auto max-w-[1060px] px-8 pb-16 pt-8">
            {!loaded ? (
              <div className="flex flex-col items-center justify-center py-16">
                <Loader2 className="size-6 animate-spin text-muted-foreground/60" />
              </div>
            ) : (
              <>
                {/* Add credential type picker */}
                <AddCredentialPicker
                  open={showTypePicker}
                  onOpenChange={setShowTypePicker}
                  hasExchanges={exchangeSchemaMarkets.length > 0}
                  hasChains={availableChains.length > 0}
                  hasBrokers={brokerSchemaMarkets.length > 0}
                  onPick={pickKind}
                />

                {/* Exchange / broker API key wizard */}
                <ConnectExchangeWizard
                  open={showForm}
                  onOpenChange={closeWizard}
                  initialMarket={wizardInitialMarket}
                  availableMarkets={wizardMarkets}
                  variant={formKind}
                  isBusy={isBusy}
                  feedback={feedback}
                  onSubmit={handleSubmit}
                  mode={mode}
                  setMode={setMode}
                  setSelectedMarket={setSelectedMarket}
                  walletName={walletName}
                  setWalletName={setWalletName}
                  formFields={formFields}
                  setFormFields={setFormFields}
                  setFeedback={setFeedback}
                  schema={schema}
                  resolvedMarket={resolvedMarket}
                />

                {/* Add crypto wallet dialog */}
                <AddCryptoWalletDialog
                  open={showCryptoForm}
                  onOpenChange={setShowCryptoForm}
                  availableChains={availableChains}
                  cryptoChain={cryptoChain}
                  setCryptoChain={setCryptoChain}
                  cryptoLabel={cryptoLabel}
                  setCryptoLabel={setCryptoLabel}
                  cryptoPrivateKey={cryptoPrivateKey}
                  setCryptoPrivateKey={setCryptoPrivateKey}
                  isBusy={isBusy}
                  onSubmit={handleAddCryptoWallet}
                />

                {/* Enrollment gate. Resumes whatever the user was doing.
                    The dialog closes itself BEFORE it reports success, so
                    clearing `pendingAction` on close would drop the very retry
                    this exists for — and the user would have to press Save
                    again over a form they already filled in. Only `onEnrolled`
                    consumes it, and only a real enrollment fires that, so a
                    cancelled dialog just leaves a closure nothing calls; the
                    next attempt overwrites it. */}
                <VaultEnrollmentDialog
                  open={enrollOpen}
                  onOpenChange={setEnrollOpen}
                  onEnrolled={resumePending}
                />
                {/* A sealed vault is a locked door, not a failed save:
                    unlocking resumes the submit that hit it, with the form
                    still filled in. */}
                <VaultUnlockDialog
                  open={unlockOpen}
                  onOpenChange={setUnlockOpen}
                  onUnlocked={resumePending}
                />

                {/* A sealed vault is NOT an empty account list. Saying so is
                    the difference between "unlock to see your keys" and a
                    user re-entering API keys over a vault they can't open. */}
                {sealed && (
                  <Alert className="mb-6 border-amber-500/30 bg-amber-500/10">
                    <KeyRound className="size-4 text-amber-600 dark:text-amber-400" />
                    <AlertDescription className="flex flex-wrap items-center gap-3">
                      <span className="min-w-0 flex-1">
                        {t('accounts.vaultSealedBody')}
                      </span>
                      <Button size="sm" onClick={() => setUnlockOpen(true)}>
                        {t('security.vault.sealedBannerAction')}
                      </Button>
                    </AlertDescription>
                  </Alert>
                )}

                {readFailed && (
                  <Alert className="mb-6 border-destructive/30 bg-destructive/10">
                    <TriangleAlert className="size-4 text-destructive" />
                    <AlertDescription className="flex flex-wrap items-center gap-3">
                      <span className="min-w-0 flex-1">
                        {t('accounts.credentialsUnreadable')}
                      </span>
                      <Button size="sm" onClick={() => void reload()}>
                        {t('common.retry')}
                      </Button>
                    </AlertDescription>
                  </Alert>
                )}

                {/* Spotlight hero — the acquisition moment, shown until the
                    first venue is connected */}
                {!hasAnyCredential && (
                  <div className="pl-store-heroin mb-11 pt-2">
                    <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">
                      {t('accounts.hero.eyebrow', 'Your venues')}
                    </span>
                    <h2 className="mt-3 max-w-[24ch] font-serif text-[40px] font-semibold leading-[1.05] tracking-[-0.03em] text-foreground">
                      {t('accounts.hero.title', 'Trade with your own keys')}
                    </h2>
                    <p className="mt-3.5 max-w-[54ch] text-[14.5px] leading-[1.65] text-muted-foreground">
                      {t(
                        'accounts.hero.subtitle',
                        'Connect exchanges, brokers, and on-chain wallets with API keys that never leave this device. Pairlens talks to each venue directly — no custody, no middlemen.',
                      )}
                    </p>
                    {(availableSchemaMarkets.length > 0 ||
                      availableChains.length > 0) && (
                      <Button className="mt-6" onClick={openTypePicker}>
                        <Plus className="size-3.5" />
                        {t('accounts.connect')}
                      </Button>
                    )}
                  </div>
                )}

                <div className="space-y-11">
                  {/* Portfolio overview */}
                  {credentials.length > 0 && holdings.length > 0 && (
                    <section>
                      <SectionEyebrow>
                        {t('accounts.portfolioEyebrow', 'Portfolio')}
                      </SectionEyebrow>
                      <div className="mt-3.5">
                        <PortfolioOverview
                          holdings={holdings}
                          totalValue={totalValue}
                          currencySymbol={currencySymbol}
                          displayCurrency={displayCurrency}
                          credentials={credentials}
                        />
                      </div>
                    </section>
                  )}

                  {/* Success feedback */}
                  {!showForm && feedback?.type === 'success' && (
                    <Alert>
                      <CircleCheck className="size-4 text-emerald-500" />
                      <AlertDescription>{feedback.message}</AlertDescription>
                    </Alert>
                  )}

                  {/* ── Exchange API Keys ─────────────────────────── */}
                  <section className="space-y-4">
                    <SectionHeader
                      title={t('accounts.exchangeAccountsTitle')}
                      description={t('accounts.exchangeAccountsDesc')}
                      count={exchangeCredentials.length}
                      action={
                        exchangeSchemaMarkets.length > 0 ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openWizard('exchange')}
                          >
                            <Plus className="size-3.5" />
                            {t('accounts.connectExchange')}
                          </Button>
                        ) : undefined
                      }
                    />

                    <SectionColumns
                      rail={
                        <VenueRail
                          venues={cexVenues}
                          kind="cex"
                          onSeeAll={() => setVenuesOpen(true)}
                        />
                      }
                    >
                      {exchangeCredentials.length === 0 ? (
                        <EmptyPanel
                          icon={
                            exchangeSchemaMarkets.length === 0
                              ? Unplug
                              : KeyRound
                          }
                          title={
                            exchangeSchemaMarkets.length === 0
                              ? t('accounts.noConnectors')
                              : t('accounts.noExchangeAccounts')
                          }
                          description={
                            exchangeSchemaMarkets.length === 0
                              ? t('accounts.noConnectorsDesc')
                              : t('accounts.noExchangeAccountsDesc')
                          }
                          action={
                            exchangeSchemaMarkets.length > 0 && !showForm ? (
                              <Button
                                variant="outline"
                                size="sm"
                                className="mt-3 gap-2"
                                onClick={() => openWizard('exchange')}
                              >
                                <Plus className="size-3.5" />
                                {t('accounts.connectExchange')}
                              </Button>
                            ) : undefined
                          }
                        />
                      ) : (
                        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                          {exchangeCredentials.map((cred, index) => (
                            <ExchangeAccountCard
                              key={cred.id}
                              credential={cred}
                              index={index}
                              onRemove={() => void handleRemove(cred.id)}
                              isBusy={isBusy}
                              currencySymbol={currencySymbol}
                            />
                          ))}
                        </div>
                      )}
                    </SectionColumns>
                  </section>

                  {/* ── Crypto Wallets ────────────────────────────── */}
                  {(availableChains.length > 0 || cryptoWallets.length > 0) && (
                    <section className="space-y-4">
                      <SectionHeader
                        title={t('accounts.cryptoWalletsTitle')}
                        description={t('accounts.cryptoWalletsDesc')}
                        count={cryptoWallets.length}
                        action={
                          availableChains.length > 0 ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openForChain()}
                            >
                              <Plus className="size-3.5" />
                              {t('accounts.addWallet')}
                            </Button>
                          ) : undefined
                        }
                      />

                      <SectionColumns
                        rail={
                          <ChainRail
                            chains={availableChains}
                            onAdd={openForChain}
                          />
                        }
                      >
                        {cryptoWallets.length === 0 ? (
                          <EmptyPanel
                            icon={Wallet}
                            title={t('accounts.noCryptoWallets')}
                            description={t('accounts.noCryptoWalletsDesc')}
                            action={
                              availableChains.length > 0 && !showCryptoForm ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="mt-3 gap-2"
                                  onClick={() => openForChain()}
                                >
                                  <Plus className="size-3.5" />
                                  {t('accounts.addWallet')}
                                </Button>
                              ) : undefined
                            }
                          />
                        ) : (
                          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                            {cryptoWallets.map((wallet) => (
                              <CryptoWalletCard
                                key={wallet.id}
                                wallet={wallet}
                                onRemove={() =>
                                  void handleRemoveCryptoWallet(wallet.id)
                                }
                                isBusy={isBusy}
                              />
                            ))}
                          </div>
                        )}
                      </SectionColumns>
                    </section>
                  )}

                  {/* ── Stock Brokers ─────────────────────────────── */}
                  {(brokerSchemaMarkets.length > 0 ||
                    brokerCredentials.length > 0) && (
                    <section className="space-y-4">
                      <SectionHeader
                        title={t('accounts.brokerAccountsTitle')}
                        description={t('accounts.brokerAccountsDesc')}
                        count={brokerCredentials.length}
                        action={
                          brokerSchemaMarkets.length > 0 ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openWizard('broker')}
                            >
                              <Plus className="size-3.5" />
                              {t('accounts.connectBroker')}
                            </Button>
                          ) : undefined
                        }
                      />

                      <SectionColumns
                        rail={
                          <VenueRail
                            venues={brokerVenues}
                            kind="broker"
                            onSeeAll={() => setVenuesOpen(true)}
                          />
                        }
                      >
                        {brokerCredentials.length === 0 ? (
                          <EmptyPanel
                            icon={Landmark}
                            title={t('accounts.noBrokerAccounts')}
                            description={t('accounts.noBrokerAccountsDesc')}
                            action={
                              !showForm ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="mt-3 gap-2"
                                  onClick={() => openWizard('broker')}
                                >
                                  <Plus className="size-3.5" />
                                  {t('accounts.connectBroker')}
                                </Button>
                              ) : undefined
                            }
                          />
                        ) : (
                          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                            {brokerCredentials.map((cred, index) => (
                              <ExchangeAccountCard
                                key={cred.id}
                                credential={cred}
                                index={index}
                                onRemove={() => void handleRemove(cred.id)}
                                isBusy={isBusy}
                                currencySymbol={currencySymbol}
                              />
                            ))}
                          </div>
                        )}
                      </SectionColumns>
                    </section>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Full-screen all-venues page — rail rows morph into grid posters */}
        <AnimatePresence>
          {venuesOpen && (
            <AllVenuesPage
              cexVenues={cexVenues}
              brokerVenues={brokerVenues}
              onBack={() => setVenuesOpen(false)}
            />
          )}
        </AnimatePresence>
      </section>
    </SidebarInset>
  )
}
