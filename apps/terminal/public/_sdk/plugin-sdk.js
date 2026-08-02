import { createContext as g } from 'react'
var T = g(null)
import { useContext as l } from 'react'
function r() {
  let t = l(T)
  if (!t)
    throw Error(
      'usePluginHost must be used within a PluginHostContext.Provider — ' +
        'this usually means the component is not rendered inside a terminal pane.',
    )
  return t
}
function x() {
  return r().pair
}
import {
  useCallback as E,
  useEffect as w,
  useRef as Q,
  useState as d,
} from 'react'
function H(t, n) {
  let e = r(),
    [o, c] = d(void 0),
    [s, a] = d(!0),
    [i, u] = d(null),
    p = Q(n)
  p.current = n
  let m = E(async () => {
    ;(a(!0), u(null))
    try {
      let y = await e.executeCapability(t, p.current)
      c(y)
    } catch (y) {
      u(y instanceof Error ? y : Error(String(y)))
    } finally {
      a(!1)
    }
  }, [e, t])
  return (
    w(() => {
      m()
    }, [m]),
    { data: o, isLoading: s, error: i, refetch: m }
  )
}
import { useEffect as U, useRef as P, useState as b } from 'react'
function D(t, n, e) {
  let o = r(),
    [c, s] = b('disconnected'),
    a = P(e)
  a.current = e
  let i = P(n)
  return (
    (i.current = n),
    U(() => {
      s('connected')
      let u
      try {
        u = o.subscribeCapability(t, i.current, (p) => a.current(p))
      } catch {
        s('error')
      }
      return () => {
        ;(u?.(), s('disconnected'))
      }
    }, [o, t]),
    { status: c }
  )
}
function I() {
  let t = r()
  return {
    isAuthenticated: t.isAuthenticated,
    tier: t.userTier,
    getAccessLevel: t.getAccessLevel,
  }
}
function R() {
  return r().navigate
}
function v() {
  return r().notify
}
function O() {
  return r().config
}
import { useCallback as C, useRef as q, useSyncExternalStore as M } from 'react'
var f = new Map()
function A(t) {
  let n = f.get(t)
  if (n) for (let e of n) e()
}
function S(t, n) {
  let e = r(),
    o = `plugin:${e.pluginId}:${t}`,
    c = q(n),
    s = M(
      (i) => {
        let u = f.get(o)
        if (!u) ((u = new Set()), f.set(o, u))
        u.add(i)
        let p = (m) => {
          if (m.key === o) i()
        }
        return (
          window.addEventListener('storage', p),
          () => {
            if ((u.delete(i), u.size === 0)) f.delete(o)
            window.removeEventListener('storage', p)
          }
        )
      },
      () => e.getStorage(t, c.current),
    ),
    a = C(
      (i) => {
        ;(e.setStorage(t, i), A(o))
      },
      [e, t, o],
    )
  return [s, a]
}
import { useQuery as N } from '@tanstack/react-query'
function K(t) {
  let n = r()
  return N({ ...t, queryKey: [`plugin:${n.pluginId}`, ...t.queryKey] })
}
import { useInfiniteQuery as $ } from '@tanstack/react-query'
function L(t) {
  let n = r()
  return $({ ...t, queryKey: [`plugin:${n.pluginId}`, ...t.queryKey] })
}
import { useMutation as z } from '@tanstack/react-query'
function B(t) {
  return z(t)
}
import { useCallback as F, useRef as G } from 'react'
function J() {
  let t = r(),
    n = String(t.config.appServerUrl ?? ''),
    e = G(t.config.authToken)
  return (
    (e.current = t.config.authToken),
    F(
      async (o, c) => {
        let s = { ...c?.headers },
          a = e.current
        if (typeof a === 'function') s.Authorization = `Bearer ${await a()}`
        let i = (c?.method ?? 'GET').toUpperCase()
        if (i !== 'GET' && i !== 'HEAD')
          s['Content-Type'] ??= 'application/json'
        return fetch(`${n}${o}`, { ...c, headers: s })
      },
      [n],
    )
  )
}
function W() {
  let t = r()
  return { register: (n, e) => t.registerService(n, e) }
}
import { useSyncExternalStore as X } from 'react'
function Y(t) {
  let n = r()
  return X(
    (e) => n.onServiceChange(t, e),
    () => n.getService(t),
  )
}
export {
  W as useServiceRegistry,
  S as usePluginStorage,
  Y as usePluginService,
  K as usePluginQuery,
  R as usePluginNavigate,
  B as usePluginMutation,
  L as usePluginInfiniteQuery,
  r as usePluginHost,
  J as usePluginFetch,
  O as usePluginConfig,
  x as usePanePair,
  v as useNotify,
  D as useCapabilityStream,
  H as useCapability,
  I as useAuth,
  T as PluginHostContext,
}
