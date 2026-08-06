// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
'use client'

import * as React from 'react'
import {
  AlertTriangle,
  Battery,
  Bot,
  Check,
  Download,
  ExternalLink,
  Hand,
  KeyRound,
  Lock,
  Monitor,
  Moon,
  MousePointerClick,
  RefreshCw,
  Scale,
  ShieldAlert,
  Sparkles,
  Sun,
  Timer,
  Trash2,
  Unlock,
  X,
  Zap,
} from 'lucide-react'
import { useTheme } from 'next-themes'
import { useTranslation } from 'react-i18next'

import { Checkbox } from '@pairlens/ui/components/ui/checkbox'
import { Input } from '@pairlens/ui/components/ui/input'
import { Label } from '@pairlens/ui/components/ui/label'
import { Switch } from '@pairlens/ui/components/ui/switch'
import {
  RadioGroup,
  RadioGroupItem,
} from '@pairlens/ui/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@pairlens/ui/components/ui/select'
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@pairlens/ui/components/ui/combobox'

import { Badge } from '@pairlens/ui/components/ui/badge'
import { Button } from '@pairlens/ui/components/ui/button'
import { Progress } from '@pairlens/ui/components/ui/progress'
import {
  INTELLIGENCE_PLANS,
  WEB_RESEARCH_CREDITS_PER_SEARCH,
} from '@pairlens/shared/billing-types'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@pairlens/ui/components/ui/alert-dialog'
import type { IntelligencePlanId } from '@pairlens/shared/billing-types'
import type { BreachAction, ResetInterval } from '@/stores/risk-config-store'
import type { CustomPublisherKey } from '@/lib/plugins/custom-publisher-keys'
import type { RegistryMode } from '@/components/plugins/use-registry-settings'
import type { PerformanceMode } from '@/hooks/use-performance-mode'
import type { PluginAutoUpdateMode } from '@/stores/plugin-updates-store'
import type { ColorMode } from '@/lib/settings/color-mode'
import type { TradeConfirmMode } from '@/lib/settings/trade-confirm'
import { track } from '@/lib/analytics-events'
import { useOptimisticSession } from '@/lib/session'
import {
  useBillingPortal,
  useBillingState,
  useIntelligenceCheckout,
} from '@/hooks/use-billing'
import { CreditPackButtons } from '@/components/billing/intelligence-upsell'
import { LegalLinksRow, LegalNotice } from '@/components/legal-links'
import { usePersistedState } from '@/hooks/use-persisted-state'
import {
  computeUngrantedHostList,
  grantNetworkHosts,
  isDesktopNetworkGoverned,
  reloadForGrants,
  revokeNetworkGrant,
} from '@/lib/plugins/network-grants'
import {
  publisherKeyFingerprint,
  validatePublisherKeyId,
  validatePublisherPublicKey,
} from '@/lib/plugins/custom-publisher-keys'
import { useMarketData } from '@/lib/market-data-provider'
import { useRegistrySettings } from '@/components/plugins/use-registry-settings'
import { useThemePluginContext } from '@/hooks/use-theme-plugin'
import { useLanguage } from '@/hooks/use-language'
import {
  PERFORMANCE_MODES,
  usePerformanceMode,
} from '@/hooks/use-performance-mode'
import { COLOR_MODES } from '@/lib/settings/color-mode'
import { useIdleGuardEnabled } from '@/components/idle-guard'
import { isAnalyticsConfigured, useAnalyticsEnabled } from '@/lib/analytics'
import { useRecentTickersMarqueeEnabled } from '@/lib/recent-tickers'
import { usePluginAutoUpdateSettings } from '@/stores/plugin-updates-store'
import { useAccountDeletion, useAccountExport } from '@/hooks/use-account'
import { savedFileFolder } from '@/lib/save-file'
import { hasAppServer } from '@/lib/auth-client'
import { getCountrySetting, setCountrySetting } from '@/lib/region-settings'
import { COUNTRIES, countryFlag, countryName } from '@/lib/countries'
import {
  DISPLAY_CURRENCIES,
  useDisplayCurrency,
} from '@/hooks/use-display-currency'
import { useRiskConfigStore } from '@/stores/risk-config-store'
import { useTradeConsentStore } from '@/stores/trade-consent-store'
import { useTradeConfirmMode } from '@/hooks/use-trade-confirm'
import { TRADE_CONFIRM_MODES } from '@/lib/settings/trade-confirm'

function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

// ── Plugins Section ─────────────────────────────────────────────────

export function PluginsSection() {
  const { t } = useTranslation()
  const {
    settings: registrySettings,
    setSettings: setRegistrySettings,
    defaultUrl: defaultRegistryUrl,
  } = useRegistrySettings()
  const { settings: autoUpdateSettings, setSettings: setAutoUpdateSettings } =
    usePluginAutoUpdateSettings()

  return (
    <div className="max-w-4xl space-y-5">
      {/* Auto-update */}
      <section className="rounded-xl border p-4">
        <div className="flex items-center gap-2">
          <RefreshCw className="size-4 text-muted-foreground" />
          <h3 className="font-medium">{t('settings.plugins.updatesTitle')}</h3>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('settings.plugins.updatesDescription')}
        </p>

        <div className="mt-4 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label className="text-sm font-medium">
                {t('settings.plugins.updateModeLabel')}
              </Label>
              <p className="text-xs text-muted-foreground">
                {autoUpdateSettings.mode === 'auto'
                  ? t('settings.plugins.updateModeAutoDescription')
                  : autoUpdateSettings.mode === 'notify'
                    ? t('settings.plugins.updateModeNotifyDescription')
                    : t('settings.plugins.updateModeOffDescription')}
              </p>
            </div>
            <Select
              value={autoUpdateSettings.mode}
              // items gives the closed trigger the item's label — without it
              // Base UI renders the raw value ("notify").
              items={{
                auto: t('settings.plugins.updateModeAuto'),
                notify: t('settings.plugins.updateModeNotify'),
                off: t('settings.plugins.updateModeOffLabel'),
              }}
              onValueChange={(mode) =>
                setAutoUpdateSettings((prev) => ({
                  ...prev,
                  mode: mode as PluginAutoUpdateMode,
                }))
              }
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">
                  {t('settings.plugins.updateModeAuto')}
                </SelectItem>
                <SelectItem value="notify">
                  {t('settings.plugins.updateModeNotify')}
                </SelectItem>
                <SelectItem value="off">
                  {t('settings.plugins.updateModeOffLabel')}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {autoUpdateSettings.mode !== 'off' && (
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label className="text-sm font-medium">
                  {t('settings.plugins.checkIntervalLabel')}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {t('settings.plugins.checkIntervalDescription')}
                </p>
              </div>
              <Select
                value={String(autoUpdateSettings.checkIntervalHours)}
                items={{
                  '1': t('settings.plugins.intervalHourly'),
                  '6': t('settings.plugins.interval6Hours'),
                  '12': t('settings.plugins.interval12Hours'),
                  '24': t('settings.plugins.intervalDaily'),
                }}
                onValueChange={(v) =>
                  setAutoUpdateSettings((prev) => ({
                    ...prev,
                    checkIntervalHours: Number(v),
                  }))
                }
              >
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">
                    {t('settings.plugins.intervalHourly')}
                  </SelectItem>
                  <SelectItem value="6">
                    {t('settings.plugins.interval6Hours')}
                  </SelectItem>
                  <SelectItem value="12">
                    {t('settings.plugins.interval12Hours')}
                  </SelectItem>
                  <SelectItem value="24">
                    {t('settings.plugins.intervalDaily')}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </section>

      {/* Registry URL */}
      <section className="rounded-xl border p-4">
        <h3 className="font-medium">{t('settings.plugins.registry')}</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('settings.plugins.registryDescription')}
        </p>

        <RadioGroup
          className="mt-4 gap-4"
          value={registrySettings.mode}
          onValueChange={(mode: RegistryMode) => {
            setRegistrySettings((prev) => ({
              ...prev,
              mode,
              ...(mode === 'official' ? { customAcknowledged: false } : {}),
            }))
            // Leaving custom mode: the registry host no longer needs desktop
            // egress. Best-effort; the narrowed CSP applies on next load.
            if (mode === 'official') {
              void revokeNetworkGrant(CUSTOM_REGISTRY_GRANT_ID)
            }
          }}
        >
          <div className="flex items-start gap-3">
            <RadioGroupItem
              value="official"
              id="registry-official"
              className="mt-0.5"
            />
            <div className="grid gap-1">
              <Label htmlFor="registry-official" className="font-medium">
                {t('settings.plugins.official')}
                <span className="ml-2 rounded-full bg-green-500/15 px-2 py-0.5 text-xs font-medium text-green-700 dark:text-green-400">
                  {t('settings.plugins.recommended')}
                </span>
              </Label>
              <p className="text-sm text-muted-foreground">
                {defaultRegistryUrl}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <RadioGroupItem
              value="custom"
              id="registry-custom"
              className="mt-0.5"
            />
            <div className="grid w-full gap-3">
              <Label htmlFor="registry-custom" className="font-medium">
                {t('settings.plugins.custom')}
              </Label>

              {registrySettings.mode === 'custom' && (
                <>
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                    <div className="mb-2 flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-400">
                      <ShieldAlert className="size-4" />
                      {t('settings.plugins.thirdPartyWarningTitle')}
                    </div>
                    <p className="mb-3 text-xs text-muted-foreground">
                      {t('settings.plugins.thirdPartyWarningDescription')}
                    </p>
                    <label className="flex cursor-pointer items-start gap-2 text-sm">
                      <Checkbox
                        checked={registrySettings.customAcknowledged}
                        onCheckedChange={(checked: boolean) =>
                          setRegistrySettings((prev) => ({
                            ...prev,
                            customAcknowledged: checked,
                            ...(!checked ? { customUrl: '' } : {}),
                          }))
                        }
                        className="mt-0.5"
                      />
                      <span className="text-xs leading-snug">
                        {t('settings.plugins.thirdPartyAcknowledge')}
                      </span>
                    </label>
                  </div>

                  <div className="space-y-1.5">
                    <Input
                      id="registry-custom-url"
                      placeholder="https://your-registry.example.com"
                      disabled={!registrySettings.customAcknowledged}
                      value={registrySettings.customUrl}
                      onChange={(e) =>
                        setRegistrySettings((prev) => ({
                          ...prev,
                          customUrl: e.target.value,
                        }))
                      }
                    />
                    {registrySettings.customUrl.trim() &&
                      !isValidUrl(registrySettings.customUrl.trim()) && (
                        <p className="text-xs text-destructive">
                          {t('settings.plugins.invalidUrl')}
                        </p>
                      )}
                  </div>

                  {registrySettings.customAcknowledged &&
                    isValidUrl(registrySettings.customUrl.trim()) && (
                      <CustomRegistryEgress
                        url={registrySettings.customUrl.trim()}
                      />
                    )}
                </>
              )}
            </div>
          </div>
        </RadioGroup>
      </section>

      <PublisherKeysSection />
    </div>
  )
}

// ── Custom registry desktop egress ──────────────────────────────────

/** Grant id under which the custom registry host is persisted in Rust. */
const CUSTOM_REGISTRY_GRANT_ID = 'custom-registry'

/**
 * Desktop-only: the CSP `connect-src` allowlist blocks a custom registry's
 * host until the user grants it egress. No-op (renders nothing) in the
 * browser, where no such boundary exists.
 */
function CustomRegistryEgress({ url }: { url: string }) {
  const { t } = useTranslation()
  const [ungrantedHost, setUngrantedHost] = React.useState<string | null>(null)
  const [checked, setChecked] = React.useState(false)

  const host = React.useMemo(() => {
    try {
      return new URL(url).hostname
    } catch {
      return null
    }
  }, [url])

  React.useEffect(() => {
    let cancelled = false
    setChecked(false)
    if (!isDesktopNetworkGoverned() || !host) {
      setUngrantedHost(null)
      setChecked(true)
      return
    }
    void computeUngrantedHostList([host]).then((missing) => {
      if (cancelled) return
      setUngrantedHost(missing[0] ?? null)
      setChecked(true)
    })
    return () => {
      cancelled = true
    }
  }, [host])

  if (!isDesktopNetworkGoverned() || !host || !checked) return null

  if (!ungrantedHost) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Check className="size-3.5 text-green-600 dark:text-green-400" />
        {t('settings.plugins.desktopEgressGranted')}
      </p>
    )
  }

  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
      <div className="mb-1 flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-400">
        <Lock className="size-4" />
        {t('settings.plugins.desktopEgressTitle')}
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        {t('settings.plugins.desktopEgressDescription')}
      </p>
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          void grantNetworkHosts(CUSTOM_REGISTRY_GRANT_ID, [ungrantedHost])
            .then(() => reloadForGrants())
            .catch(() => {})
        }}
      >
        {t('settings.plugins.desktopEgressGrant')}
        <span className="ml-1 font-mono text-xs text-muted-foreground">
          ({ungrantedHost})
        </span>
      </Button>
    </div>
  )
}

// ── Trusted publisher keys ──────────────────────────────────────────

function KeyFingerprint({ publicKey }: { publicKey: string }) {
  const [fingerprint, setFingerprint] = React.useState('')
  React.useEffect(() => {
    let cancelled = false
    void publisherKeyFingerprint(publicKey)
      .then((fp) => {
        if (!cancelled) setFingerprint(fp)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [publicKey])
  return <span className="font-mono">{fingerprint}</span>
}

function PublisherKeysSection() {
  const { t } = useTranslation()
  const [keys, setKeys] = usePersistedState<Array<CustomPublisherKey>>(
    'custom-publisher-keys',
    [],
  )

  const [draftId, setDraftId] = React.useState('')
  const [draftKey, setDraftKey] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [pending, setPending] = React.useState<CustomPublisherKey | null>(null)
  const [pendingFingerprint, setPendingFingerprint] = React.useState('')

  const startAdd = async () => {
    setError(null)
    const id = draftId.trim()
    const publicKey = draftKey.trim()

    const idVerdict = validatePublisherKeyId(id)
    if (idVerdict === 'invalid-format') {
      setError(t('settings.plugins.publisherKeyIdInvalid'))
      return
    }
    if (idVerdict === 'reserved') {
      setError(t('settings.plugins.publisherKeyIdReserved'))
      return
    }
    if (keys.some((k) => k.id === id)) {
      setError(t('settings.plugins.publisherKeyIdDuplicate'))
      return
    }
    if (!(await validatePublisherPublicKey(publicKey))) {
      setError(t('settings.plugins.publisherKeyValueInvalid'))
      return
    }

    setPendingFingerprint(await publisherKeyFingerprint(publicKey))
    setPending({ id, publicKey, addedAt: new Date().toISOString() })
  }

  const confirmAdd = () => {
    if (!pending) return
    setKeys((prev) => [...prev, pending])
    setPending(null)
    setDraftId('')
    setDraftKey('')
  }

  return (
    <section className="rounded-xl border p-4">
      <div className="flex items-center gap-2">
        <KeyRound className="size-4 text-muted-foreground" />
        <h3 className="font-medium">{t('settings.plugins.publisherKeys')}</h3>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {t('settings.plugins.publisherKeysDescription')}
      </p>

      <div className="mt-4 space-y-3">
        {keys.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t('settings.plugins.publisherKeysEmpty')}
          </p>
        ) : (
          keys.map((key) => (
            <div
              key={key.id}
              className="flex items-center justify-between gap-3 rounded-lg border p-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{key.id}</p>
                <p className="text-xs text-muted-foreground">
                  {t('settings.plugins.publisherKeyFingerprint')}:{' '}
                  <KeyFingerprint publicKey={key.publicKey} />
                </p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="shrink-0 text-destructive hover:text-destructive"
                onClick={() =>
                  setKeys((prev) => prev.filter((k) => k.id !== key.id))
                }
              >
                <Trash2 className="size-3.5" />
                {t('settings.plugins.publisherKeyRemove')}
              </Button>
            </div>
          ))
        )}

        <div className="grid gap-2 rounded-lg border border-dashed p-3">
          <div className="grid gap-1.5">
            <Label htmlFor="publisher-key-id" className="text-xs">
              {t('settings.plugins.publisherKeyIdLabel')}
            </Label>
            <Input
              id="publisher-key-id"
              placeholder={t('settings.plugins.publisherKeyIdPlaceholder')}
              value={draftId}
              onChange={(e) => setDraftId(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="publisher-key-value" className="text-xs">
              {t('settings.plugins.publisherKeyValueLabel')}
            </Label>
            <Input
              id="publisher-key-value"
              placeholder="base64…"
              className="font-mono"
              value={draftKey}
              onChange={(e) => setDraftKey(e.target.value)}
            />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div>
            <Button
              size="sm"
              variant="outline"
              disabled={!draftId.trim() || !draftKey.trim()}
              onClick={() => void startAdd()}
            >
              {t('settings.plugins.publisherKeyAdd')}
            </Button>
          </div>
        </div>
      </div>

      <AlertDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ShieldAlert className="size-5 text-amber-600 dark:text-amber-400" />
              {t('settings.plugins.publisherKeyConsentTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('settings.plugins.publisherKeyConsentBody')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="rounded-lg border bg-muted/40 p-3 text-sm">
            <p className="font-medium">{pending?.id}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t('settings.plugins.publisherKeyFingerprint')}:{' '}
              <span className="font-mono">{pendingFingerprint}</span>
            </p>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {t('settings.plugins.publisherKeyConsentCancel')}
            </AlertDialogCancel>
            <AlertDialogAction onClick={confirmAdd}>
              {t('settings.plugins.publisherKeyConsentConfirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}

// ── Connection Section ──────────────────────────────────────────────

export function ConnectionSection() {
  const { t } = useTranslation()
  const { status, availableMarkets } = useMarketData()

  const statusColor =
    status === 'connected'
      ? 'bg-green-500'
      : status === 'connecting'
        ? 'bg-amber-500 animate-pulse'
        : 'bg-red-500'

  return (
    <div className="max-w-4xl space-y-5">
      <section className="rounded-xl border p-4">
        <h3 className="font-medium">{t('settings.connection.title')}</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('settings.connection.description')}
        </p>

        <div className="mt-4 flex items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2.5">
          <div className={`size-2 shrink-0 rounded-full ${statusColor}`} />
          <div className="flex-1 text-sm">
            <span className="font-medium">
              {t(`settings.connection.status.${status}`)}
            </span>
            {availableMarkets.length > 0 && (
              <span className="ml-2 text-muted-foreground">
                {availableMarkets.map((m) => m.displayName).join(', ')}
              </span>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}

// ── Appearance Section ──────────────────────────────────────────────

const DEFAULT_PREVIEW_COLORS = {
  light: ['#2e2c27', '#e8e4d9', '#9a9589', '#6b6558', '#faf8f5'],
  dark: ['#e8e4d9', '#1a1a1a', '#9a9589', '#4a4840', '#2e2c27'],
}

// Icons stay UI-local; the value + label list is shared with the desktop menu
// via COLOR_MODES so both layers render the same choices.
const COLOR_MODE_ICONS: Record<ColorMode, typeof Sun> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
}

export function AppearanceSection() {
  const { t } = useTranslation()
  const { resolvedTheme, setTheme, theme } = useTheme()
  const { activeThemeId, availableThemes, selectTheme } =
    useThemePluginContext()
  const [marqueeEnabled, setMarqueeEnabled] = useRecentTickersMarqueeEnabled()
  const activeColorMode =
    theme === 'system' ? 'system' : (resolvedTheme ?? 'system')
  const isDark = resolvedTheme === 'dark'

  return (
    <div className="max-w-4xl space-y-5">
      <section className="rounded-xl border p-4">
        <h3 className="font-medium">{t('settings.appearance.colorMode')}</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('settings.appearance.colorModeDescription')}
        </p>
        <RadioGroup
          className="mt-4 flex gap-3"
          value={activeColorMode}
          onValueChange={(value) => {
            setTheme(value)
            track('theme_changed', { theme: value })
          }}
        >
          {COLOR_MODES.map(({ value, labelKey }) => {
            const Icon = COLOR_MODE_ICONS[value]
            return (
              <label
                key={value}
                className="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 has-[:checked]:border-primary has-[:checked]:bg-primary/5"
              >
                <RadioGroupItem value={value} className="sr-only" />
                <Icon className="size-4" />
                <span className="text-sm font-medium">{t(labelKey)}</span>
              </label>
            )
          })}
        </RadioGroup>
      </section>

      <section className="rounded-xl border p-4">
        <h3 className="font-medium">{t('settings.appearance.theme')}</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('settings.appearance.themeDescription')}
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <ThemeCard
            name={t('settings.appearance.defaultTheme')}
            author="Pairlens"
            previewColors={
              isDark
                ? DEFAULT_PREVIEW_COLORS.dark
                : DEFAULT_PREVIEW_COLORS.light
            }
            isSelected={activeThemeId === null}
            onSelect={() => selectTheme(null)}
          />
          {availableThemes.map((themePlugin) => {
            const colors = themePlugin.manifest.theme?.previewColors
            const swatches = colors ? (isDark ? colors.dark : colors.light) : []
            return (
              <ThemeCard
                key={themePlugin.id}
                name={themePlugin.name}
                author={themePlugin.author}
                previewColors={swatches}
                isSelected={activeThemeId === themePlugin.id}
                onSelect={() => selectTheme(themePlugin.id)}
              />
            )
          })}
        </div>
      </section>

      <section className="rounded-xl border p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="font-medium">
              {t('settings.appearance.recentTickers')}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {t('settings.appearance.recentTickersDescription')}
            </p>
          </div>
          <Switch
            checked={marqueeEnabled}
            onCheckedChange={setMarqueeEnabled}
          />
        </div>
      </section>
    </div>
  )
}

function ThemeCard({
  name,
  author,
  previewColors,
  isSelected,
  onSelect,
}: {
  name: string
  author: string
  previewColors: Array<string>
  isSelected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`relative flex flex-col gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-accent/50 ${
        isSelected ? 'border-primary ring-1 ring-primary' : ''
      }`}
    >
      {isSelected && (
        <div className="absolute top-2 right-2 flex size-5 items-center justify-center rounded-full bg-primary">
          <Check className="size-3 text-primary-foreground" />
        </div>
      )}
      <div className="flex gap-1.5">
        {previewColors.slice(0, 5).map((color, i) => (
          <div
            key={i}
            className="size-5 rounded-full border border-border/50"
            style={{ backgroundColor: color }}
          />
        ))}
      </div>
      <div>
        <div className="text-sm font-medium">{name}</div>
        <div className="text-xs text-muted-foreground">{author}</div>
      </div>
    </button>
  )
}

// ── Performance Section ─────────────────────────────────────────────

// Icons stay UI-local; the value + label/description list is shared with the
// desktop menu via PERFORMANCE_MODES so both layers render the same options.
const PERF_MODE_ICONS: Record<PerformanceMode, typeof Zap> = {
  performance: Zap,
  balanced: Scale,
  'energy-saver': Battery,
}

const PERF_MODES = PERFORMANCE_MODES.map((mode) => ({
  ...mode,
  Icon: PERF_MODE_ICONS[mode.value],
}))

export function PerformanceSection() {
  const { t } = useTranslation()
  const { mode, setMode } = usePerformanceMode()
  const [idleGuardEnabled, setIdleGuardEnabled] = useIdleGuardEnabled()

  return (
    <div className="max-w-4xl space-y-5">
      <section className="rounded-xl border p-4">
        <h3 className="font-medium">{t('settings.performance.title')}</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('settings.performance.description')}
        </p>
        <RadioGroup
          className="mt-4 gap-3"
          value={mode}
          onValueChange={(v: string) => setMode(v as PerformanceMode)}
        >
          {PERF_MODES.map(({ value, labelKey, descKey, Icon }) => (
            <label
              key={value}
              className="flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 has-[:checked]:border-primary has-[:checked]:bg-primary/5"
            >
              <RadioGroupItem value={value} className="mt-0.5 sr-only" />
              <Icon className="mt-0.5 size-4 shrink-0" />
              <div className="grid gap-0.5">
                <span className="text-sm font-medium">{t(labelKey)}</span>
                <span className="text-xs text-muted-foreground">
                  {t(descKey)}
                </span>
              </div>
              {mode === value && (
                <Check className="ml-auto mt-0.5 size-4 shrink-0 text-primary" />
              )}
            </label>
          ))}
        </RadioGroup>
      </section>

      <section className="rounded-xl border p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-medium">
              {t('settings.performance.idleGuardTitle')}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {t('settings.performance.idleGuardDescription')}
            </p>
          </div>
          <Switch
            checked={idleGuardEnabled}
            onCheckedChange={setIdleGuardEnabled}
          />
        </div>
      </section>
    </div>
  )
}

// ── Language Section ────────────────────────────────────────────────

export function LanguageSection() {
  const { t } = useTranslation()
  const { currentLanguage, changeLanguage, languages } = useLanguage()

  return (
    <div className="max-w-4xl space-y-5">
      <section className="rounded-xl border p-4">
        <h3 className="font-medium">{t('settings.language.title')}</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('settings.language.description')}
        </p>
        {/* Two columns: 17 languages fit on one screen instead of a long
            single-column scroll. Each option is a row-sized hit target, not
            just the 16px radio dot. */}
        <RadioGroup
          className="mt-4 grid gap-1 sm:grid-cols-2"
          value={currentLanguage}
          onValueChange={changeLanguage}
        >
          {languages.map((lang) => (
            <Label
              key={lang.code}
              htmlFor={`lang-${lang.code}`}
              className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 font-medium transition-colors ${
                currentLanguage === lang.code
                  ? 'border-primary/50 bg-primary/5'
                  : 'border-transparent hover:bg-accent/50'
              }`}
            >
              <RadioGroupItem value={lang.code} id={`lang-${lang.code}`} />
              <span className="text-xl leading-none">{lang.flag}</span>
              <span className="min-w-0 truncate">
                {lang.nativeName}
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  {lang.name}
                </span>
              </span>
            </Label>
          ))}
        </RadioGroup>
      </section>
    </div>
  )
}

// ── Country Section ─────────────────────────────────────────────────

export function RegionSection() {
  const { t, i18n } = useTranslation()
  const [country, setCountry] = React.useState(() => getCountrySetting())

  const handleChange = (value: string | null) => {
    const v = value ?? ''
    setCountry(v)
    setCountrySetting(v)
  }

  // Localized names (Intl.DisplayNames) so display and search both work in
  // the user's language; sorted by that name, "Not set" pinned first.
  const options = React.useMemo(() => {
    const localized = COUNTRIES.map((c) => ({
      code: c.code,
      name: countryName(c.code, i18n.language),
      english: c.label,
    })).sort((a, b) => a.name.localeCompare(b.name, i18n.language))
    return [
      {
        code: '',
        name: t('settings.region.notSet', 'Not set (Global)'),
        english: '',
      },
      ...localized,
    ]
  }, [i18n.language, t])

  const byCode = React.useMemo(
    () => new Map(options.map((o) => [o.code, o])),
    [options],
  )

  // The default Combobox filter matches item values (ISO codes) — match on
  // localized name, English name, and code instead.
  const filter = React.useCallback(
    (itemValue: string, query: string) => {
      const q = query.trim().toLowerCase()
      if (!q) return true
      const option = byCode.get(itemValue)
      if (!option) return false
      return (
        option.name.toLowerCase().includes(q) ||
        option.english.toLowerCase().includes(q) ||
        option.code.toLowerCase().startsWith(q)
      )
    },
    [byCode],
  )

  const itemCodes = React.useMemo(() => options.map((o) => o.code), [options])

  const selected = byCode.get(country)
  const selectedLabel = selected
    ? selected.code
      ? `${countryFlag(selected.code)} ${selected.name}`
      : selected.name
    : country

  return (
    <div className="max-w-4xl space-y-5">
      <section className="rounded-xl border p-4">
        <h3 className="font-medium">{t('settings.region.title', 'Country')}</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {t(
            'settings.region.description',
            'Select your country so market connectors route API requests to the correct regional endpoint. Each exchange plugin determines the best server based on your location.',
          )}
        </p>

        {/* A country picker doesn't earn the full pane — cap the control so
            it reads as an input, not a search bar. */}
        <div className="mt-4 max-w-sm">
          <Combobox
            // Filtering only runs on the `items` prop (static JSX children
            // are never filtered by Base UI) — render items via the List's
            // function children.
            items={itemCodes}
            value={country}
            onValueChange={handleChange}
            filter={filter}
            itemToStringLabel={(code: string) => byCode.get(code)?.name ?? code}
          >
            <ComboboxInput
              showClear={!!country}
              placeholder={
                selected
                  ? selectedLabel
                  : t('settings.region.searchPlaceholder', 'Search countries…')
              }
            />
            <ComboboxContent>
              <ComboboxEmpty>
                {t('settings.region.empty', 'No countries found')}
              </ComboboxEmpty>
              <ComboboxList>
                {(code: string) => {
                  const c = byCode.get(code)
                  if (!c) return null
                  return (
                    <ComboboxItem key={code} value={code}>
                      <span className="text-base leading-none">
                        {code ? countryFlag(code) : '🌐'}
                      </span>
                      {c.name}
                      {code && (
                        <span className="ml-auto font-mono text-[10px] tracking-[0.06em] text-muted-foreground">
                          {code}
                        </span>
                      )}
                    </ComboboxItem>
                  )
                }}
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
        </div>

        {country && (
          <p className="mt-3 text-xs text-muted-foreground">
            {t(
              'settings.region.hintPrefix',
              'Exchange connectors will use regional endpoints appropriate for',
            )}{' '}
            <span className="font-medium">{selectedLabel}</span>.{' '}
            {t(
              'settings.region.hintExample',
              'For example, OKX routes US/AU users to us.okx.com and EU users to eea.okx.com.',
            )}
          </p>
        )}
      </section>
    </div>
  )
}

// ── Currency ──────────────────────────────────────────────────────────

export function CurrencySection() {
  const { t } = useTranslation()
  const { currency, setCurrency } = useDisplayCurrency()

  return (
    <div className="max-w-4xl space-y-5">
      <section className="rounded-xl border p-4">
        <h3 className="font-medium">
          {t('settings.currency.title', 'Display Currency')}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {t(
            'settings.currency.description',
            'Choose the currency used to display portfolio values and balances.',
          )}
        </p>
        {/* One card per currency, side by side — a three-item choice reads at
            a glance instead of as a stack of near-empty full-width rows. */}
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          {DISPLAY_CURRENCIES.map((c) => (
            <button
              key={c.code}
              type="button"
              onClick={() => setCurrency(c.code)}
              className={`flex items-center gap-3 rounded-lg border p-3 text-left transition-all ${
                currency === c.code
                  ? 'border-primary/50 bg-primary/5 ring-1 ring-primary/30'
                  : 'border-border hover:bg-accent/50'
              }`}
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-sm font-bold">
                {c.symbol}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{c.label}</p>
                <p className="text-[11px] text-muted-foreground">{c.code}</p>
              </div>
              {currency === c.code && (
                <Check className="ml-auto size-4 shrink-0 text-primary" />
              )}
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}

// ── Risk Management Section ─────────────────────────────────────────

const INTERVAL_MS: Record<ResetInterval, number> = {
  '4h': 4 * 60 * 60 * 1000,
  '12h': 12 * 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
}

function formatTimeRemaining(windowStart: number, interval: ResetInterval) {
  const elapsed = Date.now() - windowStart
  const total = INTERVAL_MS[interval] ?? INTERVAL_MS.daily
  const remaining = Math.max(0, total - elapsed)
  const hours = Math.floor(remaining / 3_600_000)
  const minutes = Math.floor((remaining % 3_600_000) / 60_000)
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

const BREACH_ACTION_OPTIONS: Array<{ value: BreachAction; labelKey: string }> =
  [
    { value: 'off', labelKey: 'settings.risk.actionOff' },
    { value: 'warn', labelKey: 'settings.risk.actionWarn' },
    { value: 'block_buys', labelKey: 'settings.risk.actionBlockBuys' },
    { value: 'block_all', labelKey: 'settings.risk.actionBlockAll' },
  ]

/**
 * Base UI's Select renders the raw value in the trigger unless the root gets
 * an `items` map to look labels up in — without this the closed control says
 * "block_buys" while the open menu says "Block buys".
 */
const BREACH_ACTION_ITEMS = (
  t: (key: string) => string,
): Record<string, string> =>
  Object.fromEntries(BREACH_ACTION_OPTIONS.map((o) => [o.value, t(o.labelKey)]))

const RESET_INTERVAL_OPTIONS: Array<{
  value: ResetInterval
  labelKey: string
}> = [
  { value: '4h', labelKey: 'settings.risk.interval4h' },
  { value: '12h', labelKey: 'settings.risk.interval12h' },
  { value: 'daily', labelKey: 'settings.risk.intervalDaily' },
  { value: 'weekly', labelKey: 'settings.risk.intervalWeekly' },
]

function RiskLimitRow({
  label,
  description,
  value,
  onValueChange,
  action,
  onActionChange,
  inputType,
}: {
  label: string
  description: string
  value: number
  onValueChange: (v: number) => void
  action: BreachAction
  onActionChange: (a: BreachAction) => void
  inputType?: 'percent' | 'count'
}) {
  const { t } = useTranslation()

  return (
    // One settings row per limit: what it is on the left, the two controls on
    // the right — a 1-3 digit threshold doesn't earn a paragraph-wide input.
    // Wraps back to stacked on narrow widths.
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-lg border p-3">
      <div className="min-w-56 flex-1">
        <Label className="text-sm font-medium">{label}</Label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <div className="relative w-24">
          <Input
            type="number"
            min={0}
            step={inputType === 'count' ? 1 : 0.1}
            value={value || ''}
            onChange={(e) => {
              const v = Number(e.target.value)
              onValueChange(v >= 0 ? v : 0)
            }}
            placeholder="0"
            className={inputType === 'percent' ? 'pr-7' : undefined}
          />
          {inputType === 'percent' && (
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
              %
            </span>
          )}
        </div>
        <div className="w-[160px] shrink-0">
          <Select
            value={action}
            items={BREACH_ACTION_ITEMS(t)}
            onValueChange={(v) => onActionChange(v as BreachAction)}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BREACH_ACTION_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {t(opt.labelKey)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  )
}

const CONFIRM_MODE_ICONS: Record<TradeConfirmMode, typeof Zap> = {
  hold: Timer,
  click: MousePointerClick,
}

/**
 * The gesture that commits an order. Hold ships as the default because the
 * wait is the only thing standing between a mis-aimed cursor and a filled
 * order; this is where a trader who places size all day buys that time back.
 */
function OrderConfirmationSection() {
  const { t } = useTranslation()
  const [confirmMode, setConfirmMode] = useTradeConfirmMode()

  return (
    <section className="rounded-xl border p-4">
      <div className="flex items-center gap-2">
        <Hand className="size-4 text-muted-foreground" />
        <h3 className="font-medium">{t('settings.risk.confirmGesture')}</h3>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {t('settings.risk.confirmGestureDescription')}
      </p>

      <RadioGroup
        className="mt-4 gap-3"
        value={confirmMode}
        onValueChange={(v: string) => {
          setConfirmMode(v as TradeConfirmMode)
          track('risk_setting_changed', { setting: 'tradeConfirmMode' })
        }}
      >
        {TRADE_CONFIRM_MODES.map(({ value, labelKey, descKey }) => {
          const Icon = CONFIRM_MODE_ICONS[value]
          return (
            <label
              key={value}
              className="flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 has-[:checked]:border-primary has-[:checked]:bg-primary/5"
            >
              <RadioGroupItem value={value} className="mt-0.5 sr-only" />
              <Icon className="mt-0.5 size-4 shrink-0" />
              <div className="grid gap-0.5">
                <span className="text-sm font-medium">{t(labelKey)}</span>
                <span className="text-xs text-muted-foreground">
                  {t(descKey)}
                </span>
              </div>
              {confirmMode === value && (
                <Check className="ml-auto mt-0.5 size-4 shrink-0 text-primary" />
              )}
            </label>
          )
        })}
      </RadioGroup>

      <p className="mt-3 text-xs text-muted-foreground">
        {t('settings.risk.confirmGestureNote')}
      </p>
    </section>
  )
}

function AiTradePermissionsSection() {
  const { t } = useTranslation()
  const paper = useTradeConsentStore((s) => s.paper)
  const liveMarkets = useTradeConsentStore((s) => s.liveMarkets)
  const setPaperAutoApprove = useTradeConsentStore((s) => s.setPaperAutoApprove)
  const setLiveAutoApprove = useTradeConsentStore((s) => s.setLiveAutoApprove)

  return (
    <section className="rounded-xl border p-4">
      <div className="flex items-center gap-2">
        <Bot className="size-4 text-muted-foreground" />
        <h3 className="font-medium">{t('settings.risk.aiPermissions')}</h3>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {t('settings.risk.aiPermissionsDescription')}
      </p>

      <div className="mt-4 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <Label className="text-sm font-medium">
              {t('settings.risk.aiPaperAuto')}
            </Label>
            <p className="text-xs text-muted-foreground">
              {t('settings.risk.aiPaperAutoDescription')}
            </p>
          </div>
          <Switch checked={paper} onCheckedChange={setPaperAutoApprove} />
        </div>

        <div>
          <Label className="text-sm font-medium">
            {t('settings.risk.aiLiveAuto')}
          </Label>
          <p className="text-xs text-muted-foreground">
            {liveMarkets.length === 0
              ? t('settings.risk.aiLiveAutoEmpty')
              : t('settings.risk.aiLiveAutoDescription')}
          </p>
          {liveMarkets.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {liveMarkets.map((market) => (
                <li
                  key={market}
                  className="bg-down/10 text-down flex items-center gap-1 rounded-md px-2 py-1 font-mono text-[11px] uppercase"
                >
                  {market}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-down hover:text-foreground size-4"
                    aria-label={t('settings.risk.aiLiveAutoRevoke', { market })}
                    onClick={() => setLiveAutoApprove(market, false)}
                  >
                    <X className="size-3" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  )
}

export function RiskSection() {
  const { t } = useTranslation()
  const store = useRiskConfigStore()

  // Check for window reset on render
  React.useEffect(() => {
    store.checkWindowReset()
  }, []) // mount-only: window-reset check must not re-run on store updates

  const isLocked = store.ordersLocked || store.buyOrdersLocked

  return (
    <div className="max-w-4xl space-y-5">
      {/* Lock Banner */}
      {isLocked && (
        <section className="rounded-xl border border-red-500/30 bg-red-500/5 p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Lock className="size-5 text-red-500" />
              <div>
                <p className="text-sm font-medium text-red-700 dark:text-red-400">
                  {store.ordersLocked
                    ? t('settings.risk.lockBanner')
                    : t('settings.risk.lockBannerBuys')}
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => store.unlock()}
              className="shrink-0 gap-1.5"
            >
              <Unlock className="size-3.5" />
              {t('settings.risk.unlockOrders')}
            </Button>
          </div>
        </section>
      )}

      {/* Risk Limits + Breach Actions */}
      <section className="rounded-xl border p-4">
        <div className="flex items-center gap-2">
          <AlertTriangle className="size-4 text-muted-foreground" />
          <h3 className="font-medium">{t('settings.risk.riskLimits')}</h3>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('settings.risk.riskLimitsDescription')}
        </p>

        <div className="mt-4 space-y-3">
          <RiskLimitRow
            label={t('settings.risk.maxDailyLoss')}
            description={t('settings.risk.maxDailyLossDescription')}
            value={store.maxDailyLoss}
            onValueChange={(v) => store.updateConfig({ maxDailyLoss: v })}
            action={store.dailyLossAction}
            onActionChange={(a) => store.updateConfig({ dailyLossAction: a })}
            inputType="percent"
          />
          <RiskLimitRow
            label={t('settings.risk.maxDailyTrades')}
            description={t('settings.risk.maxDailyTradesDescription')}
            value={store.maxDailyTrades}
            onValueChange={(v) =>
              store.updateConfig({ maxDailyTrades: Math.floor(v) })
            }
            action={store.dailyTradesAction}
            onActionChange={(a) => store.updateConfig({ dailyTradesAction: a })}
            inputType="count"
          />
          <RiskLimitRow
            label={t('settings.risk.maxPositionSize')}
            description={t('settings.risk.maxPositionSizeDescription')}
            value={store.maxPositionSize}
            onValueChange={(v) => store.updateConfig({ maxPositionSize: v })}
            action={store.positionSizeAction}
            onActionChange={(a) =>
              store.updateConfig({ positionSizeAction: a })
            }
            inputType="percent"
          />
        </div>
      </section>

      {/* How a trade is committed by hand — the friction the user chooses to
          keep in front of every order they place themselves */}
      <OrderConfirmationSection />

      {/* AI Trade Permissions — the copilot's standing "don't ask again"
          grants, revocable here outside the chat that created them */}
      <AiTradePermissionsSection />

      {/* Reset Window */}
      <section className="rounded-xl border p-4">
        <h3 className="font-medium">{t('settings.risk.resetWindow')}</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('settings.risk.resetWindowDescription')}
        </p>

        <div className="mt-4 flex items-center justify-between gap-4">
          <div>
            <Label className="text-sm font-medium">
              {t('settings.risk.resetWindow')}
            </Label>
            <p className="text-xs text-muted-foreground">
              {t('settings.risk.timeRemaining', {
                time: formatTimeRemaining(
                  store.windowStart,
                  store.resetInterval,
                ),
              })}
            </p>
          </div>
          <Select
            value={store.resetInterval}
            items={Object.fromEntries(
              RESET_INTERVAL_OPTIONS.map((o) => [o.value, t(o.labelKey)]),
            )}
            onValueChange={(v) =>
              store.updateConfig({ resetInterval: v as ResetInterval })
            }
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RESET_INTERVAL_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {t(opt.labelKey)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </section>

      {/* Current Risk State */}
      <section className="rounded-xl border p-4">
        <h3 className="font-medium">{t('settings.risk.currentState')}</h3>

        <div className="mt-4 grid grid-cols-2 gap-4">
          <div className="rounded-lg bg-muted/50 p-3">
            <p className="text-xs text-muted-foreground">
              {t('settings.risk.dailyPnl')}
            </p>
            <p className="mt-1 font-mono text-sm font-medium">
              {store.dailyPnl >= 0 ? '+' : ''}
              {store.dailyPnl.toFixed(2)}%
            </p>
          </div>
          <div className="rounded-lg bg-muted/50 p-3">
            <p className="text-xs text-muted-foreground">
              {t('settings.risk.dailyTradeCount')}
            </p>
            <p className="mt-1 font-mono text-sm font-medium">
              {store.dailyTradeCount}
              {store.maxDailyTrades > 0 && (
                <span className="text-muted-foreground">
                  {' '}
                  / {store.maxDailyTrades}
                </span>
              )}
            </p>
          </div>
        </div>

        <p className="mt-3 text-xs text-muted-foreground">
          {t('settings.risk.windowStart')}:{' '}
          {new Date(store.windowStart).toLocaleString()}
        </p>
      </section>
    </div>
  )
}

// ── Privacy Section ─────────────────────────────────────────────────

export function PrivacySection() {
  const { t } = useTranslation()
  const [analyticsEnabled, setAnalyticsEnabled] = useAnalyticsEnabled()
  const configured = isAnalyticsConfigured()

  return (
    <div className="max-w-4xl space-y-5">
      <section className="rounded-xl border p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="font-medium">{t('settings.privacy.title')}</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {t('settings.privacy.description')}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              {configured
                ? t('settings.privacy.toggleDescription')
                : t('settings.privacy.notConfigured')}
            </p>
          </div>
          <Switch
            checked={configured && analyticsEnabled}
            onCheckedChange={setAnalyticsEnabled}
            disabled={!configured}
          />
        </div>
        <LegalLinksRow className="mt-4 border-t pt-3" />
      </section>

      <AccountDataControls />
    </div>
  )
}

// ── Account data: export + delete ───────────────────────────────────
//
// The in-app half of the GDPR rights the privacy policy commits to. Both
// controls only reach what the App Server holds — signed out, or with no App
// Server configured, there is nothing on a server to export or erase and the
// card says exactly that.

function AccountDataControls() {
  const { t } = useTranslation()
  const { session } = useOptimisticSession()
  const exportData = useAccountExport()
  const deleteAccount = useAccountDeletion()
  const [confirmOpen, setConfirmOpen] = React.useState(false)
  const [confirmText, setConfirmText] = React.useState('')

  const email = session?.user?.email ?? ''
  // Typing the account's own email is the confirmation: it is unguessable
  // muscle memory, unlike clicking through a second "are you sure".
  const confirmed =
    confirmText.trim().toLowerCase() === email.trim().toLowerCase() &&
    email.length > 0

  if (!hasAppServer || !session) {
    return (
      <section className="rounded-xl border border-dashed p-4">
        <h3 className="font-medium">{t('settings.privacy.dataTitle')}</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('settings.privacy.dataSignedOut')}
        </p>
      </section>
    )
  }

  const runExport = () => {
    exportData.mutate(undefined, {
      onSuccess: (saved) => {
        const folder = savedFileFolder(saved.path)
        toast.success(t('settings.privacy.exportDone'), {
          description: folder
            ? t('settings.privacy.exportSavedTo', { folder })
            : t('settings.privacy.exportSavedBrowser'),
        })
      },
      onError: () => toast.error(t('settings.privacy.exportFailed')),
    })
  }

  const runDelete = () => {
    deleteAccount.mutate(undefined, {
      onSuccess: (summary) => {
        setConfirmOpen(false)
        // Analytics erasure is the one step that can fail after the account is
        // already gone, and nothing retries it — so say so rather than let the
        // success toast overstate what happened.
        toast.success(t('settings.privacy.deleteDone'), {
          description:
            summary.analytics === 'failed'
              ? t('settings.privacy.deleteDoneAnalyticsFailed')
              : summary.subscriptionsCancelled > 0
                ? t('settings.privacy.deleteDoneSubscription')
                : t('settings.privacy.deleteDoneDescription'),
          duration: summary.analytics === 'failed' ? 12000 : 6000,
        })
        // Reload rather than unwind in place: every store hydrated from the
        // now-deleted remote account has to go, and a fresh boot is the only
        // way to be sure none of it lingers. Hold off long enough to read the
        // toast — the analytics warning is actionable and only shown once.
        const readingTime = summary.analytics === 'failed' ? 12000 : 2000
        window.setTimeout(() => window.location.assign('/'), readingTime)
      },
      onError: (error) =>
        toast.error(t('settings.privacy.deleteFailed'), {
          description: error instanceof Error ? error.message : undefined,
        }),
    })
  }

  return (
    <>
      <section className="rounded-xl border p-4">
        <h3 className="font-medium">{t('settings.privacy.exportTitle')}</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('settings.privacy.exportDescription')}
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          {t('settings.privacy.localDataNote')}
        </p>
        <Button
          size="sm"
          variant="outline"
          className="mt-3"
          disabled={exportData.isPending}
          onClick={runExport}
        >
          {exportData.isPending ? (
            <RefreshCw className="size-4 animate-spin" />
          ) : (
            <Download className="size-4" />
          )}
          {exportData.isPending
            ? t('settings.privacy.exporting')
            : t('settings.privacy.exportAction')}
        </Button>
      </section>

      <section className="rounded-xl border border-destructive/40 p-4">
        <h3 className="flex items-center gap-2 font-medium text-destructive">
          <AlertTriangle className="size-4" />
          {t('settings.privacy.deleteTitle')}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('settings.privacy.deleteDescription')}
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          {t('settings.privacy.deleteLocalNote')}
        </p>
        <Button
          size="sm"
          variant="destructive"
          className="mt-3"
          disabled={deleteAccount.isPending}
          onClick={() => {
            setConfirmText('')
            setConfirmOpen(true)
          }}
        >
          <Trash2 className="size-4" />
          {t('settings.privacy.deleteAction')}
        </Button>
      </section>

      <AlertDialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (deleteAccount.isPending) return
          setConfirmOpen(open)
          if (!open) setConfirmText('')
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-destructive" />
              {t('settings.privacy.confirmTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('settings.privacy.confirmBody')}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>{t('settings.privacy.confirmBullet1')}</li>
            <li>{t('settings.privacy.confirmBullet2')}</li>
            <li>{t('settings.privacy.confirmBullet3')}</li>
          </ul>

          <div className="space-y-2">
            <Label htmlFor="delete-account-confirm" className="text-xs">
              {t('settings.privacy.confirmPrompt', { email })}
            </Label>
            <Input
              id="delete-account-confirm"
              autoComplete="off"
              spellCheck={false}
              placeholder={email}
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              disabled={deleteAccount.isPending}
            />
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteAccount.isPending}>
              {t('settings.privacy.confirmCancel')}
            </AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={!confirmed || deleteAccount.isPending}
              onClick={runDelete}
            >
              {deleteAccount.isPending && (
                <RefreshCw className="size-4 animate-spin" />
              )}
              {deleteAccount.isPending
                ? t('settings.privacy.deleting')
                : t('settings.privacy.confirmAction')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

// ---------------------------------------------------------------------------
// Intelligence (billing) — the Pairlens Intelligence subscription
// ---------------------------------------------------------------------------

const PLAN_ORDER: Array<IntelligencePlanId> = ['pro', 'max']

export function IntelligenceSection() {
  const { t } = useTranslation()
  const { session } = useOptimisticSession()
  const billing = useBillingState()
  const checkout = useIntelligenceCheckout()
  const portal = useBillingPortal()

  if (!session) {
    return (
      <div className="max-w-4xl rounded-xl border border-dashed p-5">
        <h3 className="font-medium">{t('settings.billing.title')}</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('settings.billing.signInFirst')}
        </p>
      </div>
    )
  }

  if (billing.isLoading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <RefreshCw className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const state = billing.data
  if (!state || billing.isError) {
    return (
      <div className="max-w-4xl rounded-xl border border-dashed p-5">
        <h3 className="font-medium">{t('settings.billing.title')}</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('settings.billing.loadError')}
        </p>
      </div>
    )
  }

  if (!state.billingEnabled) {
    return (
      <div className="max-w-4xl rounded-xl border border-dashed p-5">
        <h3 className="font-medium">{t('settings.billing.title')}</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('settings.billing.selfHosted')}
        </p>
      </div>
    )
  }

  const plan = state.plan ? INTELLIGENCE_PLANS[state.plan] : null
  const periodEnd = state.periodEnd
    ? new Date(state.periodEnd).toLocaleDateString(undefined, {
        month: 'long',
        day: 'numeric',
      })
    : null
  const subscribe = (planId: IntelligencePlanId) => {
    checkout.mutate(planId, {
      onSuccess: () =>
        toast.info(t('settings.billing.checkoutOpened'), {
          description: t('settings.billing.checkoutOpenedDescription'),
        }),
      onError: () => toast.error(t('settings.billing.checkoutFailed')),
    })
  }

  return (
    <div className="max-w-4xl space-y-5">
      {/* Current plan */}
      <section className="rounded-xl border p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="flex items-center gap-2 font-medium">
              <Sparkles className="size-4 text-primary" />
              {t('settings.billing.title')}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {t('settings.billing.description')}
            </p>
          </div>
          <Badge variant={plan ? 'default' : 'outline'}>
            {plan ? plan.label : t('settings.billing.freePlan')}
          </Badge>
        </div>
        {plan && (
          <div className="mt-3 text-xs text-muted-foreground">
            {state.complimentary
              ? t('settings.billing.complimentary')
              : state.status === 'canceled' && periodEnd
                ? t('settings.billing.endsOn', { date: periodEnd })
                : t('settings.billing.active')}
          </div>
        )}
        {state.complimentary ? null : plan ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              disabled={portal.isPending}
              onClick={() =>
                portal.mutate(undefined, {
                  onError: () =>
                    toast.error(t('settings.billing.portalFailed')),
                })
              }
            >
              <ExternalLink className="size-3.5" />
              {t('settings.billing.manage')}
            </Button>
            {state.plan === 'pro' && (
              <Button
                size="sm"
                className="gap-1.5"
                disabled={checkout.isPending}
                onClick={() => subscribe('max')}
              >
                <Sparkles className="size-3.5" />
                {t('settings.billing.upgradeToMax')}
              </Button>
            )}
          </div>
        ) : (
          <div className="mt-4 space-y-2">
            {PLAN_ORDER.map((planId) => {
              const p = INTELLIGENCE_PLANS[planId]
              return (
                <div
                  key={planId}
                  className="flex items-center justify-between gap-4 rounded-lg border p-3"
                >
                  <div>
                    <p className="text-sm font-medium">{p.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {t('settings.billing.planCredits', {
                        credits: p.monthlyCredits.toLocaleString(),
                      })}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant={planId === 'pro' ? 'default' : 'outline'}
                    disabled={checkout.isPending}
                    onClick={() => subscribe(planId)}
                  >
                    ${p.priceUsdMonthly}
                    {t('settings.billing.perMonth')}
                  </Button>
                </div>
              )
            })}
            <p className="text-xs text-muted-foreground">
              {t('settings.billing.taxNote')}
            </p>
            <LegalNotice kind="checkout" />
          </div>
        )}
      </section>

      {/* Usage (complimentary access isn't metered — no meter to show) */}
      {plan && !state.complimentary && (
        <section className="rounded-xl border p-4">
          <h3 className="font-medium">{t('settings.billing.usageTitle')}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('settings.billing.usageDescription')}
          </p>
          <div className="mt-4">
            <Progress
              value={Math.min(state.creditsUsed, state.creditsGranted)}
              max={Math.max(state.creditsGranted, 1)}
            />
            <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {t('settings.billing.creditsUsed', {
                  used: state.creditsUsed.toLocaleString(),
                  granted: state.creditsGranted.toLocaleString(),
                })}
              </span>
              {periodEnd && (
                <span>
                  {t('settings.billing.resetsOn', { date: periodEnd })}
                </span>
              )}
            </div>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            {t('settings.billing.webResearchNote', {
              credits: WEB_RESEARCH_CREDITS_PER_SEARCH,
            })}
          </p>
        </section>
      )}

      {/* Extra credits — one-time packs, Max plan only */}
      {state.plan === 'max' && !state.complimentary && (
        <section className="rounded-xl border p-4">
          <h3 className="font-medium">{t('settings.billing.packsTitle')}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('settings.billing.packsDescription')}
          </p>
          <div className="mt-4 max-w-sm">
            <CreditPackButtons />
          </div>
          {(state.packs?.length ?? 0) > 0 && (
            <ul className="mt-4 space-y-3">
              {state.packs?.map((pack) => (
                <li key={pack.purchasedAt} className="rounded-lg border p-3">
                  <p className="text-xs font-medium">
                    {t('settings.billing.packActive', {
                      credits: pack.credits.toLocaleString(),
                      date: new Date(pack.expiresAt).toLocaleDateString(
                        undefined,
                        { month: 'long', day: 'numeric' },
                      ),
                    })}
                  </p>
                  {pack.creditsUsed !== undefined && (
                    <div className="mt-2">
                      <Progress
                        value={Math.min(pack.creditsUsed, pack.credits)}
                        max={Math.max(pack.credits, 1)}
                      />
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        {t('settings.billing.creditsUsed', {
                          used: pack.creditsUsed.toLocaleString(),
                          granted: pack.credits.toLocaleString(),
                        })}
                      </p>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* BYOK note */}
      <section className="rounded-xl border border-dashed p-4">
        <p className="text-xs text-muted-foreground">
          {t('settings.billing.byokNote')}
        </p>
      </section>
    </div>
  )
}
