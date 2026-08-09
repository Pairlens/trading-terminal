// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  Outlet,
  createFileRoute,
  redirect,
  useLocation,
  useNavigate,
} from '@tanstack/react-router'
import {
  ArrowRight,
  Bot,
  Bug,
  Clock,
  EllipsisVertical,
  House,
  LayoutTemplate,
  LogIn,
  LogOut,
  Monitor,
  MonitorDown,
  Moon,
  Settings2,
  ShieldCheck,
  SquareFunction,
  Sun,
  UserRound,
} from 'lucide-react'
import { useTheme } from 'next-themes'
import { useTranslation } from 'react-i18next'

import { cn } from '@pairlens/ui'
import { AiOrb } from '@pairlens/ui/components/ui/ai-orb'
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@pairlens/ui/components/ui/avatar'
import { BellIcon } from '@pairlens/ui/components/ui/bell'
import { PlugZapIcon } from '@pairlens/ui/components/ui/plug-zap'
import { WaypointsIcon } from '@pairlens/ui/components/ui/waypoints'
import { ChartLineIcon } from '@pairlens/ui/components/ui/chart-line'
import { HandCoinsIcon } from '@pairlens/ui/components/ui/hand-coins'
import { HomeIcon } from '@pairlens/ui/components/ui/home'
import { LayersIcon } from '@pairlens/ui/components/ui/layers'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@pairlens/ui/components/ui/dropdown-menu'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
  useSidebar,
} from '@pairlens/ui/components/ui/sidebar'
import { toast } from 'sonner'
import { Toaster } from '@pairlens/ui/components/ui/sonner'
import type { ReactNode } from 'react'
import type { ShortcutDefinition } from '@/hooks/use-keyboard-shortcuts'
import { track } from '@/lib/analytics-events'
import { useAvailableUpdateCount } from '@/stores/plugin-updates-store'
import { IdleGuard } from '@/components/idle-guard'
import { ShortcutHint, ShortcutHintListener } from '@/components/shortcut-hints'
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts'
import {
  useKeybindingLabel,
  useKeybindingLabels,
} from '@/hooks/use-keybindings'
import { BillingStateSync } from '@/components/billing/billing-state-sync'
import { SectionTour } from '@/components/onboarding/section-tour'
import { isOnboardingComplete } from '@/lib/onboarding-state'
import { PairAvatar } from '@/components/pair-picker/pair-avatar'
import { usePersistedState } from '@/hooks/use-persisted-state'
import { authClient, hasAppServer } from '@/lib/auth-client'
import { api, clearSessionCache, queryKeys, resolveUrl } from '@/lib/api'
import { PairlensProvider } from '@/lib/pairlens-provider'
import { MarketDataProvider } from '@/lib/market-data-provider'
import { GeoRestrictionDialog } from '@/components/geo-restriction-dialog'
import { AiSetupDialogHost } from '@/components/ai-provider-connect'
import { closeSplashScreen, isHosted, isStandalone } from '@/lib/platform'
import { DESKTOP_CTA_SEEN_KEY } from '@/lib/desktop-download'
import { DesktopMenuBridge } from '@/components/desktop-menu-bridge'
import {
  TauriDragRegion,
  useNeedsTitlebar,
} from '@/components/tauri-drag-region'
import { OmniSearchProvider } from '@/components/omni-search/omni-search-provider'
import { StatusBar } from '@/components/layout/status-bar'
import { WatchlistsProvider } from '@/lib/watchlists-provider'
import { useDesktopCtaStore } from '@/stores/desktop-cta-store'
import { useSettingsDialogStore } from '@/stores/settings-dialog-store'
import { lockNow } from '@/lib/security/lock-store'
import { startVaultBootstrap } from '@/lib/security/vault/vault-bootstrap'
import { VaultSealedBanner } from '@/components/security/vault-sealed-banner'
import { useOptimisticSession } from '@/lib/session'
import { ThemePluginContext, useThemePlugin } from '@/hooks/use-theme-plugin'
import {
  PerformanceModeContext,
  usePerformanceModeState,
  usePerformanceModeSync,
} from '@/hooks/use-performance-mode'
import { WorkspaceTreeSidebar } from '@/components/workspace/workspace-tree-sidebar'
import { FeedbackDialog } from '@/components/feedback/feedback-dialog'
import { DesktopDownloadDialog } from '@/components/feedback/desktop-download-dialog'

import UserSettingsDialog from '@/components/user-settings-dialog'
import { MobileTerminalRoot, useViewportMode } from '@/mobile'

export const Route = createFileRoute('/_terminal')({
  beforeLoad: () => {
    // First run: the dedicated /onboarding page gates the terminal shell.
    if (typeof window !== 'undefined' && !isOnboardingComplete()) {
      throw redirect({ to: '/onboarding' })
    }
  },
  component: TerminalLayout,
})

const NAV_ITEMS = [
  { id: 'accounts', labelKey: 'nav.accounts', AnimatedIcon: HandCoinsIcon },
  { id: 'plugins', labelKey: 'nav.plugins', AnimatedIcon: PlugZapIcon },
] as const

function TerminalLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { session } = useOptimisticSession()
  const needsTitlebar = useNeedsTitlebar()

  // Close splash screen once the terminal shell renders
  useEffect(() => {
    closeSplashScreen()
  }, [])

  // Read the vault record and, if a sibling window already holds the data key,
  // ask for it. A window opened after another one unlocked has no other way to
  // learn the key exists — the announcement it would have followed was
  // broadcast before this window was listening. Idempotent per window.
  useEffect(() => {
    startVaultBootstrap()
  }, [])

  const { data: currentUser } = useQuery({
    queryKey: queryKeys.currentUser(),
    queryFn: () => api.getCurrentUser(),
    enabled: Boolean(session),
  })

  const { data: userSettings } = useQuery({
    queryKey: queryKeys.userSettings(),
    queryFn: () => api.getUserSettings(),
    enabled: Boolean(session),
  })

  const signOut = useMutation({
    mutationFn: async () => {
      clearSessionCache()
      const result = await authClient.signOut()
      if (result.error) {
        throw new Error(result.error.message ?? 'Failed to sign out')
      }
    },
    onSuccess: () => {
      track('signed_out')
      toast.success(t('userMenu.signedOut'))
    },
  })

  const { t } = useTranslation()
  const viewport = useViewportMode()
  const perfMode = usePerformanceModeState()
  const [workspaceTreeOpen, setWorkspaceTreeOpen] = useState(false)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  // Store rather than local state: the Notifications/Bots nudge opens this
  // same dialog from deep in the tree (see stores/desktop-cta-store).
  const desktopCtaOpen = useDesktopCtaStore((state) => state.isOpen)
  const setDesktopCtaOpen = useDesktopCtaStore((state) => state.setOpen)
  // Device-local: the ping badge is a one-time nudge, not a permanent decoration.
  const [desktopCtaSeen, setDesktopCtaSeen] = usePersistedState<boolean>(
    DESKTOP_CTA_SEEN_KEY,
    false,
  )

  // Whoever opened it, the pitch has now been read — retire the ping badge.
  useEffect(() => {
    if (desktopCtaOpen && !desktopCtaSeen) setDesktopCtaSeen(true)
  }, [desktopCtaOpen, desktopCtaSeen, setDesktopCtaSeen])

  const activeItem = location.pathname.startsWith('/notifications')
    ? 'notifications'
    : location.pathname.startsWith('/plugins')
      ? 'plugins'
      : location.pathname.startsWith('/accounts')
        ? 'accounts'
        : location.pathname.startsWith('/workflows')
          ? 'workflows'
          : location.pathname.startsWith('/indicators')
            ? 'indicators'
            : location.pathname.startsWith('/bots')
              ? 'bots'
              : location.pathname.startsWith('/pair/')
                ? 'charts'
                : location.pathname.startsWith('/workspace-store')
                  ? 'workspace-store'
                  : location.pathname.startsWith('/workspace/')
                    ? 'workspaces'
                    : 'pairs'

  // Auto-open workspace tree when on a workspace route
  useEffect(() => {
    if (activeItem === 'workspaces') {
      setWorkspaceTreeOpen(true)
    }
  }, [activeItem])

  // Section jumps + the app-wide chords. Each names a keybinding command; what
  // chord that command answers to is the user's call (see lib/keybindings).
  const [recentPairs] = usePersistedState<Array<string>>(
    'pair-picker.recent',
    [],
  )
  const lastPair = recentPairs[0]
  const navShortcuts = useMemo<Array<ShortcutDefinition>>(
    () => [
      {
        commandId: 'navigation.pairs',
        action: () => void navigate({ to: '/' }),
      },
      {
        commandId: 'navigation.charts',
        action: () => {
          if (lastPair) {
            void navigate({ to: '/pair/$pair', params: { pair: lastPair } })
          } else {
            void navigate({ to: '/' })
          }
        },
      },
      {
        commandId: 'navigation.notifications',
        action: () => void navigate({ to: '/notifications' }),
      },
      {
        commandId: 'navigation.workflows',
        action: () => void navigate({ to: '/workflows' }),
      },
      {
        commandId: 'navigation.indicators',
        action: () => void navigate({ to: '/indicators' }),
      },
      {
        commandId: 'navigation.accounts',
        action: () => void navigate({ to: '/accounts' }),
      },
      {
        commandId: 'navigation.plugins',
        action: () => void navigate({ to: '/plugins' }),
      },
      {
        commandId: 'navigation.workspaceTree',
        action: () => setWorkspaceTreeOpen((prev) => !prev),
      },
      {
        commandId: 'navigation.workspaceStore',
        action: () => void navigate({ to: '/workspace-store' }),
      },
      {
        commandId: 'navigation.bots',
        action: () => void navigate({ to: '/bots' }),
      },
      {
        commandId: 'general.settings',
        action: () => useSettingsDialogStore.getState().open(),
      },
      {
        commandId: 'general.lockTerminal',
        action: () => lockNow('manual'),
      },
      {
        // Never fires the seal directly — it opens the confirm, because this
        // one stops live automations and the user has to see that first.
        commandId: 'general.hardLock',
        action: () => useSettingsDialogStore.getState().open('security'),
      },
    ],
    [navigate, lastPair, setWorkspaceTreeOpen],
  )
  useKeyboardShortcuts(navShortcuts)
  const shortcutLabel = useKeybindingLabels()

  const sectionLabelMap: Record<string, string> = {
    pairs: t('discovery.title'),
    charts: t('nav.charts'),
    notifications: t('nav.notifications'),
    indicators: t('nav.indicators'),
    bots: t('nav.bots'),
    accounts: t('nav.accounts'),
    plugins: t('nav.plugins'),
    workspaces: t('layout.workspaces'),
    'workspace-store': t('nav.workspaceStore'),
  }
  const sectionLabel = sectionLabelMap[activeItem]
  const userEmail = currentUser?.email ?? session?.user.email ?? 'local'
  const userName =
    currentUser?.name ?? session?.user.name ?? userEmail.split('@')[0]
  const authUserImage = currentUser?.image ?? session?.user.image ?? undefined
  const customAvatarUrl = resolveUrl(userSettings?.avatarUrl) ?? null
  const userImage = customAvatarUrl ?? authUserImage
  const initials = userName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((segment) => segment[0]?.toUpperCase() ?? '')
    .join('')

  return (
    <PerformanceModeContext.Provider value={perfMode}>
      <PairlensProvider>
        {/* sonner ≤600px pins the toaster full-width at bottom:16px — inside
            the mobile tab bar's footprint. The offset rides the shell's own
            geometry variable (declared on :root) and is inert on desktop,
            where sonner never reads --mobile-offset-*. */}
        <Toaster
          mobileOffset={{
            bottom: 'calc(var(--pl-tabbar-total) + 8px)',
            left: '16px',
            right: '16px',
            top: '16px',
          }}
        />
        <MarketDataProvider>
          <ThemePluginBridge>
            <WatchlistsProvider>
              <OmniSearchProvider>
                {isStandalone && <DesktopMenuBridge />}
                <IdleGuard />
                <ShortcutHintListener />
                <GeoRestrictionDialog />
                {/* Above the shell branch on purpose: the AI gates that open
                    this wizard unmount the moment it connects a model, and a
                    dialog held inside them would vanish mid-flow. */}
                <AiSetupDialogHost />
                <FeedbackDialog
                  open={feedbackOpen}
                  onOpenChange={setFeedbackOpen}
                />
                {isHosted && (
                  <DesktopDownloadDialog
                    open={desktopCtaOpen}
                    onOpenChange={setDesktopCtaOpen}
                  />
                )}
                <BillingStateSync />
                {/* The phone gets its own shell, branched here so that every
                    global provider above stays mounted across a resize in
                    both directions — plugins, sockets, watchlists and theme
                    all survive the swap. `useViewportMode` is correct on the
                    FIRST render (see mobile/use-viewport-mode.ts), so no
                    desktop frame is ever painted on a phone. */}
                {viewport === 'mobile' ? (
                  <Suspense
                    fallback={<div className="h-svh w-full bg-background" />}
                  >
                    <MobileTerminalRoot />
                  </Suspense>
                ) : (
                  <SidebarProvider
                    className={cn(
                      'h-svh overflow-hidden',
                      needsTitlebar && 'pt-8',
                    )}
                    defaultOpen
                  >
                    <TauriDragRegion sectionLabel={sectionLabel} />
                    <SectionTour key={activeItem} sectionId={activeItem} />
                    <Sidebar
                      side="left"
                      variant="inset"
                      collapsible="none"
                      sidebarWidth="3.75rem"
                      className="[&>[data-slot=sidebar-inner]]:bg-transparent [&>[data-slot=sidebar-inner]]:shadow-none [&>[data-slot=sidebar-inner]]:ring-0"
                    >
                      <SidebarContent className="p-2">
                        <SidebarGroup className="p-0">
                          <SidebarGroupContent>
                            <SidebarMenu className="items-center gap-1">
                              <SidebarMenuItem>
                                <SidebarMenuButton
                                  aria-label={t('nav.pairs')}
                                  className="size-9 justify-center p-0"
                                  isActive={activeItem === 'pairs'}
                                  onClick={() => void navigate({ to: '/' })}
                                  type="button"
                                >
                                  <HomeIcon size={16} />
                                  <span className="sr-only">
                                    {t('nav.pairs')}
                                  </span>
                                  <ShortcutHint
                                    keys={shortcutLabel('navigation.pairs')}
                                  />
                                </SidebarMenuButton>
                              </SidebarMenuItem>
                              <ChartsNavItem
                                isActive={activeItem === 'charts'}
                              />
                              <SidebarSeparator className="my-1" />
                              <SidebarMenuItem>
                                <SidebarMenuButton
                                  aria-label={t('nav.notifications')}
                                  className="size-9 justify-center p-0"
                                  isActive={activeItem === 'notifications'}
                                  onClick={() =>
                                    void navigate({ to: '/notifications' })
                                  }
                                  type="button"
                                >
                                  <BellIcon size={16} />
                                  <span className="sr-only">
                                    {t('nav.notifications')}
                                  </span>
                                  <ShortcutHint
                                    keys={shortcutLabel(
                                      'navigation.notifications',
                                    )}
                                  />
                                </SidebarMenuButton>
                              </SidebarMenuItem>
                              <SidebarMenuItem>
                                <SidebarMenuButton
                                  aria-label={t('nav.workflows')}
                                  className="size-9 justify-center p-0"
                                  isActive={activeItem === 'workflows'}
                                  onClick={() =>
                                    void navigate({ to: '/workflows' })
                                  }
                                  type="button"
                                >
                                  <WaypointsIcon size={16} />
                                  <span className="sr-only">
                                    {t('nav.workflows')}
                                  </span>
                                  <ShortcutHint
                                    keys={shortcutLabel('navigation.workflows')}
                                  />
                                </SidebarMenuButton>
                              </SidebarMenuItem>
                              <SidebarMenuItem>
                                <SidebarMenuButton
                                  aria-label={t('nav.indicators')}
                                  className="size-9 justify-center p-0"
                                  isActive={activeItem === 'indicators'}
                                  onClick={() =>
                                    void navigate({ to: '/indicators' })
                                  }
                                  type="button"
                                >
                                  <SquareFunction size={16} />
                                  <span className="sr-only">
                                    {t('nav.indicators')}
                                  </span>
                                  <ShortcutHint
                                    keys={shortcutLabel(
                                      'navigation.indicators',
                                    )}
                                  />
                                </SidebarMenuButton>
                              </SidebarMenuItem>
                              <SidebarMenuItem>
                                <SidebarMenuButton
                                  aria-label={t('nav.bots')}
                                  className="size-9 justify-center p-0"
                                  isActive={activeItem === 'bots'}
                                  onClick={() => void navigate({ to: '/bots' })}
                                  type="button"
                                >
                                  <Bot size={16} />
                                  <span className="sr-only">
                                    {t('nav.bots')}
                                  </span>
                                  <ShortcutHint
                                    keys={shortcutLabel('navigation.bots')}
                                  />
                                </SidebarMenuButton>
                              </SidebarMenuItem>
                              <SidebarSeparator className="my-1" />
                              {NAV_ITEMS.map((item) => (
                                <SidebarMenuItem key={item.id}>
                                  <SidebarMenuButton
                                    aria-label={t(item.labelKey)}
                                    className="relative size-9 justify-center p-0"
                                    isActive={item.id === activeItem}
                                    onClick={() => {
                                      if (item.id === 'accounts') {
                                        void navigate({ to: '/accounts' })
                                      }
                                      if (item.id === 'plugins') {
                                        void navigate({ to: '/plugins' })
                                      }
                                    }}
                                    type="button"
                                  >
                                    <item.AnimatedIcon size={16} />
                                    <span className="sr-only">
                                      {t(item.labelKey)}
                                    </span>
                                    <ShortcutHint
                                      keys={shortcutLabel(
                                        item.id === 'accounts'
                                          ? 'navigation.accounts'
                                          : 'navigation.plugins',
                                      )}
                                    />
                                  </SidebarMenuButton>
                                  {/* Outside the button on purpose — see DesktopCtaBadge. */}
                                  {item.id === 'plugins' && (
                                    <PluginUpdateBadge />
                                  )}
                                </SidebarMenuItem>
                              ))}
                              <SidebarSeparator className="my-1" />
                              <SidebarMenuItem>
                                <SidebarMenuButton
                                  aria-label={t('layout.workspaces')}
                                  className="size-9 justify-center p-0"
                                  isActive={
                                    activeItem === 'workspaces' ||
                                    workspaceTreeOpen
                                  }
                                  onClick={() =>
                                    setWorkspaceTreeOpen((prev) => !prev)
                                  }
                                  type="button"
                                >
                                  <LayersIcon size={16} />
                                  <span className="sr-only">
                                    {t('layout.workspaces')}
                                  </span>
                                  <ShortcutHint
                                    keys={shortcutLabel(
                                      'navigation.workspaceTree',
                                    )}
                                  />
                                </SidebarMenuButton>
                              </SidebarMenuItem>
                              <SidebarMenuItem>
                                <SidebarMenuButton
                                  aria-label={t('nav.workspaceStore')}
                                  className="size-9 justify-center p-0"
                                  isActive={activeItem === 'workspace-store'}
                                  onClick={() =>
                                    void navigate({ to: '/workspace-store' })
                                  }
                                  type="button"
                                >
                                  <LayoutTemplate size={16} />
                                  <span className="sr-only">
                                    {t('nav.workspaceStore')}
                                  </span>
                                  <ShortcutHint
                                    keys={shortcutLabel(
                                      'navigation.workspaceStore',
                                    )}
                                  />
                                </SidebarMenuButton>
                              </SidebarMenuItem>
                            </SidebarMenu>
                          </SidebarGroupContent>
                        </SidebarGroup>
                      </SidebarContent>

                      <SidebarFooter className="p-2">
                        <SidebarMenu className="items-center">
                          {isHosted && (
                            <SidebarMenuItem>
                              <SidebarMenuButton
                                aria-label={t('nav.getDesktopApp')}
                                className="relative size-9 justify-center p-0"
                                onClick={() => setDesktopCtaOpen(true)}
                                type="button"
                              >
                                <MonitorDown size={16} />
                                <span className="sr-only">
                                  {t('nav.getDesktopApp')}
                                </span>
                              </SidebarMenuButton>
                              {/* Outside the button on purpose — see DesktopCtaBadge. */}
                              {!desktopCtaSeen && <DesktopCtaBadge />}
                            </SidebarMenuItem>
                          )}
                          <SidebarMenuItem>
                            <SidebarMenuButton
                              aria-label={t('nav.feedback')}
                              className="size-9 justify-center p-0"
                              onClick={() => setFeedbackOpen(true)}
                              type="button"
                            >
                              <Bug size={16} />
                              <span className="sr-only">
                                {t('nav.feedback')}
                              </span>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        </SidebarMenu>
                        <TerminalUserMenu
                          initials={initials || 'PL'}
                          isSigningOut={signOut.isPending}
                          onSignOut={() => signOut.mutate()}
                          authUserImage={authUserImage}
                          customAvatarUrl={customAvatarUrl}
                          userEmail={userEmail}
                          userImage={userImage}
                          userName={userName}
                          hasSession={Boolean(session)}
                        />
                        {signOut.isError ? (
                          <p className="text-center text-xs text-red-600">
                            {signOut.error.message}
                          </p>
                        ) : null}
                      </SidebarFooter>
                    </Sidebar>
                    <div className="bg-background md:peer-data-[variant=inset]:m-2 md:peer-data-[variant=inset]:ml-0 md:peer-data-[variant=inset]:rounded-xl md:peer-data-[variant=inset]:shadow-sm md:peer-data-[variant=inset]:peer-data-[state=collapsed]:ml-2 flex min-h-0 flex-1 flex-col overflow-hidden">
                      <div className="flex min-h-0 flex-1 overflow-hidden">
                        {/* Workspace tree panel — inside inset container */}
                        <div
                          className={cn(
                            'overflow-hidden shrink-0',
                            workspaceTreeOpen ? 'w-64 border-r' : 'w-0',
                          )}
                        >
                          <div className="flex h-full w-64 flex-col bg-card text-card-foreground">
                            <WorkspaceTreeSidebar />
                          </div>
                        </div>
                        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                          {/* Above the routed content, not inside it: parked
                            live bots must be visible from any screen, not
                            only from the bots page. */}
                          <VaultSealedBanner />
                          <Outlet />
                        </div>
                      </div>
                      <StatusBar />
                    </div>
                  </SidebarProvider>
                )}
              </OmniSearchProvider>
            </WatchlistsProvider>
          </ThemePluginBridge>
        </MarketDataProvider>
      </PairlensProvider>
    </PerformanceModeContext.Provider>
  )
}

/**
 * One-time nudge on the desktop-download button: a soft ping until the user
 * opens the dialog once, then gone for good on this device.
 *
 * Rendered as a SIBLING of the SidebarMenuButton rather than inside it, which
 * is the whole reason it is visible at all. A menu button clips two ways:
 *
 *   - `overflow-hidden` on the button variant ate the 2px the badge is offset
 *     past the corner, so the dot arrived with its top-right shaved off;
 *   - `[&>span:last-child]:truncate` on that same variant targets the last
 *     span child, which IS this badge, and truncate carries overflow-hidden.
 *     The ping ring scales to twice the dot and was being clipped back to the
 *     dot, so the animation did nothing.
 *
 * The rules are there to truncate a long label, which these icon-only buttons
 * never have, but they apply all the same. SidebarMenuItem is already
 * `relative` and — with `collapsible="none"` and `items-center` on the menu —
 * shrink-wraps the button exactly, so moving out one level keeps the anchor
 * identical and escapes both clips without fighting specificity.
 */
function DesktopCtaBadge() {
  return (
    <span className="pointer-events-none absolute -right-0.5 -top-0.5 flex size-2.5">
      <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-75" />
      <span className="relative inline-flex size-2.5 rounded-full bg-primary" />
    </span>
  )
}

/** Same clipping story as [DesktopCtaBadge] — also a sibling of the button. */
function PluginUpdateBadge() {
  const count = useAvailableUpdateCount()
  if (count === 0) return null
  return (
    <span className="absolute -right-0.5 -top-0.5 flex size-3.5 items-center justify-center rounded-full bg-primary text-[8px] font-bold text-primary-foreground">
      {count > 9 ? '9+' : count}
    </span>
  )
}

function ChartsNavItem({ isActive }: { isActive: boolean }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const chartsShortcut = useKeybindingLabel('navigation.charts')
  const [recentPairs] = usePersistedState<Array<string>>(
    'pair-picker.recent',
    [],
  )
  const [assetClassMap] = usePersistedState<Record<string, string>>(
    'pair-picker.assetClassMap',
    {},
  )

  return (
    <SidebarMenuItem>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <SidebarMenuButton
              aria-label={t('nav.charts')}
              className="size-9 justify-center p-0"
              isActive={isActive}
              type="button"
            />
          }
        >
          <ChartLineIcon size={16} />
          <span className="sr-only">{t('nav.charts')}</span>
          <ShortcutHint keys={chartsShortcut} />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side="right"
          align="start"
          sideOffset={12}
          className="w-52"
        >
          <DropdownMenuGroup>
            <DropdownMenuLabel>{t('nav.recentPairs')}</DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          {recentPairs.length === 0 ? (
            <div className="px-2 py-3 text-center text-xs text-muted-foreground">
              <Clock className="mx-auto mb-1 size-4" />
              {t('nav.noRecentPairs')}
            </div>
          ) : (
            recentPairs.slice(0, 8).map((symbol) => {
              const base = symbol.split('-')[0] ?? symbol
              return (
                <DropdownMenuItem
                  key={symbol}
                  onClick={() =>
                    void navigate({
                      to: '/pair/$pair',
                      params: { pair: symbol },
                    })
                  }
                >
                  <PairAvatar
                    base={base}
                    assetClass={assetClassMap[symbol]}
                    size="sm"
                    className="size-5 text-[8px]"
                  />
                  <span className="flex-1 font-mono text-xs">{symbol}</span>
                  <ArrowRight className="size-3 text-muted-foreground" />
                </DropdownMenuItem>
              )
            })
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => void navigate({ to: '/' })}>
            <House className="size-4" />
            {t('nav.browseAllPairs')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  )
}

function TerminalUserMenu({
  userName,
  userEmail,
  userImage,
  authUserImage,
  customAvatarUrl,
  initials,
  isSigningOut,
  onSignOut,
  hasSession,
}: {
  userName: string
  userEmail: string
  userImage?: string
  authUserImage?: string
  customAvatarUrl?: string | null
  initials: string
  isSigningOut: boolean
  onSignOut: () => void
  hasSession: boolean
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { isMobile } = useSidebar()
  const { resolvedTheme, setTheme, theme } = useTheme()
  const activeTheme =
    theme === 'system' ? 'system' : (resolvedTheme ?? 'system')
  const isSettingsOpen = useSettingsDialogStore((s) => s.isOpen)
  const setSettingsOpen = useCallback((open: boolean) => {
    const state = useSettingsDialogStore.getState()
    if (open && !state.isOpen) state.open()
    else if (!open) state.close()
  }, [])

  return (
    <SidebarMenu className="items-center">
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={t('userMenu.accountMenu')}
            className="ring-sidebar-ring hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[popup-open]:bg-sidebar-accent data-[popup-open]:text-sidebar-accent-foreground flex h-9 w-9 items-center justify-center rounded-lg outline-hidden focus-visible:ring-2"
          >
            {hasSession ? (
              <Avatar className="size-7 rounded-lg" size="sm">
                <AvatarImage src={userImage} alt={userName} />
                <AvatarFallback className="rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 text-[11px] font-semibold tracking-tight text-foreground/80 ring-1 ring-inset ring-primary/10">
                  {initials}
                </AvatarFallback>
              </Avatar>
            ) : (
              <UserRound className="size-4 text-muted-foreground" />
            )}
            <span className="sr-only">{t('userMenu.accountMenu')}</span>
            <EllipsisVertical className="sr-only size-4" />
          </DropdownMenuTrigger>

          <DropdownMenuContent
            align="end"
            className={cn('rounded-lg', hasSession ? 'min-w-60' : 'w-72')}
            side={isMobile ? 'bottom' : 'right'}
            sideOffset={12}
          >
            {hasSession ? (
              <DropdownMenuGroup>
                <DropdownMenuLabel className="p-0">
                  <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                    <Avatar className="size-8 rounded-lg" size="sm">
                      <AvatarImage src={userImage} alt={userName} />
                      <AvatarFallback className="rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 text-xs font-semibold tracking-tight text-foreground/80 ring-1 ring-inset ring-primary/10">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="grid flex-1 text-left leading-tight">
                      <span className="truncate font-medium">{userName}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {userEmail}
                      </span>
                    </div>
                  </div>
                </DropdownMenuLabel>
              </DropdownMenuGroup>
            ) : (
              <div className="px-1 pt-1">
                <div className="relative overflow-hidden rounded-[10px] border border-primary/15 bg-gradient-to-b from-primary/[0.09] via-primary/[0.03] to-transparent p-3">
                  {/* soft iris glow behind the orb */}
                  <div
                    aria-hidden
                    className="pointer-events-none absolute -top-10 -right-6 size-24 rounded-full bg-primary/25 blur-2xl"
                  />
                  <div className="relative flex flex-col gap-3">
                    <div className="flex items-start gap-3">
                      <AiOrb
                        size="40px"
                        state="idle"
                        className="mt-0.5 shrink-0"
                      />
                      <div className="grid gap-1">
                        <span className="text-balance font-serif text-[15px] leading-[1.15] font-semibold tracking-[-0.01em] text-foreground">
                          {hasAppServer
                            ? t('userMenu.guestTitle')
                            : t('userMenu.guest')}
                        </span>
                        <span className="text-pretty text-[12px] leading-[1.45] text-muted-foreground">
                          {hasAppServer
                            ? t('userMenu.guestSubtitle')
                            : t('userMenu.signInDescription')}
                        </span>
                      </div>
                    </div>

                    {hasAppServer && (
                      <>
                        <DropdownMenuItem
                          onClick={() => void navigate({ to: '/sign-in' })}
                          className="group mt-0.5 cursor-pointer justify-center gap-2 rounded-lg bg-primary py-2 text-[13px] font-semibold text-primary-foreground shadow-sm transition-[background-color,transform] duration-150 hover:bg-primary/90 focus:bg-primary/90 focus:text-primary-foreground not-data-[variant=destructive]:focus:**:text-primary-foreground active:scale-[.99]"
                        >
                          <LogIn />
                          {t('userMenu.signIn')}
                        </DropdownMenuItem>

                        <div className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
                          <ShieldCheck className="size-3 text-primary/70" />
                          {t('userMenu.guestReassurance')}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}

            <DropdownMenuSeparator />

            <DropdownMenuGroup>
              <DropdownMenuItem
                onClick={() => {
                  setSettingsOpen(true)
                }}
              >
                <Settings2 className="size-4" />
                {t('userMenu.settings')}
              </DropdownMenuItem>
            </DropdownMenuGroup>

            <DropdownMenuSeparator />

            <DropdownMenuGroup>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <Monitor className="size-4" />
                  {t('userMenu.colorMode')}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuRadioGroup
                    onValueChange={(value) => {
                      setTheme(value)
                    }}
                    value={activeTheme}
                  >
                    <DropdownMenuRadioItem value="light">
                      <Sun className="size-4" />
                      {t('userMenu.light')}
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="dark">
                      <Moon className="size-4" />
                      {t('userMenu.dark')}
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="system">
                      <Monitor className="size-4" />
                      {t('userMenu.system')}
                    </DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </DropdownMenuGroup>

            {hasSession && (
              <>
                <DropdownMenuSeparator />

                <DropdownMenuItem
                  disabled={isSigningOut}
                  onClick={onSignOut}
                  variant="destructive"
                >
                  <LogOut className="size-4" />
                  {isSigningOut
                    ? t('userMenu.signingOut')
                    : t('userMenu.signOut')}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        {isSettingsOpen && (
          <UserSettingsDialog
            customAvatarUrl={customAvatarUrl}
            hasSession={hasSession}
            initials={initials}
            onOpenChange={setSettingsOpen}
            open={isSettingsOpen}
            userEmail={userEmail}
            userImage={authUserImage}
            userName={userName}
          />
        )}
      </SidebarMenuItem>
    </SidebarMenu>
  )
}

function ThemePluginBridge({ children }: { children: ReactNode }) {
  const themePlugin = useThemePlugin()
  usePerformanceModeSync()
  return (
    <ThemePluginContext.Provider value={themePlugin}>
      {children}
    </ThemePluginContext.Provider>
  )
}
