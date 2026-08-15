// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The settings map: which sections exist, how they cluster, and which of them
 * this build can actually show.
 *
 * Lifted out of `user-settings-dialog.tsx` verbatim so more than one shell can
 * read it. The desktop dialog renders it as a sidebar; the phone renders the
 * same ids as a list → detail screen. One table, so a new section appears in
 * both without anybody remembering to add it twice.
 *
 * Deliberately free of JSX and of the dialog's own imports: a surface that
 * only needs the map should not pull a dialog, a sidebar and two mutations
 * along with it.
 */
import {
  AppWindow,
  BellRing,
  CircleUser,
  Cloud,
  Coins,
  Fingerprint,
  Gauge,
  Globe,
  Keyboard,
  Lock,
  MapPin,
  Orbit,
  Paintbrush,
  Puzzle,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'

import { hasAppServer } from '@/lib/auth-client'
import { isStandalone } from '@/lib/platform'

/**
 * Profile is not in a group: it renders as the identity card at the top of
 * the sidebar (avatar, name, email), the way Apple's System Settings leads
 * with the account.
 */
export const PROFILE_NAV_ITEM = {
  id: 'profile',
  nameKey: 'settings.nav.profile',
  icon: CircleUser,
} as const

/**
 * The rest of the sidebar, clustered by what a section configures: Pairlens
 * services (things that ride on your account), trading, protection, the app
 * itself, and locale. The gap between clusters is the only separator —
 * grouping conveyed by negative space, not labels.
 */
export const SETTINGS_NAV_GROUPS = [
  [
    // Assistant sits above Intelligence on purpose: one configures where the
    // assistant lives and how it talks, the next what powers it. Read top to
    // bottom they are the same subject twice.
    { id: 'ai', nameKey: 'settings.nav.ai', icon: Orbit },
    { id: 'billing', nameKey: 'settings.nav.billing', icon: Sparkles },
    { id: 'cloud-sync', nameKey: 'settings.nav.cloudSync', icon: Cloud },
  ],
  [{ id: 'risk', nameKey: 'settings.nav.risk', icon: ShieldCheck }],
  [
    { id: 'security', nameKey: 'settings.nav.security', icon: Lock },
    { id: 'privacy', nameKey: 'settings.nav.privacy', icon: Fingerprint },
  ],
  [
    { id: 'appearance', nameKey: 'settings.nav.appearance', icon: Paintbrush },
    { id: 'keyboard', nameKey: 'settings.nav.keyboard', icon: Keyboard },
    {
      id: 'notifications',
      nameKey: 'settings.nav.notifications',
      icon: BellRing,
    },
    { id: 'performance', nameKey: 'settings.nav.performance', icon: Gauge },
    // Plugins here, not with trading: the section configures registry source
    // and publisher trust — app plumbing, even though most plugins are
    // connectors. The store for browsing them is its own page.
    { id: 'plugins', nameKey: 'settings.nav.plugins', icon: Puzzle },
    { id: 'desktop', nameKey: 'settings.nav.desktop', icon: AppWindow },
  ],
  [
    { id: 'language', nameKey: 'settings.nav.language', icon: Globe },
    { id: 'region', nameKey: 'settings.nav.region', icon: MapPin },
    { id: 'currency', nameKey: 'settings.nav.currency', icon: Coins },
  ],
] as const

export const SETTINGS_NAV = [
  PROFILE_NAV_ITEM,
  ...SETTINGS_NAV_GROUPS.flat(),
] as const

export type SettingsNavId = (typeof SETTINGS_NAV)[number]['id']

/** Sections that only exist in the Tauri build. */
const DESKTOP_ONLY_SECTIONS = new Set<string>(['desktop'])

/** Sections that only mean anything when there is an account to sync with. */
const APP_SERVER_ONLY_SECTIONS = new Set<string>(['cloud-sync'])

export const isSectionVisible = (id: string) =>
  (isStandalone || !DESKTOP_ONLY_SECTIONS.has(id)) &&
  (hasAppServer || !APP_SERVER_ONLY_SECTIONS.has(id))

/**
 * What the sidebar actually renders, and what a deep link may resolve to. An
 * additive filter over the grouped nav rather than a second list, so the nav
 * order and typing stay derived from one place — and so a stale `?section=`
 * deep link in a browser build falls back to Profile instead of opening an
 * empty pane. Groups that filter down to nothing disappear entirely, taking
 * their gap with them.
 */
export const VISIBLE_SETTINGS_NAV_GROUPS = SETTINGS_NAV_GROUPS.map((group) =>
  group.filter((item) => isSectionVisible(item.id)),
).filter((group) => group.length > 0)

export const VISIBLE_SETTINGS_NAV = [
  PROFILE_NAV_ITEM,
  ...VISIBLE_SETTINGS_NAV_GROUPS.flat(),
]

/** What settings search may return results for. */
export const VISIBLE_SECTION_IDS: ReadonlySet<string> = new Set(
  VISIBLE_SETTINGS_NAV.map((item) => item.id),
)

/** i18n key for a section's name, for chrome that renders one by id. */
export function settingsSectionNameKey(id: string): string {
  return (
    SETTINGS_NAV.find((item) => item.id === id)?.nameKey ??
    'settings.nav.profile'
  )
}
