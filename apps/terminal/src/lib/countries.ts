// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Shared country directory. The user's country (ISO 3166-1 alpha-2, stored
 * via `region-settings.ts`) is the single source of truth for location — it
 * feeds connector regional routing, geo-restriction detection, and
 * notifications. The coarse `VenueRegion` buckets exist only to curate the
 * onboarding venue shortlist; they are derived from the country, never stored.
 */

/** Coarse buckets used to curate venue suggestions during onboarding. */
export type VenueRegion = 'na' | 'eu' | 'apac' | 'latam' | 'mena' | 'africa'

export type Country = {
  /** ISO 3166-1 alpha-2, uppercase. */
  code: string
  /** English display name (matches the settings dialog). */
  label: string
  region: VenueRegion
}

/** Regional-indicator emoji flag for an ISO alpha-2 code. */
export function countryFlag(code: string): string {
  if (!code || code.length !== 2) return ''
  return String.fromCodePoint(
    ...code
      .toUpperCase()
      .split('')
      .map((c) => 0x1f1e6 + c.charCodeAt(0) - 65),
  )
}

/** Onboarding shortlist shown before the user types a search query. */
export const POPULAR_COUNTRY_CODES = [
  'US',
  'CA',
  'GB',
  'DE',
  'ES',
  'FR',
  'BR',
  'MX',
  'AR',
  'JP',
  'KR',
  'AU',
] as const

export const COUNTRIES: Array<Country> = [
  { code: 'AF', label: 'Afghanistan', region: 'apac' },
  { code: 'AL', label: 'Albania', region: 'eu' },
  { code: 'DZ', label: 'Algeria', region: 'mena' },
  { code: 'AD', label: 'Andorra', region: 'eu' },
  { code: 'AO', label: 'Angola', region: 'africa' },
  { code: 'AG', label: 'Antigua and Barbuda', region: 'latam' },
  { code: 'AR', label: 'Argentina', region: 'latam' },
  { code: 'AM', label: 'Armenia', region: 'apac' },
  { code: 'AU', label: 'Australia', region: 'apac' },
  { code: 'AT', label: 'Austria', region: 'eu' },
  { code: 'AZ', label: 'Azerbaijan', region: 'apac' },
  { code: 'BS', label: 'Bahamas', region: 'latam' },
  { code: 'BH', label: 'Bahrain', region: 'mena' },
  { code: 'BD', label: 'Bangladesh', region: 'apac' },
  { code: 'BB', label: 'Barbados', region: 'latam' },
  { code: 'BY', label: 'Belarus', region: 'eu' },
  { code: 'BE', label: 'Belgium', region: 'eu' },
  { code: 'BZ', label: 'Belize', region: 'latam' },
  { code: 'BJ', label: 'Benin', region: 'africa' },
  { code: 'BT', label: 'Bhutan', region: 'apac' },
  { code: 'BO', label: 'Bolivia', region: 'latam' },
  { code: 'BA', label: 'Bosnia and Herzegovina', region: 'eu' },
  { code: 'BW', label: 'Botswana', region: 'africa' },
  { code: 'BR', label: 'Brazil', region: 'latam' },
  { code: 'BN', label: 'Brunei', region: 'apac' },
  { code: 'BG', label: 'Bulgaria', region: 'eu' },
  { code: 'BF', label: 'Burkina Faso', region: 'africa' },
  { code: 'BI', label: 'Burundi', region: 'africa' },
  { code: 'KH', label: 'Cambodia', region: 'apac' },
  { code: 'CM', label: 'Cameroon', region: 'africa' },
  { code: 'CA', label: 'Canada', region: 'na' },
  { code: 'CV', label: 'Cape Verde', region: 'africa' },
  { code: 'CF', label: 'Central African Republic', region: 'africa' },
  { code: 'TD', label: 'Chad', region: 'africa' },
  { code: 'CL', label: 'Chile', region: 'latam' },
  { code: 'CN', label: 'China', region: 'apac' },
  { code: 'CO', label: 'Colombia', region: 'latam' },
  { code: 'KM', label: 'Comoros', region: 'africa' },
  { code: 'CG', label: 'Congo', region: 'africa' },
  { code: 'CD', label: 'Congo (DRC)', region: 'africa' },
  { code: 'CR', label: 'Costa Rica', region: 'latam' },
  { code: 'HR', label: 'Croatia', region: 'eu' },
  { code: 'CU', label: 'Cuba', region: 'latam' },
  { code: 'CY', label: 'Cyprus', region: 'eu' },
  { code: 'CZ', label: 'Czech Republic', region: 'eu' },
  { code: 'DK', label: 'Denmark', region: 'eu' },
  { code: 'DJ', label: 'Djibouti', region: 'africa' },
  { code: 'DM', label: 'Dominica', region: 'latam' },
  { code: 'DO', label: 'Dominican Republic', region: 'latam' },
  { code: 'EC', label: 'Ecuador', region: 'latam' },
  { code: 'EG', label: 'Egypt', region: 'mena' },
  { code: 'SV', label: 'El Salvador', region: 'latam' },
  { code: 'GQ', label: 'Equatorial Guinea', region: 'africa' },
  { code: 'ER', label: 'Eritrea', region: 'africa' },
  { code: 'EE', label: 'Estonia', region: 'eu' },
  { code: 'SZ', label: 'Eswatini', region: 'africa' },
  { code: 'ET', label: 'Ethiopia', region: 'africa' },
  { code: 'FJ', label: 'Fiji', region: 'apac' },
  { code: 'FI', label: 'Finland', region: 'eu' },
  { code: 'FR', label: 'France', region: 'eu' },
  { code: 'GA', label: 'Gabon', region: 'africa' },
  { code: 'GM', label: 'Gambia', region: 'africa' },
  { code: 'GE', label: 'Georgia', region: 'apac' },
  { code: 'DE', label: 'Germany', region: 'eu' },
  { code: 'GH', label: 'Ghana', region: 'africa' },
  { code: 'GR', label: 'Greece', region: 'eu' },
  { code: 'GD', label: 'Grenada', region: 'latam' },
  { code: 'GT', label: 'Guatemala', region: 'latam' },
  { code: 'GN', label: 'Guinea', region: 'africa' },
  { code: 'GW', label: 'Guinea-Bissau', region: 'africa' },
  { code: 'GY', label: 'Guyana', region: 'latam' },
  { code: 'HT', label: 'Haiti', region: 'latam' },
  { code: 'HN', label: 'Honduras', region: 'latam' },
  { code: 'HK', label: 'Hong Kong', region: 'apac' },
  { code: 'HU', label: 'Hungary', region: 'eu' },
  { code: 'IS', label: 'Iceland', region: 'eu' },
  { code: 'IN', label: 'India', region: 'apac' },
  { code: 'ID', label: 'Indonesia', region: 'apac' },
  { code: 'IR', label: 'Iran', region: 'mena' },
  { code: 'IQ', label: 'Iraq', region: 'mena' },
  { code: 'IE', label: 'Ireland', region: 'eu' },
  { code: 'IL', label: 'Israel', region: 'mena' },
  { code: 'IT', label: 'Italy', region: 'eu' },
  { code: 'CI', label: 'Ivory Coast', region: 'africa' },
  { code: 'JM', label: 'Jamaica', region: 'latam' },
  { code: 'JP', label: 'Japan', region: 'apac' },
  { code: 'JO', label: 'Jordan', region: 'mena' },
  { code: 'KZ', label: 'Kazakhstan', region: 'apac' },
  { code: 'KE', label: 'Kenya', region: 'africa' },
  { code: 'KI', label: 'Kiribati', region: 'apac' },
  { code: 'KW', label: 'Kuwait', region: 'mena' },
  { code: 'KG', label: 'Kyrgyzstan', region: 'apac' },
  { code: 'LA', label: 'Laos', region: 'apac' },
  { code: 'LV', label: 'Latvia', region: 'eu' },
  { code: 'LB', label: 'Lebanon', region: 'mena' },
  { code: 'LS', label: 'Lesotho', region: 'africa' },
  { code: 'LR', label: 'Liberia', region: 'africa' },
  { code: 'LY', label: 'Libya', region: 'mena' },
  { code: 'LI', label: 'Liechtenstein', region: 'eu' },
  { code: 'LT', label: 'Lithuania', region: 'eu' },
  { code: 'LU', label: 'Luxembourg', region: 'eu' },
  { code: 'MO', label: 'Macau', region: 'apac' },
  { code: 'MG', label: 'Madagascar', region: 'africa' },
  { code: 'MW', label: 'Malawi', region: 'africa' },
  { code: 'MY', label: 'Malaysia', region: 'apac' },
  { code: 'MV', label: 'Maldives', region: 'apac' },
  { code: 'ML', label: 'Mali', region: 'africa' },
  { code: 'MT', label: 'Malta', region: 'eu' },
  { code: 'MH', label: 'Marshall Islands', region: 'apac' },
  { code: 'MR', label: 'Mauritania', region: 'africa' },
  { code: 'MU', label: 'Mauritius', region: 'africa' },
  { code: 'MX', label: 'Mexico', region: 'latam' },
  { code: 'FM', label: 'Micronesia', region: 'apac' },
  { code: 'MD', label: 'Moldova', region: 'eu' },
  { code: 'MC', label: 'Monaco', region: 'eu' },
  { code: 'MN', label: 'Mongolia', region: 'apac' },
  { code: 'ME', label: 'Montenegro', region: 'eu' },
  { code: 'MA', label: 'Morocco', region: 'mena' },
  { code: 'MZ', label: 'Mozambique', region: 'africa' },
  { code: 'MM', label: 'Myanmar', region: 'apac' },
  { code: 'NA', label: 'Namibia', region: 'africa' },
  { code: 'NR', label: 'Nauru', region: 'apac' },
  { code: 'NP', label: 'Nepal', region: 'apac' },
  { code: 'NL', label: 'Netherlands', region: 'eu' },
  { code: 'NZ', label: 'New Zealand', region: 'apac' },
  { code: 'NI', label: 'Nicaragua', region: 'latam' },
  { code: 'NE', label: 'Niger', region: 'africa' },
  { code: 'NG', label: 'Nigeria', region: 'africa' },
  { code: 'KP', label: 'North Korea', region: 'apac' },
  { code: 'MK', label: 'North Macedonia', region: 'eu' },
  { code: 'NO', label: 'Norway', region: 'eu' },
  { code: 'OM', label: 'Oman', region: 'mena' },
  { code: 'PK', label: 'Pakistan', region: 'apac' },
  { code: 'PW', label: 'Palau', region: 'apac' },
  { code: 'PS', label: 'Palestine', region: 'mena' },
  { code: 'PA', label: 'Panama', region: 'latam' },
  { code: 'PG', label: 'Papua New Guinea', region: 'apac' },
  { code: 'PY', label: 'Paraguay', region: 'latam' },
  { code: 'PE', label: 'Peru', region: 'latam' },
  { code: 'PH', label: 'Philippines', region: 'apac' },
  { code: 'PL', label: 'Poland', region: 'eu' },
  { code: 'PT', label: 'Portugal', region: 'eu' },
  { code: 'QA', label: 'Qatar', region: 'mena' },
  { code: 'RO', label: 'Romania', region: 'eu' },
  { code: 'RU', label: 'Russia', region: 'eu' },
  { code: 'RW', label: 'Rwanda', region: 'africa' },
  { code: 'KN', label: 'Saint Kitts and Nevis', region: 'latam' },
  { code: 'LC', label: 'Saint Lucia', region: 'latam' },
  { code: 'VC', label: 'Saint Vincent and the Grenadines', region: 'latam' },
  { code: 'WS', label: 'Samoa', region: 'apac' },
  { code: 'SM', label: 'San Marino', region: 'eu' },
  { code: 'ST', label: 'Sao Tome and Principe', region: 'africa' },
  { code: 'SA', label: 'Saudi Arabia', region: 'mena' },
  { code: 'SN', label: 'Senegal', region: 'africa' },
  { code: 'RS', label: 'Serbia', region: 'eu' },
  { code: 'SC', label: 'Seychelles', region: 'africa' },
  { code: 'SL', label: 'Sierra Leone', region: 'africa' },
  { code: 'SG', label: 'Singapore', region: 'apac' },
  { code: 'SK', label: 'Slovakia', region: 'eu' },
  { code: 'SI', label: 'Slovenia', region: 'eu' },
  { code: 'SB', label: 'Solomon Islands', region: 'apac' },
  { code: 'SO', label: 'Somalia', region: 'africa' },
  { code: 'ZA', label: 'South Africa', region: 'africa' },
  { code: 'KR', label: 'South Korea', region: 'apac' },
  { code: 'SS', label: 'South Sudan', region: 'africa' },
  { code: 'ES', label: 'Spain', region: 'eu' },
  { code: 'LK', label: 'Sri Lanka', region: 'apac' },
  { code: 'SD', label: 'Sudan', region: 'africa' },
  { code: 'SR', label: 'Suriname', region: 'latam' },
  { code: 'SE', label: 'Sweden', region: 'eu' },
  { code: 'CH', label: 'Switzerland', region: 'eu' },
  { code: 'SY', label: 'Syria', region: 'mena' },
  { code: 'TW', label: 'Taiwan', region: 'apac' },
  { code: 'TJ', label: 'Tajikistan', region: 'apac' },
  { code: 'TZ', label: 'Tanzania', region: 'africa' },
  { code: 'TH', label: 'Thailand', region: 'apac' },
  { code: 'TL', label: 'Timor-Leste', region: 'apac' },
  { code: 'TG', label: 'Togo', region: 'africa' },
  { code: 'TO', label: 'Tonga', region: 'apac' },
  { code: 'TT', label: 'Trinidad and Tobago', region: 'latam' },
  { code: 'TN', label: 'Tunisia', region: 'mena' },
  { code: 'TR', label: 'Turkey', region: 'mena' },
  { code: 'TM', label: 'Turkmenistan', region: 'apac' },
  { code: 'TV', label: 'Tuvalu', region: 'apac' },
  { code: 'UG', label: 'Uganda', region: 'africa' },
  { code: 'UA', label: 'Ukraine', region: 'eu' },
  { code: 'AE', label: 'United Arab Emirates', region: 'mena' },
  { code: 'GB', label: 'United Kingdom', region: 'eu' },
  { code: 'US', label: 'United States', region: 'na' },
  { code: 'UY', label: 'Uruguay', region: 'latam' },
  { code: 'UZ', label: 'Uzbekistan', region: 'apac' },
  { code: 'VU', label: 'Vanuatu', region: 'apac' },
  { code: 'VA', label: 'Vatican City', region: 'eu' },
  { code: 'VE', label: 'Venezuela', region: 'latam' },
  { code: 'VN', label: 'Vietnam', region: 'apac' },
  { code: 'YE', label: 'Yemen', region: 'mena' },
  { code: 'ZM', label: 'Zambia', region: 'africa' },
  { code: 'ZW', label: 'Zimbabwe', region: 'africa' },
]

const BY_CODE = new Map(COUNTRIES.map((c) => [c.code, c]))

export function countryByCode(code: string | undefined): Country | undefined {
  return code ? BY_CODE.get(code.toUpperCase()) : undefined
}

/** Venue-curation bucket for a country; undefined for unset/global. */
export function regionForCountry(
  code: string | undefined,
): VenueRegion | undefined {
  return countryByCode(code)?.region
}

const displayNamesCache = new Map<string, Intl.DisplayNames | null>()

/**
 * Localized country name via Intl.DisplayNames (built into the runtime, works
 * offline). Falls back to the English label when the locale data is missing.
 */
export function countryName(code: string, locale: string): string {
  let names = displayNamesCache.get(locale)
  if (names === undefined) {
    try {
      names = new Intl.DisplayNames([locale], { type: 'region' })
    } catch {
      names = null
    }
    displayNamesCache.set(locale, names)
  }
  const name = names?.of(code.toUpperCase())
  if (name && name !== code.toUpperCase()) return name
  return countryByCode(code)?.label ?? code
}
