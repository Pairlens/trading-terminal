// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
'use client'

import * as React from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import {
  CircleUser,
  Cloud,
  CloudUpload,
  Coins,
  Fingerprint,
  Gauge,
  Globe,
  Loader2,
  LogIn,
  MapPin,
  Paintbrush,
  Puzzle,
  RotateCcw,
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
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from '@pairlens/ui/components/ui/sidebar'
import { track } from '@/lib/analytics-events'

import { authClient, hasAppServer } from '@/lib/auth-client'
import { api, queryKeys } from '@/lib/api'
import { useSettingsDialogStore } from '@/stores/settings-dialog-store'

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

function SectionFallback() {
  return (
    <div className="flex h-32 items-center justify-center">
      <Loader2 className="size-5 animate-spin text-muted-foreground" />
    </div>
  )
}

const SETTINGS_NAV = [
  { id: 'profile', nameKey: 'settings.nav.profile', icon: CircleUser },
  { id: 'billing', nameKey: 'settings.nav.billing', icon: Sparkles },
  { id: 'plugins', nameKey: 'settings.nav.plugins', icon: Puzzle },
  { id: 'region', nameKey: 'settings.nav.region', icon: MapPin },
  { id: 'currency', nameKey: 'settings.nav.currency', icon: Coins },
  { id: 'risk', nameKey: 'settings.nav.risk', icon: ShieldCheck },
  { id: 'appearance', nameKey: 'settings.nav.appearance', icon: Paintbrush },
  { id: 'performance', nameKey: 'settings.nav.performance', icon: Gauge },
  { id: 'privacy', nameKey: 'settings.nav.privacy', icon: Fingerprint },
  { id: 'language', nameKey: 'settings.nav.language', icon: Globe },
] as const

type SettingsNavId = (typeof SETTINGS_NAV)[number]['id']

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
      SETTINGS_NAV.find(
        (n) => n.id === useSettingsDialogStore.getState().section,
      )?.id ?? 'profile',
  )
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
    // Honor a requested section (deep links from omni search, risk pane,
    // geo dialog, …); default to profile otherwise.
    setActiveSection(
      SETTINGS_NAV.find(
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
      <DialogContent className="overflow-hidden p-0 md:max-h-[500px] md:max-w-[720px] lg:max-w-[820px]">
        <DialogTitle className="sr-only">{t('settings.title')}</DialogTitle>
        <DialogDescription className="sr-only">
          {t('settings.description')}
        </DialogDescription>
        <SidebarProvider className="items-start">
          <Sidebar
            collapsible="none"
            className="hidden border-r md:flex md:w-64"
          >
            <SidebarContent>
              <SidebarGroup>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {SETTINGS_NAV.map((item) => (
                      <SidebarMenuItem key={item.id}>
                        <SidebarMenuButton
                          isActive={item.id === activeSection}
                          onClick={() => setActiveSection(item.id)}
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
            </SidebarContent>
          </Sidebar>
          <main className="flex h-[480px] flex-1 flex-col overflow-hidden">
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
                        {t(currentSection.nameKey)}
                      </BreadcrumbPage>
                    </BreadcrumbItem>
                  </BreadcrumbList>
                </Breadcrumb>
              </div>
            </header>
            <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
              {activeSection === 'profile' ? (
                !hasSession ? (
                  <>
                    <ProfileSignInPrompt />
                    <ResetTutorialSection />
                  </>
                ) : (
                  <>
                    <form
                      className="max-w-2xl space-y-5"
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
                  ) : activeSection === 'billing' ? (
                    <LazyIntelligenceSection />
                  ) : (
                    <div className="max-w-2xl rounded-xl border border-dashed p-5">
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
    <div className="max-w-2xl space-y-5">
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
    <section className="max-w-2xl rounded-xl border p-4">
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
