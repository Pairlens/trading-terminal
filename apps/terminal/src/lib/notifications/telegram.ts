// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Telegram delivery.
 *
 * The terminal talks to the Bot API directly from the client — the same shape
 * as every other outbound channel here. There is no Pairlens relay, which is
 * what makes this work in a standalone install and what keeps the token off
 * our servers.
 *
 * ## Where the token lives, and why not in the rule
 *
 * A bot token is full control of the bot: read its chats, post as it, revoke
 * it. Notification rules are localStorage records that ride the sync bus to
 * the App Server under the `automation` domain (see lib/sync/sync-domains.ts),
 * so a token stored as step config would be a credential uploaded to Pairlens
 * — the one thing the credential design forbids. It goes in the keychain slot
 * below instead: the OS keychain on desktop, the vault in the browser. The
 * step carries a chat id and nothing else.
 *
 * The non-secret half of the connection (bot username, which chat is linked)
 * is a plain localStorage record. It is deliberately NOT emitted on the sync
 * channel — the coordinator drops unknown keys, so nothing has to blocklist
 * it — because a chat id that resolves against a bot only this device holds
 * the token for is meaningless on another device anyway.
 *
 * ## CORS
 *
 * api.telegram.org answers with `access-control-allow-origin: *`, so a plain
 * `fetch` works from the hosted terminal and from the Tauri webview alike. The
 * desktop build additionally needs the host in the CSP baseline
 * (apps/desktop/src-tauri/src/csp.rs) — the webview enforces connect-src
 * against every request the document makes, ours included.
 */

import type { NotificationMessage } from '@pairlens/notification-engine/types'
import { deleteCredential, getCredential, saveCredential } from '@/lib/keychain'
import { assertCanAddCredential } from '@/lib/security/vault/vault-policy'

// ── Storage ──────────────────────────────────────────────────────────

/** Keychain slot holding the bot token. Never synced, never in a rule. */
export const TELEGRAM_TOKEN_SLOT = 'integration:telegram-bot-token'

/** localStorage key for the non-secret half of the connection. */
export const TELEGRAM_CONNECTION_KEY = 'pairlens:telegram-connection'

export type TelegramChat = {
  /** Numeric for users/groups, `@name` for public channels. */
  id: string
  title: string
  type: 'private' | 'group' | 'supergroup' | 'channel'
}

export type TelegramConnection = {
  botId: number
  /** Without the leading `@`. */
  botUsername: string
  botName: string
  /** The chat a step with a blank `chatId` delivers to. */
  chat: TelegramChat | null
  connectedAt: number
}

// ── Errors ───────────────────────────────────────────────────────────

/**
 * A non-`ok` Bot API response. `description` is Telegram's own English text
 * ("chat not found", "bot was blocked by the user") and is the most useful
 * thing we can put in front of the user, so it survives to the surface
 * untranslated rather than being flattened into "delivery failed".
 */
export class TelegramApiError extends Error {
  readonly code: number
  readonly description: string
  constructor(code: number, description: string) {
    super(`Telegram API error ${code}: ${description}`)
    this.name = 'TelegramApiError'
    this.code = code
    this.description = description
  }
}

/** The user has not connected a bot yet (or disconnected it elsewhere). */
export class TelegramNotConnectedError extends Error {
  readonly code = 'telegram-not-connected'
  constructor(message = 'Telegram is not connected — add a bot in Settings') {
    super(message)
    this.name = 'TelegramNotConnectedError'
  }
}

// ── Bot API ──────────────────────────────────────────────────────────

const API_BASE = 'https://api.telegram.org'

/** Telegram's hard cap on a sendMessage `text`. */
const MAX_MESSAGE_LENGTH = 4096

type TelegramResponse<T> =
  | { ok: true; result: T }
  | { ok: false; error_code?: number; description?: string }

/**
 * One Bot API call.
 *
 * Times out on its own (a dispatch must never hang on a dead network) and
 * accepts an external signal so the settings UI can cancel a poll loop. The
 * two are combined by hand rather than with `AbortSignal.any`, which WebKit
 * only learned in 17.4 — the desktop app runs on whatever WebKit the user's
 * macOS shipped with.
 */
async function callBotApi<T>(
  token: string,
  method: string,
  params: Record<string, unknown> = {},
  opts: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(
    () => controller.abort(new Error('Telegram request timed out')),
    opts.timeoutMs ?? 10_000,
  )
  const onExternalAbort = () => controller.abort(opts.signal?.reason)
  opts.signal?.addEventListener('abort', onExternalAbort, { once: true })
  if (opts.signal?.aborted) onExternalAbort()

  try {
    const res = await fetch(`${API_BASE}/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
      signal: controller.signal,
    })

    // Telegram reports its own failures as a 4xx with a JSON body, so parse
    // before checking status — the body is where the useful part is.
    const body = (await res
      .json()
      .catch(() => null)) as TelegramResponse<T> | null
    if (!body) {
      throw new Error(`Telegram responded ${res.status}`)
    }
    if (!body.ok) {
      throw new TelegramApiError(
        body.error_code ?? res.status,
        body.description ?? `HTTP ${res.status}`,
      )
    }
    return body.result
  } finally {
    clearTimeout(timer)
    opts.signal?.removeEventListener('abort', onExternalAbort)
  }
}

type RawChat = {
  id: number
  type: string
  title?: string
  username?: string
  first_name?: string
  last_name?: string
}

type RawUpdate = {
  update_id: number
  message?: { chat: RawChat }
  channel_post?: { chat: RawChat }
  my_chat_member?: { chat: RawChat }
}

/** A token is `<bot id>:<35 url-safe chars>`. Checked before it is spent. */
export function looksLikeBotToken(token: string): boolean {
  return /^\d{5,}:[A-Za-z0-9_-]{30,}$/.test(token.trim())
}

function describeChat(chat: RawChat): TelegramChat {
  const name =
    chat.title ?? [chat.first_name, chat.last_name].filter(Boolean).join(' ')
  const type = (
    ['private', 'group', 'supergroup', 'channel'].includes(chat.type)
      ? chat.type
      : 'private'
  ) as TelegramChat['type']
  return {
    id: String(chat.id),
    title: name || (chat.username ? `@${chat.username}` : String(chat.id)),
    type,
  }
}

/** Verify a token and read back who the bot is. */
export async function fetchBotIdentity(
  token: string,
  signal?: AbortSignal,
): Promise<{ botId: number; botUsername: string; botName: string }> {
  const me = await callBotApi<{
    id: number
    username?: string
    first_name?: string
  }>(token, 'getMe', {}, { signal })
  return {
    botId: me.id,
    botUsername: me.username ?? '',
    botName: me.first_name ?? me.username ?? 'bot',
  }
}

/**
 * Chats that have talked to the bot recently.
 *
 * This is how a chat id gets discovered without asking a user to run a second
 * bot to find one: they press Start, Telegram queues an update, we read it.
 * `getUpdates` is a destructive read for whoever calls it first, which is
 * fine — a notification bot has no other consumer — but it does mean the
 * settings UI polls this rather than calling it once.
 */
export async function fetchRecentChats(
  token: string,
  signal?: AbortSignal,
): Promise<Array<TelegramChat>> {
  const updates = await callBotApi<Array<RawUpdate>>(
    token,
    'getUpdates',
    {
      timeout: 0,
      allowed_updates: ['message', 'channel_post', 'my_chat_member'],
    },
    { signal },
  )

  const seen = new Map<string, TelegramChat>()
  for (const update of updates) {
    const raw =
      update.message?.chat ??
      update.channel_post?.chat ??
      update.my_chat_member?.chat
    if (!raw) continue
    const chat = describeChat(raw)
    // Later updates win: a group that was renamed should read as its new name.
    seen.set(chat.id, chat)
  }
  return [...seen.values()]
}

// ── Message formatting ───────────────────────────────────────────────

const SEVERITY_EMOJI: Record<string, string> = {
  info: '🔔',
  success: '✅',
  warning: '⚠️',
  error: '🔴',
}

/** HTML-escape for Telegram's `parse_mode: HTML`. */
export function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

/**
 * Render a notification as Telegram HTML.
 *
 * Bold headline, plain body, and a footer naming the rule and the market so a
 * chat that collects alerts from several rules stays readable. Truncation
 * trims the body — never the headline or the footer, which are the parts that
 * say what fired and where.
 */
export function formatTelegramMessage(message: NotificationMessage): string {
  const emoji = SEVERITY_EMOJI[message.severity] ?? SEVERITY_EMOJI.info
  const head = `${emoji} <b>${escapeHtml(message.title)}</b>`

  const context = [message.payload.pair, message.payload.market]
    .filter((v): v is string => typeof v === 'string' && v.trim() !== '')
    .join(' · ')
  const footerParts = [message.ruleName, context].filter(
    (v) => typeof v === 'string' && v.trim() !== '',
  )
  const footer = footerParts.length
    ? `\n\n<i>${escapeHtml(footerParts.join(' — '))}</i>`
    : ''

  const room = MAX_MESSAGE_LENGTH - head.length - footer.length - 1
  let body = escapeHtml(message.body ?? '')
  if (body.length > room) {
    // Cut on the escaped string, then drop a trailing partial entity so the
    // message can never end mid-`&amp;` and fail Telegram's HTML parser.
    body = body.slice(0, Math.max(0, room - 1)).replace(/&[a-z]*$/i, '') + '…'
  }

  return `${head}\n${body}${footer}`
}

// ── Connection record ────────────────────────────────────────────────

/**
 * Parsed snapshot, memoized on the raw string.
 *
 * `useSyncExternalStore` compares snapshots by identity, so a fresh
 * `JSON.parse` per call would re-render forever. Re-parsing only when the
 * stored text actually changed also makes the read cheap enough to do on
 * every delivery.
 */
let snapshotRaw: string | null = null
let snapshotValue: TelegramConnection | null = null

export function loadTelegramConnection(): TelegramConnection | null {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(TELEGRAM_CONNECTION_KEY)
  } catch {
    return null
  }
  if (raw === snapshotRaw) return snapshotValue

  snapshotRaw = raw
  snapshotValue = null
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as TelegramConnection
      if (typeof parsed.botId === 'number') snapshotValue = parsed
    } catch {
      // Corrupted record — treated as not connected.
    }
  }
  return snapshotValue
}

// ── Change notification ──────────────────────────────────────────────

const listeners = new Set<() => void>()

/** Subscribe to connect/disconnect/chat changes, in this window or another. */
export function subscribeTelegramConnection(listener: () => void): () => void {
  listeners.add(listener)
  if (listeners.size === 1 && typeof window !== 'undefined') {
    window.addEventListener('storage', onStorage)
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && typeof window !== 'undefined') {
      window.removeEventListener('storage', onStorage)
    }
  }
}

function onStorage(event: StorageEvent) {
  if (event.key !== null && event.key !== TELEGRAM_CONNECTION_KEY) return
  // Another window (or tab) connected or disconnected. Our cached token
  // belongs to whatever bot that record named, so it goes with it.
  tokenCache = null
  notifyConnectionChanged()
}

function notifyConnectionChanged(): void {
  for (const listener of listeners) listener()
}

function storeTelegramConnection(connection: TelegramConnection): void {
  try {
    localStorage.setItem(TELEGRAM_CONNECTION_KEY, JSON.stringify(connection))
  } catch {
    // Quota — the token is already saved, so the connection still works for
    // this session; it just won't survive a reload.
  }
  notifyConnectionChanged()
}

// ── Token access ─────────────────────────────────────────────────────

/**
 * Reading a credential can mean a keychain round trip or a vault decrypt, and
 * every delivered notification needs one. Cached after the first read and
 * dropped whenever the connection changes.
 */
let tokenCache: string | null = null

/**
 * The live token, or null when no bot is connected.
 *
 * Gated on the connection record existing, which is what makes a disconnect
 * in another window take effect here: that window cleared the record, this
 * one stops trusting its cache. Vault errors propagate — a sealed vault is
 * "come back when you can open this", not "no bot configured".
 */
export async function readTelegramToken(): Promise<string | null> {
  if (!loadTelegramConnection()) {
    tokenCache = null
    return null
  }
  if (tokenCache) return tokenCache
  const stored = await getCredential(TELEGRAM_TOKEN_SLOT)
  tokenCache = stored
  return stored
}

// ── Connect / disconnect ─────────────────────────────────────────────

/**
 * Verify a token, store it, and record the bot.
 *
 * The vault gate runs before the network call so a browser user who has not
 * enrolled a protector gets the enrollment dialog instead of a token that
 * validated and then failed to save.
 */
export async function connectTelegramBot(
  token: string,
  signal?: AbortSignal,
): Promise<TelegramConnection> {
  const trimmed = token.trim()
  await assertCanAddCredential()

  const identity = await fetchBotIdentity(trimmed, signal)
  await saveCredential(TELEGRAM_TOKEN_SLOT, trimmed)
  tokenCache = trimmed

  // Reconnecting the same bot keeps the linked chat — re-pasting a token
  // after a browser profile move should not make the user press Start again.
  const previous = loadTelegramConnection()
  const connection: TelegramConnection = {
    ...identity,
    chat: previous?.botId === identity.botId ? previous.chat : null,
    connectedAt: Date.now(),
  }
  storeTelegramConnection(connection)
  return connection
}

/** Point every blank-`chatId` step at this chat. */
export function setTelegramChat(
  chat: TelegramChat | null,
): TelegramConnection | null {
  const connection = loadTelegramConnection()
  if (!connection) return null
  const next = { ...connection, chat }
  storeTelegramConnection(next)
  return next
}

export async function disconnectTelegram(): Promise<void> {
  tokenCache = null
  try {
    localStorage.removeItem(TELEGRAM_CONNECTION_KEY)
  } catch {
    // Nothing to remove.
  }
  notifyConnectionChanged()
  await deleteCredential(TELEGRAM_TOKEN_SLOT)
}

// ── Delivery ─────────────────────────────────────────────────────────

/** Raw send, used by the delivery implementation and the settings test button. */
export async function sendTelegramText(
  token: string,
  chatId: string,
  text: string,
  opts: { silent?: boolean; signal?: AbortSignal } = {},
): Promise<void> {
  await callBotApi(
    token,
    'sendMessage',
    {
      chat_id: /^-?\d+$/.test(chatId) ? Number(chatId) : chatId,
      text,
      parse_mode: 'HTML',
      disable_notification: opts.silent === true,
      // An alert body full of tickers should not drag a link card in behind it.
      link_preview_options: { is_disabled: true },
    },
    { signal: opts.signal },
  )
}

/**
 * Deliver one notification. Throws so the dispatcher records the failure in
 * the notification log with a reason the user can act on.
 */
export async function deliverTelegramNotification(
  stepData: Record<string, unknown>,
  message: NotificationMessage,
): Promise<void> {
  const token = await readTelegramToken()
  if (!token) throw new TelegramNotConnectedError()

  const chatId =
    String(stepData.chatId ?? '').trim() ||
    loadTelegramConnection()?.chat?.id ||
    ''
  if (!chatId) {
    throw new TelegramNotConnectedError(
      'No Telegram chat linked — press Start in the bot chat, or set a Chat ID on the step',
    )
  }

  await sendTelegramText(token, chatId, formatTelegramMessage(message), {
    silent: stepData.silent === true,
  })
}
