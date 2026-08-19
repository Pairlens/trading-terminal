// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import {
  ArrowLeft,
  ArrowRight,
  EyeOff,
  Globe,
  Loader2,
  RefreshCw,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { PaneDesktopOnly } from '@/components/layout/pane-desktop-only'
import { isStandalone } from '@/lib/platform'
import { usePaneContext } from '@/lib/layout/pane-context'
import { useLayout } from '@/lib/layout/context'

function findPaneOverride(
  layout: {
    columns: Array<{
      cells: Array<{
        panes: Array<{ id: string; overrides?: Record<string, unknown> }>
      }>
    }>
  },
  paneId: string,
  slot: string,
): unknown {
  for (const col of layout.columns) {
    for (const cell of col.cells) {
      for (const pane of cell.panes) {
        if (pane.id === paneId) return pane.overrides?.[slot]
      }
    }
  }
  return undefined
}

function normalizeUrl(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) return ''
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

// ── Native Tauri webview ────────────────────────────────────────────

let webviewIdCounter = 0

type TauriWebview = {
  label: string
  setPosition: (pos: unknown) => Promise<void>
  setSize: (size: unknown) => Promise<void>
  setFocus: () => Promise<void>
  hide: () => Promise<void>
  show: () => Promise<void>
  close: () => Promise<void>
  once: (event: string, handler: (e: unknown) => void) => Promise<unknown>
}

// ── Singleton overlay detector ──────────────────────────────────────
// One MutationObserver shared across all WebPane instances.
// Only watches body's direct children (where Base UI portals overlays)
// and uses rAF debounce to avoid excessive querySelector calls.

const OVERLAY_SELECTOR = [
  '[data-slot="dialog-overlay"]',
  '[data-slot="alert-dialog-overlay"]',
  '[data-slot="context-menu-content"]',
  '[data-slot="dropdown-menu-content"]',
  '[data-slot="popover-content"]',
  '[data-slot="select-content"]',
  '[data-slot="command-dialog"]',
  '[data-slot="pane-placement-overlay"]',
  '[data-slot="drag-overlay"]',
].join(', ')

const overlayListeners = new Set<() => void>()
let overlayObserver: MutationObserver | null = null
let overlayRafId: number | null = null
let lastOverlayState = false

function checkOverlay() {
  const next = !!document.querySelector(OVERLAY_SELECTOR)
  if (next !== lastOverlayState) {
    lastOverlayState = next
    for (const cb of overlayListeners) cb()
  }
}

function scheduleCheck() {
  if (overlayRafId !== null) return
  overlayRafId = requestAnimationFrame(() => {
    overlayRafId = null
    checkOverlay()
  })
}

function subscribeOverlay(cb: () => void): () => void {
  overlayListeners.add(cb)
  if (overlayListeners.size === 1 && typeof document !== 'undefined') {
    overlayObserver = new MutationObserver(scheduleCheck)
    // Only watch body's direct children — Base UI portals overlays there.
    // No subtree — avoids firing on every React reconciliation deep in the tree.
    overlayObserver.observe(document.body, { childList: true })
  }
  return () => {
    overlayListeners.delete(cb)
    if (overlayListeners.size === 0) {
      overlayObserver?.disconnect()
      overlayObserver = null
      if (overlayRafId !== null) {
        cancelAnimationFrame(overlayRafId)
        overlayRafId = null
      }
    }
  }
}

function useOverlayVisible(): boolean {
  return useSyncExternalStore(subscribeOverlay, () => lastOverlayState)
}

/**
 * Hook: creates a native Tauri child webview positioned over a container element.
 * The webview tracks the container's position/size via ResizeObserver.
 * Automatically hides when DOM overlays (dialogs, menus) are open.
 */
function useTauriWebview(
  containerRef: React.RefObject<HTMLDivElement | null>,
  url: string,
  shouldHide: boolean,
  onReady: () => void,
  onError: (msg: string) => void,
): { suspended: boolean } {
  const dpiRef = useRef<{
    LogicalPosition: new (x: number, y: number) => unknown
    LogicalSize: new (w: number, h: number) => unknown
  } | null>(null)
  const webviewRef = useRef<TauriWebview | null>(null)

  // Hide/show webview when overlays or placement mode are active
  useEffect(() => {
    const wv = webviewRef.current
    if (!wv) return
    if (shouldHide) {
      wv.hide().catch(() => {})
    } else {
      wv.show().catch(() => {})
      wv.setFocus().catch(() => {})
    }
  }, [shouldHide])

  useEffect(() => {
    if (!isStandalone || !url || !containerRef.current) return

    const container = containerRef.current
    const label = `webpane-${++webviewIdCounter}`
    let destroyed = false
    let ro: ResizeObserver | null = null
    let scrollCleanup: (() => void) | null = null

    const syncPosition = () => {
      const wv = webviewRef.current
      if (!wv || destroyed || !dpiRef.current) return
      const r = container.getBoundingClientRect()
      const { LogicalPosition, LogicalSize } = dpiRef.current
      wv.setPosition(new LogicalPosition(r.left, r.top)).catch(() => {})
      wv.setSize(new LogicalSize(r.width, r.height)).catch(() => {})
    }

    const setup = async () => {
      try {
        const [{ getCurrentWindow }, { Webview }, dpi] = await Promise.all([
          import('@tauri-apps/api/window'),
          import('@tauri-apps/api/webview'),
          import('@tauri-apps/api/dpi'),
        ])
        dpiRef.current = dpi

        if (destroyed) return

        const rect = container.getBoundingClientRect()
        const appWindow = getCurrentWindow()

        const webview = new Webview(appWindow, label, {
          url,
          x: rect.left,
          y: rect.top,
          width: rect.width,
          height: rect.height,
          focus: true,
          acceptFirstMouse: true,
        }) as unknown as TauriWebview

        if (destroyed) {
          webview.close().catch(() => {})
          return
        }

        webviewRef.current = webview

        webview.once('tauri://created', () => {
          if (destroyed) return
          webview.setFocus().catch(() => {})
          onReady()
        })

        webview.once('tauri://error', (e: unknown) => {
          if (destroyed) return
          const msg =
            e && typeof e === 'object' && 'payload' in e
              ? String((e as { payload: unknown }).payload)
              : 'Webview creation failed'
          console.warn('[web-pane] Tauri webview error:', msg)
          onError(msg)
        })

        ro = new ResizeObserver(syncPosition)
        ro.observe(container)

        const handleScroll = () => syncPosition()
        window.addEventListener('scroll', handleScroll, true)
        scrollCleanup = () =>
          window.removeEventListener('scroll', handleScroll, true)
      } catch (err) {
        if (!destroyed) {
          const msg = err instanceof Error ? err.message : 'Unknown error'
          console.warn('[web-pane] Failed to create native webview:', msg)
          onError(msg)
        }
      }
    }

    void setup()

    return () => {
      destroyed = true
      ro?.disconnect()
      scrollCleanup?.()
      const wv = webviewRef.current
      if (wv) {
        wv.close().catch(() => {})
        webviewRef.current = null
      }
    }
  }, [url, containerRef, onReady, onError])

  return { suspended: shouldHide && webviewRef.current !== null }
}

// ── Component ───────────────────────────────────────────────────────

/**
 * Desktop only. Embedding a site means a native Tauri child webview positioned
 * over this pane; a browser tab has only an iframe, and the sites people
 * actually put here (exchanges, TradingView, X) all send X-Frame-Options or a
 * frame-ancestors CSP, so the browser version was an address bar in front of a
 * blank box. The pane declares `requiresDesktop` in the pairlens-core manifest,
 * which is what badges and disables it in the picker; this branch is what a
 * layout that already contains one renders in a browser.
 */
export function WebPane() {
  if (!isStandalone) {
    return (
      <PaneDesktopOnly
        titleKey="webPane.desktopOnlyTitle"
        descriptionKey="webPane.desktopOnlyDescription"
      />
    )
  }
  return <WebPaneNative />
}

function WebPaneNative() {
  const { t } = useTranslation()
  const { paneId, setPaneOverride } = usePaneContext()
  const { layout, pendingAddPaneType } = useLayout()

  const persistedUrl = useMemo(
    () => (findPaneOverride(layout, paneId, 'url') as string) ?? '',
    [layout, paneId],
  )

  const [inputValue, setInputValue] = useState(persistedUrl)
  const [loadedUrl, setLoadedUrl] = useState(persistedUrl)
  const [status, setStatus] = useState<'idle' | 'loading' | 'loaded' | 'error'>(
    'idle',
  )
  const [errorMsg, setErrorMsg] = useState('')
  const [historyStack, setHistoryStack] = useState<Array<string>>(
    persistedUrl ? [persistedUrl] : [],
  )
  const [historyIndex, setHistoryIndex] = useState(persistedUrl ? 0 : -1)
  const inputRef = useRef<HTMLInputElement>(null)
  const nativeContainerRef = useRef<HTMLDivElement>(null)

  const onWebviewReady = useCallback(() => setStatus('loaded'), [])
  const onWebviewError = useCallback((msg: string) => {
    setErrorMsg(msg)
    setStatus('error')
  }, [])

  const overlayVisible = useOverlayVisible()
  const shouldHideWebview = overlayVisible || !!pendingAddPaneType

  const { suspended } = useTauriWebview(
    nativeContainerRef,
    loadedUrl,
    shouldHideWebview,
    onWebviewReady,
    onWebviewError,
  )

  useEffect(() => {
    if (!loadedUrl && persistedUrl) {
      setInputValue(persistedUrl)
      setLoadedUrl(persistedUrl)
      setStatus('loading')
    }
  }, [persistedUrl, loadedUrl])

  const navigate = useCallback(
    (raw: string) => {
      const url = normalizeUrl(raw)
      if (!url) return
      setLoadedUrl(url)
      setInputValue(url)
      setStatus('loading')
      setErrorMsg('')
      setPaneOverride('url', url)
      // Push to history, truncating any forward entries
      setHistoryStack((prev) => [...prev.slice(0, historyIndex + 1), url])
      setHistoryIndex((i) => i + 1)
    },
    [setPaneOverride, historyIndex],
  )

  const canGoBack = historyIndex > 0
  const canGoForward = historyIndex < historyStack.length - 1

  const handleBack = useCallback(() => {
    if (!canGoBack) return
    const prev = historyStack[historyIndex - 1]
    setHistoryIndex((i) => i - 1)
    setLoadedUrl(prev)
    setInputValue(prev)
    setStatus('loading')
    setPaneOverride('url', prev)
  }, [canGoBack, historyStack, historyIndex, setPaneOverride])

  const handleForward = useCallback(() => {
    if (!canGoForward) return
    const next = historyStack[historyIndex + 1]
    setHistoryIndex((i) => i + 1)
    setLoadedUrl(next)
    setInputValue(next)
    setStatus('loading')
    setPaneOverride('url', next)
  }, [canGoForward, historyStack, historyIndex, setPaneOverride])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    navigate(inputValue)
  }

  const handleRefresh = () => {
    if (!loadedUrl) return
    const prev = loadedUrl
    setLoadedUrl('')
    setStatus('loading')
    requestAnimationFrame(() => setLoadedUrl(prev))
  }

  const hasUrl = loadedUrl.length > 0

  return (
    <div className="flex h-full flex-col">
      {/* Address bar */}
      <form
        onSubmit={handleSubmit}
        className="flex shrink-0 items-center gap-1.5 pb-1.5"
      >
        <button
          type="button"
          onClick={handleBack}
          disabled={!canGoBack}
          className="text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:pointer-events-none p-0.5"
          title={t('common.back')}
        >
          <ArrowLeft className="size-3" />
        </button>
        <button
          type="button"
          onClick={handleForward}
          disabled={!canGoForward}
          className="text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:pointer-events-none p-0.5"
          title={t('webPane.forward')}
        >
          <ArrowRight className="size-3" />
        </button>
        <Globe className="text-muted-foreground size-3.5 shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder={t('webPane.placeholder')}
          className="bg-transparent text-[11px] outline-none placeholder:text-muted-foreground flex-1 min-w-0"
        />
        {hasUrl && (
          <button
            type="button"
            onClick={handleRefresh}
            className="text-muted-foreground hover:text-foreground p-0.5"
            title={t('webPane.refresh')}
          >
            <RefreshCw className="size-3" />
          </button>
        )}
        <button
          type="submit"
          className="text-muted-foreground hover:text-foreground p-0.5"
          title={t('webPane.go')}
        >
          <ArrowRight className="size-3.5" />
        </button>
      </form>

      {/* Content */}
      {!hasUrl ? (
        <div className="flex flex-1 items-center justify-center p-6">
          <div className="max-w-xs text-center">
            <Globe className="text-muted-foreground/40 mx-auto mb-3 size-10" />
            <p className="text-muted-foreground text-sm">
              {t('webPane.emptyTitle')}
            </p>
          </div>
        </div>
      ) : (
        // Native webview overlays this container
        <div ref={nativeContainerRef} className="relative flex-1">
          {status === 'loading' && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {status === 'error' && (
            <div className="absolute inset-0 flex items-center justify-center p-6">
              <div className="max-w-xs text-center">
                <p className="text-sm font-medium text-foreground mb-1">
                  {t('webPane.failedToLoad')}
                </p>
                <p className="text-xs text-muted-foreground">{errorMsg}</p>
              </div>
            </div>
          )}
          {suspended && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80">
              <div className="flex items-center gap-2 text-muted-foreground">
                <EyeOff className="size-4" />
                <span className="text-xs">{t('webPane.viewPaused')}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
