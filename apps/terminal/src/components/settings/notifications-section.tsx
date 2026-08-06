// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import * as React from 'react'
import {
  AlertTriangle,
  Check,
  ExternalLink,
  Loader2,
  MessageCircle,
  Send,
  Trash2,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@pairlens/ui/components/ui/button'
import { Input } from '@pairlens/ui/components/ui/input'

import type { TFunction } from 'i18next'
import type { TelegramChat } from '@/lib/notifications/telegram'
import { VaultEnrollmentDialog } from '@/components/security/vault-enrollment-dialog'
import { useTelegramConnection } from '@/hooks/use-telegram-connection'
import { isVaultEnrollmentRequired } from '@/lib/security/vault/vault-errors'
import {
  TelegramApiError,
  connectTelegramBot,
  disconnectTelegram,
  fetchRecentChats,
  formatTelegramMessage,
  looksLikeBotToken,
  readTelegramToken,
  sendTelegramText,
  setTelegramChat,
} from '@/lib/notifications/telegram'

/** How long "Waiting for you to press Start" keeps polling before giving up. */
const CHAT_POLL_TIMEOUT_MS = 120_000
const CHAT_POLL_INTERVAL_MS = 2_000

type Feedback = { type: 'success' | 'error'; message: string } | null

/**
 * Bot API failures, in words that name the fix.
 *
 * Telegram's own `description` is precise and useless to the person holding
 * the phone — "Unauthorized" is what a wrong token says, "Forbidden" is what a
 * bot nobody pressed Start on says, and neither tells you which. The handful
 * of codes that a setup flow can actually produce get real copy; anything else
 * keeps Telegram's text, which beats a generic failure.
 */
function describeError(
  error: unknown,
  t: TFunction,
  /** Catalog key under `settings.notifications.telegram` for a failure with
   *  no Telegram error behind it at all — a dead network, a sealed vault. */
  fallbackKey: 'connectFailed' | 'testFailed' | 'chatFailed',
): string {
  if (error instanceof TelegramApiError) {
    const key =
      error.code === 401 || error.code === 404
        ? 'errorUnauthorized'
        : error.code === 403
          ? 'errorForbidden'
          : error.code === 409
            ? 'errorConflict'
            : error.code === 429
              ? 'errorRateLimited'
              : error.description.toLowerCase().includes('chat not found')
                ? 'errorChatNotFound'
                : null
    if (key) return t(`settings.notifications.telegram.${key}`)
    return error.description
  }
  if (error instanceof Error) return error.message
  return t(`settings.notifications.telegram.${fallbackKey}`)
}

/**
 * Notification delivery settings.
 *
 * Telegram is the only thing here so far, and it is here rather than on the
 * notifications canvas for one reason: the bot token is a credential. It goes
 * to the keychain next to the exchange keys, so it belongs on the same kind of
 * surface as those — a place where connecting and revoking are both obvious —
 * rather than in a node's config panel where it would look like rule data and
 * get synced like rule data.
 */
export function NotificationsSection() {
  const { t } = useTranslation()
  const connection = useTelegramConnection()

  return (
    <div className="max-w-4xl space-y-5">
      <section className="rounded-xl border p-4">
        <div className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Send className="size-4 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-medium">
              {t('settings.notifications.telegram.title')}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {t('settings.notifications.telegram.description')}
            </p>
            {/* Telegram moves an alert off this machine; it does not keep the
                rule running. Someone who reads "reaches your phone" as "works
                while Pairlens is shut" finds out by missing the alert. */}
            <p className="mt-1.5 text-xs text-muted-foreground">
              {t('settings.notifications.telegram.runningNote')}
            </p>
          </div>
        </div>

        <div className="mt-4">
          {connection ? <ConnectedCard /> : <ConnectForm />}
        </div>

        <p className="mt-4 border-t pt-3 text-xs text-muted-foreground">
          {t('settings.notifications.telegram.privacyNote')}
        </p>
      </section>
    </div>
  )
}

// ── Not connected ────────────────────────────────────────────────────

function ConnectForm() {
  const { t } = useTranslation()
  const [token, setToken] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [feedback, setFeedback] = React.useState<Feedback>(null)
  const [enrollOpen, setEnrollOpen] = React.useState(false)
  const pendingAction = React.useRef<(() => void) | null>(null)

  const handleConnect = async () => {
    const trimmed = token.trim()
    if (!looksLikeBotToken(trimmed)) {
      setFeedback({
        type: 'error',
        message: t('settings.notifications.telegram.invalidToken'),
      })
      return
    }

    setBusy(true)
    setFeedback(null)
    try {
      await connectTelegramBot(trimmed)
      setToken('')
    } catch (error) {
      // A browser profile with no vault protector cannot hold a credential at
      // all. Enroll, then repeat the connect the user already asked for.
      if (isVaultEnrollmentRequired(error)) {
        pendingAction.current = () => void handleConnect()
        setEnrollOpen(true)
        return
      }
      setFeedback({
        type: 'error',
        message: describeError(error, t, 'connectFailed'),
      })
    } finally {
      setBusy(false)
    }
  }

  const steps = [
    t('settings.notifications.telegram.setup.step1'),
    t('settings.notifications.telegram.setup.step2'),
    t('settings.notifications.telegram.setup.step3'),
  ]

  return (
    <div className="space-y-4">
      <ol className="space-y-2">
        {steps.map((step, index) => (
          <li key={step} className="flex gap-2.5 text-sm">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-medium text-muted-foreground">
              {index + 1}
            </span>
            <span className="text-muted-foreground">{step}</span>
          </li>
        ))}
      </ol>

      <a
        href="https://t.me/BotFather"
        target="_blank"
        rel="noreferrer noopener"
        className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
      >
        {t('settings.notifications.telegram.openBotFather')}
        <ExternalLink className="size-3.5" />
      </a>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder={t('settings.notifications.telegram.tokenPlaceholder')}
          className="font-mono text-xs"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !busy) void handleConnect()
          }}
        />
        <Button
          onClick={() => void handleConnect()}
          disabled={busy || token.trim() === ''}
          className="shrink-0"
        >
          {busy && <Loader2 className="size-4 animate-spin" />}
          {t('settings.notifications.telegram.connect')}
        </Button>
      </div>

      <FeedbackLine feedback={feedback} />

      {/* The dialog closes itself before it reports success, so clearing the
          pending action on close would drop the very retry it exists for.
          Only `onEnrolled` consumes it, and only a real enrollment fires that
          — a cancelled dialog just leaves a closure nothing will call. */}
      <VaultEnrollmentDialog
        open={enrollOpen}
        onOpenChange={setEnrollOpen}
        onEnrolled={() => {
          const resume = pendingAction.current
          pendingAction.current = null
          resume?.()
        }}
      />
    </div>
  )
}

// ── Connected ────────────────────────────────────────────────────────

function ConnectedCard() {
  const { t } = useTranslation()
  const connection = useTelegramConnection()
  const [feedback, setFeedback] = React.useState<Feedback>(null)
  const [busy, setBusy] = React.useState<'test' | 'disconnect' | null>(null)

  if (!connection) return null

  const handleTest = async () => {
    setBusy('test')
    setFeedback(null)
    try {
      const token = await readTelegramToken()
      const chatId = connection.chat?.id
      if (!token || !chatId) {
        setFeedback({
          type: 'error',
          message: t('settings.notifications.telegram.noChatYet'),
        })
        return
      }
      // The real formatter, so the test shows exactly what an alert looks like
      // in the chat — including the severity marker and the footer.
      await sendTelegramText(
        token,
        chatId,
        formatTelegramMessage({
          ruleId: 'test',
          ruleName: t('settings.notifications.telegram.testRuleName'),
          title: t('settings.notifications.telegram.testTitle'),
          body: t('settings.notifications.telegram.testBody'),
          severity: 'success',
          timestamp: Date.now(),
          payload: { eventType: 'test', timestamp: Date.now(), data: {} },
        }),
      )
      setFeedback({
        type: 'success',
        message: t('settings.notifications.telegram.testSent'),
      })
    } catch (error) {
      setFeedback({
        type: 'error',
        message: describeError(error, t, 'testFailed'),
      })
    } finally {
      setBusy(null)
    }
  }

  const handleDisconnect = async () => {
    setBusy('disconnect')
    setFeedback(null)
    try {
      await disconnectTelegram()
    } catch (error) {
      setFeedback({
        type: 'error',
        message: t('settings.notifications.telegram.disconnectFailed'),
      })
      console.warn('[telegram] disconnect failed:', error)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/40 px-3 py-2.5">
        <Check className="size-4 shrink-0 text-emerald-500" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{connection.botName}</p>
          <p className="truncate font-mono text-xs text-muted-foreground">
            @{connection.botUsername}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void handleDisconnect()}
          disabled={busy !== null}
        >
          {busy === 'disconnect' ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Trash2 className="size-3.5" />
          )}
          {t('settings.notifications.telegram.disconnect')}
        </Button>
      </div>

      <ChatLink onFeedback={setFeedback} />

      {connection.chat && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => void handleTest()}
          disabled={busy !== null}
        >
          {busy === 'test' ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Send className="size-3.5" />
          )}
          {t('settings.notifications.telegram.sendTest')}
        </Button>
      )}

      <FeedbackLine feedback={feedback} />
    </div>
  )
}

// ── Chat linking ─────────────────────────────────────────────────────

/**
 * Turning "press Start in Telegram" into a chat id.
 *
 * `getUpdates` is the only way a bot learns about a chat, and it only answers
 * after the user has spoken to the bot first — that is Telegram's design, not
 * a limitation here. So the flow is: open the bot, press Start, and this polls
 * until the chat shows up. Groups work the same way once the bot is a member.
 */
function ChatLink({
  onFeedback,
}: {
  onFeedback: (feedback: Feedback) => void
}) {
  const { t } = useTranslation()
  const connection = useTelegramConnection()
  const [polling, setPolling] = React.useState(false)
  const [found, setFound] = React.useState<Array<TelegramChat>>([])
  const abortRef = React.useRef<AbortController | null>(null)

  // A poll that outlives the dialog is a fetch loop nobody is watching.
  React.useEffect(() => () => abortRef.current?.abort(), [])

  const linked = connection?.chat ?? null

  const startPolling = async () => {
    const token = await readTelegramToken()
    if (!token) return

    const controller = new AbortController()
    abortRef.current?.abort()
    abortRef.current = controller
    setPolling(true)
    setFound([])
    onFeedback(null)

    const deadline = Date.now() + CHAT_POLL_TIMEOUT_MS
    try {
      while (!controller.signal.aborted && Date.now() < deadline) {
        const chats = await fetchRecentChats(token, controller.signal)
        if (chats.length === 1) {
          setTelegramChat(chats[0])
          setFound([])
          onFeedback({
            type: 'success',
            message: t('settings.notifications.telegram.chatLinked', {
              chat: chats[0].title,
            }),
          })
          return
        }
        if (chats.length > 1) {
          // Several chats have talked to this bot. Picking one for the user
          // would be a coin flip, so show them and let them choose.
          setFound(chats)
          return
        }
        await new Promise((resolve) =>
          setTimeout(resolve, CHAT_POLL_INTERVAL_MS),
        )
      }
      if (!controller.signal.aborted) {
        onFeedback({
          type: 'error',
          message: t('settings.notifications.telegram.chatTimeout'),
        })
      }
    } catch (error) {
      if (controller.signal.aborted) return
      onFeedback({
        type: 'error',
        message: describeError(error, t, 'chatFailed'),
      })
    } finally {
      if (abortRef.current === controller) abortRef.current = null
      setPolling(false)
    }
  }

  const botLink = connection?.botUsername
    ? `https://t.me/${connection.botUsername}`
    : null

  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-start gap-2.5">
        <MessageCircle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {t('settings.notifications.telegram.chatTitle')}
          </p>
          {linked ? (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t('settings.notifications.telegram.chatLinkedTo', {
                chat: linked.title,
                id: linked.id,
              })}
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t('settings.notifications.telegram.chatHelp')}
            </p>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {botLink && (
          <Button
            variant="outline"
            size="sm"
            // Rendered as an anchor, so Base UI must not assume a native
            // <button> — it warns about the lost semantics otherwise.
            nativeButton={false}
            render={
              <a href={botLink} target="_blank" rel="noreferrer noopener" />
            }
          >
            {t('settings.notifications.telegram.openChat')}
            <ExternalLink className="size-3.5" />
          </Button>
        )}
        <Button
          variant={linked ? 'ghost' : 'default'}
          size="sm"
          onClick={() => void startPolling()}
          disabled={polling}
        >
          {polling && <Loader2 className="size-3.5 animate-spin" />}
          {polling
            ? t('settings.notifications.telegram.waitingForStart')
            : linked
              ? t('settings.notifications.telegram.relink')
              : t('settings.notifications.telegram.detectChat')}
        </Button>
        {polling && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => abortRef.current?.abort()}
          >
            {t('settings.notifications.telegram.cancel')}
          </Button>
        )}
      </div>

      {found.length > 0 && (
        <div className="mt-3 space-y-1.5">
          <p className="text-xs text-muted-foreground">
            {t('settings.notifications.telegram.pickChat')}
          </p>
          {found.map((chat) => (
            <button
              key={chat.id}
              type="button"
              className="flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2 text-left text-sm transition-colors hover:bg-muted"
              onClick={() => {
                setTelegramChat(chat)
                setFound([])
                onFeedback({
                  type: 'success',
                  message: t('settings.notifications.telegram.chatLinked', {
                    chat: chat.title,
                  }),
                })
              }}
            >
              <span className="min-w-0 truncate">{chat.title}</span>
              <span className="shrink-0 font-mono text-xs text-muted-foreground">
                {chat.id}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Shared ───────────────────────────────────────────────────────────

function FeedbackLine({ feedback }: { feedback: Feedback }) {
  if (!feedback) return null
  return (
    <p
      className={
        feedback.type === 'success'
          ? 'flex items-start gap-1.5 text-xs text-emerald-600 dark:text-emerald-400'
          : 'flex items-start gap-1.5 text-xs text-destructive'
      }
    >
      {feedback.type === 'success' ? (
        <Check className="mt-0.5 size-3.5 shrink-0" />
      ) : (
        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
      )}
      <span>{feedback.message}</span>
    </p>
  )
}
