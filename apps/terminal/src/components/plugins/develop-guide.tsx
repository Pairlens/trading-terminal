// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useState } from 'react'
import { Check, Copy, FolderOpen, Upload } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@pairlens/ui/components/ui/badge'
import { Button } from '@pairlens/ui/components/ui/button'

import {
  hasLocalPluginStore,
  openLocalPluginsDir,
} from '@/lib/plugins/local-plugin-store'

function CommandBlock({ command }: { command: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/40 px-3 py-2 font-mono text-xs">
      <code className="truncate">{command}</code>
      <Button
        size="icon-xs"
        variant="ghost"
        className="size-6 shrink-0"
        aria-label="Copy command"
        onClick={() => {
          void navigator.clipboard?.writeText(command)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        }}
      >
        {copied ? (
          <Check className="size-3.5 text-primary" />
        ) : (
          <Copy className="size-3.5" />
        )}
      </Button>
    </div>
  )
}

function Step({
  n,
  title,
  children,
}: {
  n: number
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="flex gap-3">
      <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
        {n}
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <h3 className="text-sm font-medium">{title}</h3>
        {children}
      </div>
    </div>
  )
}

export function DevelopGuide() {
  const { t } = useTranslation()
  const isDesktop = hasLocalPluginStore()

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div>
        <h2 className="text-lg font-semibold">
          {t('pluginStore.buildOwnTitle', 'Build your own plugin')}
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {t(
            'pluginStore.buildOwnDescription',
            'Pairlens is an open platform. Scaffold a plugin, build it, and load it locally — no registry required.',
          )}
        </p>
      </div>

      <div className="space-y-5 rounded-lg border p-5">
        <Step
          n={1}
          title={t('pluginStore.buildStepScaffold', 'Scaffold a new plugin')}
        >
          <CommandBlock command="npx create-pairlens-plugin my-plugin" />
          <p className="text-xs text-muted-foreground">
            {t(
              'pluginStore.buildStepScaffoldNote',
              'Inside this monorepo, use: bun run create:plugin my-plugin',
            )}
          </p>
        </Step>

        <Step n={2} title={t('pluginStore.buildStepBuild', 'Build & package')}>
          <CommandBlock command="bun install && bun run build && bun run package" />
          <p className="text-xs text-muted-foreground">
            {t(
              'pluginStore.buildStepBuildNote',
              'Produces a single .zip (manifest.json + module.js + optional styles.css).',
            )}
          </p>
        </Step>

        <Step n={3} title={t('pluginStore.buildStepInstall', 'Install it')}>
          <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            {t(
              'pluginStore.buildStepInstallNote',
              'Go to the Installed tab and use',
            )}
            <Badge variant="outline" className="gap-1 text-[10px]">
              <Upload className="size-2.5" /> Import plugin
            </Badge>
            {t(
              'pluginStore.buildStepInstallNote2',
              '— or, on desktop, drop the folder into the plugins directory.',
            )}
          </p>
          {isDesktop && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-xs"
              onClick={() => void openLocalPluginsDir()}
            >
              <FolderOpen className="size-3" />
              {t('pluginStore.openFolder', 'Open folder')}
            </Button>
          )}
        </Step>
      </div>

      <div className="space-y-2 rounded-lg border p-5">
        <h3 className="text-sm font-medium">
          {t('pluginStore.buildRuntimeTitle', 'What plugins can use')}
        </h3>
        <p className="text-xs text-muted-foreground">
          {t(
            'pluginStore.buildRuntimeNote',
            'The host provides React, @pairlens/plugin-sdk (hooks), the @pairlens/ui design system (import from the package root), and fast-financial-charts at runtime — mark them external in your build. Design-system components are styled by the host; for custom CSS, ship a styles.css with your plugin.',
          )}
        </p>
        <p className="text-xs text-muted-foreground">
          {t(
            'pluginStore.buildExamplesNote',
            'See the dev-starter and dev-sync examples in the repo for working references.',
          )}
        </p>
      </div>
    </div>
  )
}
