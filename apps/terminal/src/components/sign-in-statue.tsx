// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// Sign-in hero: the Pairlens statue with a one-shot ordered-dither treatment.
//
// Deliberately boring technology: a single Canvas-2D pass at load — no WebGL,
// no animation loop, no WASM. The previous 3D lanyard + shader backdrop
// mounted two live WebGL2 contexts, which could take down the whole webview
// renderer on desktop (white screen). A static dither cannot crash the
// process, and if anything throws the untreated image renders instead.

import { useEffect, useRef, useState } from 'react'

import { cn } from '@pairlens/ui/lib/utils'

import statueUrl from './sign-in-statue.webp'

// Internal processing resolution — deliberately coarse so the result reads
// as screen-print cells, not as a degraded photo, once CSS scales the canvas
// up with image-rendering: pixelated.
const GRID_SIZE = 288

// The marble is reduced to a fixed warm ink ramp (black ground → graphite →
// stone → bone → paper), Bayer-dithered between adjacent inks. Matches the
// Warm Precision palette rather than the photo's own tones.
// prettier-ignore
const INK_RAMP: Array<[number, number, number]> = [
  [0, 0, 0],        // ground — blends into the panel's black
  [58, 50, 42],     // warm graphite
  [128, 117, 104],  // stone
  [211, 199, 183],  // bone
  [246, 240, 230],  // paper
]

// Saturated pixels (the lenses and the rainbow spill) snap to flat vivid
// inks by hue bucket — the one place the poster gets color.
// prettier-ignore
const VIVID_INKS: Array<[number, number, number]> = [
  [255, 82, 82],    // red
  [255, 176, 46],   // orange
  [255, 224, 79],   // yellow
  [88, 214, 116],   // green
  [72, 169, 245],   // blue
  [151, 105, 245],  // violet
]

// prettier-ignore
const BAYER_4 = [
  [ 0,  8,  2, 10],
  [12,  4, 14,  6],
  [ 3, 11,  1,  9],
  [15,  7, 13,  5],
]

function renderPoster(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
): void {
  canvas.width = GRID_SIZE
  canvas.height = GRID_SIZE
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('canvas 2d unavailable')
  ctx.drawImage(image, 0, 0, GRID_SIZE, GRID_SIZE)
  const frame = ctx.getImageData(0, 0, GRID_SIZE, GRID_SIZE)
  const px = frame.data
  const rampMax = INK_RAMP.length - 1
  for (let y = 0; y < GRID_SIZE; y++) {
    const row = BAYER_4[y & 3]
    for (let x = 0; x < GRID_SIZE; x++) {
      const i = (y * GRID_SIZE + x) * 4
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
      // The marble's own chroma is exclusively warm (orange range), so warm
      // hues need high saturation to count as rainbow, while cool hues — the
      // lens colors and their spill — go vivid at moderate saturation.
      const isWarmHue = hue >= 15 && hue < 70
      const isVivid =
        max > 60 && (isWarmHue ? saturation > 0.52 : saturation > 0.24)

      let ink: [number, number, number]
      if (isVivid) {
        // Vivid path: bucket the hue into one of the flat inks.
        ink =
          hue < 25 || hue >= 330
            ? VIVID_INKS[0]
            : VIVID_INKS[
                hue < 50 ? 1 : hue < 75 ? 2 : hue < 165 ? 3 : hue < 255 ? 4 : 5
              ]
      } else {
        // Marble path: luminance dithered between adjacent ramp inks.
        const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
        const threshold = (row[x & 3] + 0.5) / 16 - 0.5
        const level = Math.round(
          Math.min(rampMax, Math.max(0, lum * rampMax + threshold)),
        )
        ink = INK_RAMP[level]
      }
      px[i] = ink[0]
      px[i + 1] = ink[1]
      px[i + 2] = ink[2]
    }
  }
  ctx.putImageData(frame, 0, 0)
}

/**
 * Dithered statue visual. The canvas behaves like an `<img>`: size and crop
 * it from the parent via className (object-cover etc. apply to canvases).
 */
export function SignInStatue({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let cancelled = false
    const image = new Image()
    image.decoding = 'async'
    image.src = statueUrl
    image
      .decode()
      .then(() => {
        if (cancelled) return
        renderPoster(canvas, image)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const classes = cn(
    'h-full w-full select-none object-cover object-[50%_20%]',
    className,
  )

  if (failed) {
    return <img src={statueUrl} alt="" aria-hidden className={classes} />
  }
  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={cn(classes, '[image-rendering:pixelated]')}
    />
  )
}
