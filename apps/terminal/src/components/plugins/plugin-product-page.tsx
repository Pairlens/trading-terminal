// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useEffect, useMemo, useRef } from 'react'
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ExternalLink,
  Globe,
  Palette,
  Trash2,
} from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { useTheme } from 'next-themes'
import { useTranslation } from 'react-i18next'

import { cn } from '@pairlens/ui'
import { AiOrb } from '@pairlens/ui/components/ui/ai-orb'
import { Alert, AlertDescription } from '@pairlens/ui/components/ui/alert'
import { Badge } from '@pairlens/ui/components/ui/badge'
import { Button } from '@pairlens/ui/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@pairlens/ui/components/ui/dropdown-menu'

import { POSTER_MORPH, SectionEyebrow, StoreAurora } from '../store/store-shell'
import { pluginBrand, pluginPosterSrc } from './plugin-brand'
import { PluginBrandTile, PluginPosterArt } from './plugin-icon'
import { ThemePreview } from './theme-preview'
import type { RegistryPluginEntry } from '@pairlens/shared/registry-types'
import type { PluginManifest } from '@pairlens/plugin-system'
import type { FormEvent } from 'react'
import { ConfigFieldInput } from '@/components/config-field-input'
import { getPaneIcon } from '@/lib/layout/pane-icons'
import { isCommunityEntry } from '@/lib/plugins/community-tier'
import { hostsFromManifest } from '@/lib/plugins/network-grants'
import {
  localizedText,
  pluginDescription,
  pluginTitle,
} from '@/lib/plugin-text'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TIER_LABELS: Record<string, string> = {
  free: 'Free',
  pro: 'Pro',
  max: 'Max',
}

function isThemeEntry(entry: RegistryPluginEntry): boolean {
  return entry.category === 'themes'
}

function formatSize(bytes?: number): string | null {
  if (!bytes || bytes <= 0) return null
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function getVisibleConfigFields(manifest: PluginManifest) {
  const isAutoManaged = manifest.id === 'pairlens-intelligence'
  return Object.entries(manifest.config).filter(([key]) => {
    if (isAutoManaged && (key === 'serverUrl' || key === 'authToken'))
      return false
    return true
  })
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Full-screen product page — opens over the store body, docked below the page
 * header, with its own scroll. Converts the old detail dialog into a
 * full-bleed product view.
 */
export function PluginProductPage({
  entry,
  categoryLabel,
  active,
  installed,
  themeApplied,
  busy,
  feedback,
  configDraft,
  savedConfig,
  platformBadge,
  posterLayoutId,
  onBack,
  onToggle,
  onApplyTheme,
  onRemoveTheme,
  onConfigChange,
  onConfigSubmit,
}: {
  entry: RegistryPluginEntry
  categoryLabel: (categoryId: string) => string
  active: boolean
  installed: boolean
  /** Themes only — this theme is the one painting the terminal right now. */
  themeApplied: boolean
  busy: boolean
  feedback: { type: 'error' | 'success'; message: string } | null
  configDraft: Record<string, unknown>
  savedConfig: Record<string, unknown> | null
  platformBadge?: string | null
  /** Shared-element id of the poster this page was opened from. */
  posterLayoutId?: string | null
  onBack: () => void
  onToggle: (checked: boolean) => void
  onApplyTheme: () => void
  onRemoveTheme: () => void
  onConfigChange: (key: string, value: unknown) => void
  onConfigSubmit: (event: FormEvent) => void
}) {
  const { t } = useTranslation()
  const { resolvedTheme } = useTheme()
  const reduceMotion = useReducedMotion() ?? false
  const scrollRef = useRef<HTMLDivElement>(null)

  const { manifest, tagline, longDescription } = entry
  const brand = pluginBrand(manifest.id, manifest.name)
  const theme = isThemeEntry(entry)
  const community = isCommunityEntry(entry)
  const isPairlensPlugin = manifest.id.startsWith('pairlens-')
  const swatches = useMemo(() => {
    const colors = manifest.theme?.previewColors
    if (!colors) return []
    return (resolvedTheme === 'dark' ? colors.dark : colors.light).slice(0, 5)
  }, [manifest.theme, resolvedTheme])

  const capabilities = useMemo(
    () => [...new Set(manifest.capabilities.map((c) => c.id))],
    [manifest.capabilities],
  )
  const hosts = useMemo(() => hostsFromManifest(manifest), [manifest])
  const configFields = getVisibleConfigFields(manifest)
  const hasSavedConfig = savedConfig && Object.keys(savedConfig).length > 0
  const size = formatSize(entry.size)
  const tier = TIER_LABELS[entry.entitlementTier ?? 'free'] ?? 'Free'
  const screenshots = entry.screenshots ?? []
  const panels = manifest.contributes?.panels ?? []
  const permissions = entry.permissions ?? []

  // Fresh product page always starts at the top.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
  }, [manifest.id])

  const installLabel = busy
    ? t('pluginStore.installing', 'Installing…')
    : theme
      ? themeApplied
        ? t('pluginStore.applied', 'Applied')
        : t('pluginStore.applyTheme', 'Apply theme')
      : active
        ? t('pluginStore.installedLabel', 'Installed')
        : t('pluginStore.install', 'Install')

  return (
    <motion.div
      ref={scrollRef}
      className="absolute inset-0 z-40 overflow-y-auto bg-card"
      // Opacity only — a transform here would skew the shared-element morph's
      // layout measurements. The left column carries the rise instead.
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
    >
      <StoreAurora glow={brand.glow} className="fixed" />

      {/* Sticky sub-bar */}
      <div className="sticky top-0 z-20 flex items-center justify-between border-b border-border/40 bg-card/70 px-5 py-2.5 backdrop-blur-md">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 text-[13px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
          {t('pluginStore.backToStore', 'Store')}
        </button>
        <div className="flex items-center gap-3">
          {(theme ? themeApplied : active) && (
            <span className="inline-flex items-center gap-1.5 text-xs text-[var(--chart-2)]">
              <span className="size-1.5 rounded-full bg-[var(--chart-2)]" />
              {theme
                ? t('pluginStore.applied', 'Applied')
                : t('pluginStore.installedActive', 'Installed & active')}
            </span>
          )}
          {!theme && active && (
            <Button
              variant="outline"
              size="sm"
              disabled={busy || !!platformBadge}
              onClick={() => onToggle(false)}
            >
              {t('pluginStore.disable', 'Disable')}
            </Button>
          )}
          {theme ? (
            <ThemeActionButton
              applyLabel={installLabel}
              applied={themeApplied}
              installed={installed}
              bundled={!!entry.bundled}
              busy={busy}
              blocked={!!platformBadge}
              onApply={onApplyTheme}
              onUseDefault={onRemoveTheme}
              onRemove={() => onToggle(false)}
            />
          ) : (
            <Button
              disabled={busy || active || !!platformBadge}
              onClick={() => onToggle(true)}
            >
              {installLabel}
            </Button>
          )}
        </div>
      </div>

      {/* Body — left column scrolls, right rail stays pinned */}
      <div className="relative z-10 mx-auto flex max-w-[1060px] items-start gap-11 px-11 pb-16 pt-6 max-lg:flex-col">
        {/* Left column — carries the enter rise so the morph stays accurate */}
        <motion.div
          className="min-w-0 flex-1"
          initial={reduceMotion ? false : { opacity: 0, y: 16 }}
          animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
          exit={reduceMotion ? undefined : { opacity: 0, y: 10 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="pb-12">
            {!theme && (
              <PluginBrandTile
                id={manifest.id}
                name={manifest.name}
                src={pluginPosterSrc(entry)}
                size={52}
                iconSize={30}
                className="mb-5"
              />
            )}
            <div className="flex items-center gap-2.5">
              <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">
                {categoryLabel(entry.category)}
              </span>
              <Badge variant="outline" className="text-[10px]">
                {tier}
              </Badge>
              {community && (
                <Badge variant="outline" className="text-[10px] text-primary">
                  {t('pluginStore.communityBadge', 'Community')}
                </Badge>
              )}
              {platformBadge && (
                <Badge
                  variant="outline"
                  className="text-[10px] text-muted-foreground"
                >
                  {platformBadge}
                </Badge>
              )}
            </div>
            <h1 className="mt-3.5 font-serif text-[46px] font-semibold leading-[1.02] tracking-[-0.03em] text-foreground">
              {pluginTitle(manifest)}
            </h1>
            <p className="mt-3.5 max-w-[52ch] text-base leading-[1.6] text-muted-foreground">
              {pluginDescription(manifest) || tagline}
            </p>
            <p className="mt-4 font-mono text-xs text-muted-foreground/80">
              {manifest.author}
              <span className="mx-2 text-border">/</span>v{manifest.version}
              {size && (
                <>
                  <span className="mx-2 text-border">/</span>
                  {size}
                </>
              )}
            </p>
          </div>

          {/* Community notice — distinct consent copy for the community tier */}
          {community && (
            <Alert className="mb-10 border-primary/30 bg-primary/5">
              <AlertDescription className="space-y-1.5 text-[13px] leading-relaxed text-muted-foreground">
                <p>
                  {t(
                    'pluginStore.communityNotice',
                    'Community plugin — submitted by the community and reviewed only lightly by Pairlens. It always runs inside the plugin sandbox: it can only reach the network hosts it declares and can never read your exchange keys, wallets, or place trades.',
                  )}
                </p>
                <p className="flex flex-wrap items-center gap-x-3">
                  {entry.githubUser && (
                    <span>
                      {t('pluginStore.communityMaintainer', 'Maintained by')}{' '}
                      <span className="font-medium text-foreground/90">
                        @{entry.githubUser}
                      </span>
                    </span>
                  )}
                  {entry.sourceUrl && (
                    <a
                      href={entry.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                    >
                      {t('pluginStore.communityViewSource', 'View source')}
                      <ExternalLink className="size-3" />
                    </a>
                  )}
                </p>
              </AlertDescription>
            </Alert>
          )}

          {/* Overview */}
          <section>
            <SectionEyebrow>
              {t('pluginStore.overview', 'Overview')}
            </SectionEyebrow>
            <p className="mt-3 max-w-[74ch] text-[14.5px] leading-[1.7] text-muted-foreground">
              {(longDescription ?? pluginDescription(manifest)) || tagline}
            </p>
          </section>

          {/* Screenshots — only when the registry entry ships real captures */}
          {!theme && screenshots.length > 0 && (
            <section className="mt-10">
              <SectionEyebrow>
                {t('pluginStore.preview', 'Preview')}
              </SectionEyebrow>
              <div className="mt-3 flex gap-4 max-md:flex-col">
                {screenshots.slice(0, 3).map((src) => (
                  <div
                    key={src}
                    className="min-w-0 flex-1 overflow-hidden rounded-[14px] border border-border/70"
                  >
                    <img
                      src={src}
                      alt=""
                      className="h-[184px] w-full object-cover"
                    />
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Included panels — the UI this plugin adds to workspaces */}
          {panels.length > 0 && (
            <section className="mt-10">
              <SectionEyebrow>
                {t('pluginStore.panels', 'Included panels')}
                <span className="ml-2 font-mono text-[11px] normal-case tracking-normal text-muted-foreground/60">
                  {panels.length}
                </span>
              </SectionEyebrow>
              <div className="mt-3 flex flex-wrap gap-2">
                {panels.map((panel) => {
                  const Icon = getPaneIcon(panel.icon)
                  return (
                    <span
                      key={panel.id}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border/70 bg-card px-2.5 py-1.5 text-xs text-foreground/90"
                      title={
                        panel.descriptionKey
                          ? t(
                              panel.descriptionKey,
                              localizedText(panel.description) ?? '',
                            )
                          : localizedText(panel.description)
                      }
                    >
                      <Icon className="size-3.5 text-muted-foreground" />
                      {panel.labelKey
                        ? t(panel.labelKey, localizedText(panel.label) ?? '')
                        : localizedText(panel.label)}
                    </span>
                  )
                })}
              </div>
            </section>
          )}

          {/* Live theme preview — real components under the theme's tokens */}
          {theme && (
            <section className="mt-10">
              <SectionEyebrow>
                {t('pluginStore.preview', 'Preview')}
              </SectionEyebrow>
              <div className="mt-3">
                <ThemePreview manifest={manifest} />
              </div>
            </section>
          )}

          {/* Palette (themes) */}
          {theme && swatches.length > 0 && (
            <section className="mt-10">
              <SectionEyebrow>
                {t('pluginStore.palette', 'Palette')}
              </SectionEyebrow>
              <div className="mt-3 flex gap-3 max-md:flex-wrap">
                {swatches.map((color, i) => (
                  <div key={i} className="min-w-0 flex-1">
                    <div
                      className="h-[88px] rounded-[12px] border border-border/60"
                      style={{ backgroundColor: color }}
                    />
                    <p className="mt-1.5 font-mono text-[11px] text-muted-foreground">
                      {color}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Configuration */}
          {configFields.length > 0 && (
            <section className="mt-10">
              <SectionEyebrow>
                {t('pluginStore.configuration', 'Configuration')}
                {hasSavedConfig && (
                  <span className="ml-2 inline-block size-1.5 rounded-full bg-[var(--chart-2)]" />
                )}
              </SectionEyebrow>
              <form
                onSubmit={onConfigSubmit}
                className="mt-3 max-w-xl space-y-4 rounded-[14px] border border-border/70 bg-card/60 p-5"
              >
                {configFields.map(([key, field]) => (
                  <ConfigFieldInput
                    key={key}
                    fieldKey={key}
                    field={field}
                    value={configDraft[key]}
                    disabled={busy}
                    onChange={(value) => onConfigChange(key, value)}
                  />
                ))}
                <div className="flex justify-end">
                  <Button type="submit" size="sm" disabled={busy}>
                    {active
                      ? t('pluginStore.updateReactivate', 'Update & Reactivate')
                      : t('pluginStore.saveActivate', 'Save & Activate')}
                  </Button>
                </div>
              </form>
            </section>
          )}

          {feedback && (
            <Alert
              variant={feedback.type === 'error' ? 'destructive' : 'default'}
              className="mt-6 max-w-xl"
            >
              <AlertDescription>{feedback.message}</AlertDescription>
            </Alert>
          )}

          <div className="mt-12 space-y-8">
            {capabilities.length > 0 && (
              <section>
                <SectionEyebrow>
                  {t('pluginStore.capabilities', 'Capabilities')}
                </SectionEyebrow>
                <div className="mt-3 flex flex-wrap gap-2">
                  {capabilities.map((cap) => (
                    <span
                      key={cap}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border/70 bg-card px-2.5 py-1 font-mono text-[11.5px] text-foreground/90"
                    >
                      <span className="size-1 rounded-full bg-primary" />
                      {cap}
                    </span>
                  ))}
                </div>
              </section>
            )}
            {permissions.length > 0 && (
              <section>
                <SectionEyebrow>
                  {t('pluginStore.permissions', 'Permissions')}
                </SectionEyebrow>
                <div className="mt-3 flex flex-wrap gap-2">
                  {permissions.map((perm) => (
                    <span
                      key={perm}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border/70 bg-card px-2.5 py-1 font-mono text-[11.5px] text-foreground/90"
                    >
                      <span className="size-1 rounded-full bg-primary" />
                      {perm}
                    </span>
                  ))}
                </div>
              </section>
            )}
            <section>
              <SectionEyebrow>
                {t('pluginStore.networkAccess', 'Network access')}
              </SectionEyebrow>
              {hosts.length > 0 ? (
                <div className="mt-3 space-y-2">
                  {hosts.map((host) => (
                    <div
                      key={host}
                      className="flex items-center gap-2.5 rounded-lg border border-border/60 px-3 py-2"
                    >
                      <Globe className="size-3.5 text-muted-foreground" />
                      <span className="font-mono text-xs text-foreground/90">
                        {host}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-[13px] text-muted-foreground">
                  {t(
                    'pluginStore.noNetworkAccess',
                    'No external network access — runs entirely on-device.',
                  )}
                </p>
              )}
            </section>
          </div>
        </motion.div>

        {/* Right rail — pinned below the sticky sub-bar while content scrolls */}
        <aside className="sticky top-[72px] w-[300px] shrink-0 max-lg:static max-lg:w-full">
          {/* Orb (plugins) or palette square (themes) */}
          <div
            aria-hidden
            className="relative flex size-[300px] items-center justify-center max-lg:hidden"
          >
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background: `radial-gradient(circle at 50% 50%, ${brand.glow}, transparent 66%)`,
              }}
            />
            <span
              className="pl-store-ring absolute size-[290px] rounded-full border"
              style={{
                borderColor:
                  'color-mix(in oklch, var(--foreground) 12%, transparent)',
                animation: 'pl-store-spin 40s linear infinite',
              }}
            />
            {/* The poster the page was opened from morphs into this box. */}
            <motion.div
              layoutId={posterLayoutId ?? undefined}
              transition={POSTER_MORPH}
              className={cn(
                'relative flex size-[210px] items-center justify-center overflow-hidden',
                theme && swatches.length > 0
                  ? 'flex-col shadow-lg'
                  : !isPairlensPlugin && 'border border-border/40',
              )}
              style={{
                borderRadius: theme && swatches.length > 0 ? 28 : 105,
              }}
            >
              {theme && swatches.length > 0 ? (
                swatches.map((color, i) => (
                  <div
                    key={i}
                    className="w-full flex-1"
                    style={{ backgroundColor: color }}
                  />
                ))
              ) : isPairlensPlugin ? (
                // Pairlens's own plugins are branded by the orb itself.
                <AiOrb size="210px" state="idle" colors={brand.orbColors} />
              ) : (
                // Ambient brand disc: the mark blurred as backdrop, crisp on top.
                <PluginPosterArt
                  id={manifest.id}
                  name={manifest.name}
                  src={pluginPosterSrc(entry)}
                  iconSize={104}
                  monoSize={120}
                  scrim={false}
                />
              )}
            </motion.div>
          </div>

          {/* Details card */}
          <section className="mt-6 max-lg:mt-0">
            <SectionEyebrow>
              {t('pluginStore.detailsHeading', 'Details')}
            </SectionEyebrow>
            <div className="mt-3 divide-y divide-border/50 rounded-[14px] border border-border/70">
              <DetailsRow
                label={t('pluginStore.author', 'Author')}
                value={manifest.author}
              />
              <DetailsRow
                label={t('pluginStore.version', 'Version')}
                value={`v${manifest.version}`}
                mono
              />
              <DetailsRow
                label={t('pluginStore.category', 'Category')}
                value={categoryLabel(entry.category)}
              />
              {size && (
                <DetailsRow
                  label={t('pluginStore.size', 'Size')}
                  value={size}
                  mono
                />
              )}
              <DetailsRow label={t('pluginStore.tier', 'Tier')} value={tier} />
              {entry.installCount != null && entry.installCount > 0 && (
                <DetailsRow
                  label={t('pluginStore.installs', 'Installs')}
                  value={entry.installCount.toLocaleString()}
                  mono
                />
              )}
              {manifest.homepage && (
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-xs text-muted-foreground">
                    {t('pluginStore.homepage', 'Homepage')}
                  </span>
                  <a
                    href={manifest.homepage}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    {t('pluginStore.visit', 'Visit')}
                    <ExternalLink className="size-3" />
                  </a>
                </div>
              )}
            </div>
          </section>
        </aside>
      </div>
    </motion.div>
  )
}

/**
 * Every theme action in one split button: the primary half applies, the menu
 * half carries the same apply, the drop back to the built-in palette, and the
 * removal. Removing a theme used to live behind applying it first — the
 * buttons were rendered per state — which made getting rid of a theme you had
 * only ever previewed impossible without first painting the terminal with it.
 */
function ThemeActionButton({
  applyLabel,
  applied,
  installed,
  bundled,
  busy,
  blocked,
  onApply,
  onUseDefault,
  onRemove,
}: {
  applyLabel: string
  applied: boolean
  installed: boolean
  /** Bundled themes ship with the app: they turn off rather than uninstall. */
  bundled: boolean
  busy: boolean
  /** Platform-incompatible — apply is off the table, removal still is not. */
  blocked: boolean
  onApply: () => void
  onUseDefault: () => void
  onRemove: () => void
}) {
  const { t } = useTranslation()

  return (
    <div className="flex items-center">
      <Button
        className="rounded-r-none"
        disabled={busy || applied || blocked}
        onClick={onApply}
      >
        {applyLabel}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              className="rounded-l-none border-l border-primary-foreground/25 px-2"
              disabled={busy}
              aria-label={t('pluginStore.themeActions', 'Theme actions')}
            />
          }
        >
          <ChevronDown className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            disabled={applied || blocked}
            onClick={onApply}
            className="gap-2"
          >
            {applied ? (
              <Check className="size-3.5" />
            ) : (
              <Palette className="size-3.5" />
            )}
            {applied
              ? t('pluginStore.applied', 'Applied')
              : t('pluginStore.applyTheme', 'Apply theme')}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!applied}
            onClick={onUseDefault}
            className="gap-2"
          >
            <Palette className="size-3.5" />
            {t('pluginStore.useDefaultTheme', 'Use default theme')}
          </DropdownMenuItem>
          {installed && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={onRemove}
                className="gap-2"
              >
                <Trash2 className="size-3.5" />
                {bundled
                  ? t('pluginStore.removeTheme', 'Remove')
                  : t('pluginStore.uninstall', 'Uninstall')}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

function DetailsRow({
  label,
  value,
  mono,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span
        className={cn(
          'text-xs text-foreground/90',
          mono && 'font-mono tabular-nums',
        )}
      >
        {value}
      </span>
    </div>
  )
}
