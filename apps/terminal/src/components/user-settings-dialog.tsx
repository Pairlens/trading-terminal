// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
'use client'

import * as React from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import {
  AppWindow,
  CircleUser,
  Cloud,
  CloudUpload,
  Coins,
  Fingerprint,
  Gauge,
  Globe,
  Keyboard,
  Loader2,
  Lock,
  LogIn,
  MapPin,
  Paintbrush,
  Puzzle,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Upload,
  UserRound,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@pairlens/ui/components/ui/avatar'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@pairlens/ui/components/ui/breadcrumb'
import { Button } from '@pairlens/ui/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@pairlens/ui/components/ui/dialog'
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@pairlens/ui/components/ui/field'
import { Input } from '@pairlens/ui/components/ui/input'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInput,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from '@pairlens/ui/components/ui/sidebar'
import type { SettingsSearchEntry } from '@/components/settings/settings-search-index'
import { searchSettings } from '@/components/settings/settings-search-index'
import { track } from '@/lib/analytics-events'

import { authClient, hasAppServer } from '@/lib/auth-client'
import { api, queryKeys } from '@/lib/api'
import { useSettingsDialogStore } from '@/stores/settings-dialog-store'
import { useAppVersion } from '@/lib/app-version'
import { isStandalone } from '@/lib/platform'

import {
  SECTION_TOURS_DISABLED_KEY,
  SECTION_TOURS_SEEN_KEY,
} from '@/components/onboarding/use-section-tour'
import { ONBOARDING_KEY } from '@/lib/onboarding-state'

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])

// Lazy-load non-profile sections (single chunk, split per named export)
const loadSections = () => import('./user-settings-sections')
const LazyPluginsSection = React.lazy(() =>
  loadSections().then((m) => ({ default: m.PluginsSection })),
)
const LazyAppearanceSection = React.lazy(() =>
  loadSections().then((m) => ({ default: m.AppearanceSection })),
)
const LazyPerformanceSection = React.lazy(() =>
  loadSections().then((m) => ({ default: m.PerformanceSection })),
)
const LazyLanguageSection = React.lazy(() =>
  loadSections().then((m) => ({ default: m.LanguageSection })),
)
const LazyRegionSection = React.lazy(() =>
  loadSections().then((m) => ({ default: m.RegionSection })),
)
const LazyCurrencySection = React.lazy(() =>
  loadSections().then((m) => ({ default: m.CurrencySection })),
)
const LazyRiskSection = React.lazy(() =>
  loadSections().then((m) => ({ default: m.RiskSection })),
)
const LazyPrivacySection = React.lazy(() =>
  loadSections().then((m) => ({ default: m.PrivacySection })),
)
const LazyIntelligenceSection = React.lazy(() =>
  loadSections().then((m) => ({ default: m.IntelligenceSection })),
)
// Keyboard lives in its own chunk: it pulls in the whole command catalog and
// almost nobody opens it, so it shouldn't ride along with the common sections.
const LazyKeyboardSection = React.lazy(() =>
  import('./settings/keyboard-section').then((m) => ({
    default: m.KeyboardSection,
  })),
)
// Security is its own chunk for the same reason as Keyboard: it carries its
// own dialogs and a page of threat-model copy that nobody who never opens it
// should have to download.
const LazySecuritySection = React.lazy(() =>
  import('./settings/security-section').then((m) => ({
    default: m.SecuritySection,
  })),
)
// Desktop is its own chunk too: it only exists in the Tauri build, so a
// browser bundle should never carry it.
const LazyDesktopSection = React.lazy(() =>
  import('./settings/desktop-section').then((m) => ({
    default: m.DesktopSection,
  })),
)
// Cloud Sync only exists when an App Server is configured, and it drags in the
// sync taxonomy — its own chunk, same reasoning as Desktop.
const LazyCloudSyncSection = React.lazy(() =>
  import('./settings/cloud-sync-section').then((m) => ({
    default: m.CloudSyncSection,
  })),
)

function SectionFallback() {
  return (
    <div className="flex h-32 items-center justify-center">
      <Loader2 className="size-5 animate-spin text-muted-foreground" />
    </div>
  )
}

/**
 * Profile is not in a group: it renders as the identity card at the top of
 * the sidebar (avatar, name, email), the way Apple's System Settings leads
 * with the account.
 */
const PROFILE_NAV_ITEM = {
  id: 'profile',
  nameKey: 'settings.nav.profile',
  icon: CircleUser,
} as const

/**
 * The rest of the sidebar, clustered by what a section configures: Pairlens
 * services (things that ride on your account), trading, protection, the app
 * itself, and locale. The gap between clusters is the only separator —
 * grouping conveyed by negative space, not labels.
 */
const SETTINGS_NAV_GROUPS = [
  [
    { id: 'billing', nameKey: 'settings.nav.billing', icon: Sparkles },
    { id: 'cloud-sync', nameKey: 'settings.nav.cloudSync', icon: Cloud },
  ],
  [
    { id: 'risk', nameKey: 'settings.nav.risk', icon: ShieldCheck },
    { id: 'plugins', nameKey: 'settings.nav.plugins', icon: Puzzle },
  ],
  [
    { id: 'security', nameKey: 'settings.nav.security', icon: Lock },
    { id: 'privacy', nameKey: 'settings.nav.privacy', icon: Fingerprint },
  ],
  [
    { id: 'appearance', nameKey: 'settings.nav.appearance', icon: Paintbrush },
    { id: 'keyboard', nameKey: 'settings.nav.keyboard', icon: Keyboard },
    { id: 'performance', nameKey: 'settings.nav.performance', icon: Gauge },
    { id: 'desktop', nameKey: 'settings.nav.desktop', icon: AppWindow },
  ],
  [
    { id: 'language', nameKey: 'settings.nav.language', icon: Globe },
    { id: 'region', nameKey: 'settings.nav.region', icon: MapPin },
    { id: 'currency', nameKey: 'settings.nav.currency', icon: Coins },
  ],
] as const

const SETTINGS_NAV = [PROFILE_NAV_ITEM, ...SETTINGS_NAV_GROUPS.flat()] as const

export type SettingsNavId = (typeof SETTINGS_NAV)[number]['id']

/** Sections that only exist in the Tauri build. */
const DESKTOP_ONLY_SECTIONS = new Set<string>(['desktop'])

/** Sections that only mean anything when there is an account to sync with. */
const APP_SERVER_ONLY_SECTIONS = new Set<string>(['cloud-sync'])

const isSectionVisible = (id: string) =>
  (isStandalone || !DESKTOP_ONLY_SECTIONS.has(id)) &&
  (hasAppServer || !APP_SERVER_ONLY_SECTIONS.has(id))

/**
 * What the sidebar actually renders, and what a deep link may resolve to. An
 * additive filter over the grouped nav rather than a second list, so the nav
 * order and typing stay derived from one place — and so a stale `?section=`
 * deep link in a browser build falls back to Profile instead of opening an
 * empty pane. Groups that filter down to nothing disappear entirely, taking
 * their gap with them.
 */
const VISIBLE_SETTINGS_NAV_GROUPS = SETTINGS_NAV_GROUPS.map((group) =>
  group.filter((item) => isSectionVisible(item.id)),
).filter((group) => group.length > 0)

const VISIBLE_SETTINGS_NAV = [
  PROFILE_NAV_ITEM,
  ...VISIBLE_SETTINGS_NAV_GROUPS.flat(),
]

/** What settings search may return results for. */
const VISIBLE_SECTION_IDS: ReadonlySet<string> = new Set(
  VISIBLE_SETTINGS_NAV.map((item) => item.id),
)

type UserSettingsDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  userName: string
  userEmail: string
  userImage?: string
  customAvatarUrl?: string | null
  initials: string
  hasSession: boolean
}

export default function UserSettingsDialog({
  open,
  onOpenChange,
  userName,
  userEmail,
  userImage,
  customAvatarUrl,
  initials,
  hasSession,
}: UserSettingsDialogProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const [activeSection, setActiveSection] = React.useState<SettingsNavId>(
    () =>
      VISIBLE_SETTINGS_NAV.find(
        (n) => n.id === useSettingsDialogStore.getState().section,
      )?.id ?? 'profile',
  )
  const [searchQuery, setSearchQuery] = React.useState('')
  const [displayName, setDisplayName] = React.useState(userName)
  const [localCustomAvatarUrl, setLocalCustomAvatarUrl] = React.useState<
    string | null
  >(customAvatarUrl ?? null)
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null)
  const [successMessage, setSuccessMessage] = React.useState<string | null>(
    null,
  )

  React.useEffect(() => {
    if (!open) {
      return
    }

    setDisplayName(userName)
    setLocalCustomAvatarUrl(customAvatarUrl ?? null)
    setErrorMessage(null)
    setSuccessMessage(null)
    setSearchQuery('')
    // Honor a requested section (deep links from omni search, risk pane,
    // geo dialog, …); default to profile otherwise.
    setActiveSection(
      VISIBLE_SETTINGS_NAV.find(
        (n) => n.id === useSettingsDialogStore.getState().section,
      )?.id ?? 'profile',
    )
  }, [customAvatarUrl, open, userName])

  const invalidateUserQueries = React.useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.currentUser() }),
      queryClient.invalidateQueries({ queryKey: queryKeys.userSettings() }),
    ])
  }, [queryClient])

  const saveName = useMutation({
    mutationFn: async () => {
      const name = displayName.trim()
      if (!name) {
        throw new Error(t('settings.profile.nameRequired'))
      }

      const result = await authClient.updateUser({ name })
      if (result.error) {
        throw new Error(
          result.error.message ?? t('settings.profile.nameUpdateFailed'),
        )
      }
    },
    onMutate: () => {
      setErrorMessage(null)
      setSuccessMessage(null)
    },
    onSuccess: async () => {
      await invalidateUserQueries()
      setSuccessMessage(t('settings.profile.savedSuccess'))
    },
    onError: (error) => {
      setErrorMessage(error.message)
    },
  })

  const uploadAvatar = useMutation({
    mutationFn: async (file: File) => {
      if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
        throw new Error(t('settings.profile.invalidImageType'))
      }

      if (file.size > MAX_IMAGE_SIZE_BYTES) {
        throw new Error(t('settings.profile.imageTooLarge'))
      }

      return api.uploadAvatar(file)
    },
    onMutate: () => {
      setErrorMessage(null)
      setSuccessMessage(null)
    },
    onSuccess: async (result) => {
      setLocalCustomAvatarUrl(result.avatarUrl)
      await invalidateUserQueries()
      setSuccessMessage(t('settings.profile.imageUpdated'))
    },
    onError: (error) => {
      setErrorMessage(error.message)
    },
  })

  const removeAvatar = useMutation({
    mutationFn: async () => {
      return api.removeAvatar()
    },
    onMutate: () => {
      setErrorMessage(null)
      setSuccessMessage(null)
    },
    onSuccess: async () => {
      setLocalCustomAvatarUrl(null)
      await invalidateUserQueries()
      setSuccessMessage(t('settings.profile.imageRemoved'))
    },
    onError: (error) => {
      setErrorMessage(error.message)
    },
  })

  const currentSection = React.useMemo(
    () =>
      SETTINGS_NAV.find((item) => item.id === activeSection) ?? SETTINGS_NAV[0],
    [activeSection],
  )

  const isSearching = searchQuery.trim().length > 0

  // Landing on a section — via the nav or a search result — always leaves
  // search mode, otherwise the results pane would keep covering the content.
  const openSection = React.useCallback((id: SettingsNavId) => {
    setSearchQuery('')
    setActiveSection(id)
  }, [])

  const searchResults = React.useMemo(
    () =>
      isSearching
        ? searchSettings(searchQuery, t, VISIBLE_SECTION_IDS, (section) =>
            t(
              SETTINGS_NAV.find((item) => item.id === section)?.nameKey ??
                'settings.nav.profile',
            ),
          )
        : [],
    [isSearching, searchQuery, t],
  )

  React.useEffect(() => {
    track('settings_section_viewed', { section: activeSection })
  }, [activeSection])

  const isBusy =
    saveName.isPending || uploadAvatar.isPending || removeAvatar.isPending
  const avatarToRender = localCustomAvatarUrl ?? userImage
  const hasCustomAvatar = Boolean(localCustomAvatarUrl)

  const onChooseAvatarFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    uploadAvatar.mutate(file)
    event.target.value = ''
  }

  const onSaveProfile = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    saveName.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Roomy on purpose: the settings surface has grown past a dozen
          sections, and the keyboard editor needs a wide row for command name +
          chord chips + row actions without wrapping. Height tracks the viewport
          so short laptop screens still get a dialog that fits. */}
      <DialogContent className="overflow-hidden p-0 md:h-[min(46rem,calc(100dvh-3rem))] md:max-h-[calc(100dvh-2rem)] md:max-w-[56rem] lg:max-w-[66rem]">
        <DialogTitle className="sr-only">{t('settings.title')}</DialogTitle>
        <DialogDescription className="sr-only">
          {t('settings.description')}
        </DialogDescription>
        {/* The dialog owns the height; provider and both columns fill it, so
            the version footer always sits flush on the dialog's bottom edge.
            Fixed column heights clipped the footer on desktop, where webview
            font metrics render the nav slightly taller than in Chrome. The
            provider's own min-h-svh must be neutralized at md or it stretches
            the columns to viewport height inside the clipped dialog. */}
        <SidebarProvider className="items-start md:h-full md:min-h-0">
          <Sidebar
            collapsible="none"
            className="hidden border-r md:flex md:h-full md:w-64"
          >
            <SidebarHeader className="gap-0 p-0">
              {/* Same h-16 + border-b as the main pane's breadcrumb header, so
                  the divider runs as one line across the whole dialog. */}
              <div className="flex h-16 shrink-0 items-center border-b px-2">
                <div className="relative w-full">
                  <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                  <SidebarInput
                    className="pl-8"
                    onChange={(event) => setSearchQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape' && isSearching) {
                        event.stopPropagation()
                        setSearchQuery('')
                      } else if (event.key === 'Enter' && searchResults[0]) {
                        openSection(searchResults[0].section)
                      }
                    }}
                    placeholder={t('settings.search.placeholder')}
                    value={searchQuery}
                  />
                </div>
              </div>
              <SidebarMenu className="px-2 pt-3">
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={!isSearching && activeSection === 'profile'}
                    onClick={() => openSection('profile')}
                    size="lg"
                    type="button"
                  >
                    <Avatar size="lg">
                      <AvatarImage
                        alt={displayName || userName}
                        src={avatarToRender}
                      />
                      <AvatarFallback>
                        {hasSession ? (
                          initials
                        ) : (
                          <UserRound className="size-5" />
                        )}
                      </AvatarFallback>
                    </Avatar>
                    <div className="grid flex-1 text-left leading-tight">
                      <span className="truncate text-sm font-medium">
                        {hasSession ? userName : t('settings.nav.profile')}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {hasSession
                          ? userEmail
                          : t('settings.profile.notSignedIn')}
                      </span>
                    </div>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarHeader>
            <SidebarContent>
              {VISIBLE_SETTINGS_NAV_GROUPS.map((group) => (
                <SidebarGroup key={group[0].id} className="py-1.5">
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {group.map((item) => (
                        <SidebarMenuItem key={item.id}>
                          <SidebarMenuButton
                            isActive={!isSearching && item.id === activeSection}
                            onClick={() => openSection(item.id)}
                            type="button"
                          >
                            <item.icon />
                            <span>{t(item.nameKey)}</span>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      ))}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              ))}
            </SidebarContent>
            <AppVersionFooter />
          </Sidebar>
          <main className="flex h-[34rem] flex-1 flex-col overflow-hidden md:h-full">
            <header className="flex h-16 shrink-0 items-center border-b">
              <div className="flex items-center gap-2 px-4">
                <Breadcrumb>
                  <BreadcrumbList>
                    <BreadcrumbItem className="hidden md:block">
                      <BreadcrumbLink href="#">
                        {t('settings.title')}
                      </BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator className="hidden md:block" />
                    <BreadcrumbItem>
                      <BreadcrumbPage>
                        {isSearching
                          ? t('settings.search.title')
                          : t(currentSection.nameKey)}
                      </BreadcrumbPage>
                    </BreadcrumbItem>
                  </BreadcrumbList>
                </Breadcrumb>
              </div>
            </header>
            <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
              {isSearching ? (
                <SettingsSearchResults
                  onNavigate={openSection}
                  query={searchQuery}
                  results={searchResults}
                />
              ) : activeSection === 'profile' ? (
                !hasSession ? (
                  <>
                    <ProfileSignInPrompt />
                    <ResetTutorialSection />
                  </>
                ) : (
                  <>
                    <form
                      className="max-w-4xl space-y-5"
                      onSubmit={onSaveProfile}
                    >
                      <section className="rounded-xl border p-4">
                        <h3 className="font-medium">
                          {t('settings.profile.image')}
                        </h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {t('settings.profile.imageDescription')}
                        </p>
                        <div className="mt-4 flex items-center gap-4">
                          <Avatar className="size-16 after:size-16">
                            <AvatarImage
                              alt={displayName || userName}
                              src={avatarToRender}
                            />
                            <AvatarFallback>{initials}</AvatarFallback>
                          </Avatar>
                          <div className="space-y-2">
                            <input
                              accept={Array.from(ALLOWED_IMAGE_TYPES).join(',')}
                              className="hidden"
                              onChange={onChooseAvatarFile}
                              ref={fileInputRef}
                              type="file"
                            />
                            <div className="flex items-center gap-2">
                              <Button
                                disabled={isBusy}
                                onClick={() => fileInputRef.current?.click()}
                                size="sm"
                                type="button"
                                variant="outline"
                              >
                                <Upload className="size-4" />
                                {uploadAvatar.isPending
                                  ? t('settings.profile.uploading')
                                  : t('settings.profile.uploadImage')}
                              </Button>
                              <Button
                                disabled={isBusy || !hasCustomAvatar}
                                onClick={() => removeAvatar.mutate()}
                                size="sm"
                                type="button"
                                variant="ghost"
                              >
                                {t('settings.profile.remove')}
                              </Button>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {t('settings.profile.imageHint')}
                            </p>
                          </div>
                        </div>
                      </section>

                      <FieldGroup>
                        <Field>
                          <FieldLabel htmlFor="settings-display-name">
                            {t('settings.profile.displayName')}
                          </FieldLabel>
                          <Input
                            disabled={isBusy}
                            id="settings-display-name"
                            onChange={(event) =>
                              setDisplayName(event.target.value)
                            }
                            placeholder={t('settings.profile.namePlaceholder')}
                            value={displayName}
                          />
                        </Field>

                        <Field>
                          <FieldLabel htmlFor="settings-email">
                            {t('settings.profile.email')}
                          </FieldLabel>
                          <Input
                            disabled
                            id="settings-email"
                            value={userEmail}
                          />
                        </Field>
                      </FieldGroup>

                      {errorMessage ? (
                        <FieldError>{errorMessage}</FieldError>
                      ) : null}
                      {successMessage ? (
                        <p className="text-sm text-green-700 dark:text-green-400">
                          {successMessage}
                        </p>
                      ) : null}

                      <div className="flex items-center justify-end">
                        <Button disabled={isBusy} type="submit">
                          {saveName.isPending
                            ? t('settings.profile.saving')
                            : t('settings.profile.saveChanges')}
                        </Button>
                      </div>
                    </form>
                    <ResetTutorialSection />
                  </>
                )
              ) : (
                <React.Suspense fallback={<SectionFallback />}>
                  {activeSection === 'plugins' ? (
                    <LazyPluginsSection />
                  ) : activeSection === 'appearance' ? (
                    <LazyAppearanceSection />
                  ) : activeSection === 'performance' ? (
                    <LazyPerformanceSection />
                  ) : activeSection === 'language' ? (
                    <LazyLanguageSection />
                  ) : activeSection === 'region' ? (
                    <LazyRegionSection />
                  ) : activeSection === 'currency' ? (
                    <LazyCurrencySection />
                  ) : activeSection === 'risk' ? (
                    <LazyRiskSection />
                  ) : activeSection === 'privacy' ? (
                    <LazyPrivacySection />
                  ) : activeSection === 'security' ? (
                    <LazySecuritySection />
                  ) : activeSection === 'keyboard' ? (
                    <LazyKeyboardSection />
                  ) : activeSection === 'desktop' ? (
                    <LazyDesktopSection />
                  ) : activeSection === 'cloud-sync' ? (
                    <LazyCloudSyncSection />
                  ) : activeSection === 'billing' ? (
                    <LazyIntelligenceSection />
                  ) : (
                    <div className="max-w-4xl rounded-xl border border-dashed p-5">
                      <h3 className="font-medium">
                        {t(currentSection.nameKey)}
                      </h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {t('settings.comingSoon')}
                      </p>
                    </div>
                  )}
                </React.Suspense>
              )}
            </div>
          </main>
        </SidebarProvider>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Which build is running — the answer to "what version am I on?", parked
 * where people already go looking for it. Desktop reports the installed
 * bundle's version (from Tauri), browser builds the version baked in at
 * build time; see @/lib/app-version.
 */
function AppVersionFooter() {
  const { t } = useTranslation()
  const version = useAppVersion()
  const platform = isStandalone
    ? t('settings.about.desktop')
    : t('settings.about.browser')

  return (
    <SidebarFooter className="shrink-0 border-t">
      <p className="truncate px-2 text-xs text-muted-foreground tabular-nums">
        Pairlens v{version}
        <span className="px-1">·</span>
        {platform}
      </p>
    </SidebarFooter>
  )
}

/**
 * The main pane while a search query is active: matching settings grouped
 * under their section, in nav order. Rows jump to the section — the sections
 * themselves are lazy chunks, so search points rather than inlines.
 */
function SettingsSearchResults({
  onNavigate,
  query,
  results,
}: {
  onNavigate: (section: SettingsNavId) => void
  query: string
  results: Array<SettingsSearchEntry>
}) {
  const { t } = useTranslation()

  if (results.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground">
          {t('settings.search.noResults', { query: query.trim() })}
        </p>
      </div>
    )
  }

  const sections = VISIBLE_SETTINGS_NAV.filter((item) =>
    results.some((entry) => entry.section === item.id),
  )

  return (
    <div className="max-w-4xl space-y-5">
      {sections.map((item) => (
        <section key={item.id}>
          <h3 className="flex items-center gap-1.5 px-1 text-xs font-medium text-muted-foreground">
            <item.icon className="size-3.5" />
            {t(item.nameKey)}
          </h3>
          <ul className="mt-2 space-y-2">
            {results
              .filter((entry) => entry.section === item.id)
              .map((entry) => (
                <li key={entry.titleKey}>
                  <button
                    className="w-full rounded-xl border p-3 text-left transition-colors hover:bg-accent/50"
                    onClick={() => onNavigate(entry.section)}
                    type="button"
                  >
                    <span className="block text-sm font-medium">
                      {t(entry.titleKey)}
                    </span>
                    {entry.descriptionKey ? (
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {t(entry.descriptionKey)}
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

function ProfileSignInPrompt() {
  const { t } = useTranslation()

  const benefits = [
    {
      icon: Cloud,
      text: t('settings.profile.signInBenefitSync'),
    },
    {
      icon: UserRound,
      text: t('settings.profile.signInBenefitProfile'),
    },
    {
      icon: CloudUpload,
      text: t('settings.profile.signInBenefitBackup'),
    },
  ]

  return (
    <div className="max-w-4xl space-y-5">
      <section className="rounded-xl border p-6">
        <div className="flex flex-col items-center text-center">
          <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-muted">
            <UserRound className="size-7 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold">
            {t('settings.profile.signInTitle')}
          </h3>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            {t('settings.profile.signInDescription')}
          </p>
        </div>

        <div className="mt-6 space-y-3">
          {benefits.map(({ icon: Icon, text }) => (
            <div key={text} className="flex items-center gap-3 text-sm">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <Icon className="size-4 text-primary" />
              </div>
              <span>{text}</span>
            </div>
          ))}
        </div>

        {hasAppServer && (
          <div className="mt-6 flex justify-center">
            <a href="/sign-in">
              <Button>
                <LogIn className="size-4" />
                {t('settings.profile.signInButton')}
              </Button>
            </a>
          </div>
        )}
      </section>
    </div>
  )
}

function ResetTutorialSection() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  // Clearing the flag re-arms the /_terminal gate; jump straight into the
  // replayed onboarding instead of waiting for the next reload.
  const handleReset = () => {
    localStorage.removeItem(ONBOARDING_KEY)
    localStorage.removeItem(SECTION_TOURS_SEEN_KEY)
    localStorage.removeItem(SECTION_TOURS_DISABLED_KEY)
    useSettingsDialogStore.getState().close()
    void navigate({ to: '/onboarding' })
  }

  return (
    <section className="max-w-4xl rounded-xl border p-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-medium">
            {t('settings.profile.resetTutorialTitle')}
          </h3>
          <p className="text-xs text-muted-foreground">
            {t('settings.profile.resetTutorialDescription')}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={handleReset}>
          <RotateCcw className="size-4" />
          {t('settings.profile.resetTutorialButton')}
        </Button>
      </div>
    </section>
  )
}
