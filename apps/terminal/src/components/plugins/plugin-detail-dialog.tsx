// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useTranslation } from 'react-i18next'
import { ExternalLink } from 'lucide-react'

import { cn } from '@pairlens/ui'
import { Alert, AlertDescription } from '@pairlens/ui/components/ui/alert'
import { Badge } from '@pairlens/ui/components/ui/badge'
import { Button } from '@pairlens/ui/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@pairlens/ui/components/ui/dialog'
import { Switch } from '@pairlens/ui/components/ui/switch'

import { PluginIcon } from './plugin-icon'
import type { RegistryPluginEntry } from '@pairlens/shared/registry-types'
import type { PluginManifest } from '@pairlens/plugin-system'
import type { FormEvent } from 'react'
import { ConfigFieldInput } from '@/components/config-field-input'
import {
  localizedText,
  pluginDescription,
  pluginTitle,
} from '@/lib/plugin-text'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function domainLabelKeys(
  t: (key: string, options?: Record<string, unknown>) => string,
): Record<string, string> {
  return {
    'market-data': t('pluginStore.domain.marketData'),
    trading: t('pluginStore.domain.trading'),
    wallet: t('pluginStore.domain.wallet'),
    intelligence: t('pluginStore.domain.signals'),
    ai: t('pluginStore.domain.ai'),
  }
}

function getCapabilityDomains(
  manifest: PluginManifest,
  t: (key: string, options?: Record<string, unknown>) => string,
): Array<string> {
  const labels = domainLabelKeys(t)
  const seen = new Set<string>()
  const result: Array<string> = []
  for (const cap of manifest.capabilities) {
    const domain = cap.id.split(':')[0]
    if (!seen.has(domain)) {
      seen.add(domain)
      result.push(labels[domain] ?? domain)
    }
  }
  return result
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

export function PluginDetailDialog({
  entry,
  open,
  onOpenChange,
  active,
  busy,
  feedback,
  savedConfig,
  configDraft,
  platformBadge,
  onToggle,
  onConfigChange,
  onConfigSubmit,
}: {
  entry: RegistryPluginEntry | null
  open: boolean
  onOpenChange: (open: boolean) => void
  active: boolean
  busy: boolean
  feedback: { type: 'error' | 'success'; message: string } | null
  savedConfig: Record<string, unknown> | null
  configDraft: Record<string, unknown>
  platformBadge?: string | null
  onToggle: (checked: boolean) => void
  onConfigChange: (key: string, value: unknown) => void
  onConfigSubmit: (event: FormEvent) => void
}) {
  const { t } = useTranslation()
  if (!entry) return null

  const { manifest, longDescription, tagline } = entry
  const domains = getCapabilityDomains(manifest, t)
  const configFields = getVisibleConfigFields(manifest)
  const hasSavedConfig = savedConfig && Object.keys(savedConfig).length > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <PluginIcon
              src={manifest.icon}
              name={manifest.name}
              themeColors={manifest.theme?.previewColors}
              className="size-10"
            />
            <div className="min-w-0 flex-1">
              <DialogTitle className="flex items-center gap-2">
                <span className="truncate">{pluginTitle(manifest)}</span>
                <span className="shrink-0 text-xs font-normal text-muted-foreground/50">
                  v{manifest.version}
                </span>
                {platformBadge && (
                  <Badge
                    variant="outline"
                    className="shrink-0 text-[10px] text-muted-foreground"
                  >
                    {platformBadge}
                  </Badge>
                )}
              </DialogTitle>
              <DialogDescription>
                <span className="text-xs text-muted-foreground">
                  {t('pluginStore.byAuthor', { author: manifest.author })}
                </span>
                {entry.installCount != null && entry.installCount > 0 && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    {t('pluginStore.installsCount', {
                      count: entry.installCount,
                      formattedCount: entry.installCount.toLocaleString(),
                    })}
                  </span>
                )}
                {manifest.homepage && (
                  <>
                    {' '}
                    <a
                      href={manifest.homepage}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-0.5 text-xs text-primary hover:underline"
                    >
                      {t('pluginStore.homepage')}
                      <ExternalLink className="size-3" />
                    </a>
                  </>
                )}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Description */}
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          {(longDescription ?? pluginDescription(manifest)) || tagline}
        </p>

        {/* Capability badges */}
        <div className="flex flex-wrap gap-1.5">
          {domains.map((domain) => (
            <Badge
              key={domain}
              variant="secondary"
              className="text-[10px] font-normal"
            >
              {domain}
            </Badge>
          ))}
        </div>

        {/* Contributed panels */}
        {manifest.contributes?.panels &&
          manifest.contributes.panels.length > 0 && (
            <div className="rounded-lg border bg-muted/20 px-4 py-3">
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                {t('pluginStore.panelsCount', {
                  count: manifest.contributes.panels.length,
                })}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {manifest.contributes.panels.map((panel) => (
                  <Badge
                    key={panel.id}
                    variant="outline"
                    className="text-[10px] font-normal"
                  >
                    {panel.labelKey
                      ? t(panel.labelKey)
                      : localizedText(panel.label)}
                  </Badge>
                ))}
              </div>
            </div>
          )}

        {/* Permissions */}
        {entry.permissions && entry.permissions.length > 0 && (
          <div className="rounded-lg border bg-muted/20 px-4 py-3">
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              {t('pluginStore.permissions')}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {entry.permissions.map((perm) => (
                <Badge
                  key={perm}
                  variant="outline"
                  className="text-[10px] font-normal"
                >
                  {perm}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Config form */}
        {configFields.length > 0 && (
          <form
            onSubmit={onConfigSubmit}
            className="space-y-4 rounded-lg border bg-muted/30 p-4"
          >
            <p className="text-xs font-medium text-muted-foreground">
              {t('pluginStore.configuration')}
              {hasSavedConfig && (
                <span className="ml-1.5 inline-block size-1.5 rounded-full bg-emerald-500" />
              )}
            </p>
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
                  ? t('pluginStore.updateReactivate')
                  : t('pluginStore.saveActivate')}
              </Button>
            </div>
          </form>
        )}

        {/* Feedback */}
        {feedback && (
          <Alert
            variant={feedback.type === 'error' ? 'destructive' : 'default'}
          >
            <AlertDescription>{feedback.message}</AlertDescription>
          </Alert>
        )}

        {/* Footer: Toggle */}
        <DialogFooter>
          <div className="flex w-full items-center justify-between">
            <span
              className={cn(
                'text-sm',
                platformBadge
                  ? 'text-muted-foreground'
                  : active
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-muted-foreground',
              )}
            >
              {platformBadge
                ? platformBadge
                : active
                  ? t('common.active')
                  : t('pluginStore.inactive')}
            </span>
            <Switch
              checked={active}
              disabled={busy || !!platformBadge}
              onCheckedChange={onToggle}
              aria-label={t('pluginStore.toggleAria', { name: manifest.name })}
            />
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
