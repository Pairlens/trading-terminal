// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Profile on the phone — the detail behind the avatar row in Settings.
 *
 * It used to be two `<p>` tags. Everything an account owner might actually
 * want from a phone was somewhere else: the photo could only be changed on a
 * desktop (which is backwards — the camera is HERE), the display name could
 * not be changed at all, and there was no way to sign out of the mobile
 * terminal short of clearing site data.
 *
 * Every write goes through the same call the desktop dialog makes —
 * `api.uploadAvatar` / `api.removeAvatar` / `authClient.updateUser` — and
 * invalidates the same two query keys, so a name changed on the phone is the
 * name the laptop shows on its next focus. The file limits and the tutorial
 * reset are shared modules (`@/lib/avatar`, `@/hooks/use-reset-tutorial`)
 * rather than copies: two surfaces enforcing "5MB, png/jpeg/webp" from two
 * literals is a drift waiting to happen.
 *
 * Feedback is toasts, not the desktop's inline error/success lines. A phone
 * form is one column tall and the message would land below the fold as often
 * as not.
 */
import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Camera,
  Cloud,
  CloudUpload,
  Loader2,
  LogIn,
  LogOut,
  RotateCcw,
  UserRound,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { cn } from '@pairlens/ui'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@pairlens/ui/components/ui/alert-dialog'
import { Button } from '@pairlens/ui/components/ui/button'
import { Input } from '@pairlens/ui/components/ui/input'
import { MobileRow } from '../primitives/mobile-row'
import { authClient, hasAppServer } from '@/lib/auth-client'
import { api, clearSessionCache, queryKeys, resolveUrl } from '@/lib/api'
import {
  ALLOWED_IMAGE_TYPES,
  AVATAR_ACCEPT,
  MAX_IMAGE_SIZE_BYTES,
} from '@/lib/avatar'
import { useResetTutorial } from '@/hooks/use-reset-tutorial'
import { useOptimisticSession } from '@/lib/session'
import { useAppVersion } from '@/lib/app-version'
import { isStandalone } from '@/lib/platform'
import { track } from '@/lib/analytics-events'

/** Shared with the Settings list row, which draws the same circle. */
export function initialsFrom(name: string): string {
  const derived = name
    .split(/[\s.@_-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((segment) => segment[0]?.toUpperCase() ?? '')
    .join('')
  return derived || 'PL'
}

/**
 * Who is signed in, resolved once for the Settings row and this screen.
 *
 * Same precedence the desktop layout uses: the App Server's user record wins
 * over the session copy (it is the one that changes when the name is edited),
 * and an uploaded avatar wins over whatever the auth provider handed us. The
 * two queries are the same keys `_terminal` already holds, so this reads the
 * warm cache rather than issuing anything.
 */
export function useProfileIdentity() {
  const { session } = useOptimisticSession()

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

  const email = currentUser?.email ?? session?.user.email ?? ''
  const name =
    currentUser?.name ?? session?.user.name ?? email.split('@')[0] ?? ''
  const customAvatarUrl = resolveUrl(userSettings?.avatarUrl) ?? null

  return {
    session,
    email,
    name,
    /** Non-null only when the user uploaded one — gates the Remove action. */
    customAvatarUrl,
    avatarUrl:
      customAvatarUrl ?? currentUser?.image ?? session?.user.image ?? undefined,
    initials: initialsFrom(name || email),
  }
}

/**
 * Signed in or not is a whole different screen, not a branch inside one — and
 * swapping between them is exactly what has to happen the moment sign-out
 * lands, while this detail is still on top of the stack.
 */
export const ProfileScreen = memo(function ProfileScreen() {
  const { session } = useOptimisticSession()
  return session ? <SignedInProfile /> : <SignedOutProfile />
})

function SignedInProfile() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [confirmSignOut, setConfirmSignOut] = useState(false)

  const {
    avatarUrl,
    customAvatarUrl,
    email,
    initials,
    name: storedName,
  } = useProfileIdentity()

  const [displayName, setDisplayName] = useState(storedName)
  // Follows the account when it changes underneath (another device renamed
  // it, or our own save landed) — never mid-keystroke, since the stored name
  // only moves on a write.
  useEffect(() => {
    setDisplayName(storedName)
  }, [storedName])

  const invalidateUserQueries = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.currentUser() }),
      queryClient.invalidateQueries({ queryKey: queryKeys.userSettings() }),
    ])
  }, [queryClient])

  const saveName = useMutation({
    mutationFn: async () => {
      const name = displayName.trim()
      if (!name) throw new Error(t('settings.profile.nameRequired'))
      const result = await authClient.updateUser({ name })
      if (result.error) {
        throw new Error(
          result.error.message ?? t('settings.profile.nameUpdateFailed'),
        )
      }
    },
    onSuccess: async () => {
      await invalidateUserQueries()
      toast.success(t('settings.profile.savedSuccess'))
    },
    onError: (error: Error) => toast.error(error.message),
  })

  const uploadAvatar = useMutation({
    mutationFn: async (file: File) => {
      // Refused here rather than at the server: a photo off the camera roll
      // is routinely tens of megabytes on a connection that is charging for
      // them.
      if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
        throw new Error(t('settings.profile.invalidImageType'))
      }
      if (file.size > MAX_IMAGE_SIZE_BYTES) {
        throw new Error(t('settings.profile.imageTooLarge'))
      }
      return api.uploadAvatar(file)
    },
    onSuccess: async () => {
      await invalidateUserQueries()
      toast.success(t('settings.profile.imageUpdated'))
    },
    onError: (error: Error) => toast.error(error.message),
  })

  const removeAvatar = useMutation({
    mutationFn: () => api.removeAvatar(),
    onSuccess: async () => {
      await invalidateUserQueries()
      toast.success(t('settings.profile.imageRemoved'))
    },
    onError: (error: Error) => toast.error(error.message),
  })

  const signOut = useMutation({
    mutationFn: async () => {
      clearSessionCache()
      const result = await authClient.signOut()
      if (result.error) {
        throw new Error(result.error.message ?? t('common.unknownError'))
      }
    },
    onSuccess: () => {
      track('signed_out')
      toast.success(t('userMenu.signedOut'))
    },
    onError: (error: Error) =>
      toast.error(t('userMenu.signOut'), { description: error.message }),
  })

  const busy =
    saveName.isPending || uploadAvatar.isPending || removeAvatar.isPending
  const trimmed = displayName.trim()
  const dirty = trimmed.length > 0 && trimmed !== storedName

  const onPickFile = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      // Reset first: picking the same file twice in a row fires no change
      // event otherwise, and "it did nothing" is indistinguishable from a
      // failed upload.
      event.target.value = ''
      if (file) uploadAvatar.mutate(file)
    },
    [uploadAvatar],
  )

  return (
    <div className="pb-8">
      <div className="flex flex-col items-center px-4 pt-2">
        <button
          aria-label={t('settings.profile.uploadImage')}
          className="relative"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
          type="button"
        >
          <AvatarCircle initials={initials} size={76} url={avatarUrl} />
          <span className="absolute -bottom-0.5 -right-0.5 flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_0_0_3px_var(--background)]">
            {uploadAvatar.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Camera className="size-3.5" />
            )}
          </span>
        </button>
        <input
          accept={AVATAR_ACCEPT}
          className="hidden"
          onChange={onPickFile}
          ref={fileRef}
          type="file"
        />

        <p className="mt-3 max-w-full truncate text-[17px] font-semibold leading-tight text-foreground">
          {storedName}
        </p>
        <p className="mt-1 max-w-full truncate text-[12.5px] text-muted-foreground">
          {email}
        </p>

        <div className="mt-2.5 flex items-center gap-2">
          <Button
            className="h-8 px-3 text-[12.5px]"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            size="sm"
            variant="outline"
          >
            {uploadAvatar.isPending
              ? t('settings.profile.uploading')
              : t('settings.profile.uploadImage')}
          </Button>
          {customAvatarUrl ? (
            <Button
              className="h-8 px-3 text-[12.5px]"
              disabled={busy}
              onClick={() => removeAvatar.mutate()}
              size="sm"
              variant="ghost"
            >
              {removeAvatar.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : null}
              {t('settings.profile.remove')}
            </Button>
          ) : null}
        </div>
        <p className="mt-2 text-center text-[11px] leading-relaxed text-muted-foreground">
          {t('settings.profile.imageHint')}
        </p>
      </div>

      <div className="px-4">
        <FieldLabel>{t('settings.profile.displayName')}</FieldLabel>
        <div className="flex items-center gap-2">
          <Input
            aria-label={t('settings.profile.displayName')}
            autoCapitalize="words"
            // 16px or iOS zooms the whole shell on focus and never zooms back.
            className="h-11 flex-1 text-[16px]"
            disabled={busy}
            enterKeyHint="done"
            onChange={(event) => setDisplayName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                if (dirty) saveName.mutate()
              }
            }}
            placeholder={t('settings.profile.namePlaceholder')}
            value={displayName}
          />
          <Button
            className="h-11 shrink-0 px-4"
            disabled={!dirty || busy}
            onClick={() => saveName.mutate()}
          >
            {saveName.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : null}
            {t('common.save')}
          </Button>
        </div>
        {/* Read-only everywhere: no change-email flow exists in the product. */}
        <FieldLabel>{t('settings.profile.email')}</FieldLabel>
        <div className="flex min-h-11 items-center rounded-xl bg-[color:var(--pl-wash)] px-3.5 shadow-[inset_0_0_0_1px_var(--pl-edge)]">
          <span className="min-w-0 truncate text-[13.5px] text-muted-foreground">
            {email}
          </span>
        </div>
      </div>

      <SectionLabel>{t('mobile.settings.accountHeader')}</SectionLabel>
      <ReplayTutorialRow />
      <MobileRow
        disabled={signOut.isPending}
        leading={<LogOut className="size-[18px] text-destructive" />}
        onPress={() => setConfirmSignOut(true)}
        title={
          <span className="text-destructive">
            {signOut.isPending
              ? t('userMenu.signingOut')
              : t('userMenu.signOut')}
          </span>
        }
      />

      <VersionFooter />

      {/* The overlay this screen lives in is z-60 and the dialog's own backdrop
          is z-50, so it would sit behind. One scrim of our own, and the popup
          raised above it — same pair the account detail uses. */}
      {confirmSignOut ? (
        <div aria-hidden className="pl-scrim fixed inset-0 z-[69]" />
      ) : null}
      <AlertDialog onOpenChange={setConfirmSignOut} open={confirmSignOut}>
        <AlertDialogContent className="z-[70]" size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('mobile.settings.signOutTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('mobile.settings.signOutBody')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault()
                setConfirmSignOut(false)
                signOut.mutate()
              }}
              variant="destructive"
            >
              {t('userMenu.signOut')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/**
 * Signed out, the screen's job is to say what an account buys — the same three
 * promises the desktop prompt makes, at a density that does not need a card
 * inside a card to hold them.
 */
function SignedOutProfile() {
  const { t } = useTranslation()

  const benefits = [
    { icon: Cloud, text: t('settings.profile.signInBenefitSync') },
    { icon: UserRound, text: t('settings.profile.signInBenefitProfile') },
    { icon: CloudUpload, text: t('settings.profile.signInBenefitBackup') },
  ]

  return (
    <div className="pb-8">
      <div className="flex flex-col items-center px-4 pt-2 text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-[color:var(--pl-wash-strong)]">
          <UserRound className="size-7 text-muted-foreground" />
        </span>
        <p className="mt-3 text-[17px] font-semibold leading-tight text-foreground">
          {t('settings.profile.signInTitle')}
        </p>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
          {t('settings.profile.signInDescription')}
        </p>
      </div>

      <div className="mt-5 space-y-2.5 px-4">
        {benefits.map(({ icon: Icon, text }) => (
          <div className="flex items-center gap-3" key={text}>
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <Icon className="size-4 text-primary" />
            </span>
            <span className="text-[12.5px] leading-snug text-foreground">
              {text}
            </span>
          </div>
        ))}
      </div>

      {/* Standalone builds have no account to sign into; the benefits above
          still explain what the App Server would add. */}
      {hasAppServer ? (
        <div className="px-4 pt-5">
          <a
            className="flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-[15px] font-semibold text-primary-foreground"
            href="/sign-in"
          >
            <LogIn className="size-4" />
            {t('settings.profile.signInButton')}
          </a>
        </div>
      ) : null}

      <SectionLabel>{t('mobile.settings.accountHeader')}</SectionLabel>
      <ReplayTutorialRow />
      <VersionFooter />
    </div>
  )
}

/**
 * Offered signed in AND signed out, exactly like the desktop section: the
 * tutorial is a property of the install, not of the account.
 */
function ReplayTutorialRow() {
  const { t } = useTranslation()
  const resetTutorial = useResetTutorial()

  return (
    <MobileRow
      leading={<RotateCcw className="size-[18px] text-muted-foreground" />}
      onPress={resetTutorial}
      subtitle={t('settings.profile.resetTutorialDescription')}
      title={t('settings.profile.resetTutorialTitle')}
    />
  )
}

/**
 * Which build is running. The desktop parks this in the settings sidebar; the
 * phone has no sidebar, so it sits at the bottom of the one screen people
 * already open when asked "what version are you on?".
 */
function VersionFooter() {
  const { t } = useTranslation()
  const version = useAppVersion()

  return (
    <p className="px-4 pt-6 text-center text-[11px] text-muted-foreground tabular-nums">
      Pairlens v{version}
      <span className="px-1">·</span>
      {isStandalone ? t('settings.about.desktop') : t('settings.about.browser')}
    </p>
  )
}

/**
 * `<img>` and not the shared `Avatar`: the base-ui component draws a blended
 * ring that reads as a grey halo against the phone's dark wash at this size,
 * and the fallback here is the primary-tinted circle the settings list already
 * uses, not a muted square.
 */
export function AvatarCircle({
  url,
  initials,
  size,
}: {
  url: string | undefined
  initials: string
  size: number
}) {
  const [failed, setFailed] = useState(false)
  // A new URL deserves a new attempt — a removed-then-re-uploaded avatar would
  // otherwise stay stuck on the fallback for the life of the screen.
  useEffect(() => {
    setFailed(false)
  }, [url])

  const dimension = { height: size, width: size }

  if (url && !failed) {
    return (
      <img
        alt=""
        className="rounded-full object-cover"
        onError={() => setFailed(true)}
        src={url}
        style={dimension}
      />
    )
  }

  return (
    <span
      className={cn(
        'flex items-center justify-center rounded-full font-semibold text-foreground',
        size >= 64 ? 'text-[22px]' : 'text-[13px]',
      )}
      style={{
        ...dimension,
        background:
          'linear-gradient(135deg, color-mix(in oklch, var(--primary) 32%, transparent), color-mix(in oklch, var(--primary) 9%, transparent))',
        boxShadow:
          'inset 0 0 0 1px color-mix(in oklch, var(--primary) 24%, transparent)',
      }}
    >
      {initials}
    </span>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="pb-2 pt-6 text-[9.5px] font-semibold uppercase leading-none tracking-[0.09em] text-muted-foreground">
      {children}
    </h3>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="px-4 pb-1.5 pt-6 text-[9.5px] font-semibold uppercase leading-none tracking-[0.09em] text-muted-foreground">
      {children}
    </h3>
  )
}
