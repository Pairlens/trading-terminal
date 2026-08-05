// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Translations for the Workspace Store catalog (`./catalog.ts`).
 *
 * `catalog.ts` stays a plain data module — it's imported by non-React code
 * (`lib/layout/workspaces/pair-workspace.ts`, `discovery-workspace.ts`) that
 * has no business acquiring a translator. So every template and facet record
 * keeps its English `name` / `tagline` / `description` / `menuLabel` /
 * `label` / `description` as plain data, and this module maps it onto
 * catalog keys on the way to the DOM — the same split `registry-labels.ts`
 * draws for the workflow/notification engines.
 *
 * ## Keys are derived, not declared
 *
 * Every key comes from an identifier the record already carries: a
 * template's own `id`, or a facet value (`TraderType` / `AssetClass` /
 * `ScreenSize`). A template id is prefixed `template:` (e.g.
 * `template:scalpers-cockpit`) — the prefix is stripped before building the
 * key, because i18next reads `:` as its namespace separator by default (see
 * `registry-labels.ts`'s `capabilityKey` for the same problem with
 * capability ids). Facet values have no colon.
 *
 * A community-submitted template has no catalog entry (and can't get one —
 * it's user content), so every lookup passes the record's own English
 * through as `defaultValue` and renders that instead of a raw key path.
 *
 * `__tests__/template-labels.test.ts` walks the real catalog and facet META
 * records and asserts every derived key resolves in `en`.
 */
import { ASSET_CLASS_META, SCREEN_SIZE_META, TRADER_TYPE_META } from './catalog'
import type { TFunction } from 'i18next'
import type {
  AssetClass,
  ScreenSize,
  TraderType,
  WorkspaceTemplate,
} from './types'

const TEMPLATE_ID_PREFIX = 'template:'

/** Strip the redundant `template:` id prefix — the rest is namespace-safe. */
export function templateSlug(id: string): string {
  return id.startsWith(TEMPLATE_ID_PREFIX)
    ? id.slice(TEMPLATE_ID_PREFIX.length)
    : id
}

function templateBase(id: string): string {
  return `workspaceStore.templates.${templateSlug(id)}`
}

export function templateName(
  t: TFunction,
  template: WorkspaceTemplate,
): string {
  return t(`${templateBase(template.id)}.name`, {
    defaultValue: template.name,
  })
}

export function templateTagline(
  t: TFunction,
  template: WorkspaceTemplate,
): string {
  return t(`${templateBase(template.id)}.tagline`, {
    defaultValue: template.tagline,
  })
}

export function templateDescription(
  t: TFunction,
  template: WorkspaceTemplate,
): string {
  return t(`${templateBase(template.id)}.description`, {
    defaultValue: template.description,
  })
}

/**
 * A route-menu preset's short label, e.g. in the ⌘⇧L workspaces dropdown.
 * Takes the raw `(id, englishLabel)` pair rather than a `WorkspaceTemplate`:
 * `routePresets()` in `catalog.ts` already reduces templates to
 * `{ label, layout }` records keyed by id (`t.menuLabel ?? t.name`), and
 * that reduced shape — id as the record key, English label as the value —
 * is what `layout-toolbar.tsx` renders from.
 *
 * The fallback chain mirrors that `menuLabel ?? name`: only 12 of the 27
 * templates carry a `menuLabel`, so falling straight through to the English
 * literal would leave the other 15 entries English in a translated menu.
 */
export function templateMenuLabel(
  t: TFunction,
  id: string,
  englishLabel: string,
): string {
  return t(`${templateBase(id)}.menuLabel`, {
    defaultValue: t(`${templateBase(id)}.name`, { defaultValue: englishLabel }),
  })
}

export function traderTypeLabel(t: TFunction, type: TraderType): string {
  return t(`workspaceStore.traderTypes.${type}.label`, {
    defaultValue: TRADER_TYPE_META[type].label,
  })
}

export function traderTypeDescription(t: TFunction, type: TraderType): string {
  return t(`workspaceStore.traderTypes.${type}.description`, {
    defaultValue: TRADER_TYPE_META[type].description,
  })
}

export function assetClassLabel(t: TFunction, cls: AssetClass): string {
  return t(`workspaceStore.assetClasses.${cls}.label`, {
    defaultValue: ASSET_CLASS_META[cls].label,
  })
}

export function screenSizeLabel(t: TFunction, size: ScreenSize): string {
  return t(`workspaceStore.screenSizes.${size}.label`, {
    defaultValue: SCREEN_SIZE_META[size].label,
  })
}
