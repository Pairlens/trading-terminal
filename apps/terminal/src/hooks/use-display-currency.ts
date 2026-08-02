// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { usePersistedState } from './use-persisted-state'

export type DisplayCurrency = 'USD' | 'EUR' | 'GBP'

export type CurrencyOption = {
  code: DisplayCurrency
  label: string
  symbol: string
}

export const DISPLAY_CURRENCIES: Array<CurrencyOption> = [
  { code: 'USD', label: 'US Dollar', symbol: '$' },
  { code: 'EUR', label: 'Euro', symbol: '€' },
  { code: 'GBP', label: 'British Pound', symbol: '£' },
]

// Persistence contract shared with the desktop menu's synced accessor.
export const DISPLAY_CURRENCY_KEY = 'display-currency'
export const DISPLAY_CURRENCY_DEFAULT: DisplayCurrency = 'USD'

export function useDisplayCurrency() {
  const [currency, setCurrency] = usePersistedState<DisplayCurrency>(
    DISPLAY_CURRENCY_KEY,
    DISPLAY_CURRENCY_DEFAULT,
  )

  const option =
    DISPLAY_CURRENCIES.find((c) => c.code === currency) ?? DISPLAY_CURRENCIES[0]

  return { currency, setCurrency, symbol: option.symbol, option }
}
