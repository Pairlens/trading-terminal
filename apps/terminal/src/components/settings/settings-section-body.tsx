// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * One settings section's body, by id — the thirty-branch pick that used to sit
 * inline in `user-settings-dialog.tsx`.
 *
 * Extracted verbatim (same chunks, same order, same fallback) so the mobile
 * settings screen renders the *same* sections rather than a second copy that
 * drifts on the first section anyone adds. Profile is not here: it is the
 * dialog's own identity form, not a lazy section.
 */
import * as React from 'react'
import { Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { settingsSectionNameKey } from './settings-nav'
import type { SettingsNavId } from './settings-nav'
import { lazyChunk } from '@/lib/lazy-chunk'

// Lazy-load non-profile sections (single chunk, split per named export).
// `lazyChunk` rather than `React.lazy`: these chunks are fetched long after
// first paint, so a tab left open across a deploy asks for hashes the live
// build no longer has — see @/lib/lazy-chunk.
const loadSections = () => import('../user-settings-sections')
const LazyPluginsSection = lazyChunk(() =>
  loadSections().then((m) => ({ default: m.PluginsSection })),
)
const LazyAppearanceSection = lazyChunk(() =>
  loadSections().then((m) => ({ default: m.AppearanceSection })),
)
const LazyPerformanceSection = lazyChunk(() =>
  loadSections().then((m) => ({ default: m.PerformanceSection })),
)
const LazyLanguageSection = lazyChunk(() =>
  loadSections().then((m) => ({ default: m.LanguageSection })),
)
const LazyRegionSection = lazyChunk(() =>
  loadSections().then((m) => ({ default: m.RegionSection })),
)
const LazyCurrencySection = lazyChunk(() =>
  loadSections().then((m) => ({ default: m.CurrencySection })),
)
const LazyRiskSection = lazyChunk(() =>
  loadSections().then((m) => ({ default: m.RiskSection })),
)
const LazyPrivacySection = lazyChunk(() =>
  loadSections().then((m) => ({ default: m.PrivacySection })),
)
const LazyIntelligenceSection = lazyChunk(() =>
  loadSections().then((m) => ({ default: m.IntelligenceSection })),
)
// Keyboard lives in its own chunk: it pulls in the whole command catalog and
// almost nobody opens it, so it shouldn't ride along with the common sections.
const LazyKeyboardSection = lazyChunk(() =>
  import('./keyboard-section').then((m) => ({
    default: m.KeyboardSection,
  })),
)
// Security is its own chunk for the same reason as Keyboard: it carries its
// own dialogs and a page of threat-model copy that nobody who never opens it
// should have to download.
const LazySecuritySection = lazyChunk(() =>
  import('./security-section').then((m) => ({
    default: m.SecuritySection,
  })),
)
// Notifications carries the Telegram connect flow (its own Bot API client and
// the vault enrollment dialog), which nothing else in settings needs.
const LazyNotificationsSection = lazyChunk(() =>
  import('./notifications-section').then((m) => ({
    default: m.NotificationsSection,
  })),
)
// Desktop is its own chunk too: it only exists in the Tauri build, so a
// browser bundle should never carry it.
const LazyDesktopSection = lazyChunk(() =>
  import('./desktop-section').then((m) => ({
    default: m.DesktopSection,
  })),
)
// Cloud Sync only exists when an App Server is configured, and it drags in the
// sync taxonomy — its own chunk, same reasoning as Desktop.
const LazyCloudSyncSection = lazyChunk(() =>
  import('./cloud-sync-section').then((m) => ({
    default: m.CloudSyncSection,
  })),
)

export function SettingsSectionFallback() {
  return (
    <div className="flex h-32 items-center justify-center">
      <Loader2 className="size-5 animate-spin text-muted-foreground" />
    </div>
  )
}

export function SettingsSectionBody({ section }: { section: SettingsNavId }) {
  const { t } = useTranslation()

  return (
    <React.Suspense fallback={<SettingsSectionFallback />}>
      {section === 'plugins' ? (
        <LazyPluginsSection />
      ) : section === 'appearance' ? (
        <LazyAppearanceSection />
      ) : section === 'performance' ? (
        <LazyPerformanceSection />
      ) : section === 'language' ? (
        <LazyLanguageSection />
      ) : section === 'region' ? (
        <LazyRegionSection />
      ) : section === 'currency' ? (
        <LazyCurrencySection />
      ) : section === 'risk' ? (
        <LazyRiskSection />
      ) : section === 'privacy' ? (
        <LazyPrivacySection />
      ) : section === 'security' ? (
        <LazySecuritySection />
      ) : section === 'keyboard' ? (
        <LazyKeyboardSection />
      ) : section === 'notifications' ? (
        <LazyNotificationsSection />
      ) : section === 'desktop' ? (
        <LazyDesktopSection />
      ) : section === 'cloud-sync' ? (
        <LazyCloudSyncSection />
      ) : section === 'billing' ? (
        <LazyIntelligenceSection />
      ) : (
        <div className="max-w-4xl rounded-xl border border-dashed p-5">
          <h3 className="font-medium">{t(settingsSectionNameKey(section))}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('settings.comingSoon')}
          </p>
        </div>
      )}
    </React.Suspense>
  )
}
