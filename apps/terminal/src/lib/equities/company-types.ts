// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The seam the Company pane is waiting on.
 *
 * A broker quotes and fills; it does not publish a P/E. No bundled connector
 * serves fundamentals, so the pane renders the identity it CAN prove (ticker,
 * name, listing venue) and says plainly that the rest needs a provider, rather
 * than drawing a grid of dashes that looks like a loading state forever.
 *
 * Every metric is optional, and that is the contract: a provider serving US
 * large caps will carry a forward P/E, one serving a European venue may carry
 * none, and a pane that required them would have to fake them. Absent means
 * "nobody published it", never zero.
 */

export type CompanyIdentity = {
  /** Bare ticker, as the equity instrument carries it. */
  symbol: string
  name?: string
  /** ISO 10383 market identifier code of the listing venue, e.g. 'XNAS'. */
  mic?: string
  /** Sector and industry as the provider classifies them. */
  sector?: string
  industry?: string
  /** Reporting currency of the figures below, ISO 4217. */
  currency?: string
}

export type CompanyValuation = {
  marketCap?: number
  enterpriseValue?: number
  peTrailing?: number
  peForward?: number
  epsTtm?: number
  dividendYield?: number
  /** Free float in shares, not in percent. */
  float?: number
  sharesOutstanding?: number
  /** Short interest as a fraction of float (0.012 = 1.2%). */
  shortInterest?: number
  beta1y?: number
}

/** One reported or estimated quarter, for the revenue trend. */
export type CompanyQuarter = {
  /** Fiscal label, e.g. 'Q2 FY26'. */
  label: string
  revenue?: number
  eps?: number
  /** True when the figure is a consensus estimate rather than a report. */
  estimate: boolean
}

export type CompanyFundamentals = {
  identity: CompanyIdentity
  valuation: CompanyValuation
  /** Ascending by fiscal period; the last entry may be an estimate. */
  quarters: Array<CompanyQuarter>
  /** Next scheduled report, epoch ms, when a provider knows it. */
  nextEarningsMs?: number
  /** When the provider last refreshed these figures, epoch ms. */
  fetchedAtMs?: number
}
