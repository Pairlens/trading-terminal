// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Scale a human-readable decimal amount to a token's smallest unit without
 * floating-point loss (memecoin sizes overflow double precision easily).
 */
export function scaleAmount(size: string, decimals: number): bigint {
  const [whole = '0', frac = ''] = size.split('.')
  const fracPadded = (frac + '0'.repeat(decimals)).slice(0, decimals)
  return (
    BigInt(whole || '0') * 10n ** BigInt(decimals) + BigInt(fracPadded || '0')
  )
}

/**
 * Multiply two decimal strings (e.g. size × price) and scale the product to
 * a token's smallest unit. Float math is fine for the product itself (UI
 * inputs carry < 15 significant digits); the scaling stays integer-exact.
 */
export function scaleAmountProduct(
  a: string,
  b: string,
  decimals: number,
): bigint {
  const product = Number(a) * Number(b)
  if (!Number.isFinite(product) || product <= 0) return 0n
  return scaleAmount(product.toFixed(Math.min(decimals, 18)), decimals)
}
