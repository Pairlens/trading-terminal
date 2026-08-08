// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * "What the phone does not have", written as an invitation rather than an
 * apology.
 *
 * Two groups, because the honest answer has two halves and collapsing them
 * would over-promise: a wider window (any browser past 768px, a tablet
 * included) unlocks the multi-pane surfaces, and the desktop APP additionally
 * unlocks what a browser cannot do at all — the OS keychain, the four venues
 * that serve no CORS headers, bots that outlive the window, extra windows.
 *
 * Every line is checkable against this repo:
 *   - workspaces / Workspace Store, /bots, /indicators, /workflows, /plugins
 *     are all in `DESKTOP_ONLY_PREFIXES` (use-mobile-route-sync.ts)
 *   - Coinbase, Gate, KuCoin and MEXC declare `requiresDesktop` in
 *     packages/plugins/src/*-market-connector, out of fifteen venues
 *   - the `keychain_*` Tauri commands back desktop credential storage
 *   - close-to-hide keeps bots running; `terminal-*` windows are Tauri-only
 *
 * `DesktopExperienceBody` is the part Settings renders, inside the SAME
 * `FullScreenOverlay` element the rest of Settings uses: a second frame there
 * would remount, and a remount plays the entry animation over a 220ms hole
 * with the chart showing through. The default export wraps the body in a
 * frame of its own and exists for the day this becomes an overlay kind — the
 * registration snippet lives in the round-3 notes.
 */
import { memo } from 'react'
import {
  AppWindow,
  BellRing,
  Blocks,
  Bot,
  FileCode2,
  Globe,
  KeyRound,
  LayoutGrid,
  Workflow,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { FullScreenOverlay } from '../primitives/full-screen-overlay'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

type Entry = { id: string; icon: LucideIcon; title: string; body: string }

/** Static keys — the i18n audit cannot follow a template literal. */
const WIDER_WINDOW: Array<Entry> = [
  {
    id: 'workspaces',
    icon: LayoutGrid,
    title: 'mobile.desktopInvite.workspaces.title',
    body: 'mobile.desktopInvite.workspaces.body',
  },
  {
    id: 'bots',
    icon: Bot,
    title: 'mobile.desktopInvite.bots.title',
    body: 'mobile.desktopInvite.bots.body',
  },
  {
    id: 'indicators',
    icon: FileCode2,
    title: 'mobile.desktopInvite.indicators.title',
    body: 'mobile.desktopInvite.indicators.body',
  },
  {
    id: 'workflows',
    icon: Workflow,
    title: 'mobile.desktopInvite.workflows.title',
    body: 'mobile.desktopInvite.workflows.body',
  },
  {
    id: 'plugins',
    icon: Blocks,
    title: 'mobile.desktopInvite.plugins.title',
    body: 'mobile.desktopInvite.plugins.body',
  },
]

const DESKTOP_APP: Array<Entry> = [
  {
    id: 'keychain',
    icon: KeyRound,
    title: 'mobile.desktopInvite.keychain.title',
    body: 'mobile.desktopInvite.keychain.body',
  },
  {
    id: 'venues',
    icon: Globe,
    title: 'mobile.desktopInvite.venues.title',
    body: 'mobile.desktopInvite.venues.body',
  },
  {
    id: 'background',
    icon: BellRing,
    title: 'mobile.desktopInvite.background.title',
    body: 'mobile.desktopInvite.background.body',
  },
  {
    id: 'windows',
    icon: AppWindow,
    title: 'mobile.desktopInvite.windows.title',
    body: 'mobile.desktopInvite.windows.body',
  },
]

export const DesktopExperienceBody = memo(function DesktopExperienceBody() {
  const { t } = useTranslation()

  return (
    <div className="px-4 pb-8 pt-1">
      <p className="text-[14.5px] leading-relaxed text-foreground">
        {t('mobile.desktopInvite.lead')}
      </p>

      <GroupLabel>{t('mobile.desktopInvite.widerWindow')}</GroupLabel>
      {WIDER_WINDOW.map((entry) => (
        <Feature entry={entry} key={entry.id} />
      ))}

      <GroupLabel>{t('mobile.desktopInvite.desktopApp')}</GroupLabel>
      {DESKTOP_APP.map((entry) => (
        <Feature entry={entry} key={entry.id} />
      ))}

      <p className="mt-7 rounded-xl border border-border/70 px-3.5 py-3 text-[12.5px] leading-relaxed text-muted-foreground">
        {t('mobile.desktopInvite.where')}
      </p>
    </div>
  )
})

export default memo(function DesktopExperienceScreen({
  onClose,
}: {
  onClose: () => void
}) {
  const { t } = useTranslation()
  return (
    <FullScreenOverlay
      anchor="screen"
      onBack={onClose}
      title={t('mobile.desktopInvite.screenTitle')}
    >
      <DesktopExperienceBody />
    </FullScreenOverlay>
  )
})

function GroupLabel({ children }: { children: ReactNode }) {
  return (
    <h3 className="pb-1.5 pt-7 text-[9.5px] font-semibold uppercase leading-none tracking-[0.09em] text-muted-foreground">
      {children}
    </h3>
  )
}

function Feature({ entry }: { entry: Entry }) {
  const { t } = useTranslation()
  const Icon = entry.icon
  return (
    <div className="flex gap-3 border-b border-border/50 py-3.5 last:border-b-0">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-[color:var(--pl-wash)]">
        <Icon className="size-[17px] text-muted-foreground" />
      </span>
      <div className="min-w-0">
        <p className="text-[14px] font-semibold leading-snug text-foreground">
          {t(entry.title)}
        </p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
          {t(entry.body)}
        </p>
      </div>
    </div>
  )
}
