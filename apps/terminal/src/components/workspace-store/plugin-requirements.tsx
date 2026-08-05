// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import {
  Blocks,
  CircleAlert,
  CircleCheck,
  Download,
  PowerOff,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@pairlens/ui'
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@pairlens/ui/components/ui/alert'
import { Badge } from '@pairlens/ui/components/ui/badge'
import type { LucideIcon } from 'lucide-react'

import type {
  RequiredPlugin,
  RequiredPluginStatus,
  TemplateDependencyReport,
} from '@/lib/workspace-store/dependency-analysis'
import { paneMeta } from '@/lib/workspace-store/dependency-analysis'

const STATUS_META: Record<
  RequiredPluginStatus,
  { key: string; label: string; Icon: LucideIcon; className: string }
> = {
  active: {
    key: 'workspaceStore.status.installed',
    label: 'Installed',
    Icon: CircleCheck,
    className: 'text-emerald-500',
  },
  disabled: {
    key: 'workspaceStore.status.disabled',
    label: 'Disabled',
    Icon: PowerOff,
    className: 'text-amber-500',
  },
  'missing-bundled': {
    key: 'workspaceStore.status.willInstall',
    label: 'Will install',
    Icon: Download,
    className: 'text-sky-500',
  },
  'missing-remote': {
    key: 'workspaceStore.status.fromStore',
    label: 'From Plugin Store',
    Icon: Download,
    className: 'text-sky-500',
  },
  unknown: {
    key: 'workspaceStore.status.unavailable',
    label: 'Unavailable',
    Icon: CircleAlert,
    className: 'text-destructive',
  },
}

function PaneChips({ paneTypes }: { paneTypes: Array<string> }) {
  if (paneTypes.length === 0) return null
  const shown = paneTypes.slice(0, 3)
  const extra = paneTypes.length - shown.length
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {shown.map((type) => (
        <Badge
          key={type}
          variant="ghost"
          className="text-[10px] text-muted-foreground"
        >
          {paneMeta(type)?.label ?? type}
        </Badge>
      ))}
      {extra > 0 ? (
        <span className="text-[10px] text-muted-foreground">+{extra}</span>
      ) : null}
    </div>
  )
}

function RequirementRow({ plugin }: { plugin: RequiredPlugin }) {
  const { t } = useTranslation()
  const status = STATUS_META[plugin.status]
  const StatusIcon = status.Icon

  return (
    <li className="flex items-start gap-3 rounded-md border bg-card px-3 py-2">
      <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <Blocks className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate text-sm font-medium">{plugin.name}</span>
          <span
            className={cn(
              'inline-flex items-center gap-1 text-xs font-medium',
              status.className,
            )}
          >
            <StatusIcon className="size-3.5" />
            {t(status.key, status.label)}
          </span>
        </div>
        {plugin.reason ? (
          <p className="mt-0.5 text-xs text-muted-foreground">
            {/* Why this template needs this plugin. Written per template in
                the catalog, so the key is derived from the plugin id rather
                than threaded through dependency-analysis as a key. */}
            {t(`workspaceStore.pluginReasons.${plugin.pluginId}`, {
              defaultValue: plugin.reason,
            })}
          </p>
        ) : null}
        {/* Security: full-access (UI) plugins run in the main realm. */}
        {plugin.requiresFullTrust ? (
          plugin.trusted ? (
            <p className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
              <ShieldCheck className="size-3.5 text-emerald-500" />
              {t(
                'workspaceStore.security.trusted',
                'Full access · bundled with Pairlens',
              )}
            </p>
          ) : (
            <p className="mt-1 inline-flex items-center gap-1 text-xs text-amber-500">
              <ShieldAlert className="size-3.5" />
              {t(
                'workspaceStore.security.needsApproval',
                'Requires full access — you’ll be asked to approve',
              )}
            </p>
          )
        ) : null}
        <PaneChips paneTypes={plugin.panes} />
      </div>
    </li>
  )
}

function OverallBanner({ report }: { report: TemplateDependencyReport }) {
  const { t } = useTranslation()
  if (report.readiness === 'ready') {
    return (
      <Alert className="border-emerald-500/30">
        <CircleCheck className="text-emerald-500" />
        <AlertTitle>
          {t('workspaceStore.readiness.readyTitle', 'You’re all set')}
        </AlertTitle>
        <AlertDescription>
          {t(
            'workspaceStore.readiness.readyBody',
            'Every plugin this workspace needs is already installed.',
          )}
        </AlertDescription>
      </Alert>
    )
  }
  if (report.readiness === 'needs-enable') {
    return (
      <Alert className="border-amber-500/30">
        <PowerOff className="text-amber-500" />
        <AlertTitle>
          {t(
            'workspaceStore.readiness.enableTitle',
            'Some plugins are disabled',
          )}
        </AlertTitle>
        <AlertDescription>
          {t(
            'workspaceStore.readiness.enableBody',
            'This workspace uses plugins you have installed but turned off. Enable them from the Plugins page to see every panel.',
          )}
        </AlertDescription>
      </Alert>
    )
  }
  return (
    <Alert className="border-sky-500/30">
      <Download className="text-sky-500" />
      <AlertTitle>
        {t('workspaceStore.readiness.installTitle', 'Extra plugins needed')}
      </AlertTitle>
      <AlertDescription>
        {t(
          'workspaceStore.readiness.installBody',
          'Some panels rely on plugins you don’t have yet. You can still add the workspace — those panels stay empty until you install the plugins from the Plugin Store.',
        )}
      </AlertDescription>
    </Alert>
  )
}

export function PluginRequirements({
  report,
}: {
  report: TemplateDependencyReport
}) {
  const { t } = useTranslation()

  if (report.plugins.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {t(
          'workspaceStore.noPluginsNeeded',
          'This workspace needs no extra plugins.',
        )}
      </p>
    )
  }

  return (
    <div className="space-y-3">
      <OverallBanner report={report} />

      {report.untrustedFullTrust.length > 0 ? (
        <Alert variant="destructive" className="border-amber-500/40">
          <ShieldAlert />
          <AlertTitle>
            {t('workspaceStore.security.gateTitle', 'Full-access plugins')}
          </AlertTitle>
          <AlertDescription>
            {t('workspaceStore.security.gateBody', {
              defaultValue:
                '{{names}} run with full access to your credentials and trades. You’ll be asked to approve each before it’s activated.',
              names: report.untrustedFullTrust.map((p) => p.name).join(', '),
            })}
          </AlertDescription>
        </Alert>
      ) : null}

      <ul className="space-y-2">
        {report.plugins.map((plugin) => (
          <RequirementRow key={plugin.pluginId} plugin={plugin} />
        ))}
      </ul>
    </div>
  )
}
