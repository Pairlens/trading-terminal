// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
declare module '*.png'

/**
 * App version injected by the terminal's vite config from
 * apps/desktop/src-tauri/tauri.conf.json. Undefined outside vite (bun test),
 * so read it through `@/lib/app-version`, never directly.
 */
declare const __APP_VERSION__: string

/**
 * Identity of this exact build, injected by the terminal's vite config and
 * republished in /version.json. Distinct per build, so a redeploy that ships
 * new chunk hashes under an unchanged release number is still detectable —
 * read it through `@/lib/app-version`, never directly.
 */
declare const __APP_BUILD_ID__: string

interface WindowEventMap {
  /**
   * Vite dispatches this when preloading a lazy chunk's dependencies fails,
   * and rethrows unless the (cancelable) event is prevented. See
   * `@/lib/lazy-chunk`.
   */
  'vite:preloadError': Event & { payload?: unknown }
}

interface ImportMetaEnv {
  /** PostHog project key — opt-in analytics is fully disabled when unset. */
  readonly VITE_POSTHOG_KEY?: string
  /** PostHog ingest host, defaults to https://us.i.posthog.com. */
  readonly VITE_POSTHOG_HOST?: string
}

declare module 'meshline' {
  export const MeshLineGeometry: any
  export const MeshLineMaterial: any
}

// R3F extend() registers these as JSX intrinsic elements at runtime.
declare namespace React.JSX {
  interface IntrinsicElements {
    meshLineGeometry: any
    meshLineMaterial: any
  }
}
