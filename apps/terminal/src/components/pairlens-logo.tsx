// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import type { ImgHTMLAttributes } from 'react'

/**
 * Pairlens terminal logo from /public/logo.svg.
 * Uses CSS filter to adapt to the current theme — slightly dimmed in dark
 * mode, darkened in light mode so it blends with the titlebar.
 */
export function PairlensLogo(props: ImgHTMLAttributes<HTMLImageElement>) {
  return <img src="/logo.svg" alt="Pairlens" draggable={false} {...props} />
}
