// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * How old a pool is, in the coarsest unit that still says something.
 *
 * Two panes read it — the pair board's pool stats and the discovery board's
 * pool detail — and they must agree, because a pool that reads "3 months" on
 * one and "94 days" on the other looks like two different pools. Shared as a
 * function over the SAME `poolStats.age*` keys rather than copied, so the
 * seventeen catalogs carry one set of them.
 */

/** Age in whole months, or days while it is younger than one. */
export function formatPoolAge(
  createdAt: string | null,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string | null {
  if (!createdAt) return null
  const created = Date.parse(createdAt)
  if (!Number.isFinite(created)) return null
  const days = Math.floor((Date.now() - created) / 86_400_000)
  if (days < 1) return t('poolStats.ageToday')
  if (days < 31) return t('poolStats.ageDays', { count: days })
  return t('poolStats.ageMonths', { count: Math.floor(days / 30) })
}
