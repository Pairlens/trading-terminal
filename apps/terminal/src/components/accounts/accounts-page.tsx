// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AnimatePresence } from 'motion/react'
import {
  CircleCheck,
  KeyRound,
  Landmark,
  Loader2,
  Plus,
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
import type { CredentialKind } from './add-credential-picker'
import type { FormEvent } from 'react'
import type { KeyRound as LucideIcon } from 'lucide-react'
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
import { useMarketData } from '@/lib/market-data-provider'
import { usePortfolioValue } from '@/hooks/use-portfolio-value'
import { PageHeader } from '@/components/page-header'

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
  const { availableMarkets } = useMarketData()
  const { holdings, totalValue, currencySymbol, displayCurrency } =
    usePortfolioValue()
  // Derive market ID list from available market connector plugins
  const availableMarketIds = availableMarkets.map((m) => m.marketId)
  const { credentials, loaded, load, addCredential, removeCredential } =
    useCredentialsStore()

  // Crypto wallets
  const {
    wallets: cryptoWallets,
    loaded: _walletsLoaded,
    load: loadWallets,
    addWallet: addCryptoWallet,
    removeWallet: removeCryptoWallet,
  } = useWalletsStore()
  const [showCryptoForm, setShowCryptoForm] = useState(false)
  const [cryptoChain, setCryptoChain] = useState<string | null>(null)
  const [cryptoLabel, setCryptoLabel] = useState('')
  const [cryptoPrivateKey, setCryptoPrivateKey] = useState('')

  const [showTypePicker, setShowTypePicker] = useState(false)
  const [showForm, setShowForm] = useState(false)
  // Which flavor of the credential wizard is open — crypto CEX or stock broker
  const [formKind, setFormKind] = useState<'exchange' | 'broker'>('exchange')
  const [selectedMarket, setSelectedMarket] = useState<string | null>(null)
  const [mode, setMode] = useState<'paper' | 'live'>('paper')
  const [walletName, setWalletName] = useState('')
  const [formFields, setFormFields] = useState<Record<string, string>>({})
  const [feedback, setFeedback] = useState<{
    type: 'error' | 'success'
    message: string
  } | null>(null)
  const [isBusy, setIsBusy] = useState(false)
  // Full-screen "all venues" page (opened from the section rails)
  const [venuesOpen, setVenuesOpen] = useState(false)

  useEffect(() => {
    void load()
    void loadWallets()
  }, [load, loadWallets])

  // Available chains from DEX connectors
  const availableChains = useMemo(() => {
    const chains = new Set<string>()
    for (const m of availableMarkets) {
      if (m.walletChain) chains.add(m.walletChain)
    }
    return [...chains]
  }, [availableMarkets])

  const handlePickKind = (kind: CredentialKind) => {
    setShowTypePicker(false)
    setFeedback(null)
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
  }

  const handleAddCryptoWallet = async (event: FormEvent) => {
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
        throw new Error(`${cryptoChain} address derivation not yet supported`)
      }
      const label =
        cryptoLabel.trim() ||
        `${WALLET_SCHEMAS[cryptoChain as keyof typeof WALLET_SCHEMAS]?.label ?? cryptoChain} Wallet`
      await addCryptoWallet(
        {
          chain: cryptoChain as 'solana' | 'ethereum' | 'bitcoin',
          address,
          label,
        },
        cryptoPrivateKey,
      )
      track('wallet_connected', { chain: cryptoChain })
      setFeedback({ type: 'success', message: 'Crypto wallet saved.' })
      setShowCryptoForm(false)
      setCryptoLabel('')
      setCryptoPrivateKey('')
      setCryptoChain(null)
    } catch (error) {
      setFeedback({
        type: 'error',
        message:
          error instanceof Error ? error.message : 'Failed to save wallet.',
      })
    } finally {
      setIsBusy(false)
    }
  }

  const handleRemoveCryptoWallet = async (id: string) => {
    setIsBusy(true)
    try {
      await removeCryptoWallet(id)
      setFeedback({ type: 'success', message: 'Crypto wallet removed.' })
    } catch (error) {
      setFeedback({
        type: 'error',
        message:
          error instanceof Error ? error.message : 'Failed to remove wallet.',
      })
    } finally {
      setIsBusy(false)
    }
  }

  // Markets that have credential schemas, split by venue kind
  const exchangeSchemaMarkets = useMemo(
    () =>
      availableMarketIds.filter(
        (m) => m in CREDENTIAL_SCHEMAS && !isBrokerMarket(m),
      ),
    [availableMarketIds],
  )
  const brokerSchemaMarkets = useMemo(
    () =>
      availableMarketIds.filter(
        (m) => m in CREDENTIAL_SCHEMAS && isBrokerMarket(m),
      ),
    [availableMarketIds],
  )
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

  // Venues the user could open a new account with, per asset class
  const cexVenues = useOpenableVenues(exchangeSchemaMarkets, connectedMarkets)
  const brokerVenues = useOpenableVenues(brokerSchemaMarkets, connectedMarkets)

  const wizardMarkets =
    formKind === 'broker' ? brokerSchemaMarkets : exchangeSchemaMarkets
  const resolvedMarket = selectedMarket ?? wizardMarkets[0] ?? null
  const schema = resolvedMarket ? CREDENTIAL_SCHEMAS[resolvedMarket] : null

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!resolvedMarket || !schema) return
    setFeedback(null)

    // Validate required fields
    for (const field of schema.fields) {
      if (field.required && !formFields[field.key]?.trim()) {
        setFeedback({ type: 'error', message: `${field.label} is required` })
        return
      }
    }

    setIsBusy(true)
    try {
      const name =
        walletName.trim() ||
        `${schema.label} ${mode === 'paper' ? 'Paper' : 'Live'}`
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
        message: `${schema.label} ${mode} account connected.`,
      })
      setFormFields({})
      setWalletName('')
      setShowForm(false)
    } catch (error) {
      setFeedback({
        type: 'error',
        message:
          error instanceof Error ? error.message : 'Failed to connect account.',
      })
    } finally {
      setIsBusy(false)
    }
  }

  const handleRemove = async (id: string) => {
    setFeedback(null)
    setIsBusy(true)
    try {
      const venue = credentials.find((c) => c.id === id)?.market
      await removeCredential(id)
      if (venue) track('venue_disconnected', { venue })
      setFeedback({ type: 'success', message: 'Account removed.' })
    } catch (error) {
      setFeedback({
        type: 'error',
        message:
          error instanceof Error ? error.message : 'Failed to remove account.',
      })
    } finally {
      setIsBusy(false)
    }
  }

  const hasAnyCredential = credentials.length > 0 || cryptoWallets.length > 0

  return (
    <SidebarInset className="h-svh min-h-svh overflow-hidden">
      {/* Compact header */}
      <PageHeader
        actions={
          <div className="flex items-center gap-2">
            <LocalOnlyBadge />
            {(availableSchemaMarkets.length > 0 ||
              availableChains.length > 0) && (
              <Button
                size="sm"
                onClick={() => {
                  setShowTypePicker(true)
                  setFeedback(null)
                }}
              >
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
                  onPick={handlePickKind}
                />

                {/* Exchange / broker API key wizard */}
                <ConnectExchangeWizard
                  open={showForm}
                  onOpenChange={setShowForm}
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
                      <Button
                        className="mt-6"
                        onClick={() => {
                          setShowTypePicker(true)
                          setFeedback(null)
                        }}
                      >
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
                            onClick={() => {
                              setFormKind('exchange')
                              setShowForm(true)
                              setFeedback(null)
                            }}
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
                                onClick={() => {
                                  setFormKind('exchange')
                                  setShowForm(true)
                                }}
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
                              onClick={() => {
                                setShowCryptoForm(true)
                                setCryptoChain(availableChains[0] ?? null)
                              }}
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
                            onAdd={(chain) => {
                              setCryptoChain(chain)
                              setShowCryptoForm(true)
                            }}
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
                                  onClick={() => {
                                    setCryptoChain(availableChains[0] ?? null)
                                    setShowCryptoForm(true)
                                  }}
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
                              onClick={() => {
                                setFormKind('broker')
                                setShowForm(true)
                                setFeedback(null)
                              }}
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
                                  onClick={() => {
                                    setFormKind('broker')
                                    setShowForm(true)
                                  }}
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
