// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
//
// Single source of truth for the legal pages (/privacy, /terms).
//
// The policy text itself lives in `src/content/legal/*.mdx` and pulls the
// identity, contact, and subprocessor facts from here, so filling in the
// company details is a one-file edit rather than a find-and-replace across
// two long documents.
//
// ┌───────────────────────────────────────────────────────────────────────┐
// │ BEFORE PUBLISHING: fill in every `[[PLACEHOLDER]]` below, verify the   │
// │ subprocessor list against the DPAs you have actually signed, then set  │
// │ `LEGAL_ENTITY.configured = true`. Until that flag flips, both pages    │
// │ render a visible DRAFT banner and are excluded from search indexes and │
// │ the sitemap, so an unfinished policy can never look binding.           │
// └───────────────────────────────────────────────────────────────────────┘

/**
 * The company that operates Pairlens: the data controller under the GDPR and
 * the counterparty to the Terms.
 */
export const LEGAL_ENTITY = {
  /**
   * Flip to `true` once every placeholder below is filled in and the
   * documents have been reviewed. Gates the DRAFT banner and `noindex`.
   */
  configured: false,

  /** Registered company name, exactly as it appears in the company register. */
  legalName: '[[COMPANY LEGAL NAME]]',
  /** The name users know. */
  tradingName: 'Pairlens',
  /** Company registration number in the register of incorporation. */
  companyNumber: '[[COMPANY REGISTRATION NUMBER]]',
  /** VAT / tax identification number. Set to null if not VAT registered. */
  vatNumber: '[[VAT NUMBER]]' as string | null,
  /** Registered office, one array entry per printed line. */
  address: [
    '[[STREET ADDRESS]]',
    '[[POSTAL CODE, CITY]]',
    '[[COUNTRY]]',
  ] as ReadonlyArray<string>,
  /** Country of incorporation, in prose ("Spain", "Estonia", "Argentina"). */
  country: '[[COUNTRY]]',

  /**
   * Whether the company is established inside the EU/EEA.
   *
   * `true`  → the GDPR applies through Art. 3(1) and no Art. 27 EU
   *           representative is required.
   * `false` → Pairlens is offering services to people in the EU, so the GDPR
   *           still applies through Art. 3(2) and an Art. 27 representative
   *           established in a member state MUST be appointed and named in
   *           the policy. Fill in `euRepresentative` when you set this false.
   */
  euEstablished: true,
  /** Art. 27 representative. Required only when `euEstablished` is false. */
  euRepresentative: null as { name: string; address: string } | null,

  /** Governing law of the Terms, in prose ("the laws of Spain"). */
  governingLaw: 'the laws of [[COUNTRY]]',
  /** Courts with jurisdiction, in prose ("the courts of Madrid, Spain"). */
  courts: 'the courts of [[CITY, COUNTRY]]',
  /**
   * The lead supervisory authority people can complain to, in prose. For an
   * EU company this is the DPA of the country of establishment (for example
   * "the Spanish Agencia Española de Protección de Datos (AEPD)").
   */
  supervisoryAuthority: '[[LEAD DATA PROTECTION AUTHORITY]]',
} as const

/** Published contact addresses. Both must be monitored: the GDPR gives you
 *  one month to answer a data-subject request. */
export const LEGAL_CONTACT = {
  /** Data-protection and data-subject requests. */
  privacy: 'privacy@pairlens.finance',
  /** Terms, notices, abuse reports, takedowns. */
  legal: 'legal@pairlens.finance',
} as const

/** Formats the registered office as a single line for inline prose. */
export const registeredAddressLine = LEGAL_ENTITY.address.join(', ')

/** `courts` with its leading article capitalised, for sentence-initial use. */
export const courtsSentenceCase = LEGAL_ENTITY.courts.replace(
  /^./,
  (character) => character.toUpperCase(),
)

/** Document metadata. Bump `updated` whenever the text materially changes. */
export const LEGAL_DOCS = {
  privacy: {
    href: '/privacy',
    label: 'Privacy Policy',
    updated: '31 July 2026',
    /** Editorial estimate shown in the facts rail. Legal prose reads slowly. */
    readMinutes: 12,
  },
  terms: {
    href: '/terms',
    label: 'Terms & Conditions',
    updated: '31 July 2026',
    readMinutes: 14,
  },
} as const

export type LegalDocId = keyof typeof LEGAL_DOCS

/**
 * Shorter labels for the section rail, keyed by the exact H2 text. The rail is
 * 212px wide and a handful of headings are written for the document, not for a
 * rail. Keyed by full text on purpose: edit a heading and it simply falls back
 * to the heading itself rather than silently mislabelling a section.
 */
export const LEGAL_TOC_SHORT: Record<string, string | undefined> = {
  '5. Pairlens Intelligence and AI processing':
    '5. Intelligence and AI processing',
  '6. Pairlens is not a broker, and this is not advice':
    '6. Not a broker, not advice',
  '9. Pairlens Intelligence subscriptions': '9. Intelligence subscriptions',
  '10. Plugins, the registry, and community content':
    '10. Plugins and community content',
  '12. Availability, changes, and beta features':
    '12. Availability and changes',
}

export type Subprocessor = {
  name: string
  purpose: string
  /** Where the processing happens, as the user should understand it. */
  location: string
  /** Transfer safeguard relied on for personal data leaving the EEA. */
  safeguard: string
  /** Link to the provider's own privacy documentation. */
  href: string
}

/**
 * Third parties that process personal data on our behalf, plus the payment
 * provider that acts as its own controller.
 *
 * VERIFY BEFORE PUBLISHING: entity names, hosting regions, and transfer
 * safeguards change. Each row must match the DPA actually in force with that
 * provider. A subprocessor list that names a safeguard you have not signed is
 * worse than no list at all.
 */
export const SUBPROCESSORS: ReadonlyArray<Subprocessor> = [
  {
    name: 'Railway Corp.',
    purpose:
      'Application hosting, PostgreSQL database, Redis cache, and object storage for the Pairlens account service.',
    location: 'United States',
    safeguard: 'Standard Contractual Clauses',
    href: 'https://railway.com/legal/privacy',
  },
  {
    name: 'Vercel Inc.',
    purpose:
      'Hosting for pairlens.finance, cookieless website audience measurement, and the AI Gateway that routes Pairlens Intelligence requests to model providers.',
    location: 'United States, global edge network',
    safeguard: 'Standard Contractual Clauses, EU-US Data Privacy Framework',
    href: 'https://vercel.com/legal/privacy-policy',
  },
  {
    name: 'AI model providers',
    purpose:
      'Running the inference and web-research requests you send through Pairlens Intelligence. Which provider serves a request depends on the model we have selected for that workload; today those are large commercial providers including OpenAI, Anthropic, xAI, and Google.',
    location: 'United States and other countries',
    safeguard:
      'Standard Contractual Clauses through the AI Gateway, plus each provider’s own API terms',
    href: 'https://vercel.com/docs/ai-gateway',
  },
  {
    name: 'Stripe, Inc.',
    purpose:
      'Payment processing for Pairlens Intelligence: checkout, card processing, subscription management, invoicing, and tax calculation. Stripe is a separate controller for the payment data it collects; card numbers never touch Pairlens servers.',
    location: 'United States, European Union',
    safeguard: 'Standard Contractual Clauses, EU-US Data Privacy Framework',
    href: 'https://stripe.com/privacy',
  },
  {
    name: 'Resend, Inc.',
    purpose:
      'Delivery of transactional email: sign-in codes and account or billing notices. No marketing email.',
    location: 'United States',
    safeguard: 'Standard Contractual Clauses',
    href: 'https://resend.com/legal/privacy-policy',
  },
  {
    name: 'PostHog Inc.',
    purpose:
      'Product analytics and error reporting, on their EU cloud. Off by default in the terminal, cookieless by default on the website.',
    location: 'European Union (Germany)',
    safeguard: 'Processing stays in the EEA',
    href: 'https://posthog.com/privacy',
  },
  {
    name: 'GitHub, Inc.',
    purpose:
      'Distribution of the desktop app: installer downloads, release notes, and auto-update manifests. Receives your IP address and request metadata when your app checks for an update.',
    location: 'United States',
    safeguard: 'Standard Contractual Clauses, EU-US Data Privacy Framework',
    href: 'https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement',
  },
]

/**
 * Upstream data sources the account service calls server to server. They are
 * listed for transparency and are deliberately NOT subprocessors: the request
 * carries a market symbol, never anything that identifies you.
 */
export const DATA_SOURCES: ReadonlyArray<{ name: string; purpose: string }> = [
  { name: 'CoinMarketCap', purpose: 'Top-coin rankings and market metadata.' },
  {
    name: 'Massive / Polygon.io',
    purpose: 'Equities reference and news data.',
  },
  { name: 'Alpha Vantage', purpose: 'Supplementary market and news data.' },
  { name: 'logo.dev', purpose: 'Symbol and venue logos.' },
]
