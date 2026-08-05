// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Translations for text that reaches the screen from outside the terminal.
 *
 * Workflow and notification step types, and the plugin capability table,
 * are declared in engine packages (`@pairlens/workflow-engine`,
 * `@pairlens/notification-engine`, `@pairlens/shared`). Those packages are
 * pure logic shared with the CLI and the plugin SDK — they have no i18next
 * and no business acquiring one. So they keep shipping English `label` and
 * `description`, and this module maps them onto catalog keys on the way to
 * the DOM.
 *
 * ## Keys are derived, not declared
 *
 * The alternative was a `labelKey` beside every `label` in the engines:
 * sixty duplicated lines, and a new step type that silently forgets one.
 * Instead every key is derived from identifiers those packages already
 * treat as stable — a step's `type`, a config field's `key`, an option's
 * `value`, a capability's `id`. All four are persisted in saved workflows,
 * rules and layouts, so they cannot be renamed casually anyway.
 *
 * Derived keys are invisible to the catalog-parity test, which only sees
 * `t('literal')` call sites. `__tests__/registry-labels.test.ts` covers
 * them instead: it walks the real core step definitions and capability
 * table and asserts every derived key resolves in `en`. That test also
 * catches a step type added upstream without translations — which the
 * duplicated-`labelKey` design would not have.
 *
 * ## Third-party steps keep their own English
 *
 * Plugin-contributed step types have no catalog entry, and a plugin author
 * cannot add one. Every lookup here passes the engine's English through as
 * `defaultValue`, so a third-party step renders its own label instead of a
 * raw `workflows.stepTypes.acme-thing.label`.
 */
import type { TFunction } from 'i18next'

/** Which engine a step type came from; also its catalog namespace. */
export type StepScope = 'workflows' | 'notifications'

type StepLike = { type: string; label: string }
type OptionLike = { value: string; label: string }
type FieldLike = { key: string; label: string }
type HandleLike = { id: string; label?: string }

// ── Step types ───────────────────────────────────────────────────────

export function stepTypeLabel(
  t: TFunction,
  scope: StepScope,
  step: StepLike,
): string {
  return t(`${scope}.stepTypes.${step.type}.label`, {
    defaultValue: step.label,
  })
}

/**
 * Label for a step type known only by its `type` — the shape execution
 * results arrive in. Falls back to the type itself, which is at least
 * recognisable, rather than to an empty cell.
 */
export function stepTypeLabelById(
  t: TFunction,
  scope: StepScope,
  type: string,
  fallback?: string,
): string {
  return t(`${scope}.stepTypes.${type}.label`, {
    defaultValue: fallback ?? type,
  })
}

export function stepFieldLabel(
  t: TFunction,
  scope: StepScope,
  stepType: string,
  field: FieldLike,
): string {
  return t(`${scope}.stepTypes.${stepType}.fields.${field.key}.label`, {
    defaultValue: field.label,
  })
}

export function stepFieldPlaceholder(
  t: TFunction,
  scope: StepScope,
  stepType: string,
  field: { key: string; placeholder?: string },
): string | undefined {
  if (!field.placeholder) return undefined
  return t(`${scope}.stepTypes.${stepType}.fields.${field.key}.placeholder`, {
    defaultValue: field.placeholder,
  })
}

export function stepOptionLabel(
  t: TFunction,
  scope: StepScope,
  stepType: string,
  fieldKey: string,
  option: OptionLike,
): string {
  return t(
    `${scope}.stepTypes.${stepType}.fields.${fieldKey}.options.${option.value}`,
    { defaultValue: option.label },
  )
}

/**
 * Handle labels sit on the connector dots of a node ('Triggered', 'Pass',
 * 'Fail'). Most handles have none, and an unlabelled handle must stay
 * unlabelled rather than fall back to its id.
 */
export function stepHandleLabel(
  t: TFunction,
  scope: StepScope,
  stepType: string,
  handle: HandleLike,
): string | undefined {
  if (!handle.label) return undefined
  return t(`${scope}.stepTypes.${stepType}.handles.${handle.id}`, {
    defaultValue: handle.label,
  })
}

/**
 * The venue capability a step needs ('Native trigger orders'). Keyed by
 * step type rather than by the requirement text: several steps share one
 * `StepMarketCompat` object, so the English is not a stable identifier and
 * the step type is.
 */
export function stepCompatRequires(
  t: TFunction,
  scope: StepScope,
  stepType: string,
  requires: string,
): string {
  return t(`${scope}.stepTypes.${stepType}.compat`, { defaultValue: requires })
}

/**
 * Why this venue in particular cannot run the step — the other half of a
 * `StepMarketCompat`, shown when a workflow is pointed at a market that
 * fails its gate. Keyed by step type for the same reason as `compat`.
 */
export function stepCompatReason(
  t: TFunction,
  scope: StepScope,
  stepType: string,
  reason: string,
): string {
  return t(`${scope}.stepTypes.${stepType}.compatReason`, {
    defaultValue: reason,
  })
}

// ── Plugin capabilities ──────────────────────────────────────────────

/**
 * Capability ids carry colons (`market-data:candles`), which i18next reads as
 * its namespace separator. Nesting under them instead keeps the key readable:
 * `capabilities.market-data.candles.label`.
 *
 * Every colon, not just the first — `market-data:discovery:search` has two,
 * and a single `replace` left the second one in, so that capability silently
 * rendered its English fallback while its nineteen neighbours translated.
 */
function capabilityKey(id: string): string {
  return `capabilities.${id.replaceAll(':', '.')}`
}

export function capabilityLabel(
  t: TFunction,
  meta: { id: string; label: string },
): string {
  return t(`${capabilityKey(meta.id)}.label`, { defaultValue: meta.label })
}

export function capabilityDescription(
  t: TFunction,
  meta: { id: string; description: string },
): string {
  return t(`${capabilityKey(meta.id)}.description`, {
    defaultValue: meta.description,
  })
}

export function capabilityDomainLabel(
  t: TFunction,
  domain: { id: string; label: string },
): string {
  return t(`capabilities.domains.${domain.id}`, { defaultValue: domain.label })
}
