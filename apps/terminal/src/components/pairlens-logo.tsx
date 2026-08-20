// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import type { ImgHTMLAttributes } from 'react'

/**
 * The Pairlens wordmark from /public/wordmark.webp (3264x630, transparent).
 * White letters with a black outline and a spectrum underline, so it reads
 * on dark and light surfaces alike without a theme swap.
 */
export function PairlensLogo(props: ImgHTMLAttributes<HTMLImageElement>) {
  return (
    <img src="/wordmark.webp" alt="Pairlens" draggable={false} {...props} />
  )
}
