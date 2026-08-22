// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The asset-class sections of Discovery — what the tabs are, which ones this
 * install actually has, and what order the trader put them in.
 *
 * A pure leaf module: no React, no registry, no storage. The hook that feeds
 * it live data lives in `use-discovery-sections.ts`; keeping the rules here
 * means the ordering and availability logic is testable without a DOM.
 *
 * A section id IS an `InstrumentClass`, deliberately. The class is what the
 * markets scanner filters on, what `templateServesClass` matches against, and
 * what the Workspace Store facet maps from — a second vocabulary for "which
 * kind of market is this" is exactly the bug that made every crypto facet
 * silently match nothing.
 */
import { INSTRUMENT_CLASSES } from '@pairlens/shared/market-ref'
import { PERPS_DISCOVERY_TEMPLATE_ID } from '@pairlens/plugins/pairlens-cex-futures/workspaces'
import { PREDICTION_DISCOVERY_TEMPLATE_ID } from '@pairlens/plugins/pairlens-predictions/workspaces'
import { DEX_DISCOVERY_TEMPLATE_ID } from '@pairlens/plugins/pairlens-dex/workspaces'
import { MEMECOIN_DISCOVERY_TEMPLATE_ID } from '@pairlens/plugins/pairlens-memecoins/workspaces'
import { EQUITIES_DISCOVERY_TEMPLATE_ID } from '@pairlens/plugins/pairlens-equities/workspaces'
import type { InstrumentClass } from '@pairlens/shared/market-ref'

export type DiscoverySectionId = InstrumentClass

export type DiscoverySection = {
  id: DiscoverySectionId
  /** Literal key so the i18n audit can see it. */
  labelKey: string
  /** Lucide icon name, matching the markets scanner's asset chips. */
  icon: string
  /**
   * The board this section opens on, when a plugin ships it. A section exists
   * only while its board is registered, so uninstalling `pairlens-predictions`
   * takes the Predictions tab with it — the same user-level asset-class
   * control the Plugin Store already is. `null` means built in and always
   * present.
   */
  templateId: string | null
}

/**
 * Ship order, which is also the fallback for a trader who has never dragged a
 * tab: spot first because it is where most people start, then the rest by how
 * far each sits from it.
 */
export const DISCOVERY_SECTIONS: ReadonlyArray<DiscoverySection> = [
  {
    id: 'spot',
    labelKey: 'discovery.sections.spot',
    icon: 'Bitcoin',
    templateId: null,
  },
  {
    id: 'perp',
    labelKey: 'discovery.sections.perp',
    icon: 'Layers',
    templateId: PERPS_DISCOVERY_TEMPLATE_ID,
  },
  {
    id: 'dex',
    labelKey: 'discovery.sections.dex',
    icon: 'Flame',
    templateId: DEX_DISCOVERY_TEMPLATE_ID,
  },
  {
    id: 'memecoin',
    labelKey: 'discovery.sections.memecoin',
    icon: 'Dog',
    templateId: MEMECOIN_DISCOVERY_TEMPLATE_ID,
  },
  {
    id: 'stocks',
    labelKey: 'discovery.sections.stocks',
    icon: 'TrendingUp',
    templateId: EQUITIES_DISCOVERY_TEMPLATE_ID,
  },
  {
    id: 'prediction',
    labelKey: 'discovery.sections.prediction',
    icon: 'Vote',
    templateId: PREDICTION_DISCOVERY_TEMPLATE_ID,
  },
]

/** The section a fresh install opens on. */
export const DEFAULT_DISCOVERY_SECTION: DiscoverySectionId = 'spot'

export function isDiscoverySectionId(
  value: unknown,
): value is DiscoverySectionId {
  return (
    typeof value === 'string' &&
    (INSTRUMENT_CLASSES as ReadonlyArray<string>).includes(value)
  )
}

/**
 * Apply a saved tab order to the sections this install has.
 *
 * Saved order is advisory, never authoritative: ids it does not mention (a
 * section added in a later release, or a family reinstalled since) keep their
 * ship-order position relative to each other and trail the ordered ones, and
 * ids it names that no longer exist are dropped. A stored array must not be
 * able to hide a tab or resurrect a dead one.
 */
export function orderSections(
  sections: ReadonlyArray<DiscoverySection>,
  order: ReadonlyArray<string>,
): Array<DiscoverySection> {
  const seen = new Set<string>()
  const ordered: Array<DiscoverySection> = []
  for (const id of order) {
    if (seen.has(id)) continue
    const section = sections.find((s) => s.id === id)
    if (!section) continue
    seen.add(id)
    ordered.push(section)
  }
  for (const section of sections) {
    if (!seen.has(section.id)) ordered.push(section)
  }
  return ordered
}

/**
 * Which sections this install has, given the boards currently registered.
 *
 * `registeredTemplateIds` is the workspace-template registry's view, so a
 * family plugin that is uninstalled, disabled, or excluded from the build by
 * `VITE_PAIRLENS_DISABLED_FAMILIES` drops its tab without a reload.
 */
export function availableSections(
  registeredTemplateIds: ReadonlySet<string>,
): Array<DiscoverySection> {
  return DISCOVERY_SECTIONS.filter(
    (s) => s.templateId === null || registeredTemplateIds.has(s.templateId),
  )
}

/**
 * The section to render, given what the URL asked for, what this device last
 * used, and what exists. Falls back rather than blanking: a link to a section
 * whose family was since removed still lands on a working board.
 */
export function resolveSection(
  available: ReadonlyArray<DiscoverySection>,
  requested: string | undefined,
  remembered: string | undefined,
): DiscoverySectionId {
  for (const candidate of [requested, remembered]) {
    if (candidate && available.some((s) => s.id === candidate)) {
      return candidate as DiscoverySectionId
    }
  }
  return available[0]?.id ?? DEFAULT_DISCOVERY_SECTION
}
