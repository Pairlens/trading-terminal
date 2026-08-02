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
// ---------------------------------------------------------------------------

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
        // Cookies still work for same-site setups; the bearer token below is
        // what makes cross-origin (desktop, localhost dev → remote) work.
        credentials: 'include',
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
