// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0

import type { SettingsNavId } from '../user-settings-dialog'
import { hapticsAvailable } from '@/lib/haptics'

/**
 * A hand-kept map of what lives inside each settings section, so settings
 * search can surface things the lazily-loaded sections haven't rendered yet.
 * Titles and descriptions are i18n keys resolved at query time, which makes
 * matching work in the user's display language. `keywords` are the English
 * synonyms people type regardless of language ("dark mode", "hotkeys",
 * "touch id") — they are matched but never shown.
 *
 * When a section gains or loses a major block (an `<h3>`-level card), update
 * its entries here; nothing enforces this, the index is only as good as it
 * is kept.
 */
export type SettingsSearchEntry = {
  /** The sidebar section that renders this entry. */
  section: SettingsNavId
  titleKey: string
  descriptionKey?: string
  keywords: ReadonlyArray<string>
}

export const SETTINGS_SEARCH_INDEX: ReadonlyArray<SettingsSearchEntry> = [
  // Profile
  {
    section: 'profile',
    titleKey: 'settings.profile.image',
    descriptionKey: 'settings.profile.imageDescription',
    keywords: ['avatar', 'photo', 'picture', 'account'],
  },
  {
    section: 'profile',
    titleKey: 'settings.profile.displayName',
    keywords: ['name', 'email', 'account'],
  },
  {
    section: 'profile',
    titleKey: 'settings.profile.resetTutorialTitle',
    descriptionKey: 'settings.profile.resetTutorialDescription',
    keywords: ['onboarding', 'tutorial', 'tour', 'getting started', 'replay'],
  },
  // Assistant
  {
    section: 'ai',
    titleKey: 'settings.ai.placement',
    descriptionKey: 'settings.ai.placementDescription',
    keywords: [
      'assistant',
      'ai',
      'orb',
      'copilot',
      'placement',
      'floating',
      'sidebar',
      'dock',
      'position',
    ],
  },
  {
    section: 'ai',
    titleKey: 'settings.ai.persona',
    descriptionKey: 'settings.ai.personaDescription',
    keywords: [
      'persona',
      'assistant',
      'ai',
      'copilot',
      'tone',
      'voice',
      'mentor',
      'balanced',
      'technical',
    ],
  },
  // Intelligence (billing)
  {
    section: 'billing',
    titleKey: 'settings.billing.title',
    descriptionKey: 'settings.billing.description',
    keywords: [
      'ai',
      'subscription',
      'plan',
      'billing',
      'upgrade',
      'pro',
      'max',
    ],
  },
  {
    section: 'billing',
    titleKey: 'settings.billing.usageTitle',
    keywords: ['credits', 'usage', 'budget', 'billing', 'quota'],
  },
  {
    section: 'billing',
    titleKey: 'aiProviders.title',
    descriptionKey: 'aiProviders.description',
    keywords: [
      'api key',
      'byok',
      'openai',
      'deepseek',
      'anthropic',
      'groq',
      'openrouter',
      'tavily',
      'exa',
      'web search',
      'provider',
    ],
  },
  // Cloud Sync
  {
    section: 'cloud-sync',
    titleKey: 'settings.cloudSync.masterTitle',
    descriptionKey: 'settings.cloudSync.masterDescription',
    keywords: ['sync', 'devices', 'backup', 'account', 'cloud', 'pause'],
  },
  {
    section: 'cloud-sync',
    titleKey: 'settings.cloudSync.title',
    descriptionKey: 'settings.cloudSync.description',
    keywords: ['sync', 'workspaces', 'watchlists', 'devices'],
  },
  // Risk
  {
    section: 'risk',
    titleKey: 'settings.risk.riskLimits',
    descriptionKey: 'settings.risk.riskLimitsDescription',
    keywords: [
      'risk',
      'limits',
      'loss',
      'guardrails',
      'daily',
      'position size',
    ],
  },
  {
    section: 'risk',
    titleKey: 'settings.risk.confirmGesture',
    descriptionKey: 'settings.risk.confirmGestureDescription',
    keywords: [
      'confirm',
      'press and hold',
      'hold',
      'click',
      'submit',
      'order',
      'trade',
    ],
  },
  {
    section: 'risk',
    titleKey: 'settings.risk.aiPermissions',
    descriptionKey: 'settings.risk.aiPermissionsDescription',
    keywords: ['ai', 'copilot', 'autonomy', 'permissions', 'trading', 'auto'],
  },
  {
    section: 'risk',
    titleKey: 'settings.risk.resetWindow',
    descriptionKey: 'settings.risk.resetWindowDescription',
    keywords: ['reset', 'window', 'daily', 'limits'],
  },
  // Plugins
  {
    section: 'plugins',
    titleKey: 'settings.plugins.registry',
    descriptionKey: 'settings.plugins.registryDescription',
    keywords: ['plugins', 'registry', 'store', 'connectors', 'third-party'],
  },
  {
    section: 'plugins',
    titleKey: 'settings.plugins.publisherKeys',
    descriptionKey: 'settings.plugins.publisherKeysDescription',
    keywords: ['keys', 'signing', 'signatures', 'trust', 'publisher'],
  },
  // Security
  {
    section: 'security',
    titleKey: 'settings.security.lockTitle',
    descriptionKey: 'settings.security.lockDescription',
    keywords: ['lock', 'password', 'screen', 'auto lock', 'idle', 'timeout'],
  },
  {
    section: 'security',
    titleKey: 'settings.security.biometricUnlockTitle',
    descriptionKey: 'settings.security.biometricUnlockDescription',
    keywords: [
      'biometric',
      'face id',
      'touch id',
      'fingerprint',
      'windows hello',
      'unlock',
      'lock screen',
    ],
  },
  {
    section: 'security',
    titleKey: 'settings.security.vaultTitle',
    descriptionKey: 'settings.security.vaultDescription',
    keywords: [
      'vault',
      'credentials',
      'api keys',
      'touch id',
      'biometric',
      'fingerprint',
      'passkey',
      'encrypt',
    ],
  },
  {
    section: 'security',
    titleKey: 'settings.security.hardLockTitle',
    descriptionKey: 'settings.security.hardLockDescription',
    keywords: ['hard lock', 'seal', 'vault', 'panic'],
  },
  // Privacy
  {
    section: 'privacy',
    titleKey: 'settings.privacy.title',
    descriptionKey: 'settings.privacy.description',
    keywords: ['analytics', 'telemetry', 'tracking', 'usage data', 'consent'],
  },
  {
    section: 'privacy',
    titleKey: 'settings.privacy.deepSearchTitle',
    descriptionKey: 'settings.privacy.deepSearchDescription',
    keywords: ['search', 'deep search', 'cloud', 'discovery', 'local only'],
  },
  {
    section: 'privacy',
    titleKey: 'settings.privacy.exportTitle',
    descriptionKey: 'settings.privacy.exportDescription',
    keywords: ['export', 'download', 'gdpr', 'data', 'backup'],
  },
  {
    section: 'privacy',
    titleKey: 'settings.privacy.deleteTitle',
    descriptionKey: 'settings.privacy.deleteDescription',
    keywords: ['delete', 'account', 'erase', 'gdpr', 'remove'],
  },
  // Appearance
  {
    section: 'appearance',
    titleKey: 'settings.appearance.colorMode',
    descriptionKey: 'settings.appearance.colorModeDescription',
    keywords: ['dark', 'light', 'mode', 'system', 'color'],
  },
  {
    section: 'appearance',
    titleKey: 'settings.appearance.theme',
    descriptionKey: 'settings.appearance.themeDescription',
    keywords: ['theme', 'colors', 'skin'],
  },
  {
    section: 'appearance',
    titleKey: 'settings.appearance.recentTickers',
    descriptionKey: 'settings.appearance.recentTickersDescription',
    keywords: ['marquee', 'tickers', 'recent', 'pairs'],
  },
  // Gated on the same hardware check as the card itself. A search hit that
  // opens Appearance and shows nothing is worse than no hit at all, and on a
  // desktop browser — where `navigator.vibrate` exists but nothing vibrates —
  // that is exactly what an ungated entry would do.
  ...(hapticsAvailable()
    ? [
        {
          section: 'appearance' as const,
          titleKey: 'settings.appearance.haptics',
          descriptionKey: 'settings.appearance.hapticsDescription',
          keywords: ['haptics', 'vibration', 'vibrate', 'taptic', 'feedback'],
        },
      ]
    : []),
  // Keyboard
  {
    section: 'keyboard',
    titleKey: 'settings.keyboard.title',
    descriptionKey: 'settings.keyboard.description',
    keywords: [
      'shortcuts',
      'keybindings',
      'hotkeys',
      'keys',
      'chords',
      'rebind',
    ],
  },
  {
    section: 'keyboard',
    titleKey: 'settings.keyboard.presetTitle',
    descriptionKey: 'settings.keyboard.presetDescription',
    keywords: ['preset', 'shortcuts', 'defaults'],
  },
  // Notifications
  {
    section: 'notifications',
    titleKey: 'settings.notifications.system.title',
    descriptionKey: 'settings.notifications.system.description',
    keywords: [
      'notifications',
      'permission',
      'desktop notifications',
      'browser notifications',
      'alerts',
      'sound',
      'banner',
      'blocked',
    ],
  },
  {
    section: 'notifications',
    titleKey: 'settings.notifications.telegram.title',
    descriptionKey: 'settings.notifications.telegram.description',
    keywords: [
      'telegram',
      'bot',
      'chat',
      'alerts',
      'notifications',
      'botfather',
      'mobile',
      'phone',
    ],
  },
  // Performance
  {
    section: 'performance',
    titleKey: 'settings.performance.title',
    descriptionKey: 'settings.performance.description',
    keywords: [
      'performance',
      'data rate',
      'throttle',
      'battery',
      'cpu',
      'bandwidth',
      'energy',
    ],
  },
  // Desktop
  {
    section: 'desktop',
    titleKey: 'settings.desktop.closeBehavior.title',
    descriptionKey: 'settings.desktop.closeBehavior.description',
    keywords: ['close', 'quit', 'tray', 'background', 'dock', 'window'],
  },
  {
    section: 'desktop',
    titleKey: 'settings.desktop.quit.title',
    descriptionKey: 'settings.desktop.quit.description',
    keywords: ['quit', 'exit', 'stop'],
  },
  // Language / Region / Currency
  {
    section: 'language',
    titleKey: 'settings.language.title',
    descriptionKey: 'settings.language.description',
    keywords: ['language', 'locale', 'translation', 'english'],
  },
  {
    section: 'region',
    titleKey: 'settings.region.title',
    descriptionKey: 'settings.region.description',
    keywords: ['country', 'region', 'geo', 'restrictions', 'routing'],
  },
  {
    section: 'currency',
    titleKey: 'settings.currency.title',
    descriptionKey: 'settings.currency.description',
    keywords: ['currency', 'usd', 'eur', 'fiat', 'display', 'portfolio'],
  },
]

/**
 * Every-token-must-match search over the index. Matches against the
 * translated title and description, the translated section name, and the
 * English keywords, so "dark" and "dunkel" both find Color Mode in a German
 * terminal.
 */
export function searchSettings(
  query: string,
  t: (key: string) => string,
  visibleSections: ReadonlySet<string>,
  sectionLabel: (section: SettingsNavId) => string,
): Array<SettingsSearchEntry> {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) {
    return []
  }

  return SETTINGS_SEARCH_INDEX.filter((entry) => {
    if (!visibleSections.has(entry.section)) {
      return false
    }
    const haystack = [
      t(entry.titleKey),
      entry.descriptionKey ? t(entry.descriptionKey) : '',
      sectionLabel(entry.section),
      ...entry.keywords,
    ]
      .join(' ')
      .toLowerCase()
    return tokens.every((token) => haystack.includes(token))
  })
}
