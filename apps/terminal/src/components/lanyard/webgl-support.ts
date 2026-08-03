// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// ── Capability gate for the /sign-in 3D surfaces ────────────────────────────
//
// `/sign-in` is the ONLY route in the terminal that mounts react-three-fiber:
// the dithered backdrop (postprocessing EffectComposer, full-screen fbm shader)
// and the lanyard badge (three.js scene + drei `Environment` PMREM + rapier
// physics compiled to WebAssembly) — two live WebGL2 contexts side by side.
// The sign-in DIALOG variant mounts neither, and it never crashed.
//
// On the Tauri desktop builds (WKWebView on macOS, WebView2 on Windows) that
// page reliably took the whole webview to a white surface a moment after load.
// White is the tell: the app paints `bg-background` on <body> and the native
// window is built with an opaque dark background_color, so a JS-level fatal
// error (React unmounting the root) would leave a DARK page, never a white one.
// A white surface means the web content process itself went away — a GPU /
// renderer crash, which no React error boundary can intercept and which never
// reaches PostHog's exception capture (and indeed nothing was ever captured).
//
// So the gate below is deliberately conservative: the 3D surfaces render in a
// real browser (dev/testing builds) and are replaced by static, GPU-free
// fallbacks inside the desktop webview. Sign-in must never be the reason
// someone can't get into the app.
//
// Escape hatch for verifying a future webview/driver fix on a real desktop
// build without cutting a new release — and, on a crashing machine, for
// bisecting which of the two surfaces is the one that takes the webview down:
//   localStorage.setItem('pairlens:signin-3d', 'on')       // both surfaces
//   localStorage.setItem('pairlens:signin-3d', 'dither')   // backdrop only
//   localStorage.setItem('pairlens:signin-3d', 'lanyard')  // badge only
//   localStorage.setItem('pairlens:signin-3d', 'off')      // neither
//   localStorage.removeItem('pairlens:signin-3d')          // back to default

import { isTauriRuntime } from '@pairlens/market-engine/platform'

export type SignIn3dSurface = 'dither' | 'lanyard'

const OVERRIDE_KEY = 'pairlens:signin-3d'
const OVERRIDES = ['on', 'off', 'dither', 'lanyard'] as const

type Override = (typeof OVERRIDES)[number]

function readOverride(): Override | null {
  try {
    const raw = localStorage.getItem(OVERRIDE_KEY) as Override | null
    return raw && OVERRIDES.includes(raw) ? raw : null
  } catch {
    return null
  }
}

let webgl2Probe: boolean | null = null

/**
 * True when this runtime can actually create a WebGL2 context. The probe
 * context is released immediately (contexts are a scarce per-document
 * resource) and the answer is cached — creating one is not free.
 */
export function hasWebgl2(): boolean {
  if (webgl2Probe !== null) return webgl2Probe
  if (typeof document === 'undefined') return false
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2')
    if (gl) gl.getExtension('WEBGL_lose_context')?.loseContext()
    webgl2Probe = Boolean(gl)
  } catch {
    webgl2Probe = false
  }
  return webgl2Probe
}

/** True when WebAssembly can be used — rapier's physics core is a wasm module. */
export function hasWebAssembly(): boolean {
  return (
    typeof WebAssembly === 'object' &&
    typeof WebAssembly.instantiate === 'function'
  )
}

/**
 * Whether the sign-in page may mount its react-three-fiber surfaces.
 * Call from an effect, never during render — it touches `document` and
 * `localStorage`, and the server must always render the static fallback.
 */
export function canRenderSignIn3d(surface: SignIn3dSurface): boolean {
  if (typeof window === 'undefined') return false
  const override = readOverride()
  if (override === 'off') return false
  if (!hasWebgl2() || !hasWebAssembly()) return false
  if (override) return override === 'on' || override === surface
  // Desktop webviews crash the renderer on this page — static fallback only.
  return !isTauriRuntime()
}
