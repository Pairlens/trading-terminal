// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// Brand duotone treatment: a smooth iris gradient map with vivid rainbow
// accents, rendered in a single Canvas-2D pass at load.
//
// Deliberately boring technology — no WebGL, no animation loop, no WASM — so
// it can never take down a desktop webview renderer the way live GL contexts
// can. If the pass throws, the untreated image renders instead. Used by the
// sign-in statue scene and the onboarding welcome hero.

import { useEffect, useRef, useState } from 'react'

import { cn } from '@pairlens/ui/lib/utils'

// Cap on the longest processed edge — the treatment is a smooth gradient
// map, so this is about keeping the one-shot pass cheap, not about style.
const MAX_RENDER_SIZE = 1600

// Luminance is gradient-mapped onto this ramp (black ground → iris-cast
// graphite → slate → lavender-gray → cool paper), interpolating smoothly
// between stops. Cool, slightly iris-tinted neutrals so treated artwork sits
// in the same palette as the product's dark ground and iris accents.
// prettier-ignore
const INK_RAMP: Array<[number, number, number]> = [
  [0, 0, 0],        // ground — blends into gallery-black panels
  [50, 47, 62],     // iris-cast graphite
  [115, 111, 138],  // slate
  [186, 182, 207],  // lavender-gray
  [243, 242, 250],  // cool paper
]

// Chromatic pixels (the statue's lenses and their rainbow spill) pull toward
// flat vivid inks by hue bucket — the one place the duotone gets color.
// prettier-ignore
const VIVID_INKS: Array<[number, number, number]> = [
  [255, 82, 82],    // red
  [255, 176, 46],   // orange
  [255, 224, 79],   // yellow
  [88, 214, 116],   // green
  [72, 169, 245],   // blue
  [151, 105, 245],  // violet
]

// Mild S-curve so shadows sink into the black ground and highlights keep
// their sheen.
function shape(lum: number): number {
  const s = lum * lum * (3 - 2 * lum)
  return (lum + s) / 2
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

/** Deterministic per-pixel hash in [-1, 1] for a whisper of film grain. */
function grain(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0
  h = (h ^ (h >> 13)) * 1274126177
  return (((h ^ (h >> 16)) & 0xff) / 255) * 2 - 1
}

function rampColor(lum: number): [number, number, number] {
  const pos = Math.min(1, Math.max(0, lum)) * (INK_RAMP.length - 1)
  const lo = Math.floor(pos)
  const hi = Math.min(INK_RAMP.length - 1, lo + 1)
  const t = pos - lo
  const a = INK_RAMP[lo]
  const b = INK_RAMP[hi]
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ]
}

export function renderDuotone(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
): void {
  const scale = Math.min(
    1,
    MAX_RENDER_SIZE / Math.max(image.naturalWidth, image.naturalHeight),
  )
  const width = Math.round(image.naturalWidth * scale)
  const height = Math.round(image.naturalHeight * scale)
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('canvas 2d unavailable')
  ctx.drawImage(image, 0, 0, width, height)
  const frame = ctx.getImageData(0, 0, width, height)
  const px = frame.data
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const r = px[i]
      const g = px[i + 1]
      const b = px[i + 2]
      const max = Math.max(r, g, b)
      const min = Math.min(r, g, b)
      const saturation = max === 0 ? 0 : (max - min) / max

      const delta = max - min
      let hue = 0
      if (delta > 0) {
        if (max === r) hue = ((g - b) / delta + 6) % 6
        else if (max === g) hue = (b - r) / delta + 2
        else hue = (r - g) / delta + 4
        hue *= 60
      }

      const lum = shape((0.2126 * r + 0.7152 * g + 0.0722 * b) / 255)
      const base = rampColor(lum + grain(x, y) * 0.015)

      // The statues' own chroma is exclusively warm (orange range), so warm
      // hues need high saturation to read as rainbow, while cool hues — the
      // lens colors and their spill — blend in at moderate saturation. The
      // smoothstep mix keeps the rainbow's edges soft instead of stamped.
      const isWarmHue = hue >= 15 && hue < 70
      const mix =
        max > 50
          ? isWarmHue
            ? smoothstep(0.55, 0.8, saturation)
            : smoothstep(0.18, 0.45, saturation)
          : 0

      let out = base
      if (mix > 0) {
        const ink =
          hue < 25 || hue >= 330
            ? VIVID_INKS[0]
            : VIVID_INKS[
                hue < 50 ? 1 : hue < 75 ? 2 : hue < 165 ? 3 : hue < 255 ? 4 : 5
              ]
        // Vivid inks carry the source brightness so glass keeps its depth.
        const lift = 0.45 + 0.55 * lum
        out = [
          base[0] + (ink[0] * lift - base[0]) * mix,
          base[1] + (ink[1] * lift - base[1]) * mix,
          base[2] + (ink[2] * lift - base[2]) * mix,
        ]
      }
      px[i] = out[0]
      px[i + 1] = out[1]
      px[i + 2] = out[2]
    }
  }
  ctx.putImageData(frame, 0, 0)
}

/**
 * An image with the brand duotone treatment applied once at load. Behaves
 * like an `<img>`: size and crop from the parent via className (object-cover
 * etc. apply to canvases). Falls back to the untreated image on any failure.
 */
export function DuotoneImage({
  src,
  className,
}: {
  src: string
  className?: string
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let cancelled = false
    const image = new Image()
    image.decoding = 'async'
    image.src = src
    image
      .decode()
      .then(() => {
        if (cancelled) return
        renderDuotone(canvas, image)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [src])

  const classes = cn('h-full w-full select-none object-cover', className)

  if (failed) {
    return <img src={src} alt="" aria-hidden className={classes} />
  }
  return <canvas ref={canvasRef} aria-hidden className={classes} />
}
