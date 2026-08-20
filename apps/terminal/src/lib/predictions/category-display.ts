// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * How a prediction category is drawn, wherever it is drawn.
 *
 * The connector owns the taxonomy — which categories exist, and how each
 * venue's own vocabulary reads into them (`@pairlens/plugins/prediction-
 * connector/categories`). This owns the two things that are presentation:
 * the glyph and the translated label.
 *
 * One module because five surfaces render the same value — the discovery
 * rail, the events browser chips, the event dialog, the event header pane and
 * the phone's event screen — and a category that reads "Tech & Science" on one
 * and "Ciencia" on another is the kind of split nobody notices until a
 * screenshot lands in a bug report.
 *
 * The label falls back to the id, which is what makes a venue-native category
 * the taxonomy has not absorbed yet render as the venue wrote it rather than
 * as a missing translation key.
 */
import {
  Atom,
  Bitcoin,
  Building2,
  ChartCandlestick,
  ChartLine,
  CloudSun,
  Flame,
  Fuel,
  Gamepad2,
  Globe,
  HeartPulse,
  Landmark,
  MessageSquareQuote,
  Plane,
  Sparkles,
  Tag,
  Trophy,
  Vote,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { TFunction } from 'i18next'

/**
 * Canonical id → { icon, i18n key suffix }.
 *
 * Keyed by the exact ids in `PREDICTION_CATEGORY_RULES`. A category missing
 * from this table is not an error — it draws the fallback tag glyph and its
 * own name — but every canonical id has an entry, and
 * `category-display.test.ts` fails when a new one lands without one.
 */
const CATEGORY_DISPLAY: Record<string, { icon: LucideIcon; key: string }> = {
  Esports: { icon: Gamepad2, key: 'esports' },
  Sports: { icon: Trophy, key: 'sports' },
  Mentions: { icon: MessageSquareQuote, key: 'mentions' },
  Elections: { icon: Vote, key: 'elections' },
  Crypto: { icon: Bitcoin, key: 'crypto' },
  Climate: { icon: CloudSun, key: 'climate' },
  Health: { icon: HeartPulse, key: 'health' },
  Geopolitics: { icon: Globe, key: 'geopolitics' },
  Commodities: { icon: Fuel, key: 'commodities' },
  Transport: { icon: Plane, key: 'transport' },
  Economics: { icon: ChartLine, key: 'economics' },
  Financials: { icon: ChartCandlestick, key: 'financials' },
  Companies: { icon: Building2, key: 'companies' },
  'Tech & Science': { icon: Atom, key: 'techScience' },
  Culture: { icon: Sparkles, key: 'culture' },
  Politics: { icon: Landmark, key: 'politics' },
}

/** The row that selects no category at all. */
export const TRENDING_ICON = Flame

export function predictionCategoryIcon(category: string): LucideIcon {
  return CATEGORY_DISPLAY[category]?.icon ?? Tag
}

/**
 * The category's name in the reader's language, or the id itself.
 *
 * The id IS English prose, so the fallback is a correct English label rather
 * than a key fragment — which is what a venue-native category renders as until
 * the taxonomy absorbs it.
 */
export function predictionCategoryLabel(
  t: TFunction,
  category: string,
): string {
  const entry = CATEGORY_DISPLAY[category]
  if (!entry) return category
  return t(`predictionCategories.names.${entry.key}`, {
    defaultValue: category,
  })
}

/** Exported for the test that pins the table against the connector's list. */
export const PREDICTION_CATEGORY_DISPLAY_IDS = Object.keys(CATEGORY_DISPLAY)
