// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// ── Sign-in left-panel visuals, with a floor under them ─────────────────────
//
// Both WebGL surfaces on /sign-in (the dithered backdrop and the lanyard
// badge) render through `WebglSurface`, which layers four independent
// protections so the sign-in page can never be the thing that breaks:
//
//  1. Capability gate — nothing 3D mounts until an effect confirms WebGL2 +
//     WebAssembly are usable, and that this isn't a desktop webview (see
//     webgl-support.ts for why). Server render and first client paint always
//     show the static fallback.
//  2. Error boundary — a throw while loading the lazy chunk, initialising
//     rapier's wasm, compiling a shader, or rendering the scene swaps in the
//     static fallback instead of unmounting the React root.
//  3. Context-loss watch — a `webglcontextlost` event (captured on the host
//     element; the event does not bubble) retires the surface permanently for
//     this page view rather than leaving a dead black canvas.
//  4. Reporting — every failure goes to console and to PostHog (a no-op
//     without analytics consent), so the next occurrence is visible.

import {
  Component,
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { isTauriRuntime } from '@pairlens/market-engine/platform'

import { canRenderSignIn3d } from './webgl-support'
import type { ErrorInfo, ReactNode } from 'react'
import { track } from '@/lib/analytics-events'

const Dither = lazy(() => import('@/components/dither'))
const Lanyard = lazy(() => import('@/components/lanyard/lanyard'))

type SurfaceName = 'dither' | 'lanyard'

function reportSurfaceFailure(
  surface: SurfaceName,
  reason: string,
  detail?: string,
): void {
  console.error(
    `[sign-in] ${surface} surface disabled (${reason})`,
    detail ?? '',
  )
  track('signin_webgl_surface_failed', {
    surface,
    reason,
    detail: detail?.slice(0, 200),
    platform: isTauriRuntime() ? 'desktop' : 'web',
  })
}

// ── Error boundary ──────────────────────────────────────────────────────────

type BoundaryProps = {
  onError: (error: Error, info: ErrorInfo) => void
  children: ReactNode
}

class SurfaceErrorBoundary extends Component<
  BoundaryProps,
  { failed: boolean }
> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.props.onError(error, info)
  }

  render() {
    // The parent swaps in the static fallback on the same commit; render
    // nothing in the meantime rather than retrying the broken subtree.
    return this.state.failed ? null : this.props.children
  }
}

// ── Guarded surface host ────────────────────────────────────────────────────

function WebglSurface({
  surface,
  fallback,
  children,
}: {
  surface: SurfaceName
  fallback: ReactNode
  children: ReactNode
}) {
  // Starts off: SSR and the first client paint show the static fallback, and
  // the capability probe runs in an effect (it touches document/localStorage).
  const [enabled, setEnabled] = useState(false)
  const retiredRef = useRef(false)
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (retiredRef.current) return
    if (canRenderSignIn3d(surface)) setEnabled(true)
  }, [surface])

  const retire = useCallback(
    (reason: string, detail?: string) => {
      if (retiredRef.current) return
      retiredRef.current = true
      setEnabled(false)
      reportSurfaceFailure(surface, reason, detail)
    },
    [surface],
  )

  // `webglcontextlost` targets the canvas and does not bubble — a capture-phase
  // listener on the host still sees it on the way down.
  useEffect(() => {
    const host = hostRef.current
    if (!host || !enabled) return
    const onLost = () => retire('context-lost')
    host.addEventListener('webglcontextlost', onLost, true)
    return () => host.removeEventListener('webglcontextlost', onLost, true)
  }, [enabled, retire])

  return (
    <div ref={hostRef} className="h-full w-full">
      {enabled ? (
        <SurfaceErrorBoundary
          onError={(error) => retire('render-error', error.message)}
        >
          <Suspense fallback={null}>{children}</Suspense>
        </SurfaceErrorBoundary>
      ) : (
        fallback
      )}
    </div>
  )
}

// ── Public surfaces ─────────────────────────────────────────────────────────

/** Animated dithered wash behind the sign-in panel, or a static gradient. */
export function SignInBackdrop({
  waveColor,
}: {
  waveColor: [number, number, number]
}) {
  return (
    <WebglSurface surface="dither" fallback={<StaticBackdrop />}>
      <Dither
        waveColor={waveColor}
        disableAnimation={false}
        enableMouseInteraction={true}
        mouseRadius={0.3}
        colorNum={3}
        pixelSize={1}
        waveAmplitude={0.3}
        waveFrequency={5}
        waveSpeed={0.04}
      />
    </WebglSurface>
  )
}

/** Physics-driven lanyard badge, or a static access-pass card. */
export function SignInBadge() {
  return (
    <WebglSurface surface="lanyard" fallback={<StaticBadge />}>
      <Lanyard position={[0, 0, 24]} gravity={[0, -40, 0]} />
    </WebglSurface>
  )
}

// ── Static fallbacks ────────────────────────────────────────────────────────

/**
 * Same read as the dither shader — a primary-tinted wash under a fine dot
 * grid — built from CSS gradients alone. No canvas, no GPU program.
 */
function StaticBackdrop() {
  return (
    <div
      aria-hidden
      className="h-full w-full"
      style={{
        backgroundImage: [
          'radial-gradient(120% 90% at 18% 12%, color-mix(in oklab, var(--primary) 55%, transparent) 0%, transparent 62%)',
          'radial-gradient(95% 75% at 88% 82%, color-mix(in oklab, var(--primary) 34%, transparent) 0%, transparent 66%)',
          'radial-gradient(70% 60% at 50% 50%, color-mix(in oklab, var(--primary) 18%, transparent) 0%, transparent 70%)',
          'radial-gradient(circle at center, color-mix(in oklab, var(--foreground) 22%, transparent) 0.5px, transparent 0.7px)',
        ].join(', '),
        backgroundSize: 'auto, auto, auto, 3px 3px',
      }}
    />
  )
}

/**
 * The lanyard badge as a flat card: strap, clip, access pass. Intentionally
 * motionless — this is what renders inside the desktop webview, where an
 * always-running transform animation is its own class of rendering trouble.
 */
function StaticBadge() {
  return (
    <div
      aria-hidden
      // The 3D badge hangs from the top of the panel and the benefits card
      // owns the bottom — the bottom padding parks this one in the same band.
      className="flex h-full w-full items-center justify-center overflow-hidden pb-[30%]"
    >
      <div className="flex flex-col items-center [transform:rotate(-3deg)]">
        {/* Strap — two runs opening upward out of the clip. */}
        <div className="relative h-24 w-28">
          <span className="absolute bottom-0 left-1/2 h-24 w-[3px] origin-bottom rounded-full bg-gradient-to-b from-sidebar-foreground/5 to-sidebar-foreground/35 [transform:translateX(-50%)_rotate(15deg)]" />
          <span className="absolute bottom-0 left-1/2 h-24 w-[3px] origin-bottom rounded-full bg-gradient-to-b from-sidebar-foreground/5 to-sidebar-foreground/35 [transform:translateX(-50%)_rotate(-15deg)]" />
        </div>

        {/* Clip */}
        <div className="-mt-px h-3.5 w-6 rounded-[4px] border border-sidebar-foreground/25 bg-sidebar-foreground/10" />

        {/* Card */}
        <div className="mt-1.5 flex h-[228px] w-[164px] flex-col justify-between rounded-2xl border border-sidebar-foreground/15 bg-gradient-to-br from-sidebar-foreground/14 via-sidebar-foreground/8 to-sidebar-foreground/4 p-4 shadow-[0_30px_70px_-35px_rgba(0,0,0,.85)]">
          <div className="flex flex-col items-center gap-4">
            <span className="h-1.5 w-9 rounded-full bg-sidebar-foreground/25" />
            <span className="size-10 rounded-xl bg-gradient-to-br from-primary/85 to-primary/25 shadow-[0_10px_24px_-12px_var(--primary)]" />
          </div>

          <div className="space-y-1.5">
            <p className="font-serif text-base font-semibold leading-none text-sidebar-foreground">
              Pairlens
            </p>
            <p className="font-mono text-[9.5px] uppercase tracking-[0.2em] text-sidebar-foreground/55">
              Access pass
            </p>
            <span className="block h-px w-full bg-sidebar-foreground/15" />
            <span className="block h-1 w-2/3 rounded-full bg-sidebar-foreground/12" />
            <span className="block h-1 w-1/2 rounded-full bg-sidebar-foreground/10" />
          </div>
        </div>
      </div>
    </div>
  )
}
