// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The routing table behind every Cloud Sync switch.
 *
 * Two things go wrong quietly here. A key the coordinator really does sync but
 * that maps to no domain would keep syncing with every switch off — the switch
 * would be a lie. And a mistake in the blocklist would start shipping exchange
 * credentials to a server that legally must never hold them.
 */
import { describe, expect, test } from 'bun:test'

import {
  ASSISTANT_CONVERSATIONS_KEY,
  SYNC_DOMAINS,
  SYNC_DOMAIN_IDS,
  TIER1_KEYS,
  domainForSyncKey,
  isBlocked,
  isSyncDomainId,
  isTier1,
  syncDomainDefault,
} from '../sync-domains'

describe('domainForSyncKey', () => {
  test('every tier-1 key belongs to a domain', () => {
    const orphans = [...TIER1_KEYS].filter((k) => domainForSyncKey(k) === null)
    expect(orphans).toEqual([])
  })

  test('every tier-2 branch the coordinator routes belongs to a domain', () => {
    // One sample per if/else branch in flushTier2, including the two dynamic
    // families a static list could never enumerate.
    const tier2 = [
      'custom-workspaces',
      'terminal.layout',
      'terminal.layout.perp',
      'discovery.layout',
      'workspace.abc.layout',
      'workspace-vars:abc',
      'terminal.indicators',
      'terminal.drawings',
      'workflows',
      'notification-rules',
      'notification-bindings',
    ]
    const orphans = tier2.filter((k) => domainForSyncKey(k) === null)
    expect(orphans).toEqual([])
  })

  test('routes each family to the domain its label promises', () => {
    expect(domainForSyncKey('language')).toBe('preferences')
    expect(domainForSyncKey('keybindings')).toBe('preferences')
    expect(domainForSyncKey('terminal.market')).toBe('preferences')
    expect(domainForSyncKey('terminal.indicators')).toBe('charts')
    expect(domainForSyncKey('terminal.chartType')).toBe('charts')
    expect(domainForSyncKey('drawing-last-lines')).toBe('charts')
    expect(domainForSyncKey('terminal.drawingFavorites')).toBe('charts')
    expect(domainForSyncKey('custom-workspaces')).toBe('workspaces')
    expect(domainForSyncKey('terminal.layout.prediction')).toBe('workspaces')
    expect(domainForSyncKey('workspace.abc.layout')).toBe('workspaces')
    expect(domainForSyncKey('workspace-vars:abc')).toBe('workspaces')
    expect(domainForSyncKey('workflows')).toBe('automation')
    expect(domainForSyncKey('notification-bindings')).toBe('automation')
  })

  test('keys the coordinator drops map to no domain', () => {
    // These are emitted on the bus but hit the "unknown tier 2 key — skip"
    // branch. Claiming a domain for them would put a switch on a feature that
    // does not sync at all.
    for (const key of [
      'risk-config',
      'bots',
      'bot-runs',
      'indicator-scripts',
      'indicator-templates',
      'workflow-runs',
      'notification-log',
      'terminal.compareSymbols',
      // Drawing-tool recents: rewritten on nearly every tool click, and a
      // trace of one device's last few actions. Favorites are the synced half.
      'terminal.drawingRecents',
    ]) {
      expect(domainForSyncKey(key)).toBeNull()
    }
  })
})

describe('isTier1', () => {
  test('covers the flat preference set plus the drawing-style prefix', () => {
    expect(isTier1('language')).toBe(true)
    expect(isTier1('drawing-last-fibonacci')).toBe(true)
    expect(isTier1('pair-picker.assetClass.dex')).toBe(true)
    expect(isTier1('discovery.sectionOrder')).toBe(true)
    expect(isTier1('custom-workspaces')).toBe(false)
    expect(isTier1('terminal.indicators')).toBe(false)
    // A per-section board is a layout, not a preference — tier 2.
    expect(isTier1('discovery.layout.perp')).toBe(false)
  })
})

describe('isBlocked', () => {
  test('nothing secret or device-local can reach the server', () => {
    expect(isBlocked('theme.cachedCss')).toBe(true)
    expect(isBlocked('custom-publisher-keys')).toBe(true)
    expect(isBlocked('desktop.closeBehavior')).toBe(true)
    expect(isBlocked('security.lock')).toBe(true)
    // The vault record holds every wrapped copy of the data key. It is
    // ciphertext, but it is also the ONLY thing standing between a stolen
    // password and the credentials — it must never leave the device, and the
    // UI mirror must not either (a server that could write it could tell a
    // terminal "no vault here" and watch the next credential land unwrapped).
    expect(isBlocked('security.vault')).toBe(true)
    expect(isBlocked('security.vault-ui')).toBe(true)
    expect(isBlocked('credentials-store:binance')).toBe(true)
    expect(isBlocked('keychain:okx')).toBe(true)
    expect(isBlocked('pairlens:keychain:okx')).toBe(true)
  })

  test('the cloud-sync switches themselves never sync', () => {
    // A device decides what it sends. Syncing the record would let one machine
    // silently switch another's sync off — or back on.
    expect(isBlocked('cloud-sync')).toBe(true)
    expect(domainForSyncKey('cloud-sync')).toBeNull()
  })

  test('ordinary keys are not blocked', () => {
    expect(isBlocked('language')).toBe(false)
    expect(isBlocked('workflows')).toBe(false)
  })
})

describe('SYNC_DOMAINS catalog', () => {
  test('ids are unique and match the exported id list', () => {
    expect(SYNC_DOMAINS.map((d) => d.id)).toEqual([...SYNC_DOMAIN_IDS])
    expect(new Set(SYNC_DOMAIN_IDS).size).toBe(SYNC_DOMAIN_IDS.length)
  })

  test('catalog keys are literals under the settings namespace', () => {
    // The i18n audit scans source statically; composed keys slip past it.
    for (const domain of SYNC_DOMAINS) {
      expect(domain.labelKey).toBe(
        `settings.cloudSync.domains.${domain.id}.title`,
      )
      expect(domain.descriptionKey).toBe(
        `settings.cloudSync.domains.${domain.id}.description`,
      )
    }
  })

  test('only the domains with no local store are flagged cloudOnly', () => {
    expect(SYNC_DOMAINS.filter((d) => d.cloudOnly).map((d) => d.id)).toEqual([
      'trades',
    ])
  })

  test('assistant is the one domain that is off until asked', () => {
    const optIn = SYNC_DOMAINS.filter((d) => d.defaultEnabled === false).map(
      (d) => d.id,
    )
    expect(optIn).toEqual(['assistant'])
    expect(syncDomainDefault('assistant')).toBe(false)
    // Everything that predates the flag keeps syncing without being asked.
    for (const id of SYNC_DOMAIN_IDS) {
      if (id === 'assistant') continue
      expect(syncDomainDefault(id)).toBe(true)
    }
  })

  test('an opt-in domain still has to explain itself when off', () => {
    // The caveat is the only thing that says "off by default" in Settings;
    // without it the row looks like every other one the user switched off.
    const assistant = SYNC_DOMAINS.find((d) => d.id === 'assistant')
    expect(assistant?.caveatKey).toBe(
      'settings.cloudSync.domains.assistant.caveat',
    )
  })

  test('the assistant collection key routes to its own domain', () => {
    expect(domainForSyncKey(ASSISTANT_CONVERSATIONS_KEY)).toBe('assistant')
    // Per-thread keys deliberately route nowhere: they ride inside the one
    // bulk payload, and routing them would mean a PUT per thread.
    expect(domainForSyncKey('assistant.thread.c-1')).toBe(null)
    expect(isTier1(ASSISTANT_CONVERSATIONS_KEY)).toBe(false)
  })

  test('isSyncDomainId rejects anything not in the catalog', () => {
    expect(isSyncDomainId('charts')).toBe(true)
    expect(isSyncDomainId('watchlists')).toBe(false)
    expect(isSyncDomainId(null)).toBe(false)
  })
})
