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

// Internal processing resolution — low enough that the Bayer cells read as
// texture once CSS scales the canvas up with image-rendering: pixelated.
const DITHER_SIZE = 720
// Quantization levels per channel: 5 keeps the marble's tonal range while
// the dither pattern carries the gradients (and the rainbow in the lenses).
const LEVELS = 5

// prettier-ignore
const BAYER_8 = [
  [ 0, 32,  8, 40,  2, 34, 10, 42],
  [48, 16, 56, 24, 50, 18, 58, 26],
  [12, 44,  4, 36, 14, 46,  6, 38],
  [60, 28, 52, 20, 62, 30, 54, 22],
  [ 3, 35, 11, 43,  1, 33,  9, 41],
  [51, 19, 59, 27, 49, 17, 57, 25],
  [15, 47,  7, 39, 13, 45,  5, 37],
  [63, 31, 55, 23, 61, 29, 53, 21],
]

function ditherInto(canvas: HTMLCanvasElement, image: HTMLImageElement): void {
  canvas.width = DITHER_SIZE
  canvas.height = DITHER_SIZE
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('canvas 2d unavailable')
  ctx.drawImage(image, 0, 0, DITHER_SIZE, DITHER_SIZE)
  const frame = ctx.getImageData(0, 0, DITHER_SIZE, DITHER_SIZE)
  const px = frame.data
  const step = LEVELS - 1
  for (let y = 0; y < DITHER_SIZE; y++) {
    const row = BAYER_8[y & 7]
    for (let x = 0; x < DITHER_SIZE; x++) {
      const threshold = (row[x & 7] + 0.5) / 64 - 0.5
      const i = (y * DITHER_SIZE + x) * 4
      for (let c = 0; c < 3; c++) {
        const v = px[i + c] / 255 + threshold / step
        px[i + c] =
          (Math.round(Math.min(1, Math.max(0, v)) * step) / step) * 255
      }
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
        ditherInto(canvas, image)
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
