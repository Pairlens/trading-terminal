// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { emailOTPClient } from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/react'

/** True when an App Server URL is explicitly configured. */
export const hasAppServer = Boolean(import.meta.env.VITE_APP_SERVER_URL)

const getAuthBaseURL = () => {
  const appServerUrl = (
    import.meta.env.VITE_APP_SERVER_URL ?? 'http://localhost:4046'
  ).replace(/\/+$/, '')
  return `${appServerUrl}/api/auth`
}

/** Host of the App Server we authenticate against — for error copy. */
export const appServerHost = (() => {
  try {
    return new URL(getAuthBaseURL()).host
  } catch {
    return 'the App Server'
  }
})()

// ---------------------------------------------------------------------------
// Bearer token storage
//
// Sessions ride on a bearer token instead of cookies. Cookies don't survive
// the cross-origin setups we actually ship: the Tauri webview (origin
// tauri://localhost) talking to api.pairlens.finance is a third-party-cookie
// context that Safari/WebKit block outright, and localhost dev against a
// remote App Server has the same problem. The App Server runs BetterAuth's
// `bearer()` plugin: every auth response carries a `set-auth-token` header,
// which we persist and send back as `Authorization: Bearer`.
//
// Which is why we must NOT ask for cookies (`credentials: 'include'`). A
// credentialed cross-origin request is only satisfied by an exact
// `Access-Control-Allow-Origin` plus `Allow-Credentials: true`; a server
// answering the wildcard makes the browser reject the response before we ever
// see it, surfacing as a bare "fetch failed". That is what broke sign-in on
// the hosted web terminal, whose origin the App Server answers with `*`.
// `same-origin` (the fetch default) still sends cookies to an App Server
// deployed under the terminal's own origin, and sends nothing cross-origin —
// where the bearer token is the credential anyway.
// ---------------------------------------------------------------------------

/**
 * Credential mode for every App Server request. See the note above: cookies
 * for a same-origin deployment, bearer-only across origins.
 */
export const APP_SERVER_CREDENTIALS: RequestCredentials = 'same-origin'

const AUTH_TOKEN_KEY = 'pairlens:auth-token'

const getStoredAuthToken = (): string => {
  if (typeof window === 'undefined') return ''
  return window.localStorage.getItem(AUTH_TOKEN_KEY) ?? ''
}

export function clearStoredAuthToken(): void {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(AUTH_TOKEN_KEY)
}

// When no App Server is configured, export a no-op stub so nothing crashes
// trying to call createAuthClient with a relative URL.
function createStubAuthClient() {
  const noop = () => Promise.resolve({ data: null, error: null })
  return {
    useSession: () => ({
      data: null,
      isPending: false,
      error: null,
    }),
    getSession: noop,
    signOut: noop,
    signIn: { emailOtp: noop },
    emailOtp: { sendVerificationOtp: noop },
  } as unknown as ReturnType<
    typeof createAuthClient<{ plugins: [ReturnType<typeof emailOTPClient>] }>
  >
}

export const authClient: ReturnType<
  typeof createAuthClient<{ plugins: [ReturnType<typeof emailOTPClient>] }>
> = hasAppServer
  ? createAuthClient({
      baseURL: getAuthBaseURL(),
      plugins: [emailOTPClient()],
      fetchOptions: {
        credentials: APP_SERVER_CREDENTIALS,
        auth: {
          type: 'Bearer',
          token: getStoredAuthToken,
        },
        onSuccess: (ctx) => {
          const token = ctx.response.headers.get('set-auth-token')
          if (token) {
            window.localStorage.setItem(AUTH_TOKEN_KEY, token)
          }
          // Signing out invalidates the session server-side — drop the dead
          // token so we don't keep presenting it.
          if (ctx.response.url.includes('/sign-out')) {
            clearStoredAuthToken()
          }
        },
      },
    })
  : createStubAuthClient()
