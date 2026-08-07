// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// Initialize plugin runtime globals before any plugin module loads
import '@/lib/plugin-runtime-globals'

import { useEffect } from 'react'
import { TanStackDevtools } from '@tanstack/react-devtools'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import {
  HeadContent,
  Scripts,
  createRootRouteWithContext,
  useRouter,
} from '@tanstack/react-router'
import { ThemeProvider } from 'next-themes'
import { useTranslation } from 'react-i18next'
import { TooltipProvider } from '@pairlens/ui/components/ui/tooltip'

import appCss from '../styles.css?url'

import type { QueryClient } from '@tanstack/react-query'
import { isStandalone } from '@/lib/platform'
import { initChunkRecovery } from '@/lib/lazy-chunk'
import { attachNavHistory } from '@/lib/nav-history'
import { RouteError } from '@/components/route-error'
import { TerminalLock } from '@/components/security/terminal-lock'
import { QuitConfirm } from '@/components/quit-confirm'
import { FullscreenShortcut } from '@/components/fullscreen-toggle'

export interface RouterContext {
  queryClient: QueryClient
}

// Dev-only per-component render counter for re-render profiling (dropped
// from production builds via the import.meta.env.DEV guard at the <script>
// below). Counts fibers that rendered in each commit via the DevTools hook.
// Uses actualStartTime (profiler timer, on in dev builds) to decide whether
// a fiber rendered in THIS pass — bailed-out fibers are shared between
// commits and keep stale PerformedWork flags, so flags alone overcount.
/**
 * Pre-paint shield for the terminal lock.
 *
 * A classic inline script (same shape and placement as the theme-CSS restore
 * below) so it runs before any module script: on reload, the terminal would
 * otherwise paint one frame of live balances before React mounts the lock.
 * It injects a <style> rather than a DOM node — head injection is the pattern
 * the theme restore already proves safe against hydration.
 *
 * Deliberately a best-effort *visual* guard, not an authority: lock-store
 * makes the real decision. Being wrong here costs at most one blank frame,
 * and the 8s watchdog guarantees a stuck shield can never brick the app.
 */
const LOCK_SHIELD_SCRIPT = `(function(){
  try {
    var cfg = JSON.parse(localStorage.getItem('pairlens:security.lock') || 'null');
    if (!cfg || !cfg.enabled) return;
    var st = JSON.parse(localStorage.getItem('pairlens:security.lock-state') || 'null');
    var locked = st ? !!st.locked : false;
    if (!locked && cfg.triggers && cfg.triggers.onStartup) {
      locked = !st || (Date.now() - (st.lastActiveAt || 0)) >= 45000;
    }
    if (!locked) return;
    var s = document.createElement('style');
    s.id = 'pairlens-lock-shield';
    s.textContent = 'html::before{content:"";position:fixed;inset:0;z-index:2147483647;background:var(--background,#0b0b0c)}';
    document.head.appendChild(s);
    setTimeout(function(){
      var e = document.getElementById('pairlens-lock-shield');
      if (e) e.remove();
    }, 8000);
  } catch (e) {}
})()`

/**
 * Pre-hydration viewport stamp.
 *
 * The mobile shell branch cannot wait for an effect: `useIsMobile()` returns
 * false on its first render, so branching the whole application on it would
 * paint one full desktop frame on every phone load. A classic inline script
 * (same shape and placement as LOCK_SHIELD_SCRIPT above) stamps
 * `html[data-viewport]` before any module script runs, which is what
 * `mobile/use-viewport-mode.ts` reads through `useSyncExternalStore` — correct
 * on the FIRST render — and what the CSS backstop in `mobile/mobile.css`
 * keys off. The listener keeps it honest across live resizes.
 *
 * Breakpoint matches MOBILE_BREAKPOINT (768) in @pairlens/ui.
 */
const VIEWPORT_MODE_SCRIPT = `(function(){
  try {
    var mq = window.matchMedia('(max-width: 767px)');
    var set = function () {
      document.documentElement.dataset.viewport = mq.matches ? 'mobile' : 'desktop';
    };
    set();
    mq.addEventListener('change', set);
    window.addEventListener('resize', set);
  } catch (e) {}
})()`

const RENDER_COUNTER_SCRIPT = `(function(){
  try {
    if (localStorage.getItem('pairlens:render-count') !== '1') return;
    var counts = new Map();
    var origins = new Map();
    var lastCommit = 0;
    function nameOf(t) {
      if (typeof t === 'function') return t.displayName || t.name || null;
      if (t && typeof t === 'object') {
        if (t.displayName) return t.displayName;
        if (typeof t.render === 'function') return t.render.displayName || t.render.name || 'ForwardRef';
        if (t.type) { var inner = nameOf(t.type); return inner ? 'Memo(' + inner + ')' : null; }
      }
      return null;
    }
    function renderedThisPass(f, now) {
      if ((f.flags & 1) !== 1) return false;
      if (typeof f.actualStartTime !== 'number') return true;
      return f.actualStartTime > lastCommit && f.actualStartTime <= now;
    }
    function bump(f, isOrigin) {
      var n = nameOf(f.type);
      if (!n) return;
      var e = counts.get(n);
      if (!e) { e = { count: 0, time: 0 }; counts.set(n, e); }
      e.count++;
      if (isOrigin) origins.set(n, (origins.get(n) || 0) + 1);
      if (typeof f.actualDuration === 'number') {
        var self = f.actualDuration;
        var c = f.child;
        while (c) { if (typeof c.actualDuration === 'number') self -= c.actualDuration; c = c.sibling; }
        e.time += Math.max(0, self);
      }
    }
    function walk(root, now) {
      var stack = [{ f: root, p: false }];
      while (stack.length) {
        var it = stack.pop();
        var f = it.f;
        if (!f) continue;
        var r = renderedThisPass(f, now);
        if (r && typeof f.type === 'function' || (r && f.type && typeof f.type === 'object')) bump(f, !it.p);
        if (f.child) stack.push({ f: f.child, p: r || it.p });
        if (f.sibling) stack.push({ f: f.sibling, p: it.p });
      }
    }
    function onCommit(root) {
      try {
        if (root && root.current) {
          var now = performance.now();
          walk(root.current, now);
          lastCommit = now;
        }
      } catch (e) {}
    }
    var existing = window.__REACT_DEVTOOLS_GLOBAL_HOOK__;
    if (existing && typeof existing.onCommitFiberRoot === 'function') {
      var orig = existing.onCommitFiberRoot.bind(existing);
      existing.onCommitFiberRoot = function(id, root, p, d) { onCommit(root); return orig(id, root, p, d); };
    } else {
      var ids = 0;
      window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
        renderers: new Map(),
        supportsFiber: true,
        isDisabled: false,
        checkDCE: function(){},
        onScheduleFiberRoot: function(){},
        onCommitFiberUnmount: function(){},
        onPostCommitFiberRoot: function(){},
        inject: function(r) { var id = ++ids; this.renderers.set(id, r); return id; },
        onCommitFiberRoot: function(id, root) { onCommit(root); },
      };
    }
    window.__resetRenderReport = function() { counts = new Map(); origins = new Map(); };
    window.__getRenderReport = function() {
      return Array.from(counts, function(kv) {
        return { name: kv[0], count: kv[1].count, time: Math.round(kv[1].time * 100) / 100 };
      }).sort(function(a, b) { return b.count - a.count; });
    };
    window.__getOrigins = function() {
      return Array.from(origins, function(kv) {
        return { name: kv[0], count: kv[1] };
      }).sort(function(a, b) { return b.count - a.count; });
    };
  } catch (e) {}
})()`

export const Route = createRootRouteWithContext<RouterContext>()({
  ssr: false,
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        // `viewport-fit=cover` is what makes env(safe-area-inset-*) non-zero,
        // and `interactive-widget=resizes-content` is what lifts the mobile
        // co-pilot composer above the software keyboard. Neither has any
        // effect on a desktop browser.
        content:
          'width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content',
      },
      {
        // --background, so iOS Safari's chrome matches the app instead of
        // bracketing it in white.
        name: 'theme-color',
        content: '#0a0806',
      },
      {
        title: 'Pairlens Terminal',
      },
    ],
    links: [
      {
        rel: 'stylesheet',
        href: appCss,
      },
    ],
  }),
  // Every route inherits this one: nothing else in the app defines an
  // errorComponent, so a throw from any screen lands on a panel that offers a
  // way out instead of the router's bare default.
  errorComponent: RouteError,
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  const { i18n } = useTranslation()
  const router = useRouter()

  // Feed the router's history stack to the back/forward tracker the desktop
  // titlebar arrows and the native menu entries both read from. Idempotent.
  useEffect(() => {
    attachNavHistory(router.history)
  }, [router])

  // Disable native browser context menu in Tauri (WebKit shows it
  // alongside our React menus — Chrome suppresses it from component
  // handlers but Safari/WebKit does not)
  useEffect(() => {
    if (!isStandalone) return

    const handler = (e: MouseEvent) => {
      e.preventDefault()
    }
    document.addEventListener('contextmenu', handler)
    return () => document.removeEventListener('contextmenu', handler)
  }, [])

  // Desktop menu commands: native menubar on macOS, in-app keyboard
  // accelerators on Windows/Linux (no window menu there). No-op in browsers.
  useEffect(() => {
    // Stale-chunk recovery first, and from a static import: every line below
    // is itself a dynamic import, so a tab left open across a deploy needs
    // this listening before it asks for a chunk that no longer exists.
    initChunkRecovery()
    void import('@/lib/desktop-menu').then((m) => m.initDesktopMenu())
    void import('@/lib/menu-shortcuts').then((m) => m.initMenuShortcuts())
    // Hide/show signal for background mode — must be listening before the
    // user can close a window, which is immediately.
    void import('@/lib/window-visibility').then((m) => m.initWindowVisibility())
    // Auto-update checks (desktop only; no-op in browsers).
    void import('@/lib/updater').then((m) => m.initUpdater())
    // New-deploy refresh prompt (browsers only; no-op on desktop and in dev).
    void import('@/lib/web-updater').then((m) => m.initWebUpdater())
    // Opt-in analytics (no-op until the user consents; inert without a key).
    void import('@/lib/analytics').then((m) => m.initAnalytics())
    // Idle / periodic / wake lock triggers. Inert until a password is set.
    void import('@/lib/security/lock-manager').then((m) => m.initLockManager())
  }, [])

  // The tray menu is built in Rust before the webview exists, so it starts in
  // English. Push the user's language over once i18n is ready, and again
  // whenever it changes. No-op on macOS (no tray) and in browsers.
  useEffect(() => {
    if (!isStandalone) return
    const push = () => {
      void import('@/lib/settings/close-behavior').then((m) =>
        m.setTrayLabels(
          i18n.t('tray.show', { defaultValue: 'Show Pairlens' }),
          i18n.t('tray.quit', { defaultValue: 'Quit Pairlens' }),
        ),
      )
    }
    push()
    i18n.on('languageChanged', push)
    return () => i18n.off('languageChanged', push)
  }, [i18n])

  // First-touch affiliate referral attribution (?ref=<code>)
  useEffect(() => {
    void import('@/lib/referral').then((m) => m.captureReferralFromUrl())
  }, [])

  return (
    <html lang={i18n.language} suppressHydrationWarning>
      <head>
        {/* Import map MUST come before any module scripts — required by spec */}
        <script
          type="importmap"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              imports: {
                react: '/_sdk/react.js',
                'react/jsx-runtime': '/_sdk/react-jsx-runtime.js',
                'react/jsx-dev-runtime': '/_sdk/react-jsx-dev-runtime.js',
                'react-dom': '/_sdk/react-dom.js',
                '@pairlens/plugin-sdk': '/_sdk/plugin-sdk.js',
                '@tanstack/react-query': '/_sdk/tanstack-react-query.js',
                '@pairlens/ui': '/_sdk/pairlens-ui.js',
                '@pairlens/fast-financial-charts':
                  '/_sdk/fast-financial-charts.js',
                '@pairlens/fast-financial-charts/react':
                  '/_sdk/fast-financial-charts-react.js',
              },
            }),
          }}
        />
        <HeadContent />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var c=localStorage.getItem("pairlens:theme.cachedCss");if(c){var s=document.createElement("style");s.id="pairlens-theme-override";s.textContent=c;document.head.appendChild(s)}}catch(e){}})()`,
          }}
        />
        <script dangerouslySetInnerHTML={{ __html: LOCK_SHIELD_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: VIEWPORT_MODE_SCRIPT }} />
        {import.meta.env.DEV && (
          // Dev-only render counter for re-render profiling.
          // Classic inline script so it runs before any module script —
          // the DevTools hook must exist before React injects its renderer.
          // Enable: localStorage.setItem('pairlens:render-count', '1')
          // Read:   window.__getRenderReport() / window.__getOrigins() /
          //         window.__resetRenderReport()
          <script
            dangerouslySetInnerHTML={{
              __html: RENDER_COUNTER_SCRIPT,
            }}
          />
        )}
      </head>
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          disableTransitionOnChange
          enableSystem
        >
          <TooltipProvider>{children}</TooltipProvider>
          {/* Renders ON TOP of the routed children, never instead of them:
              closeSplashScreen() only fires when _terminal mounts, so a lock
              that replaced the app would strand the desktop build behind its
              native splash. On top also means bots, alerts and streams keep
              running while locked. */}
          <TerminalLock />
          {/* Quitting is the one action no keyboard chord should be able to
              take without asking — the accelerator runner fires Ctrl+Q
              regardless of focus. Inert in the browser. */}
          <QuitConfirm />
          {/* One registration for the whole app, not one per PageHeader —
              two live handlers would toggle twice and cancel out. Inert on
              desktop. */}
          <FullscreenShortcut />
        </ThemeProvider>
        <TanStackDevtools
          config={{
            position: 'bottom-right',
          }}
          plugins={[
            {
              name: 'Tanstack Router',
              render: <TanStackRouterDevtoolsPanel />,
            },
          ]}
        />
        <Scripts />
      </body>
    </html>
  )
}
