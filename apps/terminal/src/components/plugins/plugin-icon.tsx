// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useState } from 'react'
import { useTheme } from 'next-themes'
import { Blocks } from 'lucide-react'
import { cn } from '@pairlens/ui'

import { pluginBrand } from './plugin-brand'

type ThemePreviewColors = { light: Array<string>; dark: Array<string> }

/**
 * Poster art for a brand — Apple-TV/album-art treatment. The brand mark
 * itself, blown up, blurred and saturated, becomes the ambient backdrop
 * filling the poster; the crisp logo floats over it. Falls back to the
 * brand-tint monogram tile when the manifest ships no icon or the image
 * fails to load. Renders absolutely-positioned layers — the parent poster
 * must be `relative` + `overflow-hidden`.
 */
export function PluginPosterArt({
  id,
  name,
  src,
  iconSize = 76,
  monoSize = 64,
  scrim = true,
}: {
  id: string
  name: string
  src?: string
  /** Crisp foreground logo edge in px. */
  iconSize?: number
  /** Fallback monogram tile edge in px. */
  monoSize?: number
  /** Bottom gradient that keeps overlaid labels legible (poster cards). */
  scrim?: boolean
}) {
  const [failed, setFailed] = useState(false)
  const brand = pluginBrand(id, name)

  if (src && !failed) {
    return (
      <>
        {/* Ambient backdrop: the mark itself as blurred poster art */}
        <img
          aria-hidden
          src={src}
          onError={() => setFailed(true)}
          className="pointer-events-none absolute inset-0 size-full scale-125 object-cover opacity-60 blur-[34px] saturate-150"
        />
        {/* Bottom scrim keeps badges + action labels legible over the art */}
        {scrim && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/50 to-transparent"
          />
        )}
        <img
          src={src}
          alt={name}
          style={{ width: iconSize, height: iconSize }}
          className="relative rounded-[16px] object-contain drop-shadow-[0_14px_30px_rgb(0_0_0/0.55)]"
        />
      </>
    )
  }

  return (
    <span
      role="img"
      aria-label={name}
      className="relative flex items-center justify-center font-mono font-bold shadow-[0_10px_30px_-8px_rgb(0_0_0/0.6)]"
      style={{
        background: brand.tint,
        color: brand.fg,
        width: monoSize,
        height: monoSize,
        borderRadius: Math.round(monoSize * 0.28),
        fontSize: Math.max(12, Math.round(monoSize * 0.28)),
      }}
    >
      {brand.mono}
    </span>
  )
}

/**
 * Storefront brand tile — the plugin's real icon on a neutral tile so brand
 * marks read at a glance (Binance yellow, OKX black, Groq red, …), falling
 * back to the brand-tint monogram when the manifest ships no icon or the
 * image fails to load. Used by the spotlight hero and product pages; sized
 * via props so favicons never upscale past legibility.
 */
export function PluginBrandTile({
  id,
  name,
  src,
  size = 64,
  iconSize = 40,
  className,
}: {
  id: string
  name: string
  src?: string
  /** Tile edge in px. */
  size?: number
  /** Icon image edge in px (kept modest — most sources are favicons). */
  iconSize?: number
  className?: string
}) {
  const [failed, setFailed] = useState(false)
  const brand = pluginBrand(id, name)
  const radius = Math.round(size * 0.28)

  if (src && !failed) {
    return (
      <span
        className={cn(
          'flex shrink-0 items-center justify-center border border-border/40 bg-background/85 shadow-[0_10px_30px_-8px_rgb(0_0_0/0.6)] backdrop-blur-sm',
          className,
        )}
        style={{ width: size, height: size, borderRadius: radius }}
      >
        <img
          src={src}
          alt={name}
          style={{ width: iconSize, height: iconSize }}
          className="rounded-md object-contain"
          onError={() => setFailed(true)}
        />
      </span>
    )
  }

  return (
    <span
      role="img"
      aria-label={name}
      className={cn(
        'flex shrink-0 items-center justify-center font-mono font-bold shadow-[0_10px_30px_-8px_rgb(0_0_0/0.6)]',
        className,
      )}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: brand.tint,
        color: brand.fg,
        fontSize: Math.max(11, Math.round(size * 0.28)),
      }}
    >
      {brand.mono}
    </span>
  )
}

export function PluginIcon({
  src,
  name,
  themeColors,
  className,
}: {
  src?: string
  name: string
  // Theme plugins ship no image icon but declare a preview palette. Pass
  // `manifest.theme?.previewColors` and, when there's no image, the icon
  // renders that palette as a swatch instead of the generic fallback glyph —
  // so themes are identifiable at a glance and you can read their colors.
  themeColors?: ThemePreviewColors
  className?: string
}) {
  const [failed, setFailed] = useState(false)
  const { resolvedTheme } = useTheme()

  if (src && !failed) {
    return (
      <img
        src={src}
        alt={name}
        className={cn('size-8 rounded-md object-contain', className)}
        onError={() => setFailed(true)}
      />
    )
  }

  const palette = themeColors
    ? (resolvedTheme === 'dark' ? themeColors.dark : themeColors.light).slice(
        0,
        5,
      )
    : []

  if (palette.length > 0) {
    return (
      <div
        role="img"
        aria-label={`${name} theme palette`}
        className={cn(
          'flex size-8 overflow-hidden rounded-md ring-1 ring-inset ring-border/50',
          className,
        )}
      >
        {palette.map((color, i) => (
          <div key={i} className="flex-1" style={{ backgroundColor: color }} />
        ))}
      </div>
    )
  }

  return (
    <div
      className={cn(
        'flex size-8 items-center justify-center rounded-md bg-muted text-muted-foreground',
        className,
      )}
    >
      <Blocks className="size-4" />
    </div>
  )
}
