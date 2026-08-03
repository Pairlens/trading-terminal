// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// Brand duotone treatment: a smooth gradient map onto the ACTIVE THEME's
// palette with vivid rainbow accents, rendered in a Canvas-2D pass at load
// and re-rendered when the theme changes.
//
// The ink ramp is derived from the CSS variables in scope at the canvas
// element (--background → --foreground, mid-tones cast toward --primary), so
// the artwork always sits on the page's own ground: gallery-dark inside a
// `dark`-scoped panel, paper-toned in light mode, and recolored live by
// theme:override plugins.
//
// Deliberately boring technology — no WebGL, no animation loop, no WASM — so
// it can never take down a desktop webview renderer the way live GL contexts
// can. If the pass throws, the untreated image renders instead. Used by the
// sign-in statue scene and the onboarding welcome hero.

import { useEffect, useRef, useState } from 'react'

import { cn } from '@pairlens/ui/lib/utils'

// Cap on the longest processed edge — keeps the one-shot pass cheap.
const MAX_RENDER_SIZE = 1600

type Rgb = [number, number, number]

// Ramp construction: five stops between background and foreground, with the
// mid-tones tinted toward the primary. STOP_T are the gray positions and
// TINT_W how strongly each pulls toward --primary — calibrated so the stock
// dark theme reproduces the original iris-cast graphite/slate/lavender ramp.
// TINT_W[0] stays 0 so near-ground pixels that survive the alpha key still
// land on an untinted darkest stop.
const STOP_T = [0, 0.18, 0.42, 0.7, 0.96]
const TINT_W = [0, 0.2, 0.24, 0.16, 0.05]

// The artwork's ground is pure black. Keying it to transparent is what lets
// the statue float frameless on ANY page ground, in both value directions —
// but dark pixels also exist INSIDE the artwork (lens glass, frame cores),
// and keying those punches light-mode holes. So only dark pixels flood-fill
// connected to the image border (the actual ground) are keyed; enclosed dark
// pixels stay opaque.
const KEY_LUM_IN = 0.012
const KEY_LUM_OUT = 0.05

// Chromatic pixels (the statues' lenses and their rainbow spill) pull toward
// flat vivid inks by hue bucket — the one place the duotone gets color.
// prettier-ignore
const VIVID_INKS: Array<Rgb> = [
  [255, 82, 82],    // red
  [255, 176, 46],   // orange
  [255, 224, 79],   // yellow
  [88, 214, 116],   // green
  [72, 169, 245],   // blue
  [151, 105, 245],  // violet
]

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ]
}

/** Resolve any CSS color (oklch, hsl, hex, var-resolved) to 0-255 rgb. */
function resolveCssColor(css: string): Rgb | null {
  const probe = document.createElement('canvas')
  probe.width = probe.height = 1
  const ctx = probe.getContext('2d')
  if (!ctx || !css) return null
  ctx.fillStyle = '#f0f'
  ctx.fillStyle = css
  ctx.fillRect(0, 0, 1, 1)
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
  return [r, g, b]
}

function luminance([r, g, b]: Rgb): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
}

/**
 * Read the theme in scope at `el` and build the ink ramp. Reading from the
 * element (not the root) is what makes `dark`-scoped panels resolve their
 * dark palette even when the app is in light mode.
 *
 * The ramp always runs darkest → lightest theme color by VALUE, so the
 * statue keeps its real lighting in light mode (shadows in ink, highlights
 * in paper) instead of rendering as a negative. The artwork's black ground
 * is alpha-keyed out in renderDuotone, so it never depends on stop 0.
 */
function readThemeRamp(el: Element): Array<Rgb> {
  const styles = getComputedStyle(el)
  const pick = (name: string, fallback: Rgb): Rgb =>
    resolveCssColor(styles.getPropertyValue(name).trim()) ?? fallback
  const background = pick('--background', [10, 8, 6])
  const foreground = pick('--foreground', [243, 242, 250])
  const primary = pick('--primary', [139, 140, 245])
  const [darkest, lightest] =
    luminance(background) <= luminance(foreground)
      ? [background, foreground]
      : [foreground, background]
  return STOP_T.map((t, i) =>
    mix(mix(darkest, lightest, t), primary, TINT_W[i]),
  )
}

// Mild S-curve so shadows sink into the ground and highlights keep sheen.
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

function rampColor(ramp: Array<Rgb>, lum: number): Rgb {
  const pos = Math.min(1, Math.max(0, lum)) * (ramp.length - 1)
  const lo = Math.floor(pos)
  const hi = Math.min(ramp.length - 1, lo + 1)
  return mix(ramp[lo], ramp[hi], pos - lo)
}

export function renderDuotone(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
  ramp: Array<Rgb>,
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
  // Raw source luminance per pixel, kept for the ground key after the color
  // pass overwrites the buffer.
  const lum255 = new Uint8ClampedArray(width * height)
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

      const rawLum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
      lum255[y * width + x] = rawLum * 255
      const lum = shape(rawLum)
      const base = rampColor(ramp, lum + grain(x, y) * 0.015)

      // The statues' own chroma is exclusively warm (orange range), so warm
      // hues need high saturation to read as rainbow, while cool hues — the
      // lens colors and their spill — blend in at moderate saturation. The
      // smoothstep mix keeps the rainbow's edges soft instead of stamped.
      const isWarmHue = hue >= 15 && hue < 70
      const vivid =
        max > 50
          ? isWarmHue
            ? smoothstep(0.55, 0.8, saturation)
            : smoothstep(0.18, 0.45, saturation)
          : 0

      let out = base
      if (vivid > 0) {
        const ink =
          hue < 25 || hue >= 330
            ? VIVID_INKS[0]
            : VIVID_INKS[
                hue < 50 ? 1 : hue < 75 ? 2 : hue < 165 ? 3 : hue < 255 ? 4 : 5
              ]
        // Vivid inks carry the source brightness so glass keeps its depth.
        const lift = 0.45 + 0.55 * lum
        out = mix(base, [ink[0] * lift, ink[1] * lift, ink[2] * lift], vivid)
      }
      px[i] = out[0]
      px[i + 1] = out[1]
      px[i + 2] = out[2]
    }
  }
  keyGround(px, lum255, width, height)
  ctx.putImageData(frame, 0, 0)
}

/**
 * Fade the artwork's ground to transparent: flood-fill the below-threshold
 * region from the image borders and alpha-key only what it reaches. Dark
 * pixels enclosed by the artwork (lens glass, frame cores) never key, so
 * light grounds can't bleed through them.
 */
function keyGround(
  px: Uint8ClampedArray,
  lum255: Uint8ClampedArray,
  width: number,
  height: number,
): void {
  const keyMax = KEY_LUM_OUT * 255
  const visited = new Uint8Array(width * height)
  const queue = new Int32Array(width * height)
  let head = 0
  let tail = 0
  const push = (idx: number) => {
    if (!visited[idx] && lum255[idx] < keyMax) {
      visited[idx] = 1
      queue[tail++] = idx
    }
  }
  for (let x = 0; x < width; x++) {
    push(x)
    push((height - 1) * width + x)
  }
  for (let y = 0; y < height; y++) {
    push(y * width)
    push(y * width + width - 1)
  }
  while (head < tail) {
    const idx = queue[head++]
    const x = idx % width
    if (x > 0) push(idx - 1)
    if (x < width - 1) push(idx + 1)
    if (idx >= width) push(idx - width)
    if (idx < (height - 1) * width) push(idx + width)
  }
  for (let idx = 0; idx < visited.length; idx++) {
    if (visited[idx]) {
      px[idx * 4 + 3] = Math.round(
        255 * smoothstep(KEY_LUM_IN, KEY_LUM_OUT, lum255[idx] / 255),
      )
    }
  }
}

/**
 * An image with the brand duotone treatment applied at load and re-applied
 * on theme changes. Behaves like an `<img>`: size and crop from the parent
 * via className (object-cover etc. apply to canvases). Falls back to the
 * untreated image on any failure.
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
    let scheduled: ReturnType<typeof setTimeout> | undefined
    let loaded: HTMLImageElement | null = null

    const render = () => {
      if (cancelled || !loaded) return
      try {
        renderDuotone(canvas, loaded, readThemeRamp(canvas))
      } catch {
        setFailed(true)
      }
    }

    const image = new Image()
    image.decoding = 'async'
    image.src = src
    image
      .decode()
      .then(() => {
        loaded = image
        render()
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })

    // Re-render when the theme changes: color-mode flips toggle classes on
    // <html>, theme plugins swap a <style> tag in <head>. Debounced — the
    // pass is one-shot but not free.
    const schedule = () => {
      clearTimeout(scheduled)
      scheduled = setTimeout(render, 120)
    }
    const observer = new MutationObserver(schedule)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'style', 'data-theme'],
    })
    observer.observe(document.head, { childList: true })

    return () => {
      cancelled = true
      clearTimeout(scheduled)
      observer.disconnect()
    }
  }, [src])

  const classes = cn('h-full w-full select-none object-cover', className)

  if (failed) {
    return <img src={src} alt="" aria-hidden className={classes} />
  }
  return <canvas ref={canvasRef} aria-hidden className={classes} />
}
