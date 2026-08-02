var wU = Object.create
var { getPrototypeOf: yU, defineProperty: vJ, getOwnPropertyNames: DU } = Object
var TU = Object.prototype.hasOwnProperty
var Z$ = (Q, Z, J) => {
  J = Q != null ? wU(yU(Q)) : {}
  let z =
    Z || !Q || !Q.__esModule
      ? vJ(J, 'default', { value: Q, enumerable: !0 })
      : J
  for (let q of DU(Q))
    if (!TU.call(z, q)) vJ(z, q, { get: () => Q[q], enumerable: !0 })
  return z
}
var J$ = (Q, Z) => () => (Z || Q((Z = { exports: {} }).exports, Z), Z.exports)
var c1 = (Q, Z) => {
  for (var J in Z)
    vJ(Q, J, {
      get: Z[J],
      enumerable: !0,
      configurable: !0,
      set: (z) => (Z[J] = () => z),
    })
}
import * as k5 from 'react'
var Iz = J$((ZN) => {
  ;(function () {
    function Q(B, H) {
      return (B === H && (B !== 0 || 1 / B === 1 / H)) || (B !== B && H !== H)
    }
    function Z(B, H) {
      Y ||
        k5.startTransition === void 0 ||
        ((Y = !0),
        console.error(
          'You are using an outdated, pre-release alpha of React 18 that does not support useSyncExternalStore. The use-sync-external-store shim will not work correctly. Upgrade to a newer pre-release.',
        ))
      var N = H()
      if (!W) {
        var _ = H()
        q(N, _) ||
          (console.error(
            'The result of getSnapshot should be cached to avoid an infinite loop',
          ),
          (W = !0))
      }
      _ = $({ inst: { value: N, getSnapshot: H } })
      var L = _[0].inst,
        F = _[1]
      return (
        K(
          function () {
            ;((L.value = N), (L.getSnapshot = H), J(L) && F({ inst: L }))
          },
          [B, N, H],
        ),
        X(
          function () {
            return (
              J(L) && F({ inst: L }),
              B(function () {
                J(L) && F({ inst: L })
              })
            )
          },
          [B],
        ),
        G(N),
        N
      )
    }
    function J(B) {
      var H = B.getSnapshot
      B = B.value
      try {
        var N = H()
        return !q(B, N)
      } catch (_) {
        return !0
      }
    }
    function z(B, H) {
      return H()
    }
    typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ < 'u' &&
      typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStart ===
        'function' &&
      __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStart(Error())
    var q = typeof Object.is === 'function' ? Object.is : Q,
      $ = k5.useState,
      X = k5.useEffect,
      K = k5.useLayoutEffect,
      G = k5.useDebugValue,
      Y = !1,
      W = !1,
      U =
        typeof window > 'u' ||
        typeof window.document > 'u' ||
        typeof window.document.createElement > 'u'
          ? z
          : Z
    ;((ZN.useSyncExternalStore =
      k5.useSyncExternalStore !== void 0 ? k5.useSyncExternalStore : U),
      typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ < 'u' &&
        typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStop ===
          'function' &&
        __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStop(Error()))
  })()
})
import * as r2 from 'react'
var VK = J$((JN) => {
  ;(function () {
    function Q(G, Y) {
      return (G === Y && (G !== 0 || 1 / G === 1 / Y)) || (G !== G && Y !== Y)
    }
    typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ < 'u' &&
      typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStart ===
        'function' &&
      __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStart(Error())
    var Z = Iz(),
      J = typeof Object.is === 'function' ? Object.is : Q,
      z = Z.useSyncExternalStore,
      q = r2.useRef,
      $ = r2.useEffect,
      X = r2.useMemo,
      K = r2.useDebugValue
    ;((JN.useSyncExternalStoreWithSelector = function (G, Y, W, U, B) {
      var H = q(null)
      if (H.current === null) {
        var N = { hasValue: !1, value: null }
        H.current = N
      } else N = H.current
      H = X(
        function () {
          function L(j) {
            if (!F) {
              if (((F = !0), (k = j), (j = U(j)), B !== void 0 && N.hasValue)) {
                var A = N.value
                if (B(A, j)) return (V = A)
              }
              return (V = j)
            }
            if (((A = V), J(k, j))) return A
            var w = U(j)
            if (B !== void 0 && B(A, w)) return ((k = j), A)
            return ((k = j), (V = w))
          }
          var F = !1,
            k,
            V,
            M = W === void 0 ? null : W
          return [
            function () {
              return L(Y())
            },
            M === null
              ? void 0
              : function () {
                  return L(M())
                },
          ]
        },
        [Y, W, U, B],
      )
      var _ = z(G, H[0], H[1])
      return (
        $(
          function () {
            ;((N.hasValue = !0), (N.value = _))
          },
          [_],
        ),
        K(_),
        _
      )
    }),
      typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ < 'u' &&
        typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStop ===
          'function' &&
        __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStop(Error()))
  })()
})
function z$(Q) {
  var Z,
    J,
    z = ''
  if (typeof Q == 'string' || typeof Q == 'number') z += Q
  else if (typeof Q == 'object')
    if (Array.isArray(Q)) {
      var q = Q.length
      for (Z = 0; Z < q; Z++)
        Q[Z] && (J = z$(Q[Z])) && (z && (z += ' '), (z += J))
    } else for (J in Q) Q[J] && (z && (z += ' '), (z += J))
  return z
}
function i7() {
  for (var Q, Z, J = 0, z = '', q = arguments.length; J < q; J++)
    (Q = arguments[J]) && (Z = z$(Q)) && (z && (z += ' '), (z += Z))
  return z
}
var PU = (Q, Z) => {
    let J = Array(Q.length + Z.length)
    for (let z = 0; z < Q.length; z++) J[z] = Q[z]
    for (let z = 0; z < Z.length; z++) J[Q.length + z] = Z[z]
    return J
  },
  EU = (Q, Z) => ({ classGroupId: Q, validator: Z }),
  Y$ = (Q = new Map(), Z = null, J) => ({
    nextPart: Q,
    validators: Z,
    classGroupId: J,
  })
var q$ = []
var SU = (Q) => {
    let Z = CU(Q),
      { conflictingClassGroups: J, conflictingClassGroupModifiers: z } = Q
    return {
      getClassGroupId: (X) => {
        if (X.startsWith('[') && X.endsWith(']')) return IU(X)
        let K = X.split('-'),
          G = K[0] === '' && K.length > 1 ? 1 : 0
        return W$(K, G, Z)
      },
      getConflictingClassGroupIds: (X, K) => {
        if (K) {
          let G = z[X],
            Y = J[X]
          if (G) {
            if (Y) return PU(Y, G)
            return G
          }
          return Y || q$
        }
        return J[X] || q$
      },
    }
  },
  W$ = (Q, Z, J) => {
    if (Q.length - Z === 0) return J.classGroupId
    let q = Q[Z],
      $ = J.nextPart.get(q)
    if ($) {
      let Y = W$(Q, Z + 1, $)
      if (Y) return Y
    }
    let X = J.validators
    if (X === null) return
    let K = Z === 0 ? Q.join('-') : Q.slice(Z).join('-'),
      G = X.length
    for (let Y = 0; Y < G; Y++) {
      let W = X[Y]
      if (W.validator(K)) return W.classGroupId
    }
    return
  },
  IU = (Q) =>
    Q.slice(1, -1).indexOf(':') === -1
      ? void 0
      : (() => {
          let Z = Q.slice(1, -1),
            J = Z.indexOf(':'),
            z = Z.slice(0, J)
          return z ? 'arbitrary..' + z : void 0
        })(),
  CU = (Q) => {
    let { theme: Z, classGroups: J } = Q
    return xU(J, Z)
  },
  xU = (Q, Z) => {
    let J = Y$()
    for (let z in Q) {
      let q = Q[z]
      gJ(q, J, z, Z)
    }
    return J
  },
  gJ = (Q, Z, J, z) => {
    let q = Q.length
    for (let $ = 0; $ < q; $++) {
      let X = Q[$]
      hU(X, Z, J, z)
    }
  },
  hU = (Q, Z, J, z) => {
    if (typeof Q === 'string') {
      bU(Q, Z, J)
      return
    }
    if (typeof Q === 'function') {
      RU(Q, Z, J, z)
      return
    }
    vU(Q, Z, J, z)
  },
  bU = (Q, Z, J) => {
    let z = Q === '' ? Z : U$(Z, Q)
    z.classGroupId = J
  },
  RU = (Q, Z, J, z) => {
    if (fU(Q)) {
      gJ(Q(z), Z, J, z)
      return
    }
    if (Z.validators === null) Z.validators = []
    Z.validators.push(EU(J, Q))
  },
  vU = (Q, Z, J, z) => {
    let q = Object.entries(Q),
      $ = q.length
    for (let X = 0; X < $; X++) {
      let [K, G] = q[X]
      gJ(G, U$(Z, K), J, z)
    }
  },
  U$ = (Q, Z) => {
    let J = Q,
      z = Z.split('-'),
      q = z.length
    for (let $ = 0; $ < q; $++) {
      let X = z[$],
        K = J.nextPart.get(X)
      if (!K) ((K = Y$()), J.nextPart.set(X, K))
      J = K
    }
    return J
  },
  fU = (Q) => 'isThemeGetter' in Q && Q.isThemeGetter === !0,
  gU = (Q) => {
    if (Q < 1)
      return {
        get: () => {
          return
        },
        set: () => {},
      }
    let Z = 0,
      J = Object.create(null),
      z = Object.create(null),
      q = ($, X) => {
        if (((J[$] = X), Z++, Z > Q))
          ((Z = 0), (z = J), (J = Object.create(null)))
      }
    return {
      get($) {
        let X = J[$]
        if (X !== void 0) return X
        if ((X = z[$]) !== void 0) return (q($, X), X)
      },
      set($, X) {
        if ($ in J) J[$] = X
        else q($, X)
      },
    }
  }
var mU = [],
  $$ = (Q, Z, J, z, q) => ({
    modifiers: Q,
    hasImportantModifier: Z,
    baseClassName: J,
    maybePostfixModifierPosition: z,
    isExternal: q,
  }),
  pU = (Q) => {
    let { prefix: Z, experimentalParseClassName: J } = Q,
      z = (q) => {
        let $ = [],
          X = 0,
          K = 0,
          G = 0,
          Y,
          W = q.length
        for (let _ = 0; _ < W; _++) {
          let L = q[_]
          if (X === 0 && K === 0) {
            if (L === ':') {
              ;($.push(q.slice(G, _)), (G = _ + 1))
              continue
            }
            if (L === '/') {
              Y = _
              continue
            }
          }
          if (L === '[') X++
          else if (L === ']') X--
          else if (L === '(') K++
          else if (L === ')') K--
        }
        let U = $.length === 0 ? q : q.slice(G),
          B = U,
          H = !1
        if (U.endsWith('!')) ((B = U.slice(0, -1)), (H = !0))
        else if (U.startsWith('!')) ((B = U.slice(1)), (H = !0))
        let N = Y && Y > G ? Y - G : void 0
        return $$($, H, B, N)
      }
    if (Z) {
      let q = Z + ':',
        $ = z
      z = (X) =>
        X.startsWith(q) ? $(X.slice(q.length)) : $$(mU, !1, X, void 0, !0)
    }
    if (J) {
      let q = z
      z = ($) => J({ className: $, parseClassName: q })
    }
    return z
  },
  uU = (Q) => {
    let Z = new Map()
    return (
      Q.orderSensitiveModifiers.forEach((J, z) => {
        Z.set(J, 1e6 + z)
      }),
      (J) => {
        let z = [],
          q = []
        for (let $ = 0; $ < J.length; $++) {
          let X = J[$],
            K = X[0] === '[',
            G = Z.has(X)
          if (K || G) {
            if (q.length > 0) (q.sort(), z.push(...q), (q = []))
            z.push(X)
          } else q.push(X)
        }
        if (q.length > 0) (q.sort(), z.push(...q))
        return z
      }
    )
  },
  cU = (Q) => ({
    cache: gU(Q.cacheSize),
    parseClassName: pU(Q),
    sortModifiers: uU(Q),
    ...SU(Q),
  }),
  dU = /\s+/,
  iU = (Q, Z) => {
    let {
        parseClassName: J,
        getClassGroupId: z,
        getConflictingClassGroupIds: q,
        sortModifiers: $,
      } = Z,
      X = [],
      K = Q.trim().split(dU),
      G = ''
    for (let Y = K.length - 1; Y >= 0; Y -= 1) {
      let W = K[Y],
        {
          isExternal: U,
          modifiers: B,
          hasImportantModifier: H,
          baseClassName: N,
          maybePostfixModifierPosition: _,
        } = J(W)
      if (U) {
        G = W + (G.length > 0 ? ' ' + G : G)
        continue
      }
      let L = !!_,
        F = z(L ? N.substring(0, _) : N)
      if (!F) {
        if (!L) {
          G = W + (G.length > 0 ? ' ' + G : G)
          continue
        }
        if (((F = z(N)), !F)) {
          G = W + (G.length > 0 ? ' ' + G : G)
          continue
        }
        L = !1
      }
      let k = B.length === 0 ? '' : B.length === 1 ? B[0] : $(B).join(':'),
        V = H ? k + '!' : k,
        M = V + F
      if (X.indexOf(M) > -1) continue
      X.push(M)
      let j = q(F, L)
      for (let A = 0; A < j.length; ++A) {
        let w = j[A]
        X.push(V + w)
      }
      G = W + (G.length > 0 ? ' ' + G : G)
    }
    return G
  },
  lU = (...Q) => {
    let Z = 0,
      J,
      z,
      q = ''
    while (Z < Q.length)
      if ((J = Q[Z++])) {
        if ((z = B$(J))) (q && (q += ' '), (q += z))
      }
    return q
  },
  B$ = (Q) => {
    if (typeof Q === 'string') return Q
    let Z,
      J = ''
    for (let z = 0; z < Q.length; z++)
      if (Q[z]) {
        if ((Z = B$(Q[z]))) (J && (J += ' '), (J += Z))
      }
    return J
  },
  rU = (Q, ...Z) => {
    let J,
      z,
      q,
      $,
      X = (G) => {
        let Y = Z.reduce((W, U) => U(W), Q())
        return (
          (J = cU(Y)),
          (z = J.cache.get),
          (q = J.cache.set),
          ($ = K),
          K(G)
        )
      },
      K = (G) => {
        let Y = z(G)
        if (Y) return Y
        let W = iU(G, J)
        return (q(G, W), W)
      }
    return (($ = X), (...G) => $(lU(...G)))
  },
  aU = [],
  I1 = (Q) => {
    let Z = (J) => J[Q] || aU
    return ((Z.isThemeGetter = !0), Z)
  },
  _$ = /^\[(?:(\w[\w-]*):)?(.+)\]$/i,
  H$ = /^\((?:(\w[\w-]*):)?(.+)\)$/i,
  sU = /^\d+(?:\.\d+)?\/\d+(?:\.\d+)?$/,
  nU = /^(\d+(\.\d+)?)?(xs|sm|md|lg|xl)$/,
  oU =
    /\d+(%|px|r?em|[sdl]?v([hwib]|min|max)|pt|pc|in|cm|mm|cap|ch|ex|r?lh|cq(w|h|i|b|min|max))|\b(calc|min|max|clamp)\(.+\)|^0$/,
  tU = /^(rgba?|hsla?|hwb|(ok)?(lab|lch)|color-mix)\(.+\)$/,
  eU = /^(inset_)?-?((\d+)?\.?(\d+)[a-z]+|0)_-?((\d+)?\.?(\d+)[a-z]+|0)/,
  QB =
    /^(url|image|image-set|cross-fade|element|(repeating-)?(linear|radial|conic)-gradient)\(.+\)$/,
  K8 = (Q) => sU.test(Q),
  u0 = (Q) => !!Q && !Number.isNaN(Number(Q)),
  G8 = (Q) => !!Q && Number.isInteger(Number(Q)),
  fJ = (Q) => Q.endsWith('%') && u0(Q.slice(0, -1)),
  f2 = (Q) => nU.test(Q),
  N$ = () => !0,
  ZB = (Q) => oU.test(Q) && !tU.test(Q),
  mJ = () => !1,
  JB = (Q) => eU.test(Q),
  zB = (Q) => QB.test(Q),
  qB = (Q) => !M0(Q) && !j0(Q),
  $B = (Q) => Y8(Q, k$, mJ),
  M0 = (Q) => _$.test(Q),
  t8 = (Q) => Y8(Q, M$, ZB),
  X$ = (Q) => Y8(Q, _B, u0),
  XB = (Q) => Y8(Q, V$, N$),
  KB = (Q) => Y8(Q, j$, mJ),
  K$ = (Q) => Y8(Q, L$, mJ),
  GB = (Q) => Y8(Q, F$, zB),
  l7 = (Q) => Y8(Q, A$, JB),
  j0 = (Q) => H$.test(Q),
  b9 = (Q) => e8(Q, M$),
  YB = (Q) => e8(Q, j$),
  G$ = (Q) => e8(Q, L$),
  WB = (Q) => e8(Q, k$),
  UB = (Q) => e8(Q, F$),
  r7 = (Q) => e8(Q, A$, !0),
  BB = (Q) => e8(Q, V$, !0),
  Y8 = (Q, Z, J) => {
    let z = _$.exec(Q)
    if (z) {
      if (z[1]) return Z(z[1])
      return J(z[2])
    }
    return !1
  },
  e8 = (Q, Z, J = !1) => {
    let z = H$.exec(Q)
    if (z) {
      if (z[1]) return Z(z[1])
      return J
    }
    return !1
  },
  L$ = (Q) => Q === 'position' || Q === 'percentage',
  F$ = (Q) => Q === 'image' || Q === 'url',
  k$ = (Q) => Q === 'length' || Q === 'size' || Q === 'bg-size',
  M$ = (Q) => Q === 'length',
  _B = (Q) => Q === 'number',
  j$ = (Q) => Q === 'family-name',
  V$ = (Q) => Q === 'number' || Q === 'weight',
  A$ = (Q) => Q === 'shadow'
var HB = () => {
  let Q = I1('color'),
    Z = I1('font'),
    J = I1('text'),
    z = I1('font-weight'),
    q = I1('tracking'),
    $ = I1('leading'),
    X = I1('breakpoint'),
    K = I1('container'),
    G = I1('spacing'),
    Y = I1('radius'),
    W = I1('shadow'),
    U = I1('inset-shadow'),
    B = I1('text-shadow'),
    H = I1('drop-shadow'),
    N = I1('blur'),
    _ = I1('perspective'),
    L = I1('aspect'),
    F = I1('ease'),
    k = I1('animate'),
    V = () => [
      'auto',
      'avoid',
      'all',
      'avoid-page',
      'page',
      'left',
      'right',
      'column',
    ],
    M = () => [
      'center',
      'top',
      'bottom',
      'left',
      'right',
      'top-left',
      'left-top',
      'top-right',
      'right-top',
      'bottom-right',
      'right-bottom',
      'bottom-left',
      'left-bottom',
    ],
    j = () => [...M(), j0, M0],
    A = () => ['auto', 'hidden', 'clip', 'visible', 'scroll'],
    w = () => ['auto', 'contain', 'none'],
    O = () => [j0, M0, G],
    S = () => [K8, 'full', 'auto', ...O()],
    x = () => [G8, 'none', 'subgrid', j0, M0],
    h = () => ['auto', { span: ['full', G8, j0, M0] }, G8, j0, M0],
    I = () => [G8, 'auto', j0, M0],
    y = () => ['auto', 'min', 'max', 'fr', j0, M0],
    T = () => [
      'start',
      'end',
      'center',
      'between',
      'around',
      'evenly',
      'stretch',
      'baseline',
      'center-safe',
      'end-safe',
    ],
    R = () => ['start', 'end', 'center', 'stretch', 'center-safe', 'end-safe'],
    v = () => ['auto', ...O()],
    P = () => [
      K8,
      'auto',
      'full',
      'dvw',
      'dvh',
      'lvw',
      'lvh',
      'svw',
      'svh',
      'min',
      'max',
      'fit',
      ...O(),
    ],
    D = () => [
      K8,
      'screen',
      'full',
      'dvw',
      'lvw',
      'svw',
      'min',
      'max',
      'fit',
      ...O(),
    ],
    E = () => [
      K8,
      'screen',
      'full',
      'lh',
      'dvh',
      'lvh',
      'svh',
      'min',
      'max',
      'fit',
      ...O(),
    ],
    C = () => [Q, j0, M0],
    a = () => [...M(), G$, K$, { position: [j0, M0] }],
    p = () => ['no-repeat', { repeat: ['', 'x', 'y', 'space', 'round'] }],
    Q0 = () => ['auto', 'cover', 'contain', WB, $B, { size: [j0, M0] }],
    g = () => [fJ, b9, t8],
    Z0 = () => ['', 'none', 'full', Y, j0, M0],
    i = () => ['', u0, b9, t8],
    X0 = () => ['solid', 'dashed', 'dotted', 'double'],
    Y0 = () => [
      'normal',
      'multiply',
      'screen',
      'overlay',
      'darken',
      'lighten',
      'color-dodge',
      'color-burn',
      'hard-light',
      'soft-light',
      'difference',
      'exclusion',
      'hue',
      'saturation',
      'color',
      'luminosity',
    ],
    J0 = () => [u0, fJ, G$, K$],
    U0 = () => ['', 'none', N, j0, M0],
    K0 = () => ['none', u0, j0, M0],
    b = () => ['none', u0, j0, M0],
    r = () => [u0, j0, M0],
    t = () => [K8, 'full', ...O()]
  return {
    cacheSize: 500,
    theme: {
      animate: ['spin', 'ping', 'pulse', 'bounce'],
      aspect: ['video'],
      blur: [f2],
      breakpoint: [f2],
      color: [N$],
      container: [f2],
      'drop-shadow': [f2],
      ease: ['in', 'out', 'in-out'],
      font: [qB],
      'font-weight': [
        'thin',
        'extralight',
        'light',
        'normal',
        'medium',
        'semibold',
        'bold',
        'extrabold',
        'black',
      ],
      'inset-shadow': [f2],
      leading: ['none', 'tight', 'snug', 'normal', 'relaxed', 'loose'],
      perspective: [
        'dramatic',
        'near',
        'normal',
        'midrange',
        'distant',
        'none',
      ],
      radius: [f2],
      shadow: [f2],
      spacing: ['px', u0],
      text: [f2],
      'text-shadow': [f2],
      tracking: ['tighter', 'tight', 'normal', 'wide', 'wider', 'widest'],
    },
    classGroups: {
      aspect: [{ aspect: ['auto', 'square', K8, M0, j0, L] }],
      container: ['container'],
      columns: [{ columns: [u0, M0, j0, K] }],
      'break-after': [{ 'break-after': V() }],
      'break-before': [{ 'break-before': V() }],
      'break-inside': [
        { 'break-inside': ['auto', 'avoid', 'avoid-page', 'avoid-column'] },
      ],
      'box-decoration': [{ 'box-decoration': ['slice', 'clone'] }],
      box: [{ box: ['border', 'content'] }],
      display: [
        'block',
        'inline-block',
        'inline',
        'flex',
        'inline-flex',
        'table',
        'inline-table',
        'table-caption',
        'table-cell',
        'table-column',
        'table-column-group',
        'table-footer-group',
        'table-header-group',
        'table-row-group',
        'table-row',
        'flow-root',
        'grid',
        'inline-grid',
        'contents',
        'list-item',
        'hidden',
      ],
      sr: ['sr-only', 'not-sr-only'],
      float: [{ float: ['right', 'left', 'none', 'start', 'end'] }],
      clear: [{ clear: ['left', 'right', 'both', 'none', 'start', 'end'] }],
      isolation: ['isolate', 'isolation-auto'],
      'object-fit': [
        { object: ['contain', 'cover', 'fill', 'none', 'scale-down'] },
      ],
      'object-position': [{ object: j() }],
      overflow: [{ overflow: A() }],
      'overflow-x': [{ 'overflow-x': A() }],
      'overflow-y': [{ 'overflow-y': A() }],
      overscroll: [{ overscroll: w() }],
      'overscroll-x': [{ 'overscroll-x': w() }],
      'overscroll-y': [{ 'overscroll-y': w() }],
      position: ['static', 'fixed', 'absolute', 'relative', 'sticky'],
      inset: [{ inset: S() }],
      'inset-x': [{ 'inset-x': S() }],
      'inset-y': [{ 'inset-y': S() }],
      start: [{ 'inset-s': S(), start: S() }],
      end: [{ 'inset-e': S(), end: S() }],
      'inset-bs': [{ 'inset-bs': S() }],
      'inset-be': [{ 'inset-be': S() }],
      top: [{ top: S() }],
      right: [{ right: S() }],
      bottom: [{ bottom: S() }],
      left: [{ left: S() }],
      visibility: ['visible', 'invisible', 'collapse'],
      z: [{ z: [G8, 'auto', j0, M0] }],
      basis: [{ basis: [K8, 'full', 'auto', K, ...O()] }],
      'flex-direction': [
        { flex: ['row', 'row-reverse', 'col', 'col-reverse'] },
      ],
      'flex-wrap': [{ flex: ['nowrap', 'wrap', 'wrap-reverse'] }],
      flex: [{ flex: [u0, K8, 'auto', 'initial', 'none', M0] }],
      grow: [{ grow: ['', u0, j0, M0] }],
      shrink: [{ shrink: ['', u0, j0, M0] }],
      order: [{ order: [G8, 'first', 'last', 'none', j0, M0] }],
      'grid-cols': [{ 'grid-cols': x() }],
      'col-start-end': [{ col: h() }],
      'col-start': [{ 'col-start': I() }],
      'col-end': [{ 'col-end': I() }],
      'grid-rows': [{ 'grid-rows': x() }],
      'row-start-end': [{ row: h() }],
      'row-start': [{ 'row-start': I() }],
      'row-end': [{ 'row-end': I() }],
      'grid-flow': [
        { 'grid-flow': ['row', 'col', 'dense', 'row-dense', 'col-dense'] },
      ],
      'auto-cols': [{ 'auto-cols': y() }],
      'auto-rows': [{ 'auto-rows': y() }],
      gap: [{ gap: O() }],
      'gap-x': [{ 'gap-x': O() }],
      'gap-y': [{ 'gap-y': O() }],
      'justify-content': [{ justify: [...T(), 'normal'] }],
      'justify-items': [{ 'justify-items': [...R(), 'normal'] }],
      'justify-self': [{ 'justify-self': ['auto', ...R()] }],
      'align-content': [{ content: ['normal', ...T()] }],
      'align-items': [{ items: [...R(), { baseline: ['', 'last'] }] }],
      'align-self': [{ self: ['auto', ...R(), { baseline: ['', 'last'] }] }],
      'place-content': [{ 'place-content': T() }],
      'place-items': [{ 'place-items': [...R(), 'baseline'] }],
      'place-self': [{ 'place-self': ['auto', ...R()] }],
      p: [{ p: O() }],
      px: [{ px: O() }],
      py: [{ py: O() }],
      ps: [{ ps: O() }],
      pe: [{ pe: O() }],
      pbs: [{ pbs: O() }],
      pbe: [{ pbe: O() }],
      pt: [{ pt: O() }],
      pr: [{ pr: O() }],
      pb: [{ pb: O() }],
      pl: [{ pl: O() }],
      m: [{ m: v() }],
      mx: [{ mx: v() }],
      my: [{ my: v() }],
      ms: [{ ms: v() }],
      me: [{ me: v() }],
      mbs: [{ mbs: v() }],
      mbe: [{ mbe: v() }],
      mt: [{ mt: v() }],
      mr: [{ mr: v() }],
      mb: [{ mb: v() }],
      ml: [{ ml: v() }],
      'space-x': [{ 'space-x': O() }],
      'space-x-reverse': ['space-x-reverse'],
      'space-y': [{ 'space-y': O() }],
      'space-y-reverse': ['space-y-reverse'],
      size: [{ size: P() }],
      'inline-size': [{ inline: ['auto', ...D()] }],
      'min-inline-size': [{ 'min-inline': ['auto', ...D()] }],
      'max-inline-size': [{ 'max-inline': ['none', ...D()] }],
      'block-size': [{ block: ['auto', ...E()] }],
      'min-block-size': [{ 'min-block': ['auto', ...E()] }],
      'max-block-size': [{ 'max-block': ['none', ...E()] }],
      w: [{ w: [K, 'screen', ...P()] }],
      'min-w': [{ 'min-w': [K, 'screen', 'none', ...P()] }],
      'max-w': [
        { 'max-w': [K, 'screen', 'none', 'prose', { screen: [X] }, ...P()] },
      ],
      h: [{ h: ['screen', 'lh', ...P()] }],
      'min-h': [{ 'min-h': ['screen', 'lh', 'none', ...P()] }],
      'max-h': [{ 'max-h': ['screen', 'lh', ...P()] }],
      'font-size': [{ text: ['base', J, b9, t8] }],
      'font-smoothing': ['antialiased', 'subpixel-antialiased'],
      'font-style': ['italic', 'not-italic'],
      'font-weight': [{ font: [z, BB, XB] }],
      'font-stretch': [
        {
          'font-stretch': [
            'ultra-condensed',
            'extra-condensed',
            'condensed',
            'semi-condensed',
            'normal',
            'semi-expanded',
            'expanded',
            'extra-expanded',
            'ultra-expanded',
            fJ,
            M0,
          ],
        },
      ],
      'font-family': [{ font: [YB, KB, Z] }],
      'font-features': [{ 'font-features': [M0] }],
      'fvn-normal': ['normal-nums'],
      'fvn-ordinal': ['ordinal'],
      'fvn-slashed-zero': ['slashed-zero'],
      'fvn-figure': ['lining-nums', 'oldstyle-nums'],
      'fvn-spacing': ['proportional-nums', 'tabular-nums'],
      'fvn-fraction': ['diagonal-fractions', 'stacked-fractions'],
      tracking: [{ tracking: [q, j0, M0] }],
      'line-clamp': [{ 'line-clamp': [u0, 'none', j0, X$] }],
      leading: [{ leading: [$, ...O()] }],
      'list-image': [{ 'list-image': ['none', j0, M0] }],
      'list-style-position': [{ list: ['inside', 'outside'] }],
      'list-style-type': [{ list: ['disc', 'decimal', 'none', j0, M0] }],
      'text-alignment': [
        { text: ['left', 'center', 'right', 'justify', 'start', 'end'] },
      ],
      'placeholder-color': [{ placeholder: C() }],
      'text-color': [{ text: C() }],
      'text-decoration': [
        'underline',
        'overline',
        'line-through',
        'no-underline',
      ],
      'text-decoration-style': [{ decoration: [...X0(), 'wavy'] }],
      'text-decoration-thickness': [
        { decoration: [u0, 'from-font', 'auto', j0, t8] },
      ],
      'text-decoration-color': [{ decoration: C() }],
      'underline-offset': [{ 'underline-offset': [u0, 'auto', j0, M0] }],
      'text-transform': ['uppercase', 'lowercase', 'capitalize', 'normal-case'],
      'text-overflow': ['truncate', 'text-ellipsis', 'text-clip'],
      'text-wrap': [{ text: ['wrap', 'nowrap', 'balance', 'pretty'] }],
      indent: [{ indent: O() }],
      'vertical-align': [
        {
          align: [
            'baseline',
            'top',
            'middle',
            'bottom',
            'text-top',
            'text-bottom',
            'sub',
            'super',
            j0,
            M0,
          ],
        },
      ],
      whitespace: [
        {
          whitespace: [
            'normal',
            'nowrap',
            'pre',
            'pre-line',
            'pre-wrap',
            'break-spaces',
          ],
        },
      ],
      break: [{ break: ['normal', 'words', 'all', 'keep'] }],
      wrap: [{ wrap: ['break-word', 'anywhere', 'normal'] }],
      hyphens: [{ hyphens: ['none', 'manual', 'auto'] }],
      content: [{ content: ['none', j0, M0] }],
      'bg-attachment': [{ bg: ['fixed', 'local', 'scroll'] }],
      'bg-clip': [{ 'bg-clip': ['border', 'padding', 'content', 'text'] }],
      'bg-origin': [{ 'bg-origin': ['border', 'padding', 'content'] }],
      'bg-position': [{ bg: a() }],
      'bg-repeat': [{ bg: p() }],
      'bg-size': [{ bg: Q0() }],
      'bg-image': [
        {
          bg: [
            'none',
            {
              linear: [
                { to: ['t', 'tr', 'r', 'br', 'b', 'bl', 'l', 'tl'] },
                G8,
                j0,
                M0,
              ],
              radial: ['', j0, M0],
              conic: [G8, j0, M0],
            },
            UB,
            GB,
          ],
        },
      ],
      'bg-color': [{ bg: C() }],
      'gradient-from-pos': [{ from: g() }],
      'gradient-via-pos': [{ via: g() }],
      'gradient-to-pos': [{ to: g() }],
      'gradient-from': [{ from: C() }],
      'gradient-via': [{ via: C() }],
      'gradient-to': [{ to: C() }],
      rounded: [{ rounded: Z0() }],
      'rounded-s': [{ 'rounded-s': Z0() }],
      'rounded-e': [{ 'rounded-e': Z0() }],
      'rounded-t': [{ 'rounded-t': Z0() }],
      'rounded-r': [{ 'rounded-r': Z0() }],
      'rounded-b': [{ 'rounded-b': Z0() }],
      'rounded-l': [{ 'rounded-l': Z0() }],
      'rounded-ss': [{ 'rounded-ss': Z0() }],
      'rounded-se': [{ 'rounded-se': Z0() }],
      'rounded-ee': [{ 'rounded-ee': Z0() }],
      'rounded-es': [{ 'rounded-es': Z0() }],
      'rounded-tl': [{ 'rounded-tl': Z0() }],
      'rounded-tr': [{ 'rounded-tr': Z0() }],
      'rounded-br': [{ 'rounded-br': Z0() }],
      'rounded-bl': [{ 'rounded-bl': Z0() }],
      'border-w': [{ border: i() }],
      'border-w-x': [{ 'border-x': i() }],
      'border-w-y': [{ 'border-y': i() }],
      'border-w-s': [{ 'border-s': i() }],
      'border-w-e': [{ 'border-e': i() }],
      'border-w-bs': [{ 'border-bs': i() }],
      'border-w-be': [{ 'border-be': i() }],
      'border-w-t': [{ 'border-t': i() }],
      'border-w-r': [{ 'border-r': i() }],
      'border-w-b': [{ 'border-b': i() }],
      'border-w-l': [{ 'border-l': i() }],
      'divide-x': [{ 'divide-x': i() }],
      'divide-x-reverse': ['divide-x-reverse'],
      'divide-y': [{ 'divide-y': i() }],
      'divide-y-reverse': ['divide-y-reverse'],
      'border-style': [{ border: [...X0(), 'hidden', 'none'] }],
      'divide-style': [{ divide: [...X0(), 'hidden', 'none'] }],
      'border-color': [{ border: C() }],
      'border-color-x': [{ 'border-x': C() }],
      'border-color-y': [{ 'border-y': C() }],
      'border-color-s': [{ 'border-s': C() }],
      'border-color-e': [{ 'border-e': C() }],
      'border-color-bs': [{ 'border-bs': C() }],
      'border-color-be': [{ 'border-be': C() }],
      'border-color-t': [{ 'border-t': C() }],
      'border-color-r': [{ 'border-r': C() }],
      'border-color-b': [{ 'border-b': C() }],
      'border-color-l': [{ 'border-l': C() }],
      'divide-color': [{ divide: C() }],
      'outline-style': [{ outline: [...X0(), 'none', 'hidden'] }],
      'outline-offset': [{ 'outline-offset': [u0, j0, M0] }],
      'outline-w': [{ outline: ['', u0, b9, t8] }],
      'outline-color': [{ outline: C() }],
      shadow: [{ shadow: ['', 'none', W, r7, l7] }],
      'shadow-color': [{ shadow: C() }],
      'inset-shadow': [{ 'inset-shadow': ['none', U, r7, l7] }],
      'inset-shadow-color': [{ 'inset-shadow': C() }],
      'ring-w': [{ ring: i() }],
      'ring-w-inset': ['ring-inset'],
      'ring-color': [{ ring: C() }],
      'ring-offset-w': [{ 'ring-offset': [u0, t8] }],
      'ring-offset-color': [{ 'ring-offset': C() }],
      'inset-ring-w': [{ 'inset-ring': i() }],
      'inset-ring-color': [{ 'inset-ring': C() }],
      'text-shadow': [{ 'text-shadow': ['none', B, r7, l7] }],
      'text-shadow-color': [{ 'text-shadow': C() }],
      opacity: [{ opacity: [u0, j0, M0] }],
      'mix-blend': [{ 'mix-blend': [...Y0(), 'plus-darker', 'plus-lighter'] }],
      'bg-blend': [{ 'bg-blend': Y0() }],
      'mask-clip': [
        {
          'mask-clip': [
            'border',
            'padding',
            'content',
            'fill',
            'stroke',
            'view',
          ],
        },
        'mask-no-clip',
      ],
      'mask-composite': [{ mask: ['add', 'subtract', 'intersect', 'exclude'] }],
      'mask-image-linear-pos': [{ 'mask-linear': [u0] }],
      'mask-image-linear-from-pos': [{ 'mask-linear-from': J0() }],
      'mask-image-linear-to-pos': [{ 'mask-linear-to': J0() }],
      'mask-image-linear-from-color': [{ 'mask-linear-from': C() }],
      'mask-image-linear-to-color': [{ 'mask-linear-to': C() }],
      'mask-image-t-from-pos': [{ 'mask-t-from': J0() }],
      'mask-image-t-to-pos': [{ 'mask-t-to': J0() }],
      'mask-image-t-from-color': [{ 'mask-t-from': C() }],
      'mask-image-t-to-color': [{ 'mask-t-to': C() }],
      'mask-image-r-from-pos': [{ 'mask-r-from': J0() }],
      'mask-image-r-to-pos': [{ 'mask-r-to': J0() }],
      'mask-image-r-from-color': [{ 'mask-r-from': C() }],
      'mask-image-r-to-color': [{ 'mask-r-to': C() }],
      'mask-image-b-from-pos': [{ 'mask-b-from': J0() }],
      'mask-image-b-to-pos': [{ 'mask-b-to': J0() }],
      'mask-image-b-from-color': [{ 'mask-b-from': C() }],
      'mask-image-b-to-color': [{ 'mask-b-to': C() }],
      'mask-image-l-from-pos': [{ 'mask-l-from': J0() }],
      'mask-image-l-to-pos': [{ 'mask-l-to': J0() }],
      'mask-image-l-from-color': [{ 'mask-l-from': C() }],
      'mask-image-l-to-color': [{ 'mask-l-to': C() }],
      'mask-image-x-from-pos': [{ 'mask-x-from': J0() }],
      'mask-image-x-to-pos': [{ 'mask-x-to': J0() }],
      'mask-image-x-from-color': [{ 'mask-x-from': C() }],
      'mask-image-x-to-color': [{ 'mask-x-to': C() }],
      'mask-image-y-from-pos': [{ 'mask-y-from': J0() }],
      'mask-image-y-to-pos': [{ 'mask-y-to': J0() }],
      'mask-image-y-from-color': [{ 'mask-y-from': C() }],
      'mask-image-y-to-color': [{ 'mask-y-to': C() }],
      'mask-image-radial': [{ 'mask-radial': [j0, M0] }],
      'mask-image-radial-from-pos': [{ 'mask-radial-from': J0() }],
      'mask-image-radial-to-pos': [{ 'mask-radial-to': J0() }],
      'mask-image-radial-from-color': [{ 'mask-radial-from': C() }],
      'mask-image-radial-to-color': [{ 'mask-radial-to': C() }],
      'mask-image-radial-shape': [{ 'mask-radial': ['circle', 'ellipse'] }],
      'mask-image-radial-size': [
        {
          'mask-radial': [
            { closest: ['side', 'corner'], farthest: ['side', 'corner'] },
          ],
        },
      ],
      'mask-image-radial-pos': [{ 'mask-radial-at': M() }],
      'mask-image-conic-pos': [{ 'mask-conic': [u0] }],
      'mask-image-conic-from-pos': [{ 'mask-conic-from': J0() }],
      'mask-image-conic-to-pos': [{ 'mask-conic-to': J0() }],
      'mask-image-conic-from-color': [{ 'mask-conic-from': C() }],
      'mask-image-conic-to-color': [{ 'mask-conic-to': C() }],
      'mask-mode': [{ mask: ['alpha', 'luminance', 'match'] }],
      'mask-origin': [
        {
          'mask-origin': [
            'border',
            'padding',
            'content',
            'fill',
            'stroke',
            'view',
          ],
        },
      ],
      'mask-position': [{ mask: a() }],
      'mask-repeat': [{ mask: p() }],
      'mask-size': [{ mask: Q0() }],
      'mask-type': [{ 'mask-type': ['alpha', 'luminance'] }],
      'mask-image': [{ mask: ['none', j0, M0] }],
      filter: [{ filter: ['', 'none', j0, M0] }],
      blur: [{ blur: U0() }],
      brightness: [{ brightness: [u0, j0, M0] }],
      contrast: [{ contrast: [u0, j0, M0] }],
      'drop-shadow': [{ 'drop-shadow': ['', 'none', H, r7, l7] }],
      'drop-shadow-color': [{ 'drop-shadow': C() }],
      grayscale: [{ grayscale: ['', u0, j0, M0] }],
      'hue-rotate': [{ 'hue-rotate': [u0, j0, M0] }],
      invert: [{ invert: ['', u0, j0, M0] }],
      saturate: [{ saturate: [u0, j0, M0] }],
      sepia: [{ sepia: ['', u0, j0, M0] }],
      'backdrop-filter': [{ 'backdrop-filter': ['', 'none', j0, M0] }],
      'backdrop-blur': [{ 'backdrop-blur': U0() }],
      'backdrop-brightness': [{ 'backdrop-brightness': [u0, j0, M0] }],
      'backdrop-contrast': [{ 'backdrop-contrast': [u0, j0, M0] }],
      'backdrop-grayscale': [{ 'backdrop-grayscale': ['', u0, j0, M0] }],
      'backdrop-hue-rotate': [{ 'backdrop-hue-rotate': [u0, j0, M0] }],
      'backdrop-invert': [{ 'backdrop-invert': ['', u0, j0, M0] }],
      'backdrop-opacity': [{ 'backdrop-opacity': [u0, j0, M0] }],
      'backdrop-saturate': [{ 'backdrop-saturate': [u0, j0, M0] }],
      'backdrop-sepia': [{ 'backdrop-sepia': ['', u0, j0, M0] }],
      'border-collapse': [{ border: ['collapse', 'separate'] }],
      'border-spacing': [{ 'border-spacing': O() }],
      'border-spacing-x': [{ 'border-spacing-x': O() }],
      'border-spacing-y': [{ 'border-spacing-y': O() }],
      'table-layout': [{ table: ['auto', 'fixed'] }],
      caption: [{ caption: ['top', 'bottom'] }],
      transition: [
        {
          transition: [
            '',
            'all',
            'colors',
            'opacity',
            'shadow',
            'transform',
            'none',
            j0,
            M0,
          ],
        },
      ],
      'transition-behavior': [{ transition: ['normal', 'discrete'] }],
      duration: [{ duration: [u0, 'initial', j0, M0] }],
      ease: [{ ease: ['linear', 'initial', F, j0, M0] }],
      delay: [{ delay: [u0, j0, M0] }],
      animate: [{ animate: ['none', k, j0, M0] }],
      backface: [{ backface: ['hidden', 'visible'] }],
      perspective: [{ perspective: [_, j0, M0] }],
      'perspective-origin': [{ 'perspective-origin': j() }],
      rotate: [{ rotate: K0() }],
      'rotate-x': [{ 'rotate-x': K0() }],
      'rotate-y': [{ 'rotate-y': K0() }],
      'rotate-z': [{ 'rotate-z': K0() }],
      scale: [{ scale: b() }],
      'scale-x': [{ 'scale-x': b() }],
      'scale-y': [{ 'scale-y': b() }],
      'scale-z': [{ 'scale-z': b() }],
      'scale-3d': ['scale-3d'],
      skew: [{ skew: r() }],
      'skew-x': [{ 'skew-x': r() }],
      'skew-y': [{ 'skew-y': r() }],
      transform: [{ transform: [j0, M0, '', 'none', 'gpu', 'cpu'] }],
      'transform-origin': [{ origin: j() }],
      'transform-style': [{ transform: ['3d', 'flat'] }],
      translate: [{ translate: t() }],
      'translate-x': [{ 'translate-x': t() }],
      'translate-y': [{ 'translate-y': t() }],
      'translate-z': [{ 'translate-z': t() }],
      'translate-none': ['translate-none'],
      accent: [{ accent: C() }],
      appearance: [{ appearance: ['none', 'auto'] }],
      'caret-color': [{ caret: C() }],
      'color-scheme': [
        {
          scheme: [
            'normal',
            'dark',
            'light',
            'light-dark',
            'only-dark',
            'only-light',
          ],
        },
      ],
      cursor: [
        {
          cursor: [
            'auto',
            'default',
            'pointer',
            'wait',
            'text',
            'move',
            'help',
            'not-allowed',
            'none',
            'context-menu',
            'progress',
            'cell',
            'crosshair',
            'vertical-text',
            'alias',
            'copy',
            'no-drop',
            'grab',
            'grabbing',
            'all-scroll',
            'col-resize',
            'row-resize',
            'n-resize',
            'e-resize',
            's-resize',
            'w-resize',
            'ne-resize',
            'nw-resize',
            'se-resize',
            'sw-resize',
            'ew-resize',
            'ns-resize',
            'nesw-resize',
            'nwse-resize',
            'zoom-in',
            'zoom-out',
            j0,
            M0,
          ],
        },
      ],
      'field-sizing': [{ 'field-sizing': ['fixed', 'content'] }],
      'pointer-events': [{ 'pointer-events': ['auto', 'none'] }],
      resize: [{ resize: ['none', '', 'y', 'x'] }],
      'scroll-behavior': [{ scroll: ['auto', 'smooth'] }],
      'scroll-m': [{ 'scroll-m': O() }],
      'scroll-mx': [{ 'scroll-mx': O() }],
      'scroll-my': [{ 'scroll-my': O() }],
      'scroll-ms': [{ 'scroll-ms': O() }],
      'scroll-me': [{ 'scroll-me': O() }],
      'scroll-mbs': [{ 'scroll-mbs': O() }],
      'scroll-mbe': [{ 'scroll-mbe': O() }],
      'scroll-mt': [{ 'scroll-mt': O() }],
      'scroll-mr': [{ 'scroll-mr': O() }],
      'scroll-mb': [{ 'scroll-mb': O() }],
      'scroll-ml': [{ 'scroll-ml': O() }],
      'scroll-p': [{ 'scroll-p': O() }],
      'scroll-px': [{ 'scroll-px': O() }],
      'scroll-py': [{ 'scroll-py': O() }],
      'scroll-ps': [{ 'scroll-ps': O() }],
      'scroll-pe': [{ 'scroll-pe': O() }],
      'scroll-pbs': [{ 'scroll-pbs': O() }],
      'scroll-pbe': [{ 'scroll-pbe': O() }],
      'scroll-pt': [{ 'scroll-pt': O() }],
      'scroll-pr': [{ 'scroll-pr': O() }],
      'scroll-pb': [{ 'scroll-pb': O() }],
      'scroll-pl': [{ 'scroll-pl': O() }],
      'snap-align': [{ snap: ['start', 'end', 'center', 'align-none'] }],
      'snap-stop': [{ snap: ['normal', 'always'] }],
      'snap-type': [{ snap: ['none', 'x', 'y', 'both'] }],
      'snap-strictness': [{ snap: ['mandatory', 'proximity'] }],
      touch: [{ touch: ['auto', 'none', 'manipulation'] }],
      'touch-x': [{ 'touch-pan': ['x', 'left', 'right'] }],
      'touch-y': [{ 'touch-pan': ['y', 'up', 'down'] }],
      'touch-pz': ['touch-pinch-zoom'],
      select: [{ select: ['none', 'text', 'all', 'auto'] }],
      'will-change': [
        { 'will-change': ['auto', 'scroll', 'contents', 'transform', j0, M0] },
      ],
      fill: [{ fill: ['none', ...C()] }],
      'stroke-w': [{ stroke: [u0, b9, t8, X$] }],
      stroke: [{ stroke: ['none', ...C()] }],
      'forced-color-adjust': [{ 'forced-color-adjust': ['auto', 'none'] }],
    },
    conflictingClassGroups: {
      overflow: ['overflow-x', 'overflow-y'],
      overscroll: ['overscroll-x', 'overscroll-y'],
      inset: [
        'inset-x',
        'inset-y',
        'inset-bs',
        'inset-be',
        'start',
        'end',
        'top',
        'right',
        'bottom',
        'left',
      ],
      'inset-x': ['right', 'left'],
      'inset-y': ['top', 'bottom'],
      flex: ['basis', 'grow', 'shrink'],
      gap: ['gap-x', 'gap-y'],
      p: ['px', 'py', 'ps', 'pe', 'pbs', 'pbe', 'pt', 'pr', 'pb', 'pl'],
      px: ['pr', 'pl'],
      py: ['pt', 'pb'],
      m: ['mx', 'my', 'ms', 'me', 'mbs', 'mbe', 'mt', 'mr', 'mb', 'ml'],
      mx: ['mr', 'ml'],
      my: ['mt', 'mb'],
      size: ['w', 'h'],
      'font-size': ['leading'],
      'fvn-normal': [
        'fvn-ordinal',
        'fvn-slashed-zero',
        'fvn-figure',
        'fvn-spacing',
        'fvn-fraction',
      ],
      'fvn-ordinal': ['fvn-normal'],
      'fvn-slashed-zero': ['fvn-normal'],
      'fvn-figure': ['fvn-normal'],
      'fvn-spacing': ['fvn-normal'],
      'fvn-fraction': ['fvn-normal'],
      'line-clamp': ['display', 'overflow'],
      rounded: [
        'rounded-s',
        'rounded-e',
        'rounded-t',
        'rounded-r',
        'rounded-b',
        'rounded-l',
        'rounded-ss',
        'rounded-se',
        'rounded-ee',
        'rounded-es',
        'rounded-tl',
        'rounded-tr',
        'rounded-br',
        'rounded-bl',
      ],
      'rounded-s': ['rounded-ss', 'rounded-es'],
      'rounded-e': ['rounded-se', 'rounded-ee'],
      'rounded-t': ['rounded-tl', 'rounded-tr'],
      'rounded-r': ['rounded-tr', 'rounded-br'],
      'rounded-b': ['rounded-br', 'rounded-bl'],
      'rounded-l': ['rounded-tl', 'rounded-bl'],
      'border-spacing': ['border-spacing-x', 'border-spacing-y'],
      'border-w': [
        'border-w-x',
        'border-w-y',
        'border-w-s',
        'border-w-e',
        'border-w-bs',
        'border-w-be',
        'border-w-t',
        'border-w-r',
        'border-w-b',
        'border-w-l',
      ],
      'border-w-x': ['border-w-r', 'border-w-l'],
      'border-w-y': ['border-w-t', 'border-w-b'],
      'border-color': [
        'border-color-x',
        'border-color-y',
        'border-color-s',
        'border-color-e',
        'border-color-bs',
        'border-color-be',
        'border-color-t',
        'border-color-r',
        'border-color-b',
        'border-color-l',
      ],
      'border-color-x': ['border-color-r', 'border-color-l'],
      'border-color-y': ['border-color-t', 'border-color-b'],
      translate: ['translate-x', 'translate-y', 'translate-none'],
      'translate-none': [
        'translate',
        'translate-x',
        'translate-y',
        'translate-z',
      ],
      'scroll-m': [
        'scroll-mx',
        'scroll-my',
        'scroll-ms',
        'scroll-me',
        'scroll-mbs',
        'scroll-mbe',
        'scroll-mt',
        'scroll-mr',
        'scroll-mb',
        'scroll-ml',
      ],
      'scroll-mx': ['scroll-mr', 'scroll-ml'],
      'scroll-my': ['scroll-mt', 'scroll-mb'],
      'scroll-p': [
        'scroll-px',
        'scroll-py',
        'scroll-ps',
        'scroll-pe',
        'scroll-pbs',
        'scroll-pbe',
        'scroll-pt',
        'scroll-pr',
        'scroll-pb',
        'scroll-pl',
      ],
      'scroll-px': ['scroll-pr', 'scroll-pl'],
      'scroll-py': ['scroll-pt', 'scroll-pb'],
      touch: ['touch-x', 'touch-y', 'touch-pz'],
      'touch-x': ['touch'],
      'touch-y': ['touch'],
      'touch-pz': ['touch'],
    },
    conflictingClassGroupModifiers: { 'font-size': ['leading'] },
    orderSensitiveModifiers: [
      '*',
      '**',
      'after',
      'backdrop',
      'before',
      'details-content',
      'file',
      'first-letter',
      'first-line',
      'marker',
      'placeholder',
      'selection',
    ],
  }
}
var O$ = rU(HB)
function z0(...Q) {
  return O$(i7(Q))
}
import * as l$ from 'react'
import * as Q6 from 'react'
function s7() {
  return typeof window < 'u'
}
function d5(Q) {
  if (n7(Q)) return (Q.nodeName || '').toLowerCase()
  return '#document'
}
function o0(Q) {
  var Z
  return (
    (Q == null || (Z = Q.ownerDocument) == null ? void 0 : Z.defaultView) ||
    window
  )
}
function i5(Q) {
  var Z
  return (Z = (n7(Q) ? Q.ownerDocument : Q.document) || window.document) == null
    ? void 0
    : Z.documentElement
}
function n7(Q) {
  if (!s7()) return !1
  return Q instanceof Node || Q instanceof o0(Q).Node
}
function C0(Q) {
  if (!s7()) return !1
  return Q instanceof Element || Q instanceof o0(Q).Element
}
function m0(Q) {
  if (!s7()) return !1
  return Q instanceof HTMLElement || Q instanceof o0(Q).HTMLElement
}
function a7(Q) {
  if (!s7() || typeof ShadowRoot > 'u') return !1
  return Q instanceof ShadowRoot || Q instanceof o0(Q).ShadowRoot
}
var NB = new Set(['inline', 'contents'])
function K2(Q) {
  let { overflow: Z, overflowX: J, overflowY: z, display: q } = R1(Q)
  return /auto|scroll|overlay|hidden|clip/.test(Z + z + J) && !NB.has(q)
}
var LB = new Set(['table', 'td', 'th'])
function w$(Q) {
  return LB.has(d5(Q))
}
var FB = [':popover-open', ':modal']
function R9(Q) {
  return FB.some((Z) => {
    try {
      return Q.matches(Z)
    } catch (J) {
      return !1
    }
  })
}
var kB = ['transform', 'translate', 'scale', 'rotate', 'perspective'],
  MB = ['transform', 'translate', 'scale', 'rotate', 'perspective', 'filter'],
  jB = ['paint', 'layout', 'strict', 'content']
function o7(Q) {
  let Z = v6(),
    J = C0(Q) ? R1(Q) : Q
  return (
    kB.some((z) => (J[z] ? J[z] !== 'none' : !1)) ||
    (J.containerType ? J.containerType !== 'normal' : !1) ||
    (!Z && (J.backdropFilter ? J.backdropFilter !== 'none' : !1)) ||
    (!Z && (J.filter ? J.filter !== 'none' : !1)) ||
    MB.some((z) => (J.willChange || '').includes(z)) ||
    jB.some((z) => (J.contain || '').includes(z))
  )
}
function y$(Q) {
  let Z = N5(Q)
  while (m0(Z) && !F5(Z)) {
    if (o7(Z)) return Z
    else if (R9(Z)) return null
    Z = N5(Z)
  }
  return null
}
function v6() {
  if (typeof CSS > 'u' || !CSS.supports) return !1
  return CSS.supports('-webkit-backdrop-filter', 'none')
}
var VB = new Set(['html', 'body', '#document'])
function F5(Q) {
  return VB.has(d5(Q))
}
function R1(Q) {
  return o0(Q).getComputedStyle(Q)
}
function v9(Q) {
  if (C0(Q)) return { scrollLeft: Q.scrollLeft, scrollTop: Q.scrollTop }
  return { scrollLeft: Q.scrollX, scrollTop: Q.scrollY }
}
function N5(Q) {
  if (d5(Q) === 'html') return Q
  let Z = Q.assignedSlot || Q.parentNode || (a7(Q) && Q.host) || i5(Q)
  return a7(Z) ? Z.host : Z
}
function D$(Q) {
  let Z = N5(Q)
  if (F5(Z)) return Q.ownerDocument ? Q.ownerDocument.body : Q.body
  if (m0(Z) && K2(Z)) return Z
  return D$(Z)
}
function L5(Q, Z, J) {
  var z
  if (Z === void 0) Z = []
  if (J === void 0) J = !0
  let q = D$(Q),
    $ = q === ((z = Q.ownerDocument) == null ? void 0 : z.body),
    X = o0(q)
  if ($) {
    let K = t7(X)
    return Z.concat(
      X,
      X.visualViewport || [],
      K2(q) ? q : [],
      K && J ? L5(K) : [],
    )
  }
  return Z.concat(q, L5(q, [], J))
}
function t7(Q) {
  return Q.parent && Object.getPrototypeOf(Q.parent) ? Q.frameElement : null
}
import * as uJ from 'react'
import * as P$ from 'react'
var T$ = {}
function R0(Q, Z) {
  let J = P$.useRef(T$)
  if (J.current === T$) J.current = Q(Z)
  return J
}
var pJ = uJ[`useInsertionEffect${Math.random().toFixed(1)}`.slice(0, -3)],
  AB = pJ && pJ !== uJ.useLayoutEffect ? pJ : (Q) => Q()
function m(Q) {
  let Z = R0(OB).current
  return ((Z.next = Q), AB(Z.effect), Z.trampoline)
}
function OB() {
  let Q = {
    next: void 0,
    callback: wB,
    trampoline: (...Z) => Q.callback?.(...Z),
    effect: () => {
      Q.callback = Q.next
    },
  }
  return Q
}
function wB() {
  throw Error('Base UI: Cannot call an event handler while rendering.')
}
var cJ
cJ = new Set()
function W8(...Q) {
  {
    let Z = Q.join(' ')
    if (!cJ.has(Z)) (cJ.add(Z), console.error(`Base UI: ${Z}`))
  }
}
import * as yB from 'react'
var U8 = { ...yB }
import * as E$ from 'react'
var DB = () => {},
  u = typeof document < 'u' ? E$.useLayoutEffect : DB
function f9(Q, Z) {
  if (Q && !Z) return Q
  if (!Q && Z) return Z
  if (Q || Z) return { ...Q, ...Z }
  return
}
var m9 = {}
function q1(Q, Z, J, z, q) {
  let $ = { ...dJ(Q, m9) }
  if (Z) $ = g9($, Z)
  if (J) $ = g9($, J)
  if (z) $ = g9($, z)
  if (q) $ = g9($, q)
  return $
}
function S$(Q) {
  if (Q.length === 0) return m9
  if (Q.length === 1) return dJ(Q[0], m9)
  let Z = { ...dJ(Q[0], m9) }
  for (let J = 1; J < Q.length; J += 1) Z = g9(Z, Q[J])
  return Z
}
function g9(Q, Z) {
  if (I$(Z)) return Z(Q)
  return TB(Q, Z)
}
function TB(Q, Z) {
  if (!Z) return Q
  for (let J in Z) {
    let z = Z[J]
    switch (J) {
      case 'style': {
        Q[J] = f9(Q.style, z)
        break
      }
      case 'className': {
        Q[J] = iJ(Q.className, z)
        break
      }
      default:
        if (PB(J, z)) Q[J] = EB(Q[J], z)
        else Q[J] = z
    }
  }
  return Q
}
function PB(Q, Z) {
  let J = Q.charCodeAt(0),
    z = Q.charCodeAt(1),
    q = Q.charCodeAt(2)
  return (
    J === 111 &&
    z === 110 &&
    q >= 65 &&
    q <= 90 &&
    (typeof Z === 'function' || typeof Z > 'u')
  )
}
function I$(Q) {
  return typeof Q === 'function'
}
function dJ(Q, Z) {
  if (I$(Q)) return Q(Z)
  return Q ?? m9
}
function EB(Q, Z) {
  if (!Z) return Q
  if (!Q) return Z
  return (J) => {
    if (SB(J)) {
      let q = J
      e7(q)
      let $ = Z(q)
      if (!q.baseUIHandlerPrevented) Q?.(q)
      return $
    }
    let z = Z(J)
    return (Q?.(J), z)
  }
}
function e7(Q) {
  return (
    (Q.preventBaseUIHandler = () => {
      Q.baseUIHandlerPrevented = !0
    }),
    Q
  )
}
function iJ(Q, Z) {
  if (Z) {
    if (Q) return Z + ' ' + Q
    return Z
  }
  return Q
}
function SB(Q) {
  return Q != null && typeof Q === 'object' && 'nativeEvent' in Q
}
import * as QQ from 'react'
var ZQ = QQ.createContext(void 0)
ZQ.displayName = 'CompositeRootContext'
function f6(Q = !1) {
  let Z = QQ.useContext(ZQ)
  if (Z === void 0 && !Q)
    throw Error(
      'Base UI: CompositeRootContext is missing. Composite parts must be placed within <Composite.Root>.',
    )
  return Z
}
import * as C$ from 'react'
function x$(Q) {
  let {
      focusableWhenDisabled: Z,
      disabled: J,
      composite: z = !1,
      tabIndex: q = 0,
      isNativeButton: $,
    } = Q,
    X = z && Z !== !1,
    K = z && Z === !1
  return {
    props: C$.useMemo(() => {
      let Y = {
        onKeyDown(W) {
          if (J && Z && W.key !== 'Tab') W.preventDefault()
        },
      }
      if (!z) {
        if (((Y.tabIndex = q), !$ && J)) Y.tabIndex = Z ? q : -1
      }
      if (($ && (Z || X)) || (!$ && J)) Y['aria-disabled'] = J
      if ($ && (!Z || K)) Y.disabled = J
      return Y
    }, [z, J, Z, X, K, $, q]),
  }
}
function Q1(Q = {}) {
  let {
      disabled: Z = !1,
      focusableWhenDisabled: J,
      tabIndex: z = 0,
      native: q = !0,
    } = Q,
    $ = Q6.useRef(null),
    X = f6(!0) !== void 0,
    K = m(() => {
      let B = $.current
      return Boolean(B?.tagName === 'A' && B?.href)
    }),
    { props: G } = x$({
      focusableWhenDisabled: J,
      disabled: Z,
      composite: X,
      tabIndex: z,
      isNativeButton: q,
    })
  Q6.useEffect(() => {
    if (!$.current) return
    let B = $.current.tagName === 'BUTTON'
    if (q) {
      if (!B) {
        let H = U8.captureOwnerStack?.() || ''
        W8(
          `${'A component that acts as a button expected a native <button> because the `nativeButton` prop is true. Rendering a non-<button> removes native button semantics, which can impact forms and accessibility. Use a real <button> in the `render` prop, or set `nativeButton` to `false`.'}${H}`,
        )
      }
    } else if (B) {
      let H = U8.captureOwnerStack?.() || ''
      W8(
        `${'A component that acts as a button expected a non-<button> because the `nativeButton` prop is false. Rendering a <button> keeps native behavior while Base UI applies non-native attributes and handlers, which can add unintended extra attributes (such as `role` or `aria-disabled`). Use a non-<button> in the `render` prop, or set `nativeButton` to `true`.'}${H}`,
      )
    }
  }, [q])
  let Y = Q6.useCallback(() => {
    let B = $.current
    if (!IB(B)) return
    if (X && Z && G.disabled === void 0 && B.disabled) B.disabled = !1
  }, [Z, G.disabled, X])
  u(Y, [Y])
  let W = Q6.useCallback(
      (B = {}) => {
        let {
          onClick: H,
          onMouseDown: N,
          onKeyUp: _,
          onKeyDown: L,
          onPointerDown: F,
          ...k
        } = B
        return q1(
          {
            type: q ? 'button' : void 0,
            onClick(M) {
              if (Z) {
                M.preventDefault()
                return
              }
              H?.(M)
            },
            onMouseDown(M) {
              if (!Z) N?.(M)
            },
            onKeyDown(M) {
              if (!Z) (e7(M), L?.(M))
              if (M.baseUIHandlerPrevented) return
              let j = M.target === M.currentTarget && !q && !K() && !Z,
                A = M.key === 'Enter',
                w = M.key === ' '
              if (j) {
                if (w || A) M.preventDefault()
                if (A) H?.(M)
              }
            },
            onKeyUp(M) {
              if (!Z) (e7(M), _?.(M))
              if (M.baseUIHandlerPrevented) return
              if (M.target === M.currentTarget && !q && !Z && M.key === ' ')
                H?.(M)
            },
            onPointerDown(M) {
              if (Z) {
                M.preventDefault()
                return
              }
              F?.(M)
            },
          },
          !q ? { role: 'button' } : void 0,
          G,
          k,
        )
      },
      [Z, G, q, K],
    ),
    U = m((B) => {
      ;(($.current = B), Y())
    })
  return { getButtonProps: W, buttonRef: U }
}
function IB(Q) {
  return m0(Q) && Q.tagName === 'BUTTON'
}
import * as g2 from 'react'
function Y1(Q, Z, J, z) {
  let q = R0(b$).current
  if (CB(q, Q, Z, J, z)) R$(q, [Q, Z, J, z])
  return q.callback
}
function h$(Q) {
  let Z = R0(b$).current
  if (xB(Z, Q)) R$(Z, Q)
  return Z.callback
}
function b$() {
  return { callback: null, cleanup: null, refs: [] }
}
function CB(Q, Z, J, z, q) {
  return (
    Q.refs[0] !== Z || Q.refs[1] !== J || Q.refs[2] !== z || Q.refs[3] !== q
  )
}
function xB(Q, Z) {
  return Q.refs.length !== Z.length || Q.refs.some((J, z) => J !== Z[z])
}
function R$(Q, Z) {
  if (((Q.refs = Z), Z.every((J) => J == null))) {
    Q.callback = null
    return
  }
  Q.callback = (J) => {
    if (Q.cleanup) (Q.cleanup(), (Q.cleanup = null))
    if (J != null) {
      let z = Array(Z.length).fill(null)
      for (let q = 0; q < Z.length; q += 1) {
        let $ = Z[q]
        if ($ == null) continue
        switch (typeof $) {
          case 'function': {
            let X = $(J)
            if (typeof X === 'function') z[q] = X
            break
          }
          case 'object': {
            $.current = J
            break
          }
          default:
        }
      }
      Q.cleanup = () => {
        for (let q = 0; q < Z.length; q += 1) {
          let $ = Z[q]
          if ($ == null) continue
          switch (typeof $) {
            case 'function': {
              let X = z[q]
              if (typeof X === 'function') X()
              else $(null)
              break
            }
            case 'object': {
              $.current = null
              break
            }
            default:
          }
        }
      }
    }
  }
}
import * as f$ from 'react'
import * as v$ from 'react'
var hB = parseInt(v$.version, 10)
function g6(Q) {
  return hB >= Q
}
function lJ(Q) {
  if (!f$.isValidElement(Q)) return null
  let Z = Q,
    J = Z.props
  return (g6(19) ? J?.ref : Z.ref) ?? null
}
function g$(Q, Z) {
  let J = {}
  for (let z in Q) {
    let q = Q[z]
    if (Z?.hasOwnProperty(z)) {
      let $ = Z[z](q)
      if ($ != null) Object.assign(J, $)
      continue
    }
    if (q === !0) J[`data-${z.toLowerCase()}`] = ''
    else if (q) J[`data-${z.toLowerCase()}`] = q.toString()
  }
  return J
}
function m$(Q, Z) {
  return typeof Q === 'function' ? Q(Z) : Q
}
function p$(Q, Z) {
  return typeof Q === 'function' ? Q(Z) : Q
}
function l0() {}
var z5 = Object.freeze([]),
  S0 = Object.freeze({})
var u$ = 500,
  JQ = 500,
  c$ = { style: { transition: 'none' } },
  m6 = 'data-base-ui-click-trigger',
  zQ = { fallbackAxisSide: 'none' },
  B8 = { fallbackAxisSide: 'end' },
  d$ = { clipPath: 'inset(50%)', position: 'fixed', top: 0, left: 0 }
import { createElement as i$ } from 'react'
function f(Q, Z, J = {}) {
  let z = Z.render,
    q = bB(Z, J)
  if (J.enabled === !1) return null
  let $ = J.state ?? S0
  return vB(Q, z, q, $)
}
function bB(Q, Z = {}) {
  let { className: J, style: z, render: q } = Q,
    {
      state: $ = S0,
      ref: X,
      props: K,
      stateAttributesMapping: G,
      enabled: Y = !0,
    } = Z,
    W = Y ? m$(J, $) : void 0,
    U = Y ? p$(z, $) : void 0,
    B = Y ? g$($, G) : S0,
    H = Y ? (f9(B, Array.isArray(K) ? S$(K) : K) ?? S0) : S0
  if (typeof document < 'u')
    if (!Y) Y1(null, null)
    else if (Array.isArray(X)) H.ref = h$([H.ref, lJ(q), ...X])
    else H.ref = Y1(H.ref, lJ(q), X)
  if (!Y) return S0
  if (W !== void 0) H.className = iJ(H.className, W)
  if (U !== void 0) H.style = f9(H.style, U)
  return H
}
var RB = Symbol.for('react.lazy')
function vB(Q, Z, J, z) {
  if (Z) {
    if (typeof Z === 'function') return Z(J, z)
    let q = q1(J, Z.props)
    q.ref = J.ref
    let $ = Z
    if ($?.$$typeof === RB) $ = g2.Children.toArray(Z)[0]
    if (!g2.isValidElement($))
      throw Error(
        [
          'Base UI: The `render` prop was provided an invalid React element as `React.isValidElement(render)` is `false`.',
          'A valid React element must be provided to the `render` prop because it is cloned with props to replace the default element.',
          'https://base-ui.com/r/invalid-render-prop',
        ].join(`
`),
      )
    return g2.cloneElement($, q)
  }
  if (Q) {
    if (typeof Q === 'string') return fB(Q, J)
  }
  throw Error('Base UI: Render element or function are not defined.')
}
function fB(Q, Z) {
  if (Q === 'button') return i$('button', { type: 'button', ...Z, key: Z.key })
  if (Q === 'img') return i$('img', { alt: '', ...Z, key: Z.key })
  return g2.createElement(Q, Z)
}
var qQ = l$.forwardRef(function (Z, J) {
  let {
      render: z,
      className: q,
      disabled: $ = !1,
      focusableWhenDisabled: X = !1,
      nativeButton: K = !0,
      ...G
    } = Z,
    { getButtonProps: Y, buttonRef: W } = Q1({
      disabled: $,
      focusableWhenDisabled: X,
      native: K,
    })
  return f('button', Z, { state: { disabled: $ }, ref: [J, W], props: [G, Y] })
})
qQ.displayName = 'Button'
var r$ = (Q) => (typeof Q === 'boolean' ? `${Q}` : Q === 0 ? '0' : Q),
  a$ = i7,
  T5 = (Q, Z) => (J) => {
    var z
    if ((Z === null || Z === void 0 ? void 0 : Z.variants) == null)
      return a$(
        Q,
        J === null || J === void 0 ? void 0 : J.class,
        J === null || J === void 0 ? void 0 : J.className,
      )
    let { variants: q, defaultVariants: $ } = Z,
      X = Object.keys(q).map((Y) => {
        let W = J === null || J === void 0 ? void 0 : J[Y],
          U = $ === null || $ === void 0 ? void 0 : $[Y]
        if (W === null) return null
        let B = r$(W) || r$(U)
        return q[Y][B]
      }),
      K =
        J &&
        Object.entries(J).reduce((Y, W) => {
          let [U, B] = W
          if (B === void 0) return Y
          return ((Y[U] = B), Y)
        }, {}),
      G =
        Z === null || Z === void 0
          ? void 0
          : (z = Z.compoundVariants) === null || z === void 0
            ? void 0
            : z.reduce((Y, W) => {
                let { class: U, className: B, ...H } = W
                return Object.entries(H).every((N) => {
                  let [_, L] = N
                  return Array.isArray(L)
                    ? L.includes({ ...$, ...K }[_])
                    : { ...$, ...K }[_] === L
                })
                  ? [...Y, U, B]
                  : Y
              }, [])
    return a$(
      Q,
      X,
      G,
      J === null || J === void 0 ? void 0 : J.class,
      J === null || J === void 0 ? void 0 : J.className,
    )
  }
import { jsxDEV as mB } from 'react/jsx-dev-runtime'
var gB = T5(
  "focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:aria-invalid:border-destructive/50 rounded-lg border border-transparent bg-clip-padding text-sm font-medium focus-visible:ring-3 aria-invalid:ring-3 [&_svg:not([class*='size-'])]:size-4 inline-flex items-center justify-center whitespace-nowrap transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none shrink-0 [&_svg]:shrink-0 outline-none group/button select-none",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground [a]:hover:bg-primary/80',
        outline:
          'border-border bg-background hover:bg-muted hover:text-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50 aria-expanded:bg-muted aria-expanded:text-foreground',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-secondary/80 aria-expanded:bg-secondary aria-expanded:text-secondary-foreground',
        ghost:
          'hover:bg-muted hover:text-foreground dark:hover:bg-muted/50 aria-expanded:bg-muted aria-expanded:text-foreground',
        destructive:
          'bg-destructive/10 hover:bg-destructive/20 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/20 text-destructive focus-visible:border-destructive/40 dark:hover:bg-destructive/30',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default:
          'h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2',
        xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: 'h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3',
        icon: 'size-8',
        'icon-xs':
          "size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        'icon-sm':
          'size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg',
        'icon-lg': 'size-9',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)
function p6({
  className: Q,
  variant: Z = 'default',
  size: J = 'default',
  ...z
}) {
  return mB(
    qQ,
    {
      'data-slot': 'button',
      className: z0(gB({ variant: Z, size: J, className: Q })),
      ...z,
    },
    void 0,
    !1,
    void 0,
    this,
  )
}
function s$(Q) {
  return f(Q.defaultTagName ?? 'div', Q, Q)
}
var pB = T5(
  'h-5 gap-1 rounded-4xl border border-transparent px-2 py-0.5 text-xs font-medium transition-all has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&>svg]:size-3! inline-flex items-center justify-center w-fit whitespace-nowrap shrink-0 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive overflow-hidden group/badge',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground [a]:hover:bg-primary/80',
        secondary:
          'bg-secondary text-secondary-foreground [a]:hover:bg-secondary/80',
        destructive:
          'bg-destructive/10 [a]:hover:bg-destructive/20 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 text-destructive dark:bg-destructive/20',
        outline:
          'border-border text-foreground [a]:hover:bg-muted [a]:hover:text-muted-foreground',
        ghost:
          'hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted/50',
        link: 'text-primary underline-offset-4 hover:underline',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)
function IM({ className: Q, variant: Z = 'default', render: J, ...z }) {
  return s$({
    defaultTagName: 'span',
    props: q1({ className: z0(pB({ variant: Z }), Q) }, z),
    render: J,
    state: { slot: 'badge', variant: Z },
  })
}
import * as hX from 'react'
var cQ = {}
c1(cQ, {
  Validity: () => Gz,
  Root: () => sJ,
  Label: () => qz,
  Item: () => Yz,
  Error: () => $z,
  Description: () => Xz,
  Control: () => Kz,
})
import * as f1 from 'react'
import * as $Q from 'react'
var rJ = (function (Q) {
  return (
    (Q.disabled = 'data-disabled'),
    (Q.valid = 'data-valid'),
    (Q.invalid = 'data-invalid'),
    (Q.touched = 'data-touched'),
    (Q.dirty = 'data-dirty'),
    (Q.filled = 'data-filled'),
    (Q.focused = 'data-focused'),
    Q
  )
})({})
var Z6 = {
    badInput: !1,
    customError: !1,
    patternMismatch: !1,
    rangeOverflow: !1,
    rangeUnderflow: !1,
    stepMismatch: !1,
    tooLong: !1,
    tooShort: !1,
    typeMismatch: !1,
    valid: null,
    valueMissing: !1,
  },
  $1 = {
    valid(Q) {
      if (Q === null) return null
      if (Q) return { [rJ.valid]: '' }
      return { [rJ.invalid]: '' }
    },
  }
var XQ = $Q.createContext({
  invalid: void 0,
  name: void 0,
  validityData: {
    state: Z6,
    errors: [],
    error: '',
    value: '',
    initialValue: null,
  },
  setValidityData: l0,
  disabled: void 0,
  touched: !1,
  setTouched: l0,
  dirty: !1,
  setDirty: l0,
  filled: !1,
  setFilled: l0,
  focused: !1,
  setFocused: l0,
  validate: () => null,
  validationMode: 'onSubmit',
  validationDebounceTime: 0,
  shouldValidateOnChange: () => !1,
  state: {
    disabled: !1,
    valid: null,
    touched: !1,
    dirty: !1,
    filled: !1,
    focused: !1,
  },
  markedDirtyRef: { current: !1 },
  validation: {
    getValidationProps: (Q = S0) => Q,
    getInputValidationProps: (Q = S0) => Q,
    inputRef: { current: null },
    commit: async () => {},
  },
})
XQ.displayName = 'FieldRootContext'
function r0(Q = !0) {
  let Z = $Q.useContext(XQ)
  if (Z.setValidityData === l0 && !Q)
    throw Error(
      'Base UI: FieldRootContext is missing. Field parts must be placed within <Field.Root>.',
    )
  return Z
}
import * as KQ from 'react'
var n$ = KQ.createContext({
  legendId: void 0,
  setLegendId: () => {},
  disabled: void 0,
})
n$.displayName = 'FieldsetRootContext'
function GQ(Q = !1) {
  let Z = KQ.useContext(n$)
  if (!Z && !Q)
    throw Error(
      'Base UI: FieldsetRootContext is missing. Fieldset parts must be placed within <Fieldset.Root>.',
    )
  return Z
}
import * as YQ from 'react'
var o$ = YQ.createContext({
  formRef: { current: { fields: new Map() } },
  errors: {},
  clearErrors: l0,
  validationMode: 'onSubmit',
  submitAttemptedRef: { current: !1 },
})
o$.displayName = 'FormContext'
function v1() {
  return YQ.useContext(o$)
}
import * as _8 from 'react'
import * as WQ from 'react'
var t$ = 0
function uB(Q, Z = 'mui') {
  let [J, z] = WQ.useState(Q),
    q = Q || J
  return (
    WQ.useEffect(() => {
      if (J == null) ((t$ += 1), z(`${Z}-${t$}`))
    }, [J, Z]),
    q
  )
}
var e$ = U8.useId
function q5(Q, Z) {
  if (e$ !== void 0) {
    let J = e$()
    return Q ?? (Z ? `${Z}-${J}` : J)
  }
  return uB(Q, Z)
}
function L0(Q) {
  return q5(Q, 'base-ui')
}
import * as UQ from 'react'
var BQ = UQ.createContext({
  controlId: void 0,
  registerControlId: l0,
  labelId: void 0,
  setLabelId: l0,
  messageIds: [],
  setMessageIds: l0,
  getDescriptionProps: (Q) => Q,
})
BQ.displayName = 'LabelableContext'
function X1() {
  return UQ.useContext(BQ)
}
import { jsx as cB } from 'react/jsx-runtime'
var p9 = function (Z) {
  let J = L0(),
    [z, q] = _8.useState(
      Z.initialControlId === void 0 ? J : Z.initialControlId,
    ),
    [$, X] = _8.useState(void 0),
    [K, G] = _8.useState([]),
    Y = R0(() => new Map()),
    { messageIds: W } = X1(),
    U = m((N, _) => {
      let L = Y.current
      if (_ === void 0) {
        L.delete(N)
        return
      }
      ;(L.set(N, _),
        q((F) => {
          if (L.size === 0) return
          let k
          for (let V of L.values()) {
            if (F !== void 0 && V === F) return F
            if (k === void 0) k = V
          }
          return k
        }))
    }),
    B = _8.useCallback(
      (N) => {
        return q1({ 'aria-describedby': W.concat(K).join(' ') || void 0 }, N)
      },
      [W, K],
    ),
    H = _8.useMemo(
      () => ({
        controlId: z,
        registerControlId: U,
        labelId: $,
        setLabelId: X,
        messageIds: K,
        setMessageIds: G,
        getDescriptionProps: B,
      }),
      [z, U, $, X, K, G, B],
    )
  return cB(BQ.Provider, { value: H, children: Z.children })
}
p9.displayName = 'LabelableProvider'
import * as z6 from 'react'
import * as QX from 'react'
var dB = []
function $5(Q) {
  QX.useEffect(Q, dB)
}
var u9 = 0
class p1 {
  static create() {
    return new p1()
  }
  currentId = u9
  start(Q, Z) {
    ;(this.clear(),
      (this.currentId = setTimeout(() => {
        ;((this.currentId = u9), Z())
      }, Q)))
  }
  isStarted() {
    return this.currentId !== u9
  }
  clear = () => {
    if (this.currentId !== u9)
      (clearTimeout(this.currentId), (this.currentId = u9))
  }
  disposeEffect = () => {
    return this.clear
  }
}
function c0() {
  let Q = R0(p1.create).current
  return ($5(Q.disposeEffect), Q)
}
function J6(Q, Z) {
  return { ...Q, state: { ...Q.state, valid: !Z && Q.state.valid } }
}
var _Q = Object.keys(Z6)
function iB(Q) {
  if (!Q || Q.valid || !Q.valueMissing) return !1
  let Z = !1
  for (let J of _Q) {
    if (J === 'valid') continue
    if (J === 'valueMissing') Z = Q[J]
    if (Q[J]) Z = !1
  }
  return Z
}
function ZX(Q) {
  let { formRef: Z, clearErrors: J } = v1(),
    {
      setValidityData: z,
      validate: q,
      validityData: $,
      validationDebounceTime: X,
      invalid: K,
      markedDirtyRef: G,
      state: Y,
      name: W,
      shouldValidateOnChange: U,
    } = Q,
    { controlId: B, getDescriptionProps: H } = X1(),
    N = c0(),
    _ = z6.useRef(null),
    L = m(async (V, M = !1) => {
      let j = _.current
      if (!j) return
      if (M) {
        if (Y.valid !== !1) return
        let y = j.validity
        if (!y.valueMissing) {
          let R = {
            value: V,
            state: { ...Z6, valid: !0 },
            error: '',
            errors: [],
            initialValue: $.initialValue,
          }
          if ((j.setCustomValidity(''), B)) {
            let v = Z.current.fields.get(B)
            if (v) Z.current.fields.set(B, { ...v, ...J6(R, !1) })
          }
          z(R)
          return
        }
        let T = _Q.reduce((R, v) => {
          return ((R[v] = y[v]), R)
        }, {})
        if (!T.valid && !iB(T)) return
      }
      function A(y) {
        let T = _Q.reduce((v, P) => {
            return ((v[P] = y.validity[P]), v)
          }, {}),
          R = !1
        for (let v of _Q) {
          if (v === 'valid') continue
          if (v === 'valueMissing' && T[v]) R = !0
          else if (T[v]) return T
        }
        if (R && !G.current) ((T.valid = !0), (T.valueMissing = !1))
        return T
      }
      N.clear()
      let w = null,
        O = [],
        S = A(j),
        x,
        h = U()
      if (j.validationMessage && !h)
        ((x = j.validationMessage), (O = [j.validationMessage]))
      else {
        let y = Array.from(Z.current.fields.values()).reduce((R, v) => {
            if (v.name) R[v.name] = v.getValue()
            return R
          }, {}),
          T = q(V, y)
        if (typeof T === 'object' && T !== null && 'then' in T) w = await T
        else w = T
        if (w !== null) {
          if (((S.valid = !1), (S.customError = !0), Array.isArray(w)))
            ((O = w),
              j.setCustomValidity(
                w.join(`
`),
              ))
          else if (w) ((O = [w]), j.setCustomValidity(w))
        } else if (h) {
          if (
            (j.setCustomValidity(''), (S.customError = !1), j.validationMessage)
          )
            ((x = j.validationMessage), (O = [j.validationMessage]))
          else if (j.validity.valid && !S.valid) S.valid = !0
        }
      }
      let I = {
        value: V,
        state: S,
        error: x ?? (Array.isArray(w) ? w[0] : (w ?? '')),
        errors: O,
        initialValue: $.initialValue,
      }
      if (B) {
        let y = Z.current.fields.get(B)
        if (y) Z.current.fields.set(B, { ...y, ...J6(I, K) })
      }
      z(I)
    }),
    F = z6.useCallback(
      (V = {}) => q1(H, Y.valid === !1 ? { 'aria-invalid': !0 } : S0, V),
      [H, Y.valid],
    ),
    k = z6.useCallback(
      (V = {}) =>
        q1(
          {
            onChange(M) {
              if (M.nativeEvent.defaultPrevented) return
              if ((J(W), !U())) {
                L(M.currentTarget.value, !0)
                return
              }
              if (K) return
              let j = M.currentTarget
              if (j.value === '') {
                L(j.value)
                return
              }
              if ((N.clear(), X))
                N.start(X, () => {
                  L(j.value)
                })
              else L(j.value)
            },
          },
          F(V),
        ),
      [F, J, W, N, L, K, X, U],
    )
  return z6.useMemo(
    () => ({
      getValidationProps: F,
      getInputValidationProps: k,
      inputRef: _,
      commit: L,
    }),
    [F, k, L],
  )
}
import { jsx as aJ } from 'react/jsx-runtime'
var JX = f1.forwardRef(function (Z, J) {
  let { errors: z, validationMode: q, submitAttemptedRef: $ } = v1(),
    {
      render: X,
      className: K,
      validate: G,
      validationDebounceTime: Y = 0,
      validationMode: W = q,
      name: U,
      disabled: B = !1,
      invalid: H,
      dirty: N,
      touched: _,
      actionsRef: L,
      ...F
    } = Z,
    { disabled: k } = GQ(),
    V = m(G || (() => null)),
    M = k || B,
    [j, A] = f1.useState(!1),
    [w, O] = f1.useState(!1),
    [S, x] = f1.useState(!1),
    [h, I] = f1.useState(!1),
    y = N ?? w,
    T = _ ?? j,
    R = f1.useRef(!1),
    v = m((Y0) => {
      if (N !== void 0) return
      if (Y0) R.current = !0
      O(Y0)
    }),
    P = m((Y0) => {
      if (_ !== void 0) return
      A(Y0)
    }),
    D = m(() => W === 'onChange' || (W === 'onSubmit' && $.current)),
    E = Boolean(H || (U && {}.hasOwnProperty.call(z, U) && z[U] !== void 0)),
    [C, a] = f1.useState({
      state: Z6,
      error: '',
      errors: [],
      value: null,
      initialValue: null,
    }),
    p = !E && C.state.valid,
    Q0 = f1.useMemo(
      () => ({
        disabled: M,
        touched: T,
        dirty: y,
        valid: p,
        filled: S,
        focused: h,
      }),
      [M, T, y, p, S, h],
    ),
    g = ZX({
      setValidityData: a,
      validate: V,
      validityData: C,
      validationDebounceTime: Y,
      invalid: E,
      markedDirtyRef: R,
      state: Q0,
      name: U,
      shouldValidateOnChange: D,
    }),
    Z0 = f1.useCallback(() => {
      ;((R.current = !0), g.commit(C.value))
    }, [g, C])
  f1.useImperativeHandle(L, () => ({ validate: Z0 }), [Z0])
  let i = f1.useMemo(
      () => ({
        invalid: E,
        name: U,
        validityData: C,
        setValidityData: a,
        disabled: M,
        touched: T,
        setTouched: P,
        dirty: y,
        setDirty: v,
        filled: S,
        setFilled: x,
        focused: h,
        setFocused: I,
        validate: V,
        validationMode: W,
        validationDebounceTime: Y,
        shouldValidateOnChange: D,
        state: Q0,
        markedDirtyRef: R,
        validation: g,
      }),
      [E, U, C, M, T, P, y, v, S, x, h, I, V, W, Y, D, Q0, g],
    ),
    X0 = f('div', Z, {
      ref: J,
      state: Q0,
      props: F,
      stateAttributesMapping: $1,
    })
  return aJ(XQ.Provider, { value: i, children: X0 })
})
JX.displayName = 'FieldRootInner'
var sJ = f1.forwardRef(function (Z, J) {
  return aJ(p9, { children: aJ(JX, { ...Z, ref: J }) })
})
sJ.displayName = 'FieldRoot'
import * as i6 from 'react'
function V0(Q) {
  return Q?.ownerDocument || document
}
var H8 = typeof navigator < 'u',
  nJ = lB(),
  zX = aB(),
  HQ = rB(),
  N8 =
    typeof CSS > 'u' || !CSS.supports
      ? !1
      : CSS.supports('-webkit-backdrop-filter:none'),
  NQ =
    nJ.platform === 'MacIntel' && nJ.maxTouchPoints > 1
      ? !0
      : /iP(hone|ad|od)|iOS/.test(nJ.platform),
  Sj = H8 && /firefox/i.test(HQ),
  LQ = H8 && /apple/i.test(navigator.vendor),
  Ij = H8 && /Edg/i.test(HQ),
  FQ = (H8 && /android/i.test(zX)) || /android/i.test(HQ),
  qX = H8 && zX.toLowerCase().startsWith('mac') && !navigator.maxTouchPoints,
  kQ = HQ.includes('jsdom/')
function lB() {
  if (!H8) return { platform: '', maxTouchPoints: -1 }
  let Q = navigator.userAgentData
  if (Q?.platform)
    return { platform: Q.platform, maxTouchPoints: navigator.maxTouchPoints }
  return {
    platform: navigator.platform ?? '',
    maxTouchPoints: navigator.maxTouchPoints ?? -1,
  }
}
function rB() {
  if (!H8) return ''
  let Q = navigator.userAgentData
  if (Q && Array.isArray(Q.brands))
    return Q.brands.map(({ brand: Z, version: J }) => `${Z}/${J}`).join(' ')
  return navigator.userAgent
}
function aB() {
  if (!H8) return ''
  let Q = navigator.userAgentData
  if (Q?.platform) return Q.platform
  return navigator.platform ?? ''
}
var c9 = 'data-base-ui-focusable',
  oJ = 'active',
  tJ = 'selected',
  u6 =
    "input:not([type='hidden']):not([disabled]),[contenteditable]:not([contenteditable='false']),textarea:not([disabled])",
  G2 = 'ArrowLeft',
  Y2 = 'ArrowRight',
  d9 = 'ArrowUp',
  q6 = 'ArrowDown'
function B1(Q) {
  let Z = Q.activeElement
  while (Z?.shadowRoot?.activeElement != null) Z = Z.shadowRoot.activeElement
  return Z
}
function F0(Q, Z) {
  if (!Q || !Z) return !1
  let J = Z.getRootNode?.()
  if (Q.contains(Z)) return !0
  if (J && a7(J)) {
    let z = Z
    while (z) {
      if (Q === z) return !0
      z = z.parentNode || z.host
    }
  }
  return !1
}
function $6(Q, Z) {
  if (!C0(Q)) return !1
  let J = Q
  if (Z.hasElement(J)) return !J.hasAttribute('data-trigger-disabled')
  for (let [, z] of Z.entries())
    if (F0(z, J)) return !z.hasAttribute('data-trigger-disabled')
  return !1
}
function K1(Q) {
  if ('composedPath' in Q) return Q.composedPath()[0]
  return Q.target
}
function P5(Q, Z) {
  if (Z == null) return !1
  if ('composedPath' in Q) return Q.composedPath().includes(Z)
  let J = Q
  return J.target != null && Z.contains(J.target)
}
function $X(Q) {
  return Q.matches('html,body')
}
function X6(Q) {
  return m0(Q) && Q.matches(u6)
}
function i9(Q) {
  if (!Q) return !1
  return Q.getAttribute('role') === 'combobox' && X6(Q)
}
function XX(Q) {
  if (!Q || kQ) return !0
  try {
    return Q.matches(':focus-visible')
  } catch (Z) {
    return !0
  }
}
function m2(Q) {
  if (!Q) return null
  return Q.hasAttribute(c9) ? Q : Q.querySelector(`[${c9}]`) || Q
}
function W2(Q, Z, J = !0) {
  return Q.filter((q) => q.parentId === Z && (!J || q.context?.open)).flatMap(
    (q) => [q, ...W2(Q, q.id, J)],
  )
}
function eJ(Q, Z) {
  let J = [],
    z = Q.find((q) => q.id === Z)?.parentId
  while (z) {
    let q = Q.find(($) => $.id === z)
    if (((z = q?.parentId), q)) J = J.concat(q)
  }
  return J
}
function A1(Q) {
  ;(Q.preventDefault(), Q.stopPropagation())
}
function KX(Q) {
  return 'nativeEvent' in Q
}
function MQ(Q) {
  if (Q.pointerType === '' && Q.isTrusted) return !0
  if (FQ && Q.pointerType) return Q.type === 'click' && Q.buttons === 1
  return Q.detail === 0 && !Q.pointerType
}
function jQ(Q) {
  if (kQ) return !1
  return (
    (!FQ && Q.width === 0 && Q.height === 0) ||
    (FQ &&
      Q.width === 1 &&
      Q.height === 1 &&
      Q.pressure === 0 &&
      Q.detail === 0 &&
      Q.pointerType === 'mouse') ||
    (Q.width < 1 &&
      Q.height < 1 &&
      Q.pressure === 0 &&
      Q.detail === 0 &&
      Q.pointerType === 'touch')
  )
}
function E5(Q, Z) {
  let J = ['mouse', 'pen']
  if (!Z) J.push('', void 0)
  return J.includes(Q)
}
function VQ(Q) {
  let Z = Q.type
  return Z === 'click' || Z === 'mousedown' || Z === 'keydown' || Z === 'keyup'
}
var WX = ['top', 'right', 'bottom', 'left']
var { min: L8, max: a1, round: F8, floor: k8 } = Math,
  l5 = (Q) => ({ x: Q, y: Q }),
  sB = { left: 'right', right: 'left', bottom: 'top', top: 'bottom' },
  nB = { start: 'end', end: 'start' }
function r9(Q, Z, J) {
  return a1(Q, L8(Z, J))
}
function r5(Q, Z) {
  return typeof Q === 'function' ? Q(Z) : Q
}
function u1(Q) {
  return Q.split('-')[0]
}
function a5(Q) {
  return Q.split('-')[1]
}
function OQ(Q) {
  return Q === 'x' ? 'y' : 'x'
}
function a9(Q) {
  return Q === 'y' ? 'height' : 'width'
}
var oB = new Set(['top', 'bottom'])
function X5(Q) {
  return oB.has(u1(Q)) ? 'y' : 'x'
}
function s9(Q) {
  return OQ(X5(Q))
}
function UX(Q, Z, J) {
  if (J === void 0) J = !1
  let z = a5(Q),
    q = s9(Q),
    $ = a9(q),
    X =
      q === 'x'
        ? z === (J ? 'end' : 'start')
          ? 'right'
          : 'left'
        : z === 'start'
          ? 'bottom'
          : 'top'
  if (Z.reference[$] > Z.floating[$]) X = l9(X)
  return [X, l9(X)]
}
function BX(Q) {
  let Z = l9(Q)
  return [AQ(Q), Z, AQ(Z)]
}
function AQ(Q) {
  return Q.replace(/start|end/g, (Z) => nB[Z])
}
var GX = ['left', 'right'],
  YX = ['right', 'left'],
  tB = ['top', 'bottom'],
  eB = ['bottom', 'top']
function Q_(Q, Z, J) {
  switch (Q) {
    case 'top':
    case 'bottom':
      if (J) return Z ? YX : GX
      return Z ? GX : YX
    case 'left':
    case 'right':
      return Z ? tB : eB
    default:
      return []
  }
}
function _X(Q, Z, J, z) {
  let q = a5(Q),
    $ = Q_(u1(Q), J === 'start', z)
  if (q) {
    if ((($ = $.map((X) => X + '-' + q)), Z)) $ = $.concat($.map(AQ))
  }
  return $
}
function l9(Q) {
  return Q.replace(/left|right|bottom|top/g, (Z) => sB[Z])
}
function Z_(Q) {
  return { top: 0, right: 0, bottom: 0, left: 0, ...Q }
}
function wQ(Q) {
  return typeof Q !== 'number'
    ? Z_(Q)
    : { top: Q, right: Q, bottom: Q, left: Q }
}
function K6(Q) {
  let { x: Z, y: J, width: z, height: q } = Q
  return {
    width: z,
    height: q,
    top: J,
    left: Z,
    right: Z + z,
    bottom: J + q,
    x: Z,
    y: J,
  }
}
function yQ(Q, Z, J) {
  return Math.floor(Q / Z) !== J
}
function p2(Q, Z) {
  return Z < 0 || Z >= Q.current.length
}
function G6(Q, Z) {
  return w1(Q, { disabledIndices: Z })
}
function c6(Q, Z) {
  return w1(Q, {
    decrement: !0,
    startingIndex: Q.current.length,
    disabledIndices: Z,
  })
}
function w1(
  Q,
  {
    startingIndex: Z = -1,
    decrement: J = !1,
    disabledIndices: z,
    amount: q = 1,
  } = {},
) {
  let $ = Z
  do $ += J ? -q : q
  while ($ >= 0 && $ <= Q.current.length - 1 && s5(Q, $, z))
  return $
}
function n9(
  Q,
  {
    event: Z,
    orientation: J,
    loopFocus: z,
    rtl: q,
    cols: $,
    disabledIndices: X,
    minIndex: K,
    maxIndex: G,
    prevIndex: Y,
    stopEvent: W = !1,
  },
) {
  let U = Y,
    B = [],
    H = {},
    N = !1
  {
    let F = null,
      k = -1
    Q.current.forEach((V, M) => {
      if (V == null) return
      let j = V.closest('[role="row"]')
      if (j) N = !0
      if (j !== F || k === -1) ((F = j), (k += 1), (B[k] = []))
      ;(B[k].push(M), (H[M] = k))
    })
  }
  let _ = N && B.length > 0 && B.some((F) => F.length !== $)
  function L(F) {
    if (!_ || Y === -1) return
    let k = H[Y]
    if (k == null) return
    let V = B[k].indexOf(Y),
      M = F === 'up' ? k - 1 : k + 1
    if (z) {
      if (M < 0) M = B.length - 1
      else if (M >= B.length) M = 0
    }
    let j = new Set()
    while (M >= 0 && M < B.length && !j.has(M)) {
      j.add(M)
      let A = B[M]
      if (A.length === 0) {
        M = F === 'up' ? M - 1 : M + 1
        continue
      }
      let w = Math.min(V, A.length - 1)
      for (let O = w; O >= 0; O -= 1) {
        let S = A[O]
        if (!s5(Q, S, X)) return S
      }
      if (((M = F === 'up' ? M - 1 : M + 1), z)) {
        if (M < 0) M = B.length - 1
        else if (M >= B.length) M = 0
      }
    }
    return
  }
  if (Z.key === d9) {
    let F = L('up')
    if (F !== void 0) {
      if (W) A1(Z)
      U = F
    } else {
      if (W) A1(Z)
      if (Y === -1) U = G
      else if (
        ((U = w1(Q, {
          startingIndex: U,
          amount: $,
          decrement: !0,
          disabledIndices: X,
        })),
        z && (Y - $ < K || U < 0))
      ) {
        let k = Y % $,
          V = G % $,
          M = G - (V - k)
        if (V === k) U = G
        else U = V > k ? M : M - $
      }
      if (p2(Q, U)) U = Y
    }
  }
  if (Z.key === q6) {
    let F = L('down')
    if (F !== void 0) {
      if (W) A1(Z)
      U = F
    } else {
      if (W) A1(Z)
      if (Y === -1) U = K
      else if (
        ((U = w1(Q, { startingIndex: Y, amount: $, disabledIndices: X })),
        z && Y + $ > G)
      )
        U = w1(Q, { startingIndex: (Y % $) - $, amount: $, disabledIndices: X })
      if (p2(Q, U)) U = Y
    }
  }
  if (J === 'both') {
    let F = k8(Y / $)
    if (Z.key === (q ? G2 : Y2)) {
      if (W) A1(Z)
      if (Y % $ !== $ - 1) {
        if (
          ((U = w1(Q, { startingIndex: Y, disabledIndices: X })),
          z && yQ(U, $, F))
        )
          U = w1(Q, { startingIndex: Y - (Y % $) - 1, disabledIndices: X })
      } else if (z)
        U = w1(Q, { startingIndex: Y - (Y % $) - 1, disabledIndices: X })
      if (yQ(U, $, F)) U = Y
    }
    if (Z.key === (q ? Y2 : G2)) {
      if (W) A1(Z)
      if (Y % $ !== 0) {
        if (
          ((U = w1(Q, { startingIndex: Y, decrement: !0, disabledIndices: X })),
          z && yQ(U, $, F))
        )
          U = w1(Q, {
            startingIndex: Y + ($ - (Y % $)),
            decrement: !0,
            disabledIndices: X,
          })
      } else if (z)
        U = w1(Q, {
          startingIndex: Y + ($ - (Y % $)),
          decrement: !0,
          disabledIndices: X,
        })
      if (yQ(U, $, F)) U = Y
    }
    let k = k8(G / $) === F
    if (p2(Q, U))
      if (z && k)
        U =
          Z.key === (q ? Y2 : G2)
            ? G
            : w1(Q, { startingIndex: Y - (Y % $) - 1, disabledIndices: X })
      else U = Y
  }
  return U
}
function o9(Q, Z, J) {
  let z = [],
    q = 0
  return (
    Q.forEach(({ width: $, height: X }, K) => {
      if ($ > Z)
        throw Error(
          `[Floating UI]: Invalid grid - item width at index ${K} is greater than grid columns`,
        )
      let G = !1
      if (J) q = 0
      while (!G) {
        let Y = []
        for (let W = 0; W < $; W += 1)
          for (let U = 0; U < X; U += 1) Y.push(q + W + U * Z)
        if ((q % Z) + $ <= Z && Y.every((W) => z[W] == null))
          (Y.forEach((W) => {
            z[W] = K
          }),
            (G = !0))
        else q += 1
      }
    }),
    [...z]
  )
}
function t9(Q, Z, J, z, q) {
  if (Q === -1) return -1
  let $ = J.indexOf(Q),
    X = Z[Q]
  switch (q) {
    case 'tl':
      return $
    case 'tr':
      if (!X) return $
      return $ + X.width - 1
    case 'bl':
      if (!X) return $
      return $ + (X.height - 1) * z
    case 'br':
      return J.lastIndexOf(Q)
    default:
      return -1
  }
}
function e9(Q, Z) {
  return Z.flatMap((J, z) => (Q.includes(J) ? [z] : []))
}
function s5(Q, Z, J) {
  if (typeof J === 'function') return J(Z)
  if (J) return J.includes(Z)
  let z = Q.current[Z]
  if (!z) return !1
  return (
    z.hasAttribute('disabled') || z.getAttribute('aria-disabled') === 'true'
  )
}
/*!
 * tabbable 6.4.0
 * @license MIT, https://github.com/focus-trap/tabbable/blob/master/LICENSE
 */ var J_ = [
    'input:not([inert]):not([inert] *)',
    'select:not([inert]):not([inert] *)',
    'textarea:not([inert]):not([inert] *)',
    'a[href]:not([inert]):not([inert] *)',
    'button:not([inert]):not([inert] *)',
    '[tabindex]:not(slot):not([inert]):not([inert] *)',
    'audio[controls]:not([inert]):not([inert] *)',
    'video[controls]:not([inert]):not([inert] *)',
    '[contenteditable]:not([contenteditable="false"]):not([inert]):not([inert] *)',
    'details>summary:first-of-type:not([inert]):not([inert] *)',
    'details:not([inert]):not([inert] *)',
  ],
  DQ = J_.join(','),
  NX = typeof Element > 'u',
  d6 = NX
    ? function () {}
    : Element.prototype.matches ||
      Element.prototype.msMatchesSelector ||
      Element.prototype.webkitMatchesSelector,
  TQ =
    !NX && Element.prototype.getRootNode
      ? function (Q) {
          var Z
          return Q === null || Q === void 0
            ? void 0
            : (Z = Q.getRootNode) === null || Z === void 0
              ? void 0
              : Z.call(Q)
        }
      : function (Q) {
          return Q === null || Q === void 0 ? void 0 : Q.ownerDocument
        },
  PQ = function (Z, J) {
    var z
    if (J === void 0) J = !0
    var q =
        Z === null || Z === void 0
          ? void 0
          : (z = Z.getAttribute) === null || z === void 0
            ? void 0
            : z.call(Z, 'inert'),
      $ = q === '' || q === 'true',
      X =
        $ ||
        (J &&
          Z &&
          (typeof Z.closest === 'function'
            ? Z.closest('[inert]')
            : PQ(Z.parentNode)))
    return X
  },
  z_ = function (Z) {
    var J,
      z =
        Z === null || Z === void 0
          ? void 0
          : (J = Z.getAttribute) === null || J === void 0
            ? void 0
            : J.call(Z, 'contenteditable')
    return z === '' || z === 'true'
  },
  LX = function (Z, J, z) {
    if (PQ(Z)) return []
    var q = Array.prototype.slice.apply(Z.querySelectorAll(DQ))
    if (J && d6.call(Z, DQ)) q.unshift(Z)
    return ((q = q.filter(z)), q)
  },
  EQ = function (Z, J, z) {
    var q = [],
      $ = Array.from(Z)
    while ($.length) {
      var X = $.shift()
      if (PQ(X, !1)) continue
      if (X.tagName === 'SLOT') {
        var K = X.assignedElements(),
          G = K.length ? K : X.children,
          Y = EQ(G, !0, z)
        if (z.flatten) q.push.apply(q, Y)
        else q.push({ scopeParent: X, candidates: Y })
      } else {
        var W = d6.call(X, DQ)
        if (W && z.filter(X) && (J || !Z.includes(X))) q.push(X)
        var U =
            X.shadowRoot ||
            (typeof z.getShadowRoot === 'function' && z.getShadowRoot(X)),
          B = !PQ(U, !1) && (!z.shadowRootFilter || z.shadowRootFilter(X))
        if (U && B) {
          var H = EQ(U === !0 ? X.children : U.children, !0, z)
          if (z.flatten) q.push.apply(q, H)
          else q.push({ scopeParent: X, candidates: H })
        } else $.unshift.apply($, X.children)
      }
    }
    return q
  },
  FX = function (Z) {
    return !isNaN(parseInt(Z.getAttribute('tabindex'), 10))
  },
  kX = function (Z) {
    if (!Z) throw Error('No node provided')
    if (Z.tabIndex < 0) {
      if ((/^(AUDIO|VIDEO|DETAILS)$/.test(Z.tagName) || z_(Z)) && !FX(Z))
        return 0
    }
    return Z.tabIndex
  },
  q_ = function (Z, J) {
    var z = kX(Z)
    if (z < 0 && J && !FX(Z)) return 0
    return z
  },
  $_ = function (Z, J) {
    return Z.tabIndex === J.tabIndex
      ? Z.documentOrder - J.documentOrder
      : Z.tabIndex - J.tabIndex
  },
  MX = function (Z) {
    return Z.tagName === 'INPUT'
  },
  X_ = function (Z) {
    return MX(Z) && Z.type === 'hidden'
  },
  K_ = function (Z) {
    var J =
      Z.tagName === 'DETAILS' &&
      Array.prototype.slice.apply(Z.children).some(function (z) {
        return z.tagName === 'SUMMARY'
      })
    return J
  },
  G_ = function (Z, J) {
    for (var z = 0; z < Z.length; z++)
      if (Z[z].checked && Z[z].form === J) return Z[z]
  },
  Y_ = function (Z) {
    if (!Z.name) return !0
    var J = Z.form || TQ(Z),
      z = function (K) {
        return J.querySelectorAll('input[type="radio"][name="' + K + '"]')
      },
      q
    if (
      typeof window < 'u' &&
      typeof window.CSS < 'u' &&
      typeof window.CSS.escape === 'function'
    )
      q = z(window.CSS.escape(Z.name))
    else
      try {
        q = z(Z.name)
      } catch (X) {
        return (
          console.error(
            'Looks like you have a radio button with a name attribute containing invalid CSS selector characters and need the CSS.escape polyfill: %s',
            X.message,
          ),
          !1
        )
      }
    var $ = G_(q, Z.form)
    return !$ || $ === Z
  },
  W_ = function (Z) {
    return MX(Z) && Z.type === 'radio'
  },
  U_ = function (Z) {
    return W_(Z) && !Y_(Z)
  },
  B_ = function (Z) {
    var J,
      z = Z && TQ(Z),
      q = (J = z) === null || J === void 0 ? void 0 : J.host,
      $ = !1
    if (z && z !== Z) {
      var X, K, G
      $ = !!(
        ((X = q) !== null &&
          X !== void 0 &&
          (K = X.ownerDocument) !== null &&
          K !== void 0 &&
          K.contains(q)) ||
        (Z !== null &&
          Z !== void 0 &&
          (G = Z.ownerDocument) !== null &&
          G !== void 0 &&
          G.contains(Z))
      )
      while (!$ && q) {
        var Y, W, U
        ;((z = TQ(q)),
          (q = (Y = z) === null || Y === void 0 ? void 0 : Y.host),
          ($ = !!(
            (W = q) !== null &&
            W !== void 0 &&
            (U = W.ownerDocument) !== null &&
            U !== void 0 &&
            U.contains(q)
          )))
      }
    }
    return $
  },
  HX = function (Z) {
    var J = Z.getBoundingClientRect(),
      z = J.width,
      q = J.height
    return z === 0 && q === 0
  },
  __ = function (Z, J) {
    var { displayCheck: z, getShadowRoot: q } = J
    if (z === 'full-native') {
      if ('checkVisibility' in Z) {
        var $ = Z.checkVisibility({
          checkOpacity: !1,
          opacityProperty: !1,
          contentVisibilityAuto: !0,
          visibilityProperty: !0,
          checkVisibilityCSS: !0,
        })
        return !$
      }
    }
    if (getComputedStyle(Z).visibility === 'hidden') return !0
    var X = d6.call(Z, 'details>summary:first-of-type'),
      K = X ? Z.parentElement : Z
    if (d6.call(K, 'details:not([open]) *')) return !0
    if (!z || z === 'full' || z === 'full-native' || z === 'legacy-full') {
      if (typeof q === 'function') {
        var G = Z
        while (Z) {
          var Y = Z.parentElement,
            W = TQ(Z)
          if (Y && !Y.shadowRoot && q(Y) === !0) return HX(Z)
          else if (Z.assignedSlot) Z = Z.assignedSlot
          else if (!Y && W !== Z.ownerDocument) Z = W.host
          else Z = Y
        }
        Z = G
      }
      if (B_(Z)) return !Z.getClientRects().length
      if (z !== 'legacy-full') return !0
    } else if (z === 'non-zero-area') return HX(Z)
    return !1
  },
  H_ = function (Z) {
    if (/^(INPUT|BUTTON|SELECT|TEXTAREA)$/.test(Z.tagName)) {
      var J = Z.parentElement
      while (J) {
        if (J.tagName === 'FIELDSET' && J.disabled) {
          for (var z = 0; z < J.children.length; z++) {
            var q = J.children.item(z)
            if (q.tagName === 'LEGEND')
              return d6.call(J, 'fieldset[disabled] *') ? !0 : !q.contains(Z)
          }
          return !0
        }
        J = J.parentElement
      }
    }
    return !1
  },
  Qz = function (Z, J) {
    if (J.disabled || X_(J) || __(J, Z) || K_(J) || H_(J)) return !1
    return !0
  },
  Zz = function (Z, J) {
    if (U_(J) || kX(J) < 0 || !Qz(Z, J)) return !1
    return !0
  },
  N_ = function (Z) {
    var J = parseInt(Z.getAttribute('tabindex'), 10)
    if (isNaN(J) || J >= 0) return !0
    return !1
  },
  jX = function (Z) {
    var J = [],
      z = []
    return (
      Z.forEach(function (q, $) {
        var X = !!q.scopeParent,
          K = X ? q.scopeParent : q,
          G = q_(K, X),
          Y = X ? jX(q.candidates) : K
        if (G === 0) X ? J.push.apply(J, Y) : J.push(K)
        else
          z.push({
            documentOrder: $,
            tabIndex: G,
            item: q,
            isScope: X,
            content: Y,
          })
      }),
      z
        .sort($_)
        .reduce(function (q, $) {
          return ($.isScope ? q.push.apply(q, $.content) : q.push($.content), q)
        }, [])
        .concat(J)
    )
  },
  Y6 = function (Z, J) {
    J = J || {}
    var z
    if (J.getShadowRoot)
      z = EQ([Z], J.includeContainer, {
        filter: Zz.bind(null, J),
        flatten: !1,
        getShadowRoot: J.getShadowRoot,
        shadowRootFilter: N_,
      })
    else z = LX(Z, J.includeContainer, Zz.bind(null, J))
    return jX(z)
  },
  VX = function (Z, J) {
    J = J || {}
    var z
    if (J.getShadowRoot)
      z = EQ([Z], J.includeContainer, {
        filter: Qz.bind(null, J),
        flatten: !0,
        getShadowRoot: J.getShadowRoot,
      })
    else z = LX(Z, J.includeContainer, Qz.bind(null, J))
    return z
  },
  Jz = function (Z, J) {
    if (((J = J || {}), !Z)) throw Error('No node provided')
    if (d6.call(Z, DQ) === !1) return !1
    return Zz(J, Z)
  }
var W6 = () => ({
  getShadowRoot: !0,
  displayCheck:
    typeof ResizeObserver === 'function' &&
    ResizeObserver.toString().includes('[native code]')
      ? 'full'
      : 'none',
})
function AX(Q, Z) {
  let J = Y6(Q, W6()),
    z = J.length
  if (z === 0) return
  let q = B1(V0(Q)),
    $ = J.indexOf(q),
    X = $ === -1 ? (Z === 1 ? 0 : z - 1) : $ + Z
  return J[X]
}
function M8(Q) {
  return AX(V0(Q).body, 1) || Q
}
function SQ(Q) {
  return AX(V0(Q).body, -1) || Q
}
function OX(Q, Z) {
  if (!Q) return null
  let J = Y6(V0(Q).body, W6()),
    z = J.length
  if (z === 0) return null
  let q = J.indexOf(Q)
  if (q === -1) return null
  let $ = (q + Z + z) % z
  return J[$]
}
function IQ(Q) {
  return OX(Q, 1)
}
function CQ(Q) {
  return OX(Q, -1)
}
function n5(Q, Z) {
  let J = Z || Q.currentTarget,
    z = Q.relatedTarget
  return !z || !F0(J, z)
}
function wX(Q) {
  Y6(Q, W6()).forEach((J) => {
    ;((J.dataset.tabindex = J.getAttribute('tabindex') || ''),
      J.setAttribute('tabindex', '-1'))
  })
}
function zz(Q) {
  Q.querySelectorAll('[data-tabindex]').forEach((J) => {
    let z = J.dataset.tabindex
    if ((delete J.dataset.tabindex, z)) J.setAttribute('tabindex', z)
    else J.removeAttribute('tabindex')
  })
}
var qz = i6.forwardRef(function (Z, J) {
  let { render: z, className: q, id: $, nativeLabel: X = !0, ...K } = Z,
    G = r0(!1),
    { controlId: Y, setLabelId: W, labelId: U } = X1(),
    B = L0($),
    H = i6.useRef(null),
    N = m((L) => {
      if (K1(L.nativeEvent)?.closest('button,input,select,textarea')) return
      if (!L.defaultPrevented && L.detail > 1) L.preventDefault()
      if (X || !Y) return
      let k = V0(L.currentTarget).getElementById(Y)
      if (m0(k)) k.focus({ focusVisible: !0 })
    })
  return (
    i6.useEffect(() => {
      if (!H.current) return
      let L = H.current.tagName === 'LABEL'
      if (X) {
        if (!L) {
          let F = U8.captureOwnerStack?.() || ''
          W8(
            `${'<Field.Label> expected a <label> element because the `nativeLabel` prop is true. Rendering a non-<label> disables native label association, so `htmlFor` will not work. Use a real <label> in the `render` prop, or set `nativeLabel` to `false`.'}${F}`,
          )
        }
      } else if (L) {
        let F = U8.captureOwnerStack?.() || ''
        W8(
          `${'<Field.Label> expected a non-<label> element because the `nativeLabel` prop is false. Rendering a <label> assumes native label behavior while Base UI treats it as non-native, which can cause unexpected pointer behavior. Use a non-<label> in the `render` prop, or set `nativeLabel` to `true`.'}${F}`,
        )
      }
    }, [X]),
    u(() => {
      if (B) W(B)
      return () => {
        W(void 0)
      }
    }, [B, W]),
    f('label', Z, {
      ref: [J, H],
      state: G.state,
      props: [
        { id: U },
        X
          ? { htmlFor: Y ?? void 0, onMouseDown: N }
          : {
              onClick: N,
              onPointerDown(L) {
                L.preventDefault()
              },
            },
        K,
      ],
      stateAttributesMapping: $1,
    })
  )
})
qz.displayName = 'FieldLabel'
import * as B6 from 'react'
import * as PX from 'react'
import * as TX from 'react-dom'
var xQ = null,
  yX = globalThis.requestAnimationFrame
class DX {
  callbacks = []
  callbacksCount = 0
  nextId = 1
  startId = 1
  isScheduled = !1
  tick = (Q) => {
    this.isScheduled = !1
    let Z = this.callbacks,
      J = this.callbacksCount
    if (
      ((this.callbacks = []),
      (this.callbacksCount = 0),
      (this.startId = this.nextId),
      J > 0)
    )
      for (let z = 0; z < Z.length; z += 1) Z[z]?.(Q)
  }
  request(Q) {
    let Z = this.nextId
    ;((this.nextId += 1), this.callbacks.push(Q), (this.callbacksCount += 1))
    let J = yX !== requestAnimationFrame && ((yX = requestAnimationFrame), !0)
    if (!this.isScheduled || J)
      (requestAnimationFrame(this.tick), (this.isScheduled = !0))
    return Z
  }
  cancel(Q) {
    let Z = Q - this.startId
    if (Z < 0 || Z >= this.callbacks.length) return
    ;((this.callbacks[Z] = null), (this.callbacksCount -= 1))
  }
}
var hQ = new DX()
class S5 {
  static create() {
    return new S5()
  }
  static request(Q) {
    return hQ.request(Q)
  }
  static cancel(Q) {
    return hQ.cancel(Q)
  }
  currentId = xQ
  request(Q) {
    ;(this.cancel(),
      (this.currentId = hQ.request(() => {
        ;((this.currentId = xQ), Q())
      })))
  }
  cancel = () => {
    if (this.currentId !== xQ)
      (hQ.cancel(this.currentId), (this.currentId = xQ))
  }
  disposeEffect = () => {
    return this.cancel
  }
}
function K5() {
  let Q = R0(S5.create).current
  return ($5(Q.disposeEffect), Q)
}
function o5(Q) {
  if (Q == null) return Q
  return 'current' in Q ? Q.current : Q
}
var U6 = (function (Q) {
    return (
      (Q.startingStyle = 'data-starting-style'),
      (Q.endingStyle = 'data-ending-style'),
      Q
    )
  })({}),
  L_ = { [U6.startingStyle]: '' },
  F_ = { [U6.endingStyle]: '' },
  i0 = {
    transitionStatus(Q) {
      if (Q === 'starting') return L_
      if (Q === 'ending') return F_
      return null
    },
  }
function j8(Q, Z = !1, J = !0) {
  let z = K5()
  return m((q, $ = null) => {
    z.cancel()
    function X() {
      TX.flushSync(q)
    }
    let K = o5(Q)
    if (K == null) return
    let G = K
    if (
      typeof G.getAnimations !== 'function' ||
      globalThis.BASE_UI_ANIMATIONS_DISABLED
    )
      q()
    else {
      let Y = function () {
          let U = U6.startingStyle
          if (!G.hasAttribute(U)) {
            z.request(W)
            return
          }
          let B = new MutationObserver(() => {
            if (!G.hasAttribute(U)) (B.disconnect(), W())
          })
          ;(B.observe(G, { attributes: !0, attributeFilter: [U] }),
            $?.addEventListener('abort', () => B.disconnect(), { once: !0 }))
        },
        W = function () {
          Promise.all(G.getAnimations().map((U) => U.finished))
            .then(() => {
              if ($?.aborted) return
              X()
            })
            .catch(() => {
              let U = G.getAnimations()
              if (J) {
                if ($?.aborted) return
                X()
              } else if (
                U.length > 0 &&
                U.some((B) => B.pending || B.playState !== 'finished')
              )
                W()
            })
        }
      if (Z) {
        Y()
        return
      }
      z.request(W)
    }
  })
}
function a0(Q) {
  let { enabled: Z = !0, open: J, ref: z, onComplete: q } = Q,
    $ = m(q),
    X = j8(z, J, !1)
  PX.useEffect(() => {
    if (!Z) return
    let K = new AbortController()
    return (
      X($, K.signal),
      () => {
        K.abort()
      }
    )
  }, [Z, J, $, X])
}
import * as Q7 from 'react'
function F1(Q, Z = !1, J = !1) {
  let [z, q] = Q7.useState(Q && Z ? 'idle' : void 0),
    [$, X] = Q7.useState(Q)
  if (Q && !$) (X(!0), q('starting'))
  if (!Q && $ && z !== 'ending' && !J) q('ending')
  if (!Q && !$ && z === 'ending') q(void 0)
  return (
    u(() => {
      if (!Q && $ && z !== 'ending' && J) {
        let K = S5.request(() => {
          q('ending')
        })
        return () => {
          S5.cancel(K)
        }
      }
      return
    }, [Q, $, z, J]),
    u(() => {
      if (!Q || Z) return
      let K = S5.request(() => {
        q(void 0)
      })
      return () => {
        S5.cancel(K)
      }
    }, [Z, Q]),
    u(() => {
      if (!Q || !Z) return
      if (Q && $ && z !== 'idle') q('starting')
      let K = S5.request(() => {
        q('idle')
      })
      return () => {
        S5.cancel(K)
      }
    }, [Z, Q, $, q, z]),
    Q7.useMemo(
      () => ({ mounted: $, setMounted: X, transitionStatus: z }),
      [$, z],
    )
  )
}
import { jsx as EX } from 'react/jsx-runtime'
var k_ = { ...$1, ...i0 },
  $z = B6.forwardRef(function (Z, J) {
    let { render: z, id: q, className: $, match: X, ...K } = Z,
      G = L0(q),
      { validityData: Y, state: W, name: U } = r0(!1),
      { setMessageIds: B } = X1(),
      { errors: H } = v1(),
      N = U ? H[U] : null,
      _ = !1
    if (N || X === !0) _ = !0
    else if (X) _ = Boolean(Y.state[X])
    else _ = Y.state.valid === !1
    let { mounted: L, transitionStatus: F, setMounted: k } = F1(_)
    u(() => {
      if (!_ || !G) return
      return (
        B((I) => I.concat(G)),
        () => {
          B((I) => I.filter((y) => y !== G))
        }
      )
    }, [_, G, B])
    let V = B6.useRef(null),
      [M, j] = B6.useState(null),
      [A, w] = B6.useState(null),
      O =
        N ||
        (Y.errors.length > 1
          ? EX('ul', {
              children: Y.errors.map((I) => EX('li', { children: I }, I)),
            })
          : Y.error),
      S = Y.error
    if (N != null) S = Array.isArray(N) ? JSON.stringify(N) : N
    else if (Y.errors.length > 1) S = JSON.stringify(Y.errors)
    if (_ && S !== A) (w(S), j(O))
    a0({
      open: _,
      ref: V,
      onComplete() {
        if (!_) k(!1)
      },
    })
    let x = { ...W, transitionStatus: F },
      h = f('div', Z, {
        ref: [J, V],
        state: x,
        props: [{ id: G, children: _ ? O : M }, K],
        stateAttributesMapping: k_,
        enabled: L,
      })
    if (!L) return null
    return h
  })
$z.displayName = 'FieldError'
import * as SX from 'react'
var Xz = SX.forwardRef(function (Z, J) {
  let { render: z, id: q, className: $, ...X } = Z,
    K = L0(q),
    G = r0(!1),
    { setMessageIds: Y } = X1()
  return (
    u(() => {
      if (!K) return
      return (
        Y((U) => U.concat(K)),
        () => {
          Y((U) => U.filter((B) => B !== K))
        }
      )
    }, [K, Y]),
    f('p', Z, {
      ref: J,
      state: G.state,
      props: [{ id: K }, X],
      stateAttributesMapping: $1,
    })
  )
})
Xz.displayName = 'FieldDescription'
import * as RQ from 'react'
import * as U2 from 'react'
function _1({ controlled: Q, default: Z, name: J, state: z = 'value' }) {
  let { current: q } = U2.useRef(Q !== void 0),
    [$, X] = U2.useState(Z),
    K = q ? Q : $
  {
    U2.useEffect(() => {
      if (q !== (Q !== void 0))
        console.error(
          [
            `Base UI: A component is changing the ${q ? '' : 'un'}controlled ${z} state of ${J} to be ${q ? 'un' : ''}controlled.`,
            'Elements should not switch from uncontrolled to controlled (or vice versa).',
            `Decide between using a controlled or uncontrolled ${J} element for the lifetime of the component.`,
            "The nature of the state is determined during the first render. It's considered controlled if the value is not `undefined`.",
            'More info: https://fb.me/react-controlled-components',
          ].join(`
`),
        )
    }, [z, J, Q])
    let { current: Y } = U2.useRef(Z)
    U2.useEffect(() => {
      if (!q && JSON.stringify(Y) !== JSON.stringify(Z))
        console.error(
          [
            `Base UI: A component is changing the default ${z} state of an uncontrolled ${J} after being initialized. To suppress this warning opt to use a controlled ${J}.`,
          ].join(`
`),
        )
    }, [JSON.stringify(Z)])
  }
  let G = U2.useCallback((Y) => {
    if (!q) X(Y)
  }, [])
  return [K, G]
}
import * as Z7 from 'react'
function I5(Q = {}) {
  let { id: Z, implicit: J = !1, controlRef: z } = Q,
    { controlId: q, registerControlId: $ } = X1(),
    X = L0(Z),
    K = J ? q : void 0,
    G = R0(() => Symbol('labelable-control')),
    Y = Z7.useRef(!1),
    W = Z7.useRef(Z != null),
    U = m(() => {
      if (!Y.current || $ === l0) return
      ;((Y.current = !1), $(G.current, void 0))
    })
  return (
    u(() => {
      if ($ === l0) return
      let B
      if (J) {
        let H = z?.current
        if (C0(H) && H.closest('label') != null) B = Z ?? null
        else B = K ?? X
      } else if (Z != null) ((W.current = !0), (B = Z))
      else if (W.current) B = X
      else {
        U()
        return
      }
      if (B === void 0) {
        U()
        return
      }
      ;((Y.current = !0), $(G.current, B))
      return
    }, [Z, z, K, $, J, X, G, U]),
    Z7.useEffect(() => {
      return U
    }, [U]),
    q ?? X
  )
}
import * as IX from 'react-dom'
function C5(Q) {
  let {
      enabled: Z = !0,
      value: J,
      id: z,
      name: q,
      controlRef: $,
      commit: X,
    } = Q,
    { formRef: K } = v1(),
    {
      invalid: G,
      markedDirtyRef: Y,
      validityData: W,
      setValidityData: U,
    } = r0(),
    B = m(Q.getValue)
  ;(u(() => {
    if (!Z) return
    let H = J
    if (H === void 0) H = B()
    if (W.initialValue === null && H !== null)
      U((N) => ({ ...N, initialValue: H }))
  }, [Z, U, J, W.initialValue, B]),
    u(() => {
      if (!Z || !z) return
      K.current.fields.set(z, {
        getValue: B,
        name: q,
        controlRef: $,
        validityData: J6(W, G),
        validate(H = !0) {
          let N = J
          if (N === void 0) N = B()
          if (((Y.current = !0), !H)) X(N)
          else IX.flushSync(() => X(N))
        },
      })
    }, [X, $, Z, K, B, z, G, Y, q, W, J]),
    u(() => {
      let H = K.current.fields
      return () => {
        if (z) H.delete(z)
      }
    }, [K, z]))
}
var c = {}
c1(c, {
  windowResize: () => o_,
  wheel: () => d_,
  triggerPress: () => j_,
  triggerHover: () => V_,
  triggerFocus: () => A_,
  trackPress: () => E_,
  swipe: () => n_,
  siblingOpen: () => r_,
  scrub: () => i_,
  pointer: () => u_,
  outsidePress: () => O_,
  none: () => M_,
  listNavigation: () => m_,
  linkPress: () => D_,
  keyboard: () => p_,
  itemPress: () => w_,
  inputPress: () => R_,
  inputPaste: () => b_,
  inputClear: () => x_,
  inputChange: () => C_,
  inputBlur: () => h_,
  incrementPress: () => S_,
  imperativeAction: () => s_,
  focusOut: () => v_,
  escapeKey: () => f_,
  drag: () => c_,
  disabled: () => a_,
  decrementPress: () => I_,
  closeWatcher: () => g_,
  closePress: () => y_,
  clearPress: () => T_,
  chipRemovePress: () => P_,
  cancelOpen: () => l_,
})
var M_ = 'none',
  j_ = 'trigger-press',
  V_ = 'trigger-hover',
  A_ = 'trigger-focus',
  O_ = 'outside-press',
  w_ = 'item-press',
  y_ = 'close-press',
  D_ = 'link-press',
  T_ = 'clear-press',
  P_ = 'chip-remove-press',
  E_ = 'track-press',
  S_ = 'increment-press',
  I_ = 'decrement-press',
  C_ = 'input-change',
  x_ = 'input-clear',
  h_ = 'input-blur',
  b_ = 'input-paste',
  R_ = 'input-press',
  v_ = 'focus-out',
  f_ = 'escape-key',
  g_ = 'close-watcher',
  m_ = 'list-navigation',
  p_ = 'keyboard',
  u_ = 'pointer',
  c_ = 'drag',
  d_ = 'wheel',
  i_ = 'scrub',
  l_ = 'cancel-open',
  r_ = 'sibling-open',
  a_ = 'disabled',
  s_ = 'imperative-action',
  n_ = 'swipe',
  o_ = 'window-resize'
function $0(Q, Z, J, z) {
  let q = !1,
    $ = !1,
    X = z ?? S0
  return {
    reason: Q,
    event: Z ?? new Event('base-ui'),
    cancel() {
      q = !0
    },
    allowPropagation() {
      $ = !0
    },
    get isCanceled() {
      return q
    },
    get isPropagationAllowed() {
      return $
    },
    trigger: J,
    ...X,
  }
}
function bQ(Q, Z, J) {
  let z = J ?? S0
  return { reason: Q, event: Z ?? new Event('base-ui'), ...z }
}
var Kz = RQ.forwardRef(function (Z, J) {
  let {
      render: z,
      className: q,
      id: $,
      name: X,
      value: K,
      disabled: G = !1,
      onValueChange: Y,
      defaultValue: W,
      autoFocus: U = !1,
      ...B
    } = Z,
    {
      state: H,
      name: N,
      disabled: _,
      setTouched: L,
      setDirty: F,
      validityData: k,
      setFocused: V,
      setFilled: M,
      validationMode: j,
      validation: A,
    } = r0(),
    w = _ || G,
    O = N ?? X,
    S = { ...H, disabled: w },
    { labelId: x } = X1(),
    h = I5({ id: $ })
  u(() => {
    let P = K != null
    if (A.inputRef.current?.value || (P && K !== '')) M(!0)
    else if (P && K === '') M(!1)
  }, [A.inputRef, M, K])
  let I = RQ.useRef(null)
  u(() => {
    if (U && I.current === B1(V0(I.current))) V(!0)
  }, [U, V])
  let [y] = _1({
      controlled: K,
      default: W,
      name: 'FieldControl',
      state: 'value',
    }),
    T = K !== void 0,
    R = T ? y : void 0
  return (
    C5({
      id: h,
      name: O,
      commit: A.commit,
      value: R,
      getValue: () => A.inputRef.current?.value,
      controlRef: A.inputRef,
    }),
    f('input', Z, {
      ref: [J, I],
      state: S,
      props: [
        {
          id: h,
          disabled: w,
          name: O,
          ref: A.inputRef,
          'aria-labelledby': x,
          autoFocus: U,
          ...(T ? { value: R } : { defaultValue: W }),
          onChange(P) {
            let D = P.currentTarget.value
            ;(Y?.(D, $0(c.none, P.nativeEvent)),
              F(D !== k.initialValue),
              M(D !== ''))
          },
          onFocus() {
            V(!0)
          },
          onBlur(P) {
            if ((L(!0), V(!1), j === 'onBlur')) A.commit(P.currentTarget.value)
          },
          onKeyDown(P) {
            if (P.currentTarget.tagName === 'INPUT' && P.key === 'Enter')
              (L(!0), A.commit(P.currentTarget.value))
          },
        },
        A.getInputValidationProps(),
        B,
      ],
      stateAttributesMapping: $1,
    })
  )
})
Kz.displayName = 'FieldControl'
import * as J7 from 'react'
import { jsx as t_ } from 'react/jsx-runtime'
var Gz = function (Z) {
  let { children: J } = Z,
    { validityData: z, invalid: q } = r0(!1),
    $ = J7.useMemo(() => J6(z, q), [z, q]),
    X = $.state.valid === !1,
    { transitionStatus: K } = F1(X),
    G = J7.useMemo(() => {
      return { ...$, validity: $.state, transitionStatus: K }
    }, [$, K])
  return t_(J7.Fragment, { children: J(G) })
}
Gz.displayName = 'FieldValidity'
import * as uQ from 'react'
import * as vQ from 'react'
var fQ = vQ.createContext({ disabled: !1 })
fQ.displayName = 'FieldItemContext'
function gQ() {
  return vQ.useContext(fQ)
}
import * as mQ from 'react'
var CX = mQ.createContext(void 0)
CX.displayName = 'CheckboxGroupContext'
function pQ(Q = !0) {
  let Z = mQ.useContext(CX)
  if (Z === void 0 && !Q)
    throw Error(
      'Base UI: CheckboxGroupContext is missing. CheckboxGroup parts must be placed within <CheckboxGroup>.',
    )
  return Z
}
import { jsx as xX } from 'react/jsx-runtime'
var Yz = uQ.forwardRef(function (Z, J) {
  let { render: z, className: q, disabled: $ = !1, ...X } = Z,
    { state: K, disabled: G } = r0(!1),
    Y = G || $,
    W = pQ(),
    U = W?.parent.id,
    H = W?.allValues !== void 0 ? U : void 0,
    N = uQ.useMemo(() => ({ disabled: Y }), [Y]),
    _ = f('div', Z, { ref: J, state: K, props: X, stateAttributesMapping: $1 })
  return xX(p9, {
    initialControlId: H,
    children: xX(fQ.Provider, { value: N, children: _ }),
  })
})
Yz.displayName = 'FieldItem'
import { jsx as e_ } from 'react/jsx-runtime'
var dQ = hX.forwardRef(function (Z, J) {
  return e_(cQ.Control, { ref: J, ...Z })
})
dQ.displayName = 'Input'
import { jsxDEV as QH } from 'react/jsx-dev-runtime'
function tA({ className: Q, type: Z, ...J }) {
  return QH(
    dQ,
    {
      type: Z,
      'data-slot': 'input',
      className: z0(
        'dark:bg-input/30 border-input focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:aria-invalid:border-destructive/50 disabled:bg-input/50 dark:disabled:bg-input/80 h-8 rounded-lg border bg-transparent px-2.5 py-1 text-base transition-colors file:h-6 file:text-sm file:font-medium focus-visible:ring-3 aria-invalid:ring-3 md:text-sm file:text-foreground placeholder:text-muted-foreground w-full min-w-0 outline-none file:inline-flex file:border-0 file:bg-transparent disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
        Q,
      ),
      ...J,
    },
    void 0,
    !1,
    void 0,
    this,
  )
}
import { jsxDEV as ZH } from 'react/jsx-dev-runtime'
function JO({ className: Q, ...Z }) {
  return ZH(
    'textarea',
    {
      'data-slot': 'textarea',
      className: z0(
        'border-input dark:bg-input/30 focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:aria-invalid:border-destructive/50 disabled:bg-input/50 dark:disabled:bg-input/80 rounded-lg border bg-transparent px-2.5 py-2 text-base transition-colors focus-visible:ring-3 aria-invalid:ring-3 md:text-sm placeholder:text-muted-foreground flex field-sizing-content min-h-16 w-full outline-none disabled:cursor-not-allowed disabled:opacity-50',
        Q,
      ),
      ...Z,
    },
    void 0,
    !1,
    void 0,
    this,
  )
}
import { jsxDEV as JH } from 'react/jsx-dev-runtime'
function XO({ className: Q, ...Z }) {
  return JH(
    'label',
    {
      'data-slot': 'label',
      className: z0(
        'gap-2 text-sm leading-none font-medium group-data-[disabled=true]:opacity-50 peer-disabled:opacity-50 flex items-center select-none group-data-[disabled=true]:pointer-events-none peer-disabled:cursor-not-allowed',
        Q,
      ),
      ...Z,
    },
    void 0,
    !1,
    void 0,
    this,
  )
}
var z7 = {}
c1(z7, { Thumb: () => Bz, Root: () => Uz })
import * as A8 from 'react'
var bX = {
    clipPath: 'inset(50%)',
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    border: 0,
    padding: 0,
    width: 1,
    height: 1,
    margin: -1,
  },
  s1 = { ...bX, position: 'fixed', top: 0, left: 0 },
  V8 = { ...bX, position: 'absolute' }
import * as iQ from 'react'
var lQ = iQ.createContext(void 0)
lQ.displayName = 'SwitchRootContext'
function RX() {
  let Q = iQ.useContext(lQ)
  if (Q === void 0)
    throw Error(
      'Base UI: SwitchRootContext is missing. Switch parts must be placed within <Switch.Root>.',
    )
  return Q
}
var Wz = (function (Q) {
  return (
    (Q.checked = 'data-checked'),
    (Q.unchecked = 'data-unchecked'),
    (Q.disabled = 'data-disabled'),
    (Q.readonly = 'data-readonly'),
    (Q.required = 'data-required'),
    (Q.valid = 'data-valid'),
    (Q.invalid = 'data-invalid'),
    (Q.touched = 'data-touched'),
    (Q.dirty = 'data-dirty'),
    (Q.filled = 'data-filled'),
    (Q.focused = 'data-focused'),
    Q
  )
})({})
var rQ = {
  ...$1,
  checked(Q) {
    if (Q) return { [Wz.checked]: '' }
    return { [Wz.unchecked]: '' }
  },
}
import * as vX from 'react'
function B2(Q, Z) {
  let J = vX.useRef(Q),
    z = m(Z)
  ;(u(() => {
    if (J.current === Q) return
    z(J.current)
  }, [Q, z]),
    u(() => {
      J.current = Q
    }, [Q]))
}
import { jsx as fX, jsxs as zH } from 'react/jsx-runtime'
var Uz = A8.forwardRef(function (Z, J) {
  let {
      checked: z,
      className: q,
      defaultChecked: $,
      id: X,
      inputRef: K,
      name: G,
      nativeButton: Y = !1,
      onCheckedChange: W,
      readOnly: U = !1,
      required: B = !1,
      disabled: H = !1,
      render: N,
      uncheckedValue: _,
      value: L,
      ...F
    } = Z,
    { clearErrors: k } = v1(),
    {
      state: V,
      setTouched: M,
      setDirty: j,
      validityData: A,
      setFilled: w,
      setFocused: O,
      shouldValidateOnChange: S,
      validationMode: x,
      disabled: h,
      name: I,
      validation: y,
    } = r0(),
    { labelId: T } = X1(),
    R = h || H,
    v = I ?? G,
    P = m(W),
    D = A8.useRef(null),
    E = Y1(D, K, y.inputRef),
    C = A8.useRef(null),
    a = L0(),
    p = I5({ id: X, implicit: !1, controlRef: C }),
    Q0 = Y ? void 0 : p,
    [g, Z0] = _1({
      controlled: z,
      default: Boolean($),
      name: 'Switch',
      state: 'checked',
    })
  ;(C5({
    id: a,
    commit: y.commit,
    value: g,
    controlRef: C,
    name: v,
    getValue: () => g,
  }),
    u(() => {
      if (D.current) w(D.current.checked)
    }, [D, w]),
    B2(g, () => {
      if ((k(v), j(g !== A.initialValue), w(g), S())) y.commit(g)
      else y.commit(g, !0)
    }))
  let { getButtonProps: i, buttonRef: X0 } = Q1({ disabled: R, native: Y }),
    Y0 = {
      id: Y ? p : a,
      role: 'switch',
      'aria-checked': g,
      'aria-readonly': U || void 0,
      'aria-required': B || void 0,
      'aria-labelledby': T,
      onFocus() {
        if (!R) O(!0)
      },
      onBlur() {
        let b = D.current
        if (!b || R) return
        if ((M(!0), O(!1), x === 'onBlur')) y.commit(b.checked)
      },
      onClick(b) {
        if (U || R) return
        ;(b.preventDefault(),
          D.current?.dispatchEvent(
            new PointerEvent('click', {
              bubbles: !0,
              shiftKey: b.shiftKey,
              ctrlKey: b.ctrlKey,
              altKey: b.altKey,
              metaKey: b.metaKey,
            }),
          ))
      },
    },
    J0 = A8.useMemo(
      () =>
        q1(
          {
            checked: g,
            disabled: R,
            id: Q0,
            name: v,
            required: B,
            style: v ? V8 : s1,
            tabIndex: -1,
            type: 'checkbox',
            'aria-hidden': !0,
            ref: E,
            onChange(b) {
              if (b.nativeEvent.defaultPrevented) return
              let r = b.target.checked,
                t = $0(c.none, b.nativeEvent)
              if ((P?.(r, t), t.isCanceled)) return
              Z0(r)
            },
            onFocus() {
              C.current?.focus()
            },
          },
          y.getInputValidationProps,
          L !== void 0 ? { value: L } : S0,
        ),
      [g, R, E, Q0, v, P, B, Z0, y, L],
    ),
    U0 = A8.useMemo(
      () => ({ ...V, checked: g, disabled: R, readOnly: U, required: B }),
      [V, g, R, U, B],
    ),
    K0 = f('span', Z, {
      state: U0,
      ref: [J, C, X0],
      props: [Y0, y.getValidationProps, F, i],
      stateAttributesMapping: rQ,
    })
  return zH(lQ.Provider, {
    value: U0,
    children: [
      K0,
      !g &&
        v &&
        _ !== void 0 &&
        fX('input', { type: 'hidden', name: v, value: _ }),
      fX('input', { ...J0 }),
    ],
  })
})
Uz.displayName = 'SwitchRoot'
import * as gX from 'react'
var Bz = gX.forwardRef(function (Z, J) {
  let { render: z, className: q, ...$ } = Z,
    { state: X } = r0(),
    K = RX(),
    G = { ...X, ...K }
  return f('span', Z, {
    state: G,
    ref: J,
    stateAttributesMapping: rQ,
    props: $,
  })
})
Bz.displayName = 'SwitchThumb'
import { jsxDEV as mX } from 'react/jsx-dev-runtime'
function tO({ className: Q, size: Z = 'default', ...J }) {
  return mX(
    z7.Root,
    {
      'data-slot': 'switch',
      'data-size': Z,
      className: z0(
        'data-checked:bg-primary data-unchecked:bg-input focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:aria-invalid:border-destructive/50 dark:data-unchecked:bg-input/80 shrink-0 rounded-full border border-transparent focus-visible:ring-3 aria-invalid:ring-3 data-[size=default]:h-[18.4px] data-[size=default]:w-[32px] data-[size=sm]:h-[14px] data-[size=sm]:w-[24px] peer group/switch relative inline-flex items-center transition-all outline-none after:absolute after:-inset-x-3 after:-inset-y-2 data-disabled:cursor-not-allowed data-disabled:opacity-50',
        Q,
      ),
      ...J,
      children: mX(
        z7.Thumb,
        {
          'data-slot': 'switch-thumb',
          className:
            'bg-background dark:data-unchecked:bg-foreground dark:data-checked:bg-primary-foreground rounded-full group-data-[size=default]/switch:size-4 group-data-[size=sm]/switch:size-3 group-data-[size=default]/switch:data-checked:translate-x-[calc(100%-2px)] group-data-[size=sm]/switch:data-checked:translate-x-[calc(100%-2px)] group-data-[size=default]/switch:data-unchecked:translate-x-0 group-data-[size=sm]/switch:data-unchecked:translate-x-0 pointer-events-none block ring-0 transition-transform',
        },
        void 0,
        !1,
        void 0,
        this,
      ),
    },
    void 0,
    !1,
    void 0,
    this,
  )
}
var q7 = {}
c1(q7, { Root: () => Hz, Indicator: () => Nz })
import * as t5 from 'react'
import * as pX from 'react'
var _z = (function (Q) {
  return (
    (Q.checked = 'data-checked'),
    (Q.unchecked = 'data-unchecked'),
    (Q.indeterminate = 'data-indeterminate'),
    (Q.disabled = 'data-disabled'),
    (Q.readonly = 'data-readonly'),
    (Q.required = 'data-required'),
    (Q.valid = 'data-valid'),
    (Q.invalid = 'data-invalid'),
    (Q.touched = 'data-touched'),
    (Q.dirty = 'data-dirty'),
    (Q.filled = 'data-filled'),
    (Q.focused = 'data-focused'),
    Q
  )
})({})
function aQ(Q) {
  return pX.useMemo(
    () => ({
      checked(Z) {
        if (Q.indeterminate) return {}
        if (Z) return { [_z.checked]: '' }
        return { [_z.unchecked]: '' }
      },
      ...$1,
    }),
    [Q.indeterminate],
  )
}
import * as sQ from 'react'
var nQ = sQ.createContext(void 0)
nQ.displayName = 'CheckboxRootContext'
function uX() {
  let Q = sQ.useContext(nQ)
  if (Q === void 0)
    throw Error(
      'Base UI: CheckboxRootContext is missing. Checkbox parts must be placed within <Checkbox.Root>.',
    )
  return Q
}
import { jsx as cX, jsxs as qH } from 'react/jsx-runtime'
var $H = 'data-parent',
  Hz = t5.forwardRef(function (Z, J) {
    let {
        checked: z,
        className: q,
        defaultChecked: $ = !1,
        disabled: X = !1,
        id: K,
        indeterminate: G = !1,
        inputRef: Y,
        name: W,
        onCheckedChange: U,
        parent: B = !1,
        readOnly: H = !1,
        render: N,
        required: _ = !1,
        uncheckedValue: L,
        value: F,
        nativeButton: k = !1,
        ...V
      } = Z,
      { clearErrors: M } = v1(),
      {
        disabled: j,
        name: A,
        setDirty: w,
        setFilled: O,
        setFocused: S,
        setTouched: x,
        state: h,
        validationMode: I,
        validityData: y,
        shouldValidateOnChange: T,
        validation: R,
      } = r0(),
      v = gQ(),
      {
        labelId: P,
        controlId: D,
        registerControlId: E,
        getDescriptionProps: C,
      } = X1(),
      a = pQ(),
      p = a?.parent,
      Q0 = p && a.allValues,
      g = j || v.disabled || a?.disabled || X,
      Z0 = A ?? W,
      i = F ?? Z0,
      X0 = L0(),
      Y0 = L0(),
      J0 = D
    if (Q0) J0 = B ? Y0 : `${p.id}-${i}`
    else if (K) J0 = K
    let U0 = {}
    if (Q0) {
      if (B) U0 = a.parent.getParentProps()
      else if (i) U0 = a.parent.getChildProps(i)
    }
    let K0 = m(U),
      { checked: b = z, indeterminate: r = G, onCheckedChange: t, ...e } = U0,
      s = a?.value,
      d = a?.setValue,
      o = a?.defaultValue,
      l = t5.useRef(null),
      q0 = R0(() => Symbol('checkbox-control')),
      n = t5.useRef(!1),
      { getButtonProps: _0, buttonRef: H0 } = Q1({ disabled: g, native: k }),
      W0 = a?.validation ?? R,
      [O0, f0] = _1({
        controlled: i && s && !B ? s.includes(i) : b,
        default: i && o && !B ? o.includes(i) : $,
        name: 'Checkbox',
        state: 'checked',
      })
    ;(u(() => {
      if (E === l0) return
      ;((n.current = !0), E(q0.current, J0))
      return
    }, [J0, a, E, B, q0]),
      t5.useEffect(() => {
        let B0 = q0.current
        return () => {
          if (!n.current || E === l0) return
          ;((n.current = !1), E(B0, void 0))
        }
      }, [E, q0]),
      C5({
        enabled: !a,
        id: X0,
        commit: W0.commit,
        value: O0,
        controlRef: l,
        name: Z0,
        getValue: () => O0,
      }))
    let A0 = t5.useRef(null),
      T0 = Y1(Y, A0, W0.inputRef)
    ;(u(() => {
      if (A0.current) {
        if (((A0.current.indeterminate = r), O0)) O(!0)
      }
    }, [O0, r, O]),
      B2(O0, () => {
        if (a && !B) return
        if ((M(Z0), O(O0), w(O0 !== y.initialValue), T())) W0.commit(O0)
        else W0.commit(O0, !0)
      }))
    let y0 = q1(
        {
          checked: O0,
          disabled: g,
          name: B ? void 0 : Z0,
          id: k ? void 0 : (J0 ?? void 0),
          required: _,
          ref: T0,
          style: Z0 ? V8 : s1,
          tabIndex: -1,
          type: 'checkbox',
          'aria-hidden': !0,
          onChange(B0) {
            if (B0.nativeEvent.defaultPrevented) return
            let E0 = B0.target.checked,
              w0 = $0(c.none, B0.nativeEvent)
            if ((t?.(E0, w0), K0(E0, w0), w0.isCanceled)) return
            if ((f0(E0), i && s && d && !B)) {
              let g0 = E0 ? [...s, i] : s.filter((e0) => e0 !== i)
              d(g0, w0)
            }
          },
          onFocus() {
            l.current?.focus()
          },
        },
        F !== void 0 ? { value: (a ? O0 && F : F) || '' } : S0,
        C,
        a ? W0.getValidationProps : W0.getInputValidationProps,
      ),
      P0 = Q0 ? Boolean(b) : O0,
      b0 = Q0 ? r || G : G
    t5.useEffect(() => {
      if (!p || !i) return
      let B0 = p.disabledStatesRef.current
      return (
        B0.set(i, g),
        () => {
          B0.delete(i)
        }
      )
    }, [p, g, i])
    let t0 = t5.useMemo(
        () => ({
          ...h,
          checked: P0,
          disabled: g,
          readOnly: H,
          required: _,
          indeterminate: b0,
        }),
        [h, P0, g, H, _, b0],
      ),
      L1 = aQ(t0),
      D0 = f('span', Z, {
        state: t0,
        ref: [H0, l, J, a?.registerControlRef],
        props: [
          {
            id: k ? (J0 ?? void 0) : X0,
            role: 'checkbox',
            'aria-checked': r ? 'mixed' : O0,
            'aria-readonly': H || void 0,
            'aria-required': _ || void 0,
            'aria-labelledby': P,
            [$H]: B ? '' : void 0,
            onFocus() {
              S(!0)
            },
            onBlur() {
              let B0 = A0.current
              if (!B0) return
              if ((x(!0), S(!1), I === 'onBlur')) W0.commit(a ? s : B0.checked)
            },
            onClick(B0) {
              if (H || g) return
              ;(B0.preventDefault(),
                A0.current?.dispatchEvent(
                  new PointerEvent('click', {
                    bubbles: !0,
                    shiftKey: B0.shiftKey,
                    ctrlKey: B0.ctrlKey,
                    altKey: B0.altKey,
                    metaKey: B0.metaKey,
                  }),
                ))
            },
          },
          C,
          W0.getValidationProps,
          V,
          e,
          _0,
        ],
        stateAttributesMapping: L1,
      })
    return qH(nQ.Provider, {
      value: t0,
      children: [
        D0,
        !O0 &&
          !a &&
          Z0 &&
          !B &&
          L !== void 0 &&
          cX('input', { type: 'hidden', name: Z0, value: L }),
        cX('input', { ...y0 }),
      ],
    })
  })
Hz.displayName = 'CheckboxRoot'
import * as l6 from 'react'
var Nz = l6.forwardRef(function (Z, J) {
  let { render: z, className: q, keepMounted: $ = !1, ...X } = Z,
    K = uX(),
    G = K.checked || K.indeterminate,
    { mounted: Y, transitionStatus: W, setMounted: U } = F1(G),
    B = l6.useRef(null),
    H = { ...K, transitionStatus: W }
  a0({
    open: G,
    ref: B,
    onComplete() {
      if (!G) U(!1)
    },
  })
  let N = aQ(K),
    _ = l6.useMemo(() => ({ ...N, ...i0, ...$1 }), [N]),
    L = $ || Y,
    F = f('span', Z, {
      ref: [J, B],
      state: H,
      stateAttributesMapping: _,
      props: X,
    })
  if (!L) return null
  return F
})
Nz.displayName = 'CheckboxIndicator'
import { forwardRef as KH, createElement as GH } from 'react'
var oQ = (...Q) =>
  Q.filter((Z, J, z) => {
    return Boolean(Z) && Z.trim() !== '' && z.indexOf(Z) === J
  })
    .join(' ')
    .trim()
var dX = (Q) => Q.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
var iX = (Q) =>
  Q.replace(/^([A-Z])|[\s-_]+(\w)/g, (Z, J, z) =>
    z ? z.toUpperCase() : J.toLowerCase(),
  )
var Lz = (Q) => {
  let Z = iX(Q)
  return Z.charAt(0).toUpperCase() + Z.slice(1)
}
import { forwardRef as XH, createElement as aX } from 'react'
var lX = {
  xmlns: 'http://www.w3.org/2000/svg',
  width: 24,
  height: 24,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
}
var rX = (Q) => {
  for (let Z in Q)
    if (Z.startsWith('aria-') || Z === 'role' || Z === 'title') return !0
  return !1
}
var sX = XH(
  (
    {
      color: Q = 'currentColor',
      size: Z = 24,
      strokeWidth: J = 2,
      absoluteStrokeWidth: z,
      className: q = '',
      children: $,
      iconNode: X,
      ...K
    },
    G,
  ) =>
    aX(
      'svg',
      {
        ref: G,
        ...lX,
        width: Z,
        height: Z,
        stroke: Q,
        strokeWidth: z ? (Number(J) * 24) / Number(Z) : J,
        className: oQ('lucide', q),
        ...(!$ && !rX(K) && { 'aria-hidden': 'true' }),
        ...K,
      },
      [...X.map(([Y, W]) => aX(Y, W)), ...(Array.isArray($) ? $ : [$])],
    ),
)
var G5 = (Q, Z) => {
  let J = KH(({ className: z, ...q }, $) =>
    GH(sX, {
      ref: $,
      iconNode: Z,
      className: oQ(`lucide-${dX(Lz(Q))}`, `lucide-${Q}`, z),
      ...q,
    }),
  )
  return ((J.displayName = Lz(Q)), J)
}
var YH = [['path', { d: 'M20 6 9 17l-5-5', key: '1gmf2c' }]],
  _2 = G5('check', YH)
var WH = [['path', { d: 'm6 9 6 6 6-6', key: 'qrunsl' }]],
  r6 = G5('chevron-down', WH)
var UH = [['path', { d: 'm9 18 6-6-6-6', key: 'mthhwq' }]],
  $7 = G5('chevron-right', UH)
var BH = [['path', { d: 'm18 15-6-6-6 6', key: '153udz' }]],
  X7 = G5('chevron-up', BH)
var _H = [['circle', { cx: '12', cy: '12', r: '10', key: '1mglay' }]],
  K7 = G5('circle', _H)
var HH = [['path', { d: 'M21 12a9 9 0 1 1-6.219-8.56', key: '13zald' }]],
  O8 = G5('loader-circle', HH)
var NH = [
    ['path', { d: 'M18 6 6 18', key: '1bl5f8' }],
    ['path', { d: 'm6 6 12 12', key: 'd8bk6v' }],
  ],
  G7 = G5('x', NH)
import { jsxDEV as Fz } from 'react/jsx-dev-runtime'
function Iy({ className: Q, ...Z }) {
  return Fz(
    q7.Root,
    {
      'data-slot': 'checkbox',
      className: z0(
        'border-input dark:bg-input/30 data-checked:bg-primary data-checked:text-primary-foreground dark:data-checked:bg-primary data-checked:border-primary aria-invalid:aria-checked:border-primary aria-invalid:border-destructive dark:aria-invalid:border-destructive/50 focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 flex size-4 items-center justify-center rounded-[4px] border transition-colors group-has-disabled/field:opacity-50 focus-visible:ring-3 aria-invalid:ring-3 peer relative shrink-0 outline-none after:absolute after:-inset-x-3 after:-inset-y-2 disabled:cursor-not-allowed disabled:opacity-50',
        Q,
      ),
      ...Z,
      children: Fz(
        q7.Indicator,
        {
          'data-slot': 'checkbox-indicator',
          className:
            '[&>svg]:size-3.5 grid place-content-center text-current transition-none',
          children: Fz(_2, {}, void 0, !1, void 0, this),
        },
        void 0,
        !1,
        void 0,
        this,
      ),
    },
    void 0,
    !1,
    void 0,
    this,
  )
}
var W7 = {}
c1(W7, { Root: () => jz, Indicator: () => Vz })
import * as w8 from 'react'
var kz = (function (Q) {
  return (
    (Q.checked = 'data-checked'),
    (Q.unchecked = 'data-unchecked'),
    (Q.disabled = 'data-disabled'),
    (Q.readonly = 'data-readonly'),
    (Q.required = 'data-required'),
    (Q.valid = 'data-valid'),
    (Q.invalid = 'data-invalid'),
    (Q.touched = 'data-touched'),
    (Q.dirty = 'data-dirty'),
    (Q.filled = 'data-filled'),
    (Q.focused = 'data-focused'),
    Q
  )
})({})
var Y7 = {
  checked(Q) {
    if (Q) return { [kz.checked]: '' }
    return { [kz.unchecked]: '' }
  },
  ...i0,
  ...$1,
}
var a6 = 'data-composite-item-active'
import * as Q4 from 'react'
import * as u2 from 'react'
import * as tQ from 'react'
var eQ = tQ.createContext({
  register: () => {},
  unregister: () => {},
  subscribeMapChange: () => {
    return () => {}
  },
  elementsRef: { current: [] },
  nextIndexRef: { current: 0 },
})
eQ.displayName = 'CompositeListContext'
function nX() {
  return tQ.useContext(eQ)
}
var Mz = (function (Q) {
  return (
    (Q[(Q.None = 0)] = 'None'),
    (Q[(Q.GuessFromOrder = 1)] = 'GuessFromOrder'),
    Q
  )
})({})
function g1(Q = {}) {
  let {
      label: Z,
      metadata: J,
      textRef: z,
      indexGuessBehavior: q,
      index: $,
    } = Q,
    {
      register: X,
      unregister: K,
      subscribeMapChange: G,
      elementsRef: Y,
      labelsRef: W,
      nextIndexRef: U,
    } = nX(),
    B = u2.useRef(-1),
    [H, N] = u2.useState(
      $ ??
        (q === Mz.GuessFromOrder
          ? () => {
              if (B.current === -1) {
                let F = U.current
                ;((U.current += 1), (B.current = F))
              }
              return B.current
            }
          : -1),
    ),
    _ = u2.useRef(null),
    L = u2.useCallback(
      (F) => {
        if (((_.current = F), H !== -1 && F !== null)) {
          if (((Y.current[H] = F), W)) {
            let k = Z !== void 0
            W.current[H] = k ? Z : (z?.current?.textContent ?? F.textContent)
          }
        }
      },
      [H, Y, W, Z, z],
    )
  return (
    u(() => {
      if ($ != null) return
      let F = _.current
      if (F)
        return (
          X(F, J),
          () => {
            K(F)
          }
        )
      return
    }, [$, X, K, J]),
    u(() => {
      if ($ != null) return
      return G((F) => {
        let k = _.current ? F.get(_.current)?.index : null
        if (k != null) N(k)
      })
    }, [$, G, N]),
    u2.useMemo(() => ({ ref: L, index: H }), [H, L])
  )
}
function Z4(Q = {}) {
  let {
      highlightItemOnHover: Z,
      highlightedIndex: J,
      onHighlightedIndexChange: z,
    } = f6(),
    { ref: q, index: $ } = g1(Q),
    X = J === $,
    K = Q4.useRef(null),
    G = Y1(q, K)
  return {
    compositeProps: Q4.useMemo(
      () => ({
        tabIndex: X ? 0 : -1,
        onFocus() {
          z($)
        },
        onMouseMove() {
          let W = K.current
          if (!Z || !W) return
          let U = W.hasAttribute('disabled') || W.ariaDisabled === 'true'
          if (!X && !U) W.focus()
        },
      }),
      [X, z, $, Z],
    ),
    compositeRef: G,
    index: $,
  }
}
function s6(Q) {
  let {
      render: Z,
      className: J,
      state: z = S0,
      props: q = z5,
      refs: $ = z5,
      metadata: X,
      stateAttributesMapping: K,
      tag: G = 'div',
      ...Y
    } = Q,
    { compositeProps: W, compositeRef: U } = Z4({ metadata: X })
  return f(G, Q, {
    state: z,
    ref: [...$, U],
    props: [W, ...q, Y],
    stateAttributesMapping: K,
  })
}
import * as J4 from 'react'
var z4 = J4.createContext(void 0)
z4.displayName = 'RadioGroupContext'
function oX() {
  return J4.useContext(z4)
}
function n6(Q) {
  if (Q == null) return ''
  if (typeof Q === 'string') return Q
  try {
    return JSON.stringify(Q)
  } catch {
    return String(Q)
  }
}
import * as q4 from 'react'
var $4 = q4.createContext(void 0)
$4.displayName = 'RadioRootContext'
function tX() {
  let Q = q4.useContext($4)
  if (Q === void 0)
    throw Error(
      'Base UI: RadioRootContext is missing. Radio parts must be placed within <Radio.Root>.',
    )
  return Q
}
import { jsx as eX, jsxs as LH } from 'react/jsx-runtime'
var jz = w8.forwardRef(function (Z, J) {
  let {
      render: z,
      className: q,
      disabled: $ = !1,
      readOnly: X = !1,
      required: K = !1,
      value: G,
      inputRef: Y,
      nativeButton: W = !1,
      id: U,
      ...B
    } = Z,
    H = oX(),
    {
      disabled: N,
      readOnly: _,
      required: L,
      checkedValue: F,
      touched: k = !1,
      validation: V,
      name: M,
    } = H ?? {},
    j = H?.setCheckedValue ?? l0,
    A = H?.setTouched ?? l0,
    w = H?.registerControlRef ?? l0,
    O = H?.registerInputRef ?? l0,
    {
      setDirty: S,
      validityData: x,
      setTouched: h,
      setFilled: I,
      state: y,
      disabled: T,
    } = r0(),
    R = gQ(),
    { labelId: v, getDescriptionProps: P } = X1(),
    D = T || R.disabled || N || $,
    E = _ || X,
    C = L || K,
    a = H ? F === G : G === '',
    p = w8.useMemo(() => n6(G), [G]),
    Q0 = w8.useRef(null),
    g = w8.useRef(null),
    Z0 = m((q0) => {
      if (!q0) return
      w(q0, D)
    }),
    i = Y1(Y, g, O)
  ;(u(() => {
    if (g.current?.checked) I(!0)
  }, [I]),
    u(() => {
      if (!g.current) return
      if (D && a) {
        O(null)
        return
      }
      if (Q0.current) w(Q0.current, D)
      O(g.current)
    }, [a, D, w, O]))
  let X0 = L0(),
    Y0 = I5({ id: U, implicit: !1, controlRef: Q0 }),
    J0 = W ? void 0 : Y0,
    U0 = {
      role: 'radio',
      'aria-checked': a,
      'aria-required': C || void 0,
      'aria-readonly': E || void 0,
      'aria-labelledby': v,
      [a6]: a ? '' : void 0,
      id: W ? Y0 : X0,
      onKeyDown(q0) {
        if (q0.key === 'Enter') q0.preventDefault()
      },
      onClick(q0) {
        if (q0.defaultPrevented || D || E) return
        ;(q0.preventDefault(),
          g.current?.dispatchEvent(
            new PointerEvent('click', {
              bubbles: !0,
              shiftKey: q0.shiftKey,
              ctrlKey: q0.ctrlKey,
              altKey: q0.altKey,
              metaKey: q0.metaKey,
            }),
          ))
      },
      onFocus(q0) {
        if (q0.defaultPrevented || D || E || !k) return
        ;(g.current?.click(), A(!1))
      },
    },
    { getButtonProps: K0, buttonRef: b } = Q1({ disabled: D, native: W }),
    r = {
      type: 'radio',
      ref: i,
      id: J0,
      name: M,
      tabIndex: -1,
      style: M ? V8 : s1,
      'aria-hidden': !0,
      ...(G !== void 0 ? { value: p } : S0),
      disabled: D,
      checked: a,
      required: C,
      readOnly: E,
      onChange(q0) {
        if (q0.nativeEvent.defaultPrevented) return
        if (D || E || G === void 0) return
        let n = $0(c.none, q0.nativeEvent)
        if (n.isCanceled) return
        ;(h(!0), S(G !== x.initialValue), I(!0), j(G, n))
      },
      onFocus() {
        Q0.current?.focus()
      },
    },
    t = w8.useMemo(
      () => ({ ...y, required: C, disabled: D, readOnly: E, checked: a }),
      [y, D, E, a, C],
    ),
    e = t,
    s = H !== void 0,
    d = [J, Q0, b, Z0],
    o = [U0, P, V?.getValidationProps ?? S0, B, K0],
    l = f('span', Z, {
      enabled: !s,
      state: t,
      ref: d,
      props: o,
      stateAttributesMapping: Y7,
    })
  return LH($4.Provider, {
    value: e,
    children: [
      s
        ? eX(s6, {
            tag: 'span',
            render: z,
            className: q,
            state: t,
            refs: d,
            props: o,
            stateAttributesMapping: Y7,
          })
        : l,
      eX('input', { ...r }),
    ],
  })
})
jz.displayName = 'RadioRoot'
import * as X4 from 'react'
var Vz = X4.forwardRef(function (Z, J) {
  let { render: z, className: q, keepMounted: $ = !1, ...X } = Z,
    K = tX(),
    G = K.checked,
    { mounted: Y, transitionStatus: W, setMounted: U } = F1(G),
    B = { ...K, transitionStatus: W },
    H = X4.useRef(null),
    N = $ || Y,
    _ = f('span', Z, {
      ref: [J, H],
      state: B,
      props: X,
      stateAttributesMapping: Y7,
    })
  if (
    (a0({
      open: G,
      ref: H,
      onComplete() {
        if (!G) U(!1)
      },
    }),
    !N)
  )
    return null
  return _
})
Vz.displayName = 'RadioIndicator'
import * as k2 from 'react'
var H2 = 'ArrowUp',
  e5 = 'ArrowDown',
  c2 = 'ArrowLeft',
  N2 = 'ArrowRight',
  d2 = 'Home',
  i2 = 'End',
  Az = new Set([c2, N2]),
  ZK = new Set([c2, N2, d2, i2]),
  Oz = new Set([H2, e5]),
  JK = new Set([H2, e5, d2, i2]),
  wz = new Set([...Az, ...Oz]),
  zK = new Set([...wz, d2, i2]),
  L2 = new Set([H2, e5, c2, N2, d2, i2]),
  yz = 'Shift',
  FH = 'Control',
  kH = 'Alt',
  MH = 'Meta',
  qK = new Set([yz, FH, kH, MH])
function jH(Q) {
  return m0(Q) && Q.tagName === 'INPUT'
}
function Dz(Q) {
  if (jH(Q) && Q.selectionStart != null) return !0
  if (m0(Q) && Q.tagName === 'TEXTAREA') return !0
  return !1
}
function Tz(Q, Z, J, z) {
  if (!Q || !Z || !Z.scrollTo) return
  let { scrollLeft: q, scrollTop: $ } = Q,
    X = Q.clientWidth < Q.scrollWidth,
    K = Q.clientHeight < Q.scrollHeight
  if (X && z !== 'vertical') {
    let G = QK(Q, Z, 'left'),
      Y = K4(Q),
      W = K4(Z)
    if (J === 'ltr') {
      if (
        G + Z.offsetWidth + W.scrollMarginRight >
        Q.scrollLeft + Q.clientWidth - Y.scrollPaddingRight
      )
        q =
          G +
          Z.offsetWidth +
          W.scrollMarginRight -
          Q.clientWidth +
          Y.scrollPaddingRight
      else if (G - W.scrollMarginLeft < Q.scrollLeft + Y.scrollPaddingLeft)
        q = G - W.scrollMarginLeft - Y.scrollPaddingLeft
    }
    if (J === 'rtl') {
      if (G - W.scrollMarginRight < Q.scrollLeft + Y.scrollPaddingLeft)
        q = G - W.scrollMarginLeft - Y.scrollPaddingLeft
      else if (
        G + Z.offsetWidth + W.scrollMarginRight >
        Q.scrollLeft + Q.clientWidth - Y.scrollPaddingRight
      )
        q =
          G +
          Z.offsetWidth +
          W.scrollMarginRight -
          Q.clientWidth +
          Y.scrollPaddingRight
    }
  }
  if (K && z !== 'horizontal') {
    let G = QK(Q, Z, 'top'),
      Y = K4(Q),
      W = K4(Z)
    if (G - W.scrollMarginTop < Q.scrollTop + Y.scrollPaddingTop)
      $ = G - W.scrollMarginTop - Y.scrollPaddingTop
    else if (
      G + Z.offsetHeight + W.scrollMarginBottom >
      Q.scrollTop + Q.clientHeight - Y.scrollPaddingBottom
    )
      $ =
        G +
        Z.offsetHeight +
        W.scrollMarginBottom -
        Q.clientHeight +
        Y.scrollPaddingBottom
  }
  Q.scrollTo({ left: q, top: $, behavior: 'auto' })
}
function QK(Q, Z, J) {
  let z = J === 'left' ? 'offsetLeft' : 'offsetTop',
    q = 0
  while (Z.offsetParent) {
    if (((q += Z[z]), Z.offsetParent === Q)) break
    Z = Z.offsetParent
  }
  return q
}
function K4(Q) {
  let Z = getComputedStyle(Q)
  return {
    scrollMarginTop: parseFloat(Z.scrollMarginTop) || 0,
    scrollMarginRight: parseFloat(Z.scrollMarginRight) || 0,
    scrollMarginBottom: parseFloat(Z.scrollMarginBottom) || 0,
    scrollMarginLeft: parseFloat(Z.scrollMarginLeft) || 0,
    scrollPaddingTop: parseFloat(Z.scrollPaddingTop) || 0,
    scrollPaddingRight: parseFloat(Z.scrollPaddingRight) || 0,
    scrollPaddingBottom: parseFloat(Z.scrollPaddingBottom) || 0,
    scrollPaddingLeft: parseFloat(Z.scrollPaddingLeft) || 0,
  }
}
import * as YK from 'react'
import * as y8 from 'react'
import { jsx as VH } from 'react/jsx-runtime'
function F2(Q) {
  let { children: Z, elementsRef: J, labelsRef: z, onMapChange: q } = Q,
    $ = m(q),
    X = y8.useRef(0),
    K = R0(OH).current,
    G = R0(AH).current,
    [Y, W] = y8.useState(0),
    U = y8.useRef(Y),
    B = m((F, k) => {
      ;(G.set(F, k ?? null), (U.current += 1), W(U.current))
    }),
    H = m((F) => {
      ;(G.delete(F), (U.current += 1), W(U.current))
    }),
    N = y8.useMemo(() => {
      yH(Y)
      let F = new Map()
      return (
        Array.from(G.keys())
          .filter((V) => V.isConnected)
          .sort(wH)
          .forEach((V, M) => {
            let j = G.get(V) ?? {}
            F.set(V, { ...j, index: M })
          }),
        F
      )
    }, [G, Y])
  ;(u(() => {
    if (typeof MutationObserver !== 'function' || N.size === 0) return
    let F = new MutationObserver((k) => {
      let V = new Set(),
        M = (j) => (V.has(j) ? V.delete(j) : V.add(j))
      if (
        (k.forEach((j) => {
          ;(j.removedNodes.forEach(M), j.addedNodes.forEach(M))
        }),
        V.size === 0)
      )
        ((U.current += 1), W(U.current))
    })
    return (
      N.forEach((k, V) => {
        if (V.parentElement) F.observe(V.parentElement, { childList: !0 })
      }),
      () => {
        F.disconnect()
      }
    )
  }, [N]),
    u(() => {
      if (U.current === Y) {
        if (J.current.length !== N.size) J.current.length = N.size
        if (z && z.current.length !== N.size) z.current.length = N.size
        X.current = N.size
      }
      $(N)
    }, [$, N, J, z, Y]),
    u(() => {
      return () => {
        J.current = []
      }
    }, [J]),
    u(() => {
      return () => {
        if (z) z.current = []
      }
    }, [z]))
  let _ = m((F) => {
    return (
      K.add(F),
      () => {
        K.delete(F)
      }
    )
  })
  u(() => {
    K.forEach((F) => F(N))
  }, [K, N])
  let L = y8.useMemo(
    () => ({
      register: B,
      unregister: H,
      subscribeMapChange: _,
      elementsRef: J,
      labelsRef: z,
      nextIndexRef: X,
    }),
    [B, H, _, J, z, X],
  )
  return VH(eQ.Provider, { value: L, children: Z })
}
function AH() {
  return new Map()
}
function OH() {
  return new Set()
}
function wH(Q, Z) {
  let J = Q.compareDocumentPosition(Z)
  if (
    J & Node.DOCUMENT_POSITION_FOLLOWING ||
    J & Node.DOCUMENT_POSITION_CONTAINED_BY
  )
    return -1
  if (
    J & Node.DOCUMENT_POSITION_PRECEDING ||
    J & Node.DOCUMENT_POSITION_CONTAINS
  )
    return 1
  return 0
}
function yH(Q) {}
import * as l2 from 'react'
function $K(Q) {
  return (
    Q == null ||
    Q.hasAttribute('disabled') ||
    Q.getAttribute('aria-disabled') === 'true'
  )
}
var DH = []
function XK(Q) {
  let {
      itemSizes: Z,
      cols: J = 1,
      loopFocus: z = !0,
      dense: q = !1,
      orientation: $ = 'both',
      direction: X,
      highlightedIndex: K,
      onHighlightedIndexChange: G,
      rootRef: Y,
      enableHomeAndEndKeys: W = !1,
      stopEventPropagation: U = !1,
      disabledIndices: B,
      modifierKeys: H = DH,
    } = Q,
    [N, _] = l2.useState(0),
    L = J > 1,
    F = l2.useRef(null),
    k = Y1(F, Y),
    V = l2.useRef([]),
    M = l2.useRef(!1),
    j = K ?? N,
    A = m((S, x = !1) => {
      if (((G ?? _)(S), x)) {
        let h = V.current[S]
        Tz(F.current, h, X, $)
      }
    }),
    w = m((S) => {
      if (S.size === 0 || M.current) return
      M.current = !0
      let x = Array.from(S.keys()),
        h = x.find((y) => y?.hasAttribute(a6)) ?? null,
        I = h ? x.indexOf(h) : -1
      if (I !== -1) A(I)
      Tz(F.current, h, X, $)
    }),
    O = l2.useMemo(
      () => ({
        'aria-orientation': $ === 'both' ? void 0 : $,
        ref: k,
        onFocus(S) {
          if (!F.current || !Dz(S.target)) return
          S.target.setSelectionRange(0, S.target.value.length ?? 0)
        },
        onKeyDown(S) {
          let x = W ? zK : wz
          if (!x.has(S.key)) return
          if (TH(S, H)) return
          if (!F.current) return
          let I = X === 'rtl',
            y = I ? c2 : N2,
            T = { horizontal: y, vertical: e5, both: y }[$],
            R = I ? N2 : c2,
            v = { horizontal: R, vertical: H2, both: R }[$]
          if (Dz(S.target) && !$K(S.target)) {
            let Q0 = S.target.selectionStart,
              g = S.target.selectionEnd,
              Z0 = S.target.value ?? ''
            if (Q0 == null || S.shiftKey || Q0 !== g) return
            if (S.key !== v && Q0 < Z0.length) return
            if (S.key !== T && Q0 > 0) return
          }
          let P = j,
            D = G6(V, B),
            E = c6(V, B)
          if (L) {
            let Q0 =
                Z ||
                Array.from({ length: V.current.length }, () => ({
                  width: 1,
                  height: 1,
                })),
              g = o9(Q0, J, q),
              Z0 = g.findIndex((X0) => X0 != null && !s5(V, X0, B)),
              i = g.reduce(
                (X0, Y0, J0) => (Y0 != null && !s5(V, Y0, B) ? J0 : X0),
                -1,
              )
            P =
              g[
                n9(
                  { current: g.map((X0) => (X0 ? V.current[X0] : null)) },
                  {
                    event: S,
                    orientation: $,
                    loopFocus: z,
                    cols: J,
                    disabledIndices: e9(
                      [
                        ...(B ||
                          V.current.map((X0, Y0) => (s5(V, Y0) ? Y0 : void 0))),
                        void 0,
                      ],
                      g,
                    ),
                    minIndex: Z0,
                    maxIndex: i,
                    prevIndex: t9(
                      j > E ? D : j,
                      Q0,
                      g,
                      J,
                      S.key === e5 ? 'bl' : S.key === N2 ? 'tr' : 'tl',
                    ),
                    rtl: I,
                  },
                )
              ]
          }
          let C = { horizontal: [y], vertical: [e5], both: [y, e5] }[$],
            a = { horizontal: [R], vertical: [H2], both: [R, H2] }[$],
            p = L
              ? x
              : { horizontal: W ? ZK : Az, vertical: W ? JK : Oz, both: x }[$]
          if (W) {
            if (S.key === d2) P = D
            else if (S.key === i2) P = E
          }
          if (P === j && (C.includes(S.key) || a.includes(S.key)))
            if (z && P === E && C.includes(S.key)) P = D
            else if (z && P === D && a.includes(S.key)) P = E
            else
              P = w1(V, {
                startingIndex: P,
                decrement: a.includes(S.key),
                disabledIndices: B,
              })
          if (P !== j && !p2(V, P)) {
            if (U) S.stopPropagation()
            if (p.has(S.key)) S.preventDefault()
            ;(A(P, !0),
              queueMicrotask(() => {
                V.current[P]?.focus()
              }))
          }
        },
      }),
      [J, q, X, B, V, W, j, L, Z, z, k, H, A, $, U],
    )
  return l2.useMemo(
    () => ({
      props: O,
      highlightedIndex: j,
      onHighlightedIndexChange: A,
      elementsRef: V,
      disabledIndices: B,
      onMapChange: w,
      relayKeyboardEvent: O.onKeyDown,
    }),
    [O, j, A, V, B, w],
  )
}
function TH(Q, Z) {
  for (let J of qK.values()) {
    if (Z.includes(J)) continue
    if (Q.getModifierState(J)) return !0
  }
  return !1
}
import * as G4 from 'react'
var KK = G4.createContext(void 0)
KK.displayName = 'DirectionContext'
function y1() {
  return G4.useContext(KK)?.direction ?? 'ltr'
}
import { jsx as GK } from 'react/jsx-runtime'
function o6(Q) {
  let {
      render: Z,
      className: J,
      refs: z = z5,
      props: q = z5,
      state: $ = S0,
      stateAttributesMapping: X,
      highlightedIndex: K,
      onHighlightedIndexChange: G,
      orientation: Y,
      dense: W,
      itemSizes: U,
      loopFocus: B,
      cols: H,
      enableHomeAndEndKeys: N,
      onMapChange: _,
      stopEventPropagation: L = !0,
      rootRef: F,
      disabledIndices: k,
      modifierKeys: V,
      highlightItemOnHover: M = !1,
      tag: j = 'div',
      ...A
    } = Q,
    w = y1(),
    {
      props: O,
      highlightedIndex: S,
      onHighlightedIndexChange: x,
      elementsRef: h,
      onMapChange: I,
      relayKeyboardEvent: y,
    } = XK({
      itemSizes: U,
      cols: H,
      loopFocus: B,
      dense: W,
      orientation: Y,
      highlightedIndex: K,
      onHighlightedIndexChange: G,
      rootRef: F,
      stopEventPropagation: L,
      enableHomeAndEndKeys: N,
      direction: w,
      disabledIndices: k,
      modifierKeys: V,
    }),
    T = f(j, Q, {
      state: $,
      ref: z,
      props: [O, ...q, A],
      stateAttributesMapping: X,
    }),
    R = YK.useMemo(
      () => ({
        highlightedIndex: S,
        onHighlightedIndexChange: x,
        highlightItemOnHover: M,
        relayKeyboardEvent: y,
      }),
      [S, x, M, y],
    )
  return GK(ZQ.Provider, {
    value: R,
    children: GK(F2, {
      elementsRef: h,
      onMapChange: (v) => {
        ;(_?.(v), I(v))
      },
      children: T,
    }),
  })
}
import { jsx as WK } from 'react/jsx-runtime'
var PH = [yz],
  Y4 = k2.forwardRef(function (Z, J) {
    let {
        render: z,
        className: q,
        disabled: $,
        readOnly: X,
        required: K,
        onValueChange: G,
        value: Y,
        defaultValue: W,
        name: U,
        inputRef: B,
        id: H,
        ...N
      } = Z,
      {
        setTouched: _,
        setFocused: L,
        shouldValidateOnChange: F,
        validationMode: k,
        name: V,
        disabled: M,
        state: j,
        validation: A,
        setDirty: w,
        setFilled: O,
        validityData: S,
      } = r0(),
      { labelId: x } = X1(),
      { clearErrors: h } = v1(),
      I = GQ(!0),
      y = M || $,
      T = V ?? U,
      R = L0(H),
      [v, P] = _1({
        controlled: Y,
        default: W,
        name: 'RadioGroup',
        state: 'value',
      }),
      D = m(G),
      E = m((b, r) => {
        if ((D(b, r), r.isCanceled)) return
        P(b)
      }),
      C = k2.useRef(null),
      a = k2.useRef(null),
      p = k2.useRef(null)
    function Q0(b) {
      let r = void 0
      if (B)
        if (typeof B === 'function') r = B(b)
        else B.current = b
      return ((a.current = b), (A.inputRef.current = b), r)
    }
    let g = m((b, r = !1) => {
        if (!b) return
        if (r) {
          if (C.current === b) C.current = null
          return
        }
        if (C.current == null) C.current = b
      }),
      Z0 = m((b) => {
        if (!b || b.disabled) return
        if (!p.current) p.current = b
        let r = a.current
        if (b.checked || r == null || r.disabled) return Q0(b)
        return
      })
    ;(C5({
      id: R,
      commit: A.commit,
      value: v,
      controlRef: C,
      name: T,
      getValue: () => v ?? null,
    }),
      B2(v, () => {
        if ((h(T), w(v !== S.initialValue), O(v != null), F())) A.commit(v)
        else A.commit(v, !0)
        let b = p.current
        if (v == null && b && !b.disabled) Q0(b)
      }))
    let [i, X0] = k2.useState(!1),
      Y0 = N['aria-labelledby'] ?? x ?? I?.legendId,
      J0 = { ...j, disabled: y ?? !1, required: K ?? !1, readOnly: X ?? !1 },
      U0 = k2.useMemo(
        () => ({
          ...j,
          checkedValue: v,
          disabled: y,
          validation: A,
          name: T,
          onValueChange: D,
          readOnly: X,
          registerControlRef: g,
          registerInputRef: Z0,
          required: K,
          setCheckedValue: E,
          setTouched: X0,
          touched: i,
        }),
        [v, y, A, j, T, D, X, g, Z0, K, E, X0, i],
      ),
      K0 = {
        role: 'radiogroup',
        'aria-required': K || void 0,
        'aria-disabled': y || void 0,
        'aria-readonly': X || void 0,
        'aria-labelledby': Y0,
        onFocus() {
          L(!0)
        },
        onBlur(b) {
          if (!F0(b.currentTarget, b.relatedTarget)) {
            if ((_(!0), L(!1), k === 'onBlur')) A.commit(v)
          }
        },
        onKeyDownCapture(b) {
          if (b.key.startsWith('Arrow')) (_(!0), X0(!0), L(!0))
        },
      }
    return WK(z4.Provider, {
      value: U0,
      children: WK(o6, {
        render: z,
        className: q,
        state: J0,
        props: [K0, A.getValidationProps, N],
        refs: [J],
        stateAttributesMapping: $1,
        enableHomeAndEndKeys: !1,
        modifierKeys: PH,
      }),
    })
  })
Y4.displayName = 'RadioGroup'
import { jsxDEV as W4 } from 'react/jsx-dev-runtime'
function DT({ className: Q, ...Z }) {
  return W4(
    Y4,
    { 'data-slot': 'radio-group', className: z0('grid gap-2 w-full', Q), ...Z },
    void 0,
    !1,
    void 0,
    this,
  )
}
function TT({ className: Q, ...Z }) {
  return W4(
    W7.Root,
    {
      'data-slot': 'radio-group-item',
      className: z0(
        'border-input text-primary dark:bg-input/30 focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:aria-invalid:border-destructive/50 flex size-4 rounded-full focus-visible:ring-3 aria-invalid:ring-3 group/radio-group-item peer relative aspect-square shrink-0 border outline-none after:absolute after:-inset-x-3 after:-inset-y-2 disabled:cursor-not-allowed disabled:opacity-50',
        Q,
      ),
      ...Z,
      children: W4(
        W7.Indicator,
        {
          'data-slot': 'radio-group-indicator',
          className:
            'group-aria-invalid/radio-group-item:text-destructive text-primary flex size-4 items-center justify-center',
          children: W4(
            K7,
            {
              className:
                'absolute top-1/2 left-1/2 size-2 -translate-x-1/2 -translate-y-1/2 fill-current',
            },
            void 0,
            !1,
            void 0,
            this,
          ),
        },
        void 0,
        !1,
        void 0,
        this,
      ),
    },
    void 0,
    !1,
    void 0,
    this,
  )
}
var b1 = {}
c1(b1, {
  Value: () => _q,
  Trigger: () => Bq,
  Separator: () => f8,
  ScrollUpArrow: () => Tq,
  ScrollDownArrow: () => Dq,
  Root: () => PG,
  Positioner: () => Mq,
  Portal: () => Fq,
  Popup: () => jq,
  List: () => Vq,
  ItemText: () => wq,
  ItemIndicator: () => Oq,
  Item: () => Aq,
  Icon: () => Hq,
  GroupLabel: () => Eq,
  Group: () => Pq,
  Backdrop: () => kq,
  Arrow: () => yq,
})
import * as k1 from 'react'
import * as UK from 'react'
function x5(Q) {
  let Z = UK.useRef(!0)
  if (Z.current) ((Z.current = !1), Q())
}
function s0(Q) {
  let Z = R0(EH, Q).current
  return ((Z.next = Q), u(Z.effect), Z)
}
function EH(Q) {
  let Z = {
    current: Q,
    next: Q,
    effect: () => {
      Z.current = Z.next
    },
  }
  return Z
}
var SH = (Q, Z, J) => {
    if (Z.length === 1 && Z[0] === J) {
      let z = !1
      try {
        let q = {}
        if (Q(q) === q) z = !0
      } catch {}
      if (z) {
        let q = void 0
        try {
          throw Error()
        } catch ($) {
          ;({ stack: q } = $)
        }
        console.warn(
          `The result function returned its own inputs without modification. e.g
\`createSelector([state => state.todos], todos => todos)\`
This could lead to inefficient memoization and unnecessary re-renders.
Ensure transformation logic is in the result function, and extraction logic is in the input selectors.`,
          { stack: q },
        )
      }
    }
  },
  IH = (Q, Z, J) => {
    let { memoize: z, memoizeOptions: q } = Z,
      { inputSelectorResults: $, inputSelectorResultsCopy: X } = Q,
      K = z(() => ({}), ...q)
    if (K.apply(null, $) !== K.apply(null, X)) {
      let Y = void 0
      try {
        throw Error()
      } catch (W) {
        ;({ stack: Y } = W)
      }
      console.warn(
        `An input selector returned a different result when passed same arguments.
This means your output selector will likely run more frequently than intended.
Avoid returning a new reference inside your input selector, e.g.
\`createSelector([state => state.todos.map(todo => todo.id)], todoIds => todoIds.length)\``,
        { arguments: J, firstInputs: $, secondInputs: X, stack: Y },
      )
    }
  },
  CH = { inputStabilityCheck: 'once', identityFunctionCheck: 'once' }
var B4 = Symbol('NOT_FOUND')
function xH(Q, Z = `expected a function, instead received ${typeof Q}`) {
  if (typeof Q !== 'function') throw TypeError(Z)
}
function hH(Q, Z = `expected an object, instead received ${typeof Q}`) {
  if (typeof Q !== 'object') throw TypeError(Z)
}
function bH(
  Q,
  Z = 'expected all items to be functions, instead received the following types: ',
) {
  if (!Q.every((J) => typeof J === 'function')) {
    let J = Q.map((z) =>
      typeof z === 'function' ? `function ${z.name || 'unnamed'}()` : typeof z,
    ).join(', ')
    throw TypeError(`${Z}[${J}]`)
  }
}
var BK = (Q) => {
  return Array.isArray(Q) ? Q : [Q]
}
function RH(Q) {
  let Z = Array.isArray(Q[0]) ? Q[0] : Q
  return (
    bH(
      Z,
      'createSelector expects all input-selectors to be functions, but received the following types: ',
    ),
    Z
  )
}
function _K(Q, Z) {
  let J = [],
    { length: z } = Q
  for (let q = 0; q < z; q++) J.push(Q[q].apply(null, Z))
  return J
}
var vH = (Q, Z) => {
    let { identityFunctionCheck: J, inputStabilityCheck: z } = { ...CH, ...Z }
    return {
      identityFunctionCheck: {
        shouldRun: J === 'always' || (J === 'once' && Q),
        run: SH,
      },
      inputStabilityCheck: {
        shouldRun: z === 'always' || (z === 'once' && Q),
        run: IH,
      },
    }
  },
  HK = 0,
  fH = null,
  LK = class {
    revision = HK
    _value
    _lastValue
    _isEqual = Pz
    constructor(Q, Z = Pz) {
      ;((this._value = this._lastValue = Q), (this._isEqual = Z))
    }
    get value() {
      return (fH?.add(this), this._value)
    }
    set value(Q) {
      if (this.value === Q) return
      ;((this._value = Q), (this.revision = ++HK))
    }
  }
function Pz(Q, Z) {
  return Q === Z
}
function Ez(Q) {
  if (!(Q instanceof LK)) console.warn('Not a valid cell! ', Q)
  return Q.value
}
function gH(Q, Z = Pz) {
  return new LK(Q, Z)
}
var mH = (Q, Z) => !1
function _4() {
  return gH(null, mH)
}
var FK = (Q) => {
  let Z = Q.collectionTag
  if (Z === null) Z = Q.collectionTag = _4()
  Ez(Z)
}
var hT = Symbol(),
  kK = 0,
  pH = Object.getPrototypeOf({}),
  uH = class {
    constructor(Q) {
      ;((this.value = Q), (this.value = Q), (this.tag.value = Q))
    }
    proxy = new Proxy(this, U7)
    tag = _4()
    tags = {}
    children = {}
    collectionTag = null
    id = kK++
  },
  U7 = {
    get(Q, Z) {
      function J() {
        let { value: q } = Q,
          $ = Reflect.get(q, Z)
        if (typeof Z === 'symbol') return $
        if (Z in pH) return $
        if (typeof $ === 'object' && $ !== null) {
          let X = Q.children[Z]
          if (X === void 0) X = Q.children[Z] = iH($)
          if (X.tag) Ez(X.tag)
          return X.proxy
        } else {
          let X = Q.tags[Z]
          if (X === void 0) ((X = Q.tags[Z] = _4()), (X.value = $))
          return (Ez(X), $)
        }
      }
      return J()
    },
    ownKeys(Q) {
      return (FK(Q), Reflect.ownKeys(Q.value))
    },
    getOwnPropertyDescriptor(Q, Z) {
      return Reflect.getOwnPropertyDescriptor(Q.value, Z)
    },
    has(Q, Z) {
      return Reflect.has(Q.value, Z)
    },
  },
  cH = class {
    constructor(Q) {
      ;((this.value = Q), (this.value = Q), (this.tag.value = Q))
    }
    proxy = new Proxy([this], dH)
    tag = _4()
    tags = {}
    children = {}
    collectionTag = null
    id = kK++
  },
  dH = {
    get([Q], Z) {
      if (Z === 'length') FK(Q)
      return U7.get(Q, Z)
    },
    ownKeys([Q]) {
      return U7.ownKeys(Q)
    },
    getOwnPropertyDescriptor([Q], Z) {
      return U7.getOwnPropertyDescriptor(Q, Z)
    },
    has([Q], Z) {
      return U7.has(Q, Z)
    },
  }
function iH(Q) {
  if (Array.isArray(Q)) return new cH(Q)
  return new uH(Q)
}
function lH(Q) {
  let Z
  return {
    get(J) {
      if (Z && Q(Z.key, J)) return Z.value
      return B4
    },
    put(J, z) {
      Z = { key: J, value: z }
    },
    getEntries() {
      return Z ? [Z] : []
    },
    clear() {
      Z = void 0
    },
  }
}
function rH(Q, Z) {
  let J = []
  function z(K) {
    let G = J.findIndex((Y) => Z(K, Y.key))
    if (G > -1) {
      let Y = J[G]
      if (G > 0) (J.splice(G, 1), J.unshift(Y))
      return Y.value
    }
    return B4
  }
  function q(K, G) {
    if (z(K) === B4) {
      if ((J.unshift({ key: K, value: G }), J.length > Q)) J.pop()
    }
  }
  function $() {
    return J
  }
  function X() {
    J = []
  }
  return { get: z, put: q, getEntries: $, clear: X }
}
var aH = (Q, Z) => Q === Z
function sH(Q) {
  return function (J, z) {
    if (J === null || z === null || J.length !== z.length) return !1
    let { length: q } = J
    for (let $ = 0; $ < q; $++) if (!Q(J[$], z[$])) return !1
    return !0
  }
}
function MK(Q, Z) {
  let J = typeof Z === 'object' ? Z : { equalityCheck: Z },
    { equalityCheck: z = aH, maxSize: q = 1, resultEqualityCheck: $ } = J,
    X = sH(z),
    K = 0,
    G = q <= 1 ? lH(X) : rH(q, X)
  function Y() {
    let W = G.get(arguments)
    if (W === B4) {
      if (((W = Q.apply(null, arguments)), K++, $)) {
        let B = G.getEntries().find((H) => $(H.value, W))
        if (B) ((W = B.value), K !== 0 && K--)
      }
      G.put(arguments, W)
    }
    return W
  }
  return (
    (Y.clearCache = () => {
      ;(G.clear(), Y.resetResultsCount())
    }),
    (Y.resultsCount = () => K),
    (Y.resetResultsCount = () => {
      K = 0
    }),
    Y
  )
}
var nH = class {
    constructor(Q) {
      this.value = Q
    }
    deref() {
      return this.value
    }
  },
  oH = typeof WeakRef < 'u' ? WeakRef : nH,
  tH = 0,
  NK = 1
function U4() {
  return { s: tH, v: void 0, o: null, p: null }
}
function jK(Q, Z = {}) {
  let J = U4(),
    { resultEqualityCheck: z } = Z,
    q,
    $ = 0
  function X() {
    let K = J,
      { length: G } = arguments
    for (let U = 0, B = G; U < B; U++) {
      let H = arguments[U]
      if (typeof H === 'function' || (typeof H === 'object' && H !== null)) {
        let N = K.o
        if (N === null) K.o = N = new WeakMap()
        let _ = N.get(H)
        if (_ === void 0) ((K = U4()), N.set(H, K))
        else K = _
      } else {
        let N = K.p
        if (N === null) K.p = N = new Map()
        let _ = N.get(H)
        if (_ === void 0) ((K = U4()), N.set(H, K))
        else K = _
      }
    }
    let Y = K,
      W
    if (K.s === NK) W = K.v
    else if (((W = Q.apply(null, arguments)), $++, z)) {
      let U = q?.deref?.() ?? q
      if (U != null && z(U, W)) ((W = U), $ !== 0 && $--)
      q =
        (typeof W === 'object' && W !== null) || typeof W === 'function'
          ? new oH(W)
          : W
    }
    return ((Y.s = NK), (Y.v = W), W)
  }
  return (
    (X.clearCache = () => {
      ;((J = U4()), X.resetResultsCount())
    }),
    (X.resultsCount = () => $),
    (X.resetResultsCount = () => {
      $ = 0
    }),
    X
  )
}
function Sz(Q, ...Z) {
  let J = typeof Q === 'function' ? { memoize: Q, memoizeOptions: Z } : Q,
    z = (...q) => {
      let $ = 0,
        X = 0,
        K,
        G = {},
        Y = q.pop()
      if (typeof Y === 'object') ((G = Y), (Y = q.pop()))
      xH(
        Y,
        `createSelector expects an output function after the inputs, but received: [${typeof Y}]`,
      )
      let W = { ...J, ...G },
        {
          memoize: U,
          memoizeOptions: B = [],
          argsMemoize: H = jK,
          argsMemoizeOptions: N = [],
          devModeChecks: _ = {},
        } = W,
        L = BK(B),
        F = BK(N),
        k = RH(q),
        V = U(
          function () {
            return ($++, Y.apply(null, arguments))
          },
          ...L,
        ),
        M = !0,
        j = H(
          function () {
            X++
            let w = _K(k, arguments)
            K = V.apply(null, w)
            {
              let { identityFunctionCheck: O, inputStabilityCheck: S } = vH(
                M,
                _,
              )
              if (O.shouldRun) O.run(Y, w, K)
              if (S.shouldRun) {
                let x = _K(k, arguments)
                S.run(
                  { inputSelectorResults: w, inputSelectorResultsCopy: x },
                  { memoize: U, memoizeOptions: L },
                  arguments,
                )
              }
              if (M) M = !1
            }
            return K
          },
          ...F,
        )
      return Object.assign(j, {
        resultFunc: Y,
        memoizedResultFunc: V,
        dependencies: k,
        dependencyRecomputations: () => X,
        resetDependencyRecomputations: () => {
          X = 0
        },
        lastResult: () => K,
        recomputations: () => $,
        resetRecomputations: () => {
          $ = 0
        },
        memoize: U,
        argsMemoize: H,
      })
    }
  return (Object.assign(z, { withTypes: () => z }), z)
}
var eH = Sz(jK),
  QN = Object.assign(
    (Q, Z = eH) => {
      hH(
        Q,
        `createStructuredSelector expects first argument to be an object where each property is a selector, instead received a ${typeof Q}`,
      )
      let J = Object.keys(Q),
        z = J.map(($) => Q[$])
      return Z(z, (...$) => {
        return $.reduce((X, K, G) => {
          return ((X[J[G]] = K), X)
        }, {})
      })
    },
    { withTypes: () => QN },
  )
var pT = Sz({
    memoize: MK,
    memoizeOptions: { maxSize: 1, equalityCheck: Object.is },
  }),
  G0 = (Q, Z, J, z, q, $, ...X) => {
    if (X.length > 0) throw Error('Unsupported number of selectors')
    let K
    if (Q && Z && J && z && q && $)
      K = (G, Y, W, U) => {
        let B = Q(G, Y, W, U),
          H = Z(G, Y, W, U),
          N = J(G, Y, W, U),
          _ = z(G, Y, W, U),
          L = q(G, Y, W, U)
        return $(B, H, N, _, L, Y, W, U)
      }
    else if (Q && Z && J && z && q)
      K = (G, Y, W, U) => {
        let B = Q(G, Y, W, U),
          H = Z(G, Y, W, U),
          N = J(G, Y, W, U),
          _ = z(G, Y, W, U)
        return q(B, H, N, _, Y, W, U)
      }
    else if (Q && Z && J && z)
      K = (G, Y, W, U) => {
        let B = Q(G, Y, W, U),
          H = Z(G, Y, W, U),
          N = J(G, Y, W, U)
        return z(B, H, N, Y, W, U)
      }
    else if (Q && Z && J)
      K = (G, Y, W, U) => {
        let B = Q(G, Y, W, U),
          H = Z(G, Y, W, U)
        return J(B, H, Y, W, U)
      }
    else if (Q && Z)
      K = (G, Y, W, U) => {
        let B = Q(G, Y, W, U)
        return Z(B, Y, W, U)
      }
    else if (Q) K = Q
    else throw Error('Missing arguments')
    return K
  }
var hz = Z$(Iz(), 1),
  DK = Z$(VK(), 1)
import * as yK from 'react'
import * as AK from 'react'
var Cz = [],
  xz = void 0
function OK() {
  return xz
}
function wK(Q) {
  Cz.push(Q)
}
function B7(Q) {
  let Z = (J, z) => {
    let q = R0(zN).current,
      $
    try {
      xz = q
      for (let X of Cz) X.before(q)
      $ = Q(J, z)
      for (let X of Cz) X.after(q)
      q.didInitialize = !0
    } finally {
      xz = void 0
    }
    return $
  }
  return ((Z.displayName = Q.displayName || Q.name), Z)
}
function H4(Q) {
  return AK.forwardRef(B7(Q))
}
function zN() {
  return { didInitialize: !1 }
}
var qN = g6(19),
  $N = qN ? KN : GN
function N0(Q, Z, J, z, q) {
  return $N(Q, Z, J, z, q)
}
function XN(Q, Z, J, z, q) {
  let $ = yK.useCallback(() => Z(Q.getSnapshot(), J, z, q), [Q, Z, J, z, q])
  return hz.useSyncExternalStore(Q.subscribe, $, $)
}
wK({
  before(Q) {
    if (((Q.syncIndex = 0), !Q.didInitialize))
      ((Q.syncTick = 1),
        (Q.syncHooks = []),
        (Q.didChangeStore = !0),
        (Q.getSnapshot = () => {
          let Z = !1
          for (let J = 0; J < Q.syncHooks.length; J += 1) {
            let z = Q.syncHooks[J],
              q = z.selector(z.store.state, z.a1, z.a2, z.a3)
            if (z.didChange || !Object.is(z.value, q))
              ((Z = !0), (z.value = q), (z.didChange = !1))
          }
          if (Z) Q.syncTick += 1
          return Q.syncTick
        }))
  },
  after(Q) {
    if (Q.syncHooks.length > 0) {
      if (Q.didChangeStore)
        ((Q.didChangeStore = !1),
          (Q.subscribe = (Z) => {
            let J = new Set()
            for (let q of Q.syncHooks) J.add(q.store)
            let z = []
            for (let q of J) z.push(q.subscribe(Z))
            return () => {
              for (let q of z) q()
            }
          }))
      hz.useSyncExternalStore(Q.subscribe, Q.getSnapshot, Q.getSnapshot)
    }
  },
})
function KN(Q, Z, J, z, q) {
  let $ = OK()
  if (!$) return XN(Q, Z, J, z, q)
  let X = $.syncIndex
  $.syncIndex += 1
  let K
  if (!$.didInitialize)
    ((K = {
      store: Q,
      selector: Z,
      a1: J,
      a2: z,
      a3: q,
      value: Z(Q.getSnapshot(), J, z, q),
      didChange: !1,
    }),
      $.syncHooks.push(K))
  else if (
    ((K = $.syncHooks[X]),
    K.store !== Q ||
      K.selector !== Z ||
      !Object.is(K.a1, J) ||
      !Object.is(K.a2, z) ||
      !Object.is(K.a3, q))
  ) {
    if (K.store !== Q) $.didChangeStore = !0
    ;((K.store = Q),
      (K.selector = Z),
      (K.a1 = J),
      (K.a2 = z),
      (K.a3 = q),
      (K.didChange = !0))
  }
  return K.value
}
function GN(Q, Z, J, z, q) {
  return DK.useSyncExternalStoreWithSelector(
    Q.subscribe,
    Q.getSnapshot,
    Q.getSnapshot,
    ($) => Z($, J, z, q),
  )
}
class _7 {
  constructor(Q) {
    ;((this.state = Q), (this.listeners = new Set()), (this.updateTick = 0))
  }
  subscribe = (Q) => {
    return (
      this.listeners.add(Q),
      () => {
        this.listeners.delete(Q)
      }
    )
  }
  getSnapshot = () => {
    return this.state
  }
  setState(Q) {
    if (this.state === Q) return
    ;((this.state = Q), (this.updateTick += 1))
    let Z = this.updateTick
    for (let J of this.listeners) {
      if (Z !== this.updateTick) return
      J(Q)
    }
  }
  update(Q) {
    for (let Z in Q)
      if (!Object.is(this.state[Z], Q[Z])) {
        this.setState({ ...this.state, ...Q })
        return
      }
  }
  set(Q, Z) {
    if (!Object.is(this.state[Q], Z)) this.setState({ ...this.state, [Q]: Z })
  }
  notifyAll() {
    let Q = { ...this.state }
    this.setState(Q)
  }
  use(Q, Z, J, z) {
    return N0(this, Q, Z, J, z)
  }
}
import * as a2 from 'react'
class M5 extends _7 {
  constructor(Q, Z = {}, J) {
    super(Q)
    ;((this.context = Z), (this.selectors = J))
  }
  useSyncedValue(Q, Z) {
    ;(a2.useDebugValue(Q),
      u(() => {
        if (this.state[Q] !== Z) this.set(Q, Z)
      }, [Q, Z]))
  }
  useSyncedValueWithCleanup(Q, Z) {
    let J = this
    u(() => {
      if (J.state[Q] !== Z) J.set(Q, Z)
      return () => {
        J.set(Q, void 0)
      }
    }, [J, Q, Z])
  }
  useSyncedValues(Q) {
    let Z = this
    {
      a2.useDebugValue(Q, ($) => Object.keys($))
      let z = a2.useRef(Object.keys(Q)).current,
        q = Object.keys(Q)
      if (z.length !== q.length || z.some(($, X) => $ !== q[X]))
        console.error(
          'ReactStore.useSyncedValues expects the same prop keys on every render. Keys should be stable.',
        )
    }
    let J = Object.values(Q)
    u(() => {
      Z.update(Q)
    }, [Z, ...J])
  }
  useControlledProp(Q, Z) {
    a2.useDebugValue(Q)
    let J = Z !== void 0
    u(() => {
      if (J && !Object.is(this.state[Q], Z))
        super.setState({ ...this.state, [Q]: Z })
    }, [Q, Z, J])
    {
      let z = (this.controlledValues ??= new Map())
      if (!z.has(Q)) z.set(Q, J)
      let q = z.get(Q)
      if (q !== void 0 && q !== J)
        console.error(
          `A component is changing the ${J ? '' : 'un'}controlled state of ${Q.toString()} to be ${J ? 'un' : ''}controlled. Elements should not switch from uncontrolled to controlled (or vice versa).`,
        )
    }
  }
  select(Q, Z, J, z) {
    let q = this.selectors[Q]
    return q(this.state, Z, J, z)
  }
  useState(Q, Z, J, z) {
    return (a2.useDebugValue(Q), N0(this, this.selectors[Q], Z, J, z))
  }
  useContextCallback(Q, Z) {
    a2.useDebugValue(Q)
    let J = m(Z ?? l0)
    this.context[Q] = J
  }
  useStateSetter(Q) {
    let Z = a2.useRef(void 0)
    if (Z.current === void 0)
      Z.current = (J) => {
        this.set(Q, J)
      }
    return Z.current
  }
  observe(Q, Z) {
    let J
    if (typeof Q === 'function') J = Q
    else J = this.selectors[Q]
    let z = J(this.state)
    return (
      Z(z, z, this),
      this.subscribe((q) => {
        let $ = J(q)
        if (!Object.is(z, $)) {
          let X = z
          ;((z = $), Z($, X, this))
        }
      })
    )
  }
}
import * as N4 from 'react'
function TK() {
  let [, Q] = N4.useState({})
  return N4.useCallback(() => {
    Q({})
  }, [])
}
import * as Y5 from 'react'
import * as F4 from 'react'
import * as D8 from 'react'
function L4() {
  let Q = new Map()
  return {
    emit(Z, J) {
      Q.get(Z)?.forEach((z) => z(J))
    },
    on(Z, J) {
      if (!Q.has(Z)) Q.set(Z, new Set())
      Q.get(Z).add(J)
    },
    off(Z, J) {
      Q.get(Z)?.delete(J)
    },
  }
}
class _6 {
  nodesRef = { current: [] }
  events = L4()
  addNode(Q) {
    this.nodesRef.current.push(Q)
  }
  removeNode(Q) {
    let Z = this.nodesRef.current.findIndex((J) => J === Q)
    if (Z !== -1) this.nodesRef.current.splice(Z, 1)
  }
}
import { jsx as PK } from 'react/jsx-runtime'
var bz = D8.createContext(null)
bz.displayName = 'FloatingNodeContext'
var Rz = D8.createContext(null)
Rz.displayName = 'FloatingTreeContext'
var C1 = () => D8.useContext(bz)?.id || null,
  d1 = (Q) => {
    let Z = D8.useContext(Rz)
    return Q ?? Z
  }
function H6(Q) {
  let Z = q5(),
    J = d1(Q),
    z = C1()
  return (
    u(() => {
      if (!Z) return
      let q = { id: Z, parentId: z }
      return (
        J?.addNode(q),
        () => {
          J?.removeNode(q)
        }
      )
    }, [J, Z, z]),
    Z
  )
}
function H7(Q) {
  let { children: Z, id: J } = Q,
    z = C1()
  return PK(bz.Provider, {
    value: D8.useMemo(() => ({ id: J, parentId: z }), [J, z]),
    children: Z,
  })
}
function N7(Q) {
  let { children: Z, externalTree: J } = Q,
    z = R0(() => J ?? new _6()).current
  return PK(Rz.Provider, { value: z, children: Z })
}
function j5(Q) {
  return `data-base-ui-${Q}`
}
var AP = j5('safe-polygon'),
  OP = `button,[role="button"],select,[tabindex]:not([tabindex="-1"]),${u6}`
function t6(Q, Z, J) {
  if (J && !E5(J)) return 0
  if (typeof Q === 'number') return Q
  if (typeof Q === 'function') {
    let z = Q()
    if (typeof z === 'number') return z
    return z?.[Z]
  }
  return Q?.[Z]
}
import { jsx as YN } from 'react/jsx-runtime'
var vz = Y5.createContext({
  hasProvider: !1,
  timeoutMs: 0,
  delayRef: { current: 0 },
  initialDelayRef: { current: 0 },
  timeout: new p1(),
  currentIdRef: { current: null },
  currentContextRef: { current: null },
})
vz.displayName = 'FloatingDelayGroupContext'
function fz(Q) {
  let { children: Z, delay: J, timeoutMs: z = 0 } = Q,
    q = Y5.useRef(J),
    $ = Y5.useRef(J),
    X = Y5.useRef(null),
    K = Y5.useRef(null),
    G = c0()
  return YN(vz.Provider, {
    value: Y5.useMemo(
      () => ({
        hasProvider: !0,
        delayRef: q,
        initialDelayRef: $,
        currentIdRef: X,
        timeoutMs: z,
        currentContextRef: K,
        timeout: G,
      }),
      [z, G],
    ),
    children: Z,
  })
}
function gz(Q, Z = { open: !1 }) {
  let J = 'rootStore' in Q ? Q.rootStore : Q,
    z = J.useState('floatingId'),
    { open: q } = Z,
    $ = Y5.useContext(vz),
    {
      currentIdRef: X,
      delayRef: K,
      timeoutMs: G,
      initialDelayRef: Y,
      currentContextRef: W,
      hasProvider: U,
      timeout: B,
    } = $,
    [H, N] = Y5.useState(!1)
  return (
    u(() => {
      function _() {
        ;(N(!1),
          W.current?.setIsInstantPhase(!1),
          (X.current = null),
          (W.current = null),
          (K.current = Y.current))
      }
      if (!X.current) return
      if (!q && X.current === z) {
        if ((N(!1), G)) {
          let L = z
          return (
            B.start(G, () => {
              if (J.select('open') || (X.current && X.current !== L)) return
              _()
            }),
            () => {
              B.clear()
            }
          )
        }
        _()
      }
      return
    }, [q, z, X, K, G, Y, W, B, J]),
    u(() => {
      if (!q) return
      let _ = W.current,
        L = X.current
      if (
        (B.clear(),
        (W.current = { onOpenChange: J.setOpen, setIsInstantPhase: N }),
        (X.current = z),
        (K.current = { open: 0, close: t6(Y.current, 'close') }),
        L !== null && L !== z)
      )
        (N(!0), _?.setIsInstantPhase(!0), _?.onOpenChange(!1, $0(c.none)))
      else (N(!1), _?.setIsInstantPhase(!1))
    }, [q, z, J, X, K, G, Y, W, B]),
    u(() => {
      return () => {
        W.current = null
      }
    }, [W]),
    Y5.useMemo(
      () => ({ hasProvider: U, delayRef: K, isInstantPhase: H }),
      [U, K, H],
    )
  )
}
import * as x1 from 'react'
import * as k4 from 'react'
import { jsx as WN } from 'react/jsx-runtime'
var V5 = k4.forwardRef(function (Z, J) {
  let [z, q] = k4.useState()
  return (
    u(() => {
      if (LQ) q('button')
    }, []),
    WN('span', {
      ...Z,
      ref: J,
      style: s1,
      'aria-hidden': z ? void 0 : !0,
      ...{ tabIndex: 0, role: z },
      'data-base-ui-focus-guard': '',
    })
  )
})
V5.displayName = 'FocusGuard'
var EK = 0
function N6(Q, Z = {}) {
  let { preventScroll: J = !1, cancelPrevious: z = !0, sync: q = !1 } = Z
  if (z) cancelAnimationFrame(EK)
  let $ = () => Q?.focus({ preventScroll: J })
  if (q) $()
  else EK = requestAnimationFrame($)
}
var e6 = {
  inert: new WeakMap(),
  'aria-hidden': new WeakMap(),
  none: new WeakMap(),
}
function SK(Q) {
  if (Q === 'inert') return e6.inert
  if (Q === 'aria-hidden') return e6['aria-hidden']
  return e6.none
}
var M4 = new WeakSet(),
  j4 = {},
  mz = 0
var IK = (Q) => Q && (Q.host || IK(Q.parentNode)),
  UN = (Q, Z) =>
    Z.map((J) => {
      if (Q.contains(J)) return J
      let z = IK(J)
      if (Q.contains(z)) return z
      return null
    }).filter((J) => J != null)
function BN(Q, Z, J, z) {
  let $ = z ? 'inert' : J ? 'aria-hidden' : null,
    X = UN(Z, Q),
    K = new Set(),
    G = new Set(X),
    Y = []
  if (!j4['data-base-ui-inert']) j4['data-base-ui-inert'] = new WeakMap()
  let W = j4['data-base-ui-inert']
  ;(X.forEach(U), B(Z), K.clear())
  function U(H) {
    if (!H || K.has(H)) return
    if ((K.add(H), H.parentNode)) U(H.parentNode)
  }
  function B(H) {
    if (!H || G.has(H)) return
    ;[].forEach.call(H.children, (N) => {
      if (d5(N) === 'script') return
      if (K.has(N)) B(N)
      else {
        let _ = $ ? N.getAttribute($) : null,
          L = _ !== null && _ !== 'false',
          F = SK($),
          k = (F.get(N) || 0) + 1,
          V = (W.get(N) || 0) + 1
        if ((F.set(N, k), W.set(N, V), Y.push(N), k === 1 && L)) M4.add(N)
        if (V === 1) N.setAttribute('data-base-ui-inert', '')
        if (!L && $) N.setAttribute($, $ === 'inert' ? '' : 'true')
      }
    })
  }
  return (
    (mz += 1),
    () => {
      if (
        (Y.forEach((H) => {
          let N = SK($),
            L = (N.get(H) || 0) - 1,
            F = (W.get(H) || 0) - 1
          if ((N.set(H, L), W.set(H, F), !L)) {
            if (!M4.has(H) && $) H.removeAttribute($)
            M4.delete(H)
          }
          if (!F) H.removeAttribute('data-base-ui-inert')
        }),
        (mz -= 1),
        !mz)
      )
        ((e6.inert = new WeakMap()),
          (e6['aria-hidden'] = new WeakMap()),
          (e6.none = new WeakMap()),
          (M4 = new WeakSet()),
          (j4 = {}))
    }
  )
}
function CK(Q, Z = !1, J = !1) {
  let z = V0(Q[0]).body
  return BN(Q.concat(Array.from(z.querySelectorAll('[aria-live]'))), z, Z, J)
}
import * as H1 from 'react'
import * as uz from 'react-dom'
import { jsx as pz, jsxs as xK } from 'react/jsx-runtime'
var cz = H1.createContext(null)
cz.displayName = 'PortalContext'
var dz = () => H1.useContext(cz),
  _N = j5('portal')
function V4(Q = {}) {
  let { ref: Z, container: J, componentProps: z = S0, elementProps: q } = Q,
    $ = q5(),
    K = dz()?.portalNode,
    [G, Y] = H1.useState(null),
    [W, U] = H1.useState(null),
    B = m((L) => {
      if (L !== null) U(L)
    }),
    H = H1.useRef(null)
  u(() => {
    if (J === null) {
      if (H.current) ((H.current = null), U(null), Y(null))
      return
    }
    if ($ == null) return
    let L = (J && (n7(J) ? J : J.current)) ?? K ?? document.body
    if (L == null) {
      if (H.current) ((H.current = null), U(null), Y(null))
      return
    }
    if (H.current !== L) ((H.current = L), U(null), Y(L))
  }, [J, K, $])
  let N = f('div', z, { ref: [Z, B], props: [{ id: $, [_N]: '' }, q] })
  return { portalNode: W, portalSubtree: G && N ? uz.createPortal(N, G) : null }
}
var M2 = H1.forwardRef(function (Z, J) {
  let {
      children: z,
      container: q,
      className: $,
      render: X,
      renderGuards: K,
      ...G
    } = Z,
    { portalNode: Y, portalSubtree: W } = V4({
      container: q,
      ref: J,
      componentProps: Z,
      elementProps: G,
    }),
    U = H1.useRef(null),
    B = H1.useRef(null),
    H = H1.useRef(null),
    N = H1.useRef(null),
    [_, L] = H1.useState(null),
    F = _?.modal,
    k = _?.open,
    V = typeof K === 'boolean' ? K : !!_ && !_.modal && _.open && !!Y
  ;(H1.useEffect(() => {
    if (!Y || F) return
    function j(A) {
      if (Y && A.relatedTarget && n5(A)) (A.type === 'focusin' ? zz : wX)(Y)
    }
    return (
      Y.addEventListener('focusin', j, !0),
      Y.addEventListener('focusout', j, !0),
      () => {
        ;(Y.removeEventListener('focusin', j, !0),
          Y.removeEventListener('focusout', j, !0))
      }
    )
  }, [Y, F]),
    H1.useEffect(() => {
      if (!Y || k) return
      zz(Y)
    }, [k, Y]))
  let M = H1.useMemo(
    () => ({
      beforeOutsideRef: U,
      afterOutsideRef: B,
      beforeInsideRef: H,
      afterInsideRef: N,
      portalNode: Y,
      setFocusManagerState: L,
    }),
    [Y],
  )
  return xK(H1.Fragment, {
    children: [
      W,
      xK(cz.Provider, {
        value: M,
        children: [
          V &&
            Y &&
            pz(V5, {
              'data-type': 'outside',
              ref: U,
              onFocus: (j) => {
                if (n5(j, Y)) H.current?.focus()
                else {
                  let A = _ ? _.domReference : null
                  SQ(A)?.focus()
                }
              },
            }),
          V && Y && pz('span', { 'aria-owns': Y.id, style: d$ }),
          Y && uz.createPortal(z, Y),
          V &&
            Y &&
            pz(V5, {
              'data-type': 'outside',
              ref: B,
              onFocus: (j) => {
                if (n5(j, Y)) N.current?.focus()
                else {
                  let A = _ ? _.domReference : null
                  if ((M8(A)?.focus(), _?.closeOnFocusOut))
                    _?.onOpenChange(!1, $0(c.focusOut, j.nativeEvent))
                }
              },
            }),
        ],
      }),
    ],
  })
})
M2.displayName = 'FloatingPortal'
import { jsx as hK, jsxs as HN } from 'react/jsx-runtime'
function NN(Q, Z) {
  let J = o0(Q.target)
  if (Q instanceof J.KeyboardEvent) return 'keyboard'
  if (Q instanceof J.FocusEvent) return Z || 'keyboard'
  if ('pointerType' in Q) return Q.pointerType || 'keyboard'
  if ('touches' in Q) return 'touch'
  if (Q instanceof J.MouseEvent)
    return Z || (Q.detail === 0 ? 'keyboard' : 'mouse')
  return ''
}
var bK = 20,
  T8 = []
function lz() {
  T8 = T8.filter((Q) => {
    return Q.deref()?.isConnected
  })
}
function LN(Q) {
  if ((lz(), Q && d5(Q) !== 'body')) {
    if ((T8.push(new WeakRef(Q)), T8.length > bK)) T8 = T8.slice(-bK)
  }
}
function iz() {
  return (lz(), T8[T8.length - 1]?.deref())
}
function FN(Q) {
  if (!Q) return null
  let Z = W6()
  if (Jz(Q, Z)) return Q
  return Y6(Q, Z)[0] || Q
}
function kN(Q) {
  if (!Q || !Q.isConnected) return !1
  if (typeof Q.checkVisibility === 'function') return Q.checkVisibility()
  return R1(Q).display !== 'none'
}
function RK(Q, Z) {
  if (
    !Z.current.includes('floating') &&
    !Q.getAttribute('role')?.includes('dialog')
  )
    return
  let J = W6(),
    q = VX(Q, J).filter((X) => {
      let K = X.getAttribute('data-tabindex') || ''
      return Jz(X, J) || (X.hasAttribute('data-tabindex') && !K.startsWith('-'))
    }),
    $ = Q.getAttribute('tabindex')
  if (Z.current.includes('floating') || q.length === 0) {
    if ($ !== '0') Q.setAttribute('tabindex', '0')
  } else if (
    $ !== '-1' ||
    (Q.hasAttribute('data-tabindex') &&
      Q.getAttribute('data-tabindex') !== '-1')
  )
    (Q.setAttribute('tabindex', '-1'), Q.setAttribute('data-tabindex', '-1'))
}
function s2(Q) {
  let {
      context: Z,
      children: J,
      disabled: z = !1,
      initialFocus: q = !0,
      returnFocus: $ = !0,
      restoreFocus: X = !1,
      modal: K = !0,
      closeOnFocusOut: G = !0,
      openInteractionType: Y = '',
      nextFocusableElement: W,
      previousFocusableElement: U,
      beforeContentFocusGuardRef: B,
      externalTree: H,
    } = Q,
    N = 'rootStore' in Z ? Z.rootStore : Z,
    _ = N.useState('open'),
    L = N.useState('domReferenceElement'),
    F = N.useState('floatingElement'),
    { events: k, dataRef: V } = N.context,
    M = m(() => V.current.floatingContext?.nodeId),
    j = q === !1,
    A = i9(L) && j,
    w = x1.useRef(['content']),
    O = s0(q),
    S = s0($),
    x = s0(Y),
    h = d1(H),
    I = dz(),
    y = x1.useRef(null),
    T = x1.useRef(null),
    R = x1.useRef(!1),
    v = x1.useRef(!1),
    P = x1.useRef(!1),
    D = x1.useRef(-1),
    E = x1.useRef(''),
    C = x1.useRef(''),
    a = x1.useRef(null),
    p = x1.useRef(null),
    Q0 = Y1(a, B, I?.beforeInsideRef),
    g = Y1(p, I?.afterInsideRef),
    Z0 = c0(),
    i = c0(),
    X0 = K5(),
    Y0 = I != null,
    J0 = m2(F),
    U0 = m((r = J0) => {
      return r ? Y6(r, W6()) : []
    }),
    K0 = m((r) => {
      let t = U0(r)
      return w.current
        .map(() => t)
        .filter(Boolean)
        .flat()
    })
  ;(x1.useEffect(() => {
    if (z || !K) return
    function r(e) {
      if (e.key === 'Tab') {
        if (F0(J0, B1(V0(J0))) && U0().length === 0 && !A) A1(e)
      }
    }
    let t = V0(J0)
    return (
      t.addEventListener('keydown', r),
      () => {
        t.removeEventListener('keydown', r)
      }
    )
  }, [z, L, J0, K, w, A, U0, K0]),
    x1.useEffect(() => {
      if (z || !_) return
      let r = V0(J0)
      function t() {
        P.current = !1
      }
      function e(d) {
        let o = K1(d),
          l = F0(F, o) || F0(L, o) || F0(I?.portalNode, o)
        if (
          ((P.current = !l),
          (C.current = d.pointerType || 'keyboard'),
          o?.closest(`[${m6}]`))
        )
          v.current = !0
      }
      function s() {
        C.current = 'keyboard'
      }
      return (
        r.addEventListener('pointerdown', e, !0),
        r.addEventListener('pointerup', t, !0),
        r.addEventListener('pointercancel', t, !0),
        r.addEventListener('keydown', s, !0),
        () => {
          ;(r.removeEventListener('pointerdown', e, !0),
            r.removeEventListener('pointerup', t, !0),
            r.removeEventListener('pointercancel', t, !0),
            r.removeEventListener('keydown', s, !0))
        }
      )
    }, [z, F, L, J0, _, I]),
    x1.useEffect(() => {
      if (z || !G) return
      let r = V0(J0)
      function t() {
        ;((v.current = !0),
          i.start(0, () => {
            v.current = !1
          }))
      }
      function e(q0) {
        let n = K1(q0),
          H0 = U0().indexOf(n)
        if (H0 !== -1) D.current = H0
      }
      function s(q0) {
        let { relatedTarget: n, currentTarget: _0 } = q0,
          H0 = K1(q0)
        queueMicrotask(() => {
          let W0 = M(),
            O0 = N.context.triggerElements,
            f0 =
              n?.hasAttribute(j5('focus-guard')) &&
              [
                a.current,
                p.current,
                I?.beforeInsideRef.current,
                I?.afterInsideRef.current,
                I?.beforeOutsideRef.current,
                I?.afterOutsideRef.current,
                o5(U),
                o5(W),
              ].includes(n),
            A0 = !(
              F0(L, n) ||
              F0(F, n) ||
              F0(n, F) ||
              F0(I?.portalNode, n) ||
              (n != null && O0.hasElement(n)) ||
              O0.hasMatchingElement((T0) => F0(T0, n)) ||
              f0 ||
              (h &&
                (W2(h.nodesRef.current, W0).find(
                  (T0) =>
                    F0(T0.context?.elements.floating, n) ||
                    F0(T0.context?.elements.domReference, n),
                ) ||
                  eJ(h.nodesRef.current, W0).find(
                    (T0) =>
                      [
                        T0.context?.elements.floating,
                        m2(T0.context?.elements.floating),
                      ].includes(n) || T0.context?.elements.domReference === n,
                  )))
            )
          if (_0 === L && J0) RK(J0, w)
          if (X && _0 !== L && !kN(H0) && B1(r) === r.body) {
            if (m0(J0)) {
              if ((J0.focus(), X === 'popup')) {
                X0.request(() => {
                  J0.focus()
                })
                return
              }
            }
            let T0 = D.current,
              y0 = U0(),
              P0 = y0[T0] || y0[y0.length - 1] || J0
            if (m0(P0)) P0.focus()
          }
          if (V.current.insideReactTree) {
            V.current.insideReactTree = !1
            return
          }
          if ((A ? !0 : !K) && n && A0 && !v.current && (A || n !== iz()))
            ((R.current = !0), N.setOpen(!1, $0(c.focusOut, q0)))
        })
      }
      function d() {
        if (P.current) return
        ;((V.current.insideReactTree = !0),
          Z0.start(0, () => {
            V.current.insideReactTree = !1
          }))
      }
      let o = m0(L) ? L : null,
        l = []
      if (!F && !o) return
      if (o)
        (o.addEventListener('focusout', s),
          o.addEventListener('pointerdown', t),
          l.push(() => {
            ;(o.removeEventListener('focusout', s),
              o.removeEventListener('pointerdown', t))
          }))
      if (F) {
        if (
          (F.addEventListener('focusin', e),
          F.addEventListener('focusout', s),
          I)
        )
          (F.addEventListener('focusout', d, !0),
            l.push(() => {
              F.removeEventListener('focusout', d, !0)
            }))
        l.push(() => {
          ;(F.removeEventListener('focusin', e),
            F.removeEventListener('focusout', s))
        })
      }
      return () => {
        l.forEach((q0) => {
          q0()
        })
      }
    }, [z, L, F, J0, K, h, I, N, G, X, U0, A, M, w, V, Z0, i, X0, W, U]),
    x1.useEffect(() => {
      if (z || !F || !_) return
      let r = Array.from(
          I?.portalNode?.querySelectorAll(`[${j5('portal')}]`) || [],
        ),
        e = (h ? eJ(h.nodesRef.current, M()) : []).find((d) =>
          i9(d.context?.elements.domReference || null),
        )?.context?.elements.domReference,
        s = [
          F,
          e,
          ...r,
          y.current,
          T.current,
          a.current,
          p.current,
          I?.beforeOutsideRef.current,
          I?.afterOutsideRef.current,
          o5(U),
          o5(W),
          A ? L : null,
        ].filter((d) => d != null)
      return CK(s, K || A)
    }, [_, z, L, F, K, w, I, A, h, M, W, U]),
    u(() => {
      if (!_ || z || !m0(J0)) return
      let r = V0(J0),
        t = B1(r)
      queueMicrotask(() => {
        let e = K0(J0),
          s = O.current,
          d = typeof s === 'function' ? s(x.current || '') : s
        if (d === void 0 || d === !1) return
        let o
        if (d === !0 || d === null) o = e[0] || J0
        else o = o5(d)
        if (((o = o || e[0] || J0), F0(J0, t))) return
        N6(o, { preventScroll: o === J0 })
      })
    }, [z, _, J0, j, K0, O, x]),
    u(() => {
      if (z || !J0) return
      let r = V0(J0),
        t = B1(r)
      LN(t)
      function e(o) {
        if (!o.open) E.current = NN(o.nativeEvent, C.current)
        if (o.reason === c.triggerHover && o.nativeEvent.type === 'mouseleave')
          R.current = !0
        if (o.reason !== c.outsidePress) return
        if (o.nested) R.current = !1
        else if (MQ(o.nativeEvent) || jQ(o.nativeEvent)) R.current = !1
        else {
          let l = !1
          if (
            (document.createElement('div').focus({
              get preventScroll() {
                return ((l = !0), !1)
              },
            }),
            l)
          )
            R.current = !1
          else R.current = !0
        }
      }
      k.on('openchange', e)
      let s = r.createElement('span')
      if (
        (s.setAttribute('tabindex', '-1'),
        s.setAttribute('aria-hidden', 'true'),
        Object.assign(s.style, s1),
        Y0 && L)
      )
        L.insertAdjacentElement('afterend', s)
      function d() {
        let o = S.current,
          l = typeof o === 'function' ? o(E.current) : o
        if (l === void 0 || l === !1) return null
        if (l === null) l = !0
        if (typeof l === 'boolean') {
          let n = L || iz()
          return n && n.isConnected ? n : s
        }
        let q0 = L || iz() || s
        return o5(l) || q0
      }
      return () => {
        k.off('openchange', e)
        let o = B1(r),
          l =
            F0(F, o) ||
            (h &&
              W2(h.nodesRef.current, M(), !1).some((n) =>
                F0(n.context?.elements.floating, o),
              )),
          q0 = d()
        queueMicrotask(() => {
          let n = FN(q0),
            _0 = typeof S.current !== 'boolean'
          if (
            S.current &&
            !R.current &&
            m0(n) &&
            (!_0 && n !== o && o !== r.body ? l : !0)
          )
            n.focus({ preventScroll: !0 })
          ;(s.remove(), (R.current = !1))
        })
      }
    }, [z, F, J0, S, V, k, h, Y0, L, M]),
    u(() => {
      if (!N8 || _ || !F) return
      let r = B1(V0(F))
      if (!m0(r) || !X6(r)) return
      if (F0(F, r)) r.blur()
    }, [_, F]),
    u(() => {
      if (z || !I) return
      return (
        I.setFocusManagerState({
          modal: K,
          closeOnFocusOut: G,
          open: _,
          onOpenChange: N.setOpen,
          domReference: L,
        }),
        () => {
          I.setFocusManagerState(null)
        }
      )
    }, [z, I, K, _, N, G, L]),
    u(() => {
      if (z || !J0) return
      return (
        RK(J0, w),
        () => {
          queueMicrotask(lz)
        }
      )
    }, [z, J0, w]))
  let b = !z && (K ? !A : !0) && (Y0 || K)
  return HN(x1.Fragment, {
    children: [
      b &&
        hK(V5, {
          'data-type': 'inside',
          ref: Q0,
          onFocus: (r) => {
            if (K) {
              let t = K0()
              N6(t[t.length - 1])
            } else if (I?.portalNode)
              if (((R.current = !1), n5(r, I.portalNode))) M8(L)?.focus()
              else o5(U ?? I.beforeOutsideRef)?.focus()
          },
        }),
      J,
      b &&
        hK(V5, {
          'data-type': 'inside',
          ref: g,
          onFocus: (r) => {
            if (K) N6(K0()[0])
            else if (I?.portalNode) {
              if (G) R.current = !0
              if (n5(r, I.portalNode)) SQ(L)?.focus()
              else o5(W ?? I.afterOutsideRef)?.focus()
            }
          },
        }),
    ],
  })
}
import * as L7 from 'react'
function Q2(Q, Z = {}) {
  let J = 'rootStore' in Q ? Q.rootStore : Q,
    z = J.context.dataRef,
    {
      enabled: q = !0,
      event: $ = 'click',
      toggle: X = !0,
      ignoreMouse: K = !1,
      stickIfOpen: G = !0,
      touchOpenDelay: Y = 0,
      reason: W = c.triggerPress,
    } = Z,
    U = L7.useRef(void 0),
    B = K5(),
    H = c0(),
    N = L7.useMemo(
      () => ({
        onPointerDown(_) {
          U.current = _.pointerType
        },
        onMouseDown(_) {
          let L = U.current,
            F = _.nativeEvent,
            k = J.select('open')
          if (_.button !== 0 || $ === 'click' || (E5(L, !0) && K)) return
          let V = z.current.openEvent,
            M = V?.type,
            j = J.select('domReferenceElement') !== _.currentTarget,
            A =
              (k && j) ||
              !(k && X && (V && G ? M === 'click' || M === 'mousedown' : !0))
          if (X6(F.target)) {
            let O = $0(W, F, F.target)
            if (A && L === 'touch' && Y > 0)
              H.start(Y, () => {
                J.setOpen(!0, O)
              })
            else J.setOpen(A, O)
            return
          }
          let w = _.currentTarget
          B.request(() => {
            let O = $0(W, F, w)
            if (A && L === 'touch' && Y > 0)
              H.start(Y, () => {
                J.setOpen(!0, O)
              })
            else J.setOpen(A, O)
          })
        },
        onClick(_) {
          if ($ === 'mousedown-only') return
          let L = U.current
          if ($ === 'mousedown' && L) {
            U.current = void 0
            return
          }
          if (E5(L, !0) && K) return
          let F = J.select('open'),
            k = z.current.openEvent,
            V = J.select('domReferenceElement') !== _.currentTarget,
            M = (F && V) || !(F && X && (k && G ? VQ(k) : !0)),
            j = $0(W, _.nativeEvent, _.currentTarget)
          if (M && L === 'touch' && Y > 0)
            H.start(Y, () => {
              J.setOpen(!0, j)
            })
          else J.setOpen(M, j)
        },
        onKeyDown() {
          U.current = void 0
        },
      }),
      [z, $, K, J, G, X, B, H, Y, W],
    )
  return L7.useMemo(() => (q ? { reference: N } : S0), [q, N])
}
import * as n1 from 'react'
function MN(Q, Z) {
  let J = null,
    z = null,
    q = !1
  return {
    contextElement: Q || void 0,
    getBoundingClientRect() {
      let $ = Q?.getBoundingClientRect() || { width: 0, height: 0, x: 0, y: 0 },
        X = Z.axis === 'x' || Z.axis === 'both',
        K = Z.axis === 'y' || Z.axis === 'both',
        G =
          ['mouseenter', 'mousemove'].includes(
            Z.dataRef.current.openEvent?.type || '',
          ) && Z.pointerType !== 'touch',
        Y = $.width,
        W = $.height,
        U = $.x,
        B = $.y
      if (J == null && Z.x && X) J = $.x - Z.x
      if (z == null && Z.y && K) z = $.y - Z.y
      if (((U -= J || 0), (B -= z || 0), (Y = 0), (W = 0), !q || G))
        ((Y = Z.axis === 'y' ? $.width : 0),
          (W = Z.axis === 'x' ? $.height : 0),
          (U = X && Z.x != null ? Z.x : U),
          (B = K && Z.y != null ? Z.y : B))
      else if (q && !G)
        ((W = Z.axis === 'x' ? $.height : W),
          (Y = Z.axis === 'y' ? $.width : Y))
      return (
        (q = !0),
        {
          width: Y,
          height: W,
          x: U,
          y: B,
          top: B,
          right: U + Y,
          bottom: B + W,
          left: U,
        }
      )
    },
  }
}
function vK(Q) {
  return Q != null && Q.clientX != null
}
function rz(Q, Z = {}) {
  let J = 'rootStore' in Q ? Q.rootStore : Q,
    z = J.useState('open'),
    q = J.useState('floatingElement'),
    $ = J.useState('domReferenceElement'),
    X = J.context.dataRef,
    { enabled: K = !0, axis: G = 'both' } = Z,
    Y = n1.useRef(!1),
    W = n1.useRef(null),
    [U, B] = n1.useState(),
    [H, N] = n1.useState([]),
    _ = m((M, j, A) => {
      if (Y.current) return
      if (X.current.openEvent && !vK(X.current.openEvent)) return
      J.set(
        'positionReference',
        MN(A ?? $, { x: M, y: j, axis: G, dataRef: X, pointerType: U }),
      )
    }),
    L = m((M) => {
      if (!z) _(M.clientX, M.clientY, M.currentTarget)
      else if (!W.current) N([])
    }),
    F = E5(U) ? q : z,
    k = n1.useCallback(() => {
      if (!F || !K) return
      let M = o0(q)
      function j(A) {
        let w = K1(A)
        if (!F0(q, w)) _(A.clientX, A.clientY)
        else (M.removeEventListener('mousemove', j), (W.current = null))
      }
      if (!X.current.openEvent || vK(X.current.openEvent)) {
        M.addEventListener('mousemove', j)
        let A = () => {
          ;(M.removeEventListener('mousemove', j), (W.current = null))
        }
        return ((W.current = A), A)
      }
      J.set('positionReference', $)
      return
    }, [F, K, q, X, $, J, _])
  ;(n1.useEffect(() => {
    return k()
  }, [k, H]),
    n1.useEffect(() => {
      if (K && !q) Y.current = !1
    }, [K, q]),
    n1.useEffect(() => {
      if (!K && z) Y.current = !0
    }, [K, z]))
  let V = n1.useMemo(() => {
    function M(j) {
      B(j.pointerType)
    }
    return {
      onPointerDown: M,
      onPointerEnter: M,
      onMouseMove: L,
      onMouseEnter: L,
    }
  }, [L])
  return n1.useMemo(() => (K ? { reference: V, trigger: V } : {}), [K, V])
}
import * as h5 from 'react'
function fK(Q, Z, J) {
  let { reference: z, floating: q } = Q,
    $ = X5(Z),
    X = s9(Z),
    K = a9(X),
    G = u1(Z),
    Y = $ === 'y',
    W = z.x + z.width / 2 - q.width / 2,
    U = z.y + z.height / 2 - q.height / 2,
    B = z[K] / 2 - q[K] / 2,
    H
  switch (G) {
    case 'top':
      H = { x: W, y: z.y - q.height }
      break
    case 'bottom':
      H = { x: W, y: z.y + z.height }
      break
    case 'right':
      H = { x: z.x + z.width, y: U }
      break
    case 'left':
      H = { x: z.x - q.width, y: U }
      break
    default:
      H = { x: z.x, y: z.y }
  }
  switch (a5(Z)) {
    case 'start':
      H[X] -= B * (J && Y ? -1 : 1)
      break
    case 'end':
      H[X] += B * (J && Y ? -1 : 1)
      break
  }
  return H
}
async function pK(Q, Z) {
  var J
  if (Z === void 0) Z = {}
  let { x: z, y: q, platform: $, rects: X, elements: K, strategy: G } = Q,
    {
      boundary: Y = 'clippingAncestors',
      rootBoundary: W = 'viewport',
      elementContext: U = 'floating',
      altBoundary: B = !1,
      padding: H = 0,
    } = r5(Z, Q),
    N = wQ(H),
    L = K[B ? (U === 'floating' ? 'reference' : 'floating') : U],
    F = K6(
      await $.getClippingRect({
        element: (
          (J = await ($.isElement == null ? void 0 : $.isElement(L))) != null
            ? J
            : !0
        )
          ? L
          : L.contextElement ||
            (await ($.getDocumentElement == null
              ? void 0
              : $.getDocumentElement(K.floating))),
        boundary: Y,
        rootBoundary: W,
        strategy: G,
      }),
    ),
    k =
      U === 'floating'
        ? { x: z, y: q, width: X.floating.width, height: X.floating.height }
        : X.reference,
    V = await ($.getOffsetParent == null
      ? void 0
      : $.getOffsetParent(K.floating)),
    M = (await ($.isElement == null ? void 0 : $.isElement(V)))
      ? (await ($.getScale == null ? void 0 : $.getScale(V))) || { x: 1, y: 1 }
      : { x: 1, y: 1 },
    j = K6(
      $.convertOffsetParentRelativeRectToViewportRelativeRect
        ? await $.convertOffsetParentRelativeRectToViewportRelativeRect({
            elements: K,
            rect: k,
            offsetParent: V,
            strategy: G,
          })
        : k,
    )
  return {
    top: (F.top - j.top + N.top) / M.y,
    bottom: (j.bottom - F.bottom + N.bottom) / M.y,
    left: (F.left - j.left + N.left) / M.x,
    right: (j.right - F.right + N.right) / M.x,
  }
}
var uK = async (Q, Z, J) => {
  let {
      placement: z = 'bottom',
      strategy: q = 'absolute',
      middleware: $ = [],
      platform: X,
    } = J,
    K = $.filter(Boolean),
    G = await (X.isRTL == null ? void 0 : X.isRTL(Z)),
    Y = await X.getElementRects({ reference: Q, floating: Z, strategy: q }),
    { x: W, y: U } = fK(Y, z, G),
    B = z,
    H = {},
    N = 0
  for (let L = 0; L < K.length; L++) {
    var _
    let { name: F, fn: k } = K[L],
      {
        x: V,
        y: M,
        data: j,
        reset: A,
      } = await k({
        x: W,
        y: U,
        initialPlacement: z,
        placement: B,
        strategy: q,
        middlewareData: H,
        rects: Y,
        platform: {
          ...X,
          detectOverflow: (_ = X.detectOverflow) != null ? _ : pK,
        },
        elements: { reference: Q, floating: Z },
      })
    if (
      ((W = V != null ? V : W),
      (U = M != null ? M : U),
      (H = { ...H, [F]: { ...H[F], ...j } }),
      A && N <= 50)
    ) {
      if ((N++, typeof A === 'object')) {
        if (A.placement) B = A.placement
        if (A.rects)
          Y =
            A.rects === !0
              ? await X.getElementRects({
                  reference: Q,
                  floating: Z,
                  strategy: q,
                })
              : A.rects
        ;({ x: W, y: U } = fK(Y, B, G))
      }
      L = -1
    }
  }
  return { x: W, y: U, placement: B, strategy: q, middlewareData: H }
}
var cK = function (Q) {
  if (Q === void 0) Q = {}
  return {
    name: 'flip',
    options: Q,
    async fn(Z) {
      var J, z
      let {
          placement: q,
          middlewareData: $,
          rects: X,
          initialPlacement: K,
          platform: G,
          elements: Y,
        } = Z,
        {
          mainAxis: W = !0,
          crossAxis: U = !0,
          fallbackPlacements: B,
          fallbackStrategy: H = 'bestFit',
          fallbackAxisSideDirection: N = 'none',
          flipAlignment: _ = !0,
          ...L
        } = r5(Q, Z)
      if ((J = $.arrow) != null && J.alignmentOffset) return {}
      let F = u1(q),
        k = X5(K),
        V = u1(K) === K,
        M = await (G.isRTL == null ? void 0 : G.isRTL(Y.floating)),
        j = B || (V || !_ ? [l9(K)] : BX(K)),
        A = N !== 'none'
      if (!B && A) j.push(..._X(K, _, N, M))
      let w = [K, ...j],
        O = await G.detectOverflow(Z, L),
        S = [],
        x = ((z = $.flip) == null ? void 0 : z.overflows) || []
      if (W) S.push(O[F])
      if (U) {
        let T = UX(q, X, M)
        S.push(O[T[0]], O[T[1]])
      }
      if (
        ((x = [...x, { placement: q, overflows: S }]), !S.every((T) => T <= 0))
      ) {
        var h, I
        let T = (((h = $.flip) == null ? void 0 : h.index) || 0) + 1,
          R = w[T]
        if (R) {
          if (
            !(U === 'alignment' ? k !== X5(R) : !1) ||
            x.every((D) => (X5(D.placement) === k ? D.overflows[0] > 0 : !0))
          )
            return { data: { index: T, overflows: x }, reset: { placement: R } }
        }
        let v =
          (I = x
            .filter((P) => P.overflows[0] <= 0)
            .sort((P, D) => P.overflows[1] - D.overflows[1])[0]) == null
            ? void 0
            : I.placement
        if (!v)
          switch (H) {
            case 'bestFit': {
              var y
              let P =
                (y = x
                  .filter((D) => {
                    if (A) {
                      let E = X5(D.placement)
                      return E === k || E === 'y'
                    }
                    return !0
                  })
                  .map((D) => [
                    D.placement,
                    D.overflows.filter((E) => E > 0).reduce((E, C) => E + C, 0),
                  ])
                  .sort((D, E) => D[1] - E[1])[0]) == null
                  ? void 0
                  : y[0]
              if (P) v = P
              break
            }
            case 'initialPlacement':
              v = K
              break
          }
        if (q !== v) return { reset: { placement: v } }
      }
      return {}
    },
  }
}
function gK(Q, Z) {
  return {
    top: Q.top - Z.height,
    right: Q.right - Z.width,
    bottom: Q.bottom - Z.height,
    left: Q.left - Z.width,
  }
}
function mK(Q) {
  return WX.some((Z) => Q[Z] >= 0)
}
var dK = function (Q) {
  if (Q === void 0) Q = {}
  return {
    name: 'hide',
    options: Q,
    async fn(Z) {
      let { rects: J, platform: z } = Z,
        { strategy: q = 'referenceHidden', ...$ } = r5(Q, Z)
      switch (q) {
        case 'referenceHidden': {
          let X = await z.detectOverflow(Z, {
              ...$,
              elementContext: 'reference',
            }),
            K = gK(X, J.reference)
          return { data: { referenceHiddenOffsets: K, referenceHidden: mK(K) } }
        }
        case 'escaped': {
          let X = await z.detectOverflow(Z, { ...$, altBoundary: !0 }),
            K = gK(X, J.floating)
          return { data: { escapedOffsets: K, escaped: mK(K) } }
        }
        default:
          return {}
      }
    },
  }
}
var iK = new Set(['left', 'top'])
async function jN(Q, Z) {
  let { placement: J, platform: z, elements: q } = Q,
    $ = await (z.isRTL == null ? void 0 : z.isRTL(q.floating)),
    X = u1(J),
    K = a5(J),
    G = X5(J) === 'y',
    Y = iK.has(X) ? -1 : 1,
    W = $ && G ? -1 : 1,
    U = r5(Z, Q),
    {
      mainAxis: B,
      crossAxis: H,
      alignmentAxis: N,
    } = typeof U === 'number'
      ? { mainAxis: U, crossAxis: 0, alignmentAxis: null }
      : {
          mainAxis: U.mainAxis || 0,
          crossAxis: U.crossAxis || 0,
          alignmentAxis: U.alignmentAxis,
        }
  if (K && typeof N === 'number') H = K === 'end' ? N * -1 : N
  return G ? { x: H * W, y: B * Y } : { x: B * Y, y: H * W }
}
var lK = function (Q) {
    if (Q === void 0) Q = 0
    return {
      name: 'offset',
      options: Q,
      async fn(Z) {
        var J, z
        let { x: q, y: $, placement: X, middlewareData: K } = Z,
          G = await jN(Z, Q)
        if (
          X === ((J = K.offset) == null ? void 0 : J.placement) &&
          (z = K.arrow) != null &&
          z.alignmentOffset
        )
          return {}
        return { x: q + G.x, y: $ + G.y, data: { ...G, placement: X } }
      },
    }
  },
  rK = function (Q) {
    if (Q === void 0) Q = {}
    return {
      name: 'shift',
      options: Q,
      async fn(Z) {
        let { x: J, y: z, placement: q, platform: $ } = Z,
          {
            mainAxis: X = !0,
            crossAxis: K = !1,
            limiter: G = {
              fn: (F) => {
                let { x: k, y: V } = F
                return { x: k, y: V }
              },
            },
            ...Y
          } = r5(Q, Z),
          W = { x: J, y: z },
          U = await $.detectOverflow(Z, Y),
          B = X5(u1(q)),
          H = OQ(B),
          N = W[H],
          _ = W[B]
        if (X) {
          let F = H === 'y' ? 'top' : 'left',
            k = H === 'y' ? 'bottom' : 'right',
            V = N + U[F],
            M = N - U[k]
          N = r9(V, N, M)
        }
        if (K) {
          let F = B === 'y' ? 'top' : 'left',
            k = B === 'y' ? 'bottom' : 'right',
            V = _ + U[F],
            M = _ - U[k]
          _ = r9(V, _, M)
        }
        let L = G.fn({ ...Z, [H]: N, [B]: _ })
        return {
          ...L,
          data: { x: L.x - J, y: L.y - z, enabled: { [H]: X, [B]: K } },
        }
      },
    }
  },
  aK = function (Q) {
    if (Q === void 0) Q = {}
    return {
      options: Q,
      fn(Z) {
        let { x: J, y: z, placement: q, rects: $, middlewareData: X } = Z,
          { offset: K = 0, mainAxis: G = !0, crossAxis: Y = !0 } = r5(Q, Z),
          W = { x: J, y: z },
          U = X5(q),
          B = OQ(U),
          H = W[B],
          N = W[U],
          _ = r5(K, Z),
          L =
            typeof _ === 'number'
              ? { mainAxis: _, crossAxis: 0 }
              : { mainAxis: 0, crossAxis: 0, ..._ }
        if (G) {
          let V = B === 'y' ? 'height' : 'width',
            M = $.reference[B] - $.floating[V] + L.mainAxis,
            j = $.reference[B] + $.reference[V] - L.mainAxis
          if (H < M) H = M
          else if (H > j) H = j
        }
        if (Y) {
          var F, k
          let V = B === 'y' ? 'width' : 'height',
            M = iK.has(u1(q)),
            j =
              $.reference[U] -
              $.floating[V] +
              (M ? ((F = X.offset) == null ? void 0 : F[U]) || 0 : 0) +
              (M ? 0 : L.crossAxis),
            A =
              $.reference[U] +
              $.reference[V] +
              (M ? 0 : ((k = X.offset) == null ? void 0 : k[U]) || 0) -
              (M ? L.crossAxis : 0)
          if (N < j) N = j
          else if (N > A) N = A
        }
        return { [B]: H, [U]: N }
      },
    }
  },
  sK = function (Q) {
    if (Q === void 0) Q = {}
    return {
      name: 'size',
      options: Q,
      async fn(Z) {
        var J, z
        let { placement: q, rects: $, platform: X, elements: K } = Z,
          { apply: G = () => {}, ...Y } = r5(Q, Z),
          W = await X.detectOverflow(Z, Y),
          U = u1(q),
          B = a5(q),
          H = X5(q) === 'y',
          { width: N, height: _ } = $.floating,
          L,
          F
        if (U === 'top' || U === 'bottom')
          ((L = U),
            (F =
              B ===
              ((await (X.isRTL == null ? void 0 : X.isRTL(K.floating)))
                ? 'start'
                : 'end')
                ? 'left'
                : 'right'))
        else ((F = U), (L = B === 'end' ? 'top' : 'bottom'))
        let k = _ - W.top - W.bottom,
          V = N - W.left - W.right,
          M = L8(_ - W[L], k),
          j = L8(N - W[F], V),
          A = !Z.middlewareData.shift,
          w = M,
          O = j
        if ((J = Z.middlewareData.shift) != null && J.enabled.x) O = V
        if ((z = Z.middlewareData.shift) != null && z.enabled.y) w = k
        if (A && !B) {
          let x = a1(W.left, 0),
            h = a1(W.right, 0),
            I = a1(W.top, 0),
            y = a1(W.bottom, 0)
          if (H) O = N - 2 * (x !== 0 || h !== 0 ? x + h : a1(W.left, W.right))
          else w = _ - 2 * (I !== 0 || y !== 0 ? I + y : a1(W.top, W.bottom))
        }
        await G({ ...Z, availableWidth: O, availableHeight: w })
        let S = await X.getDimensions(K.floating)
        if (N !== S.width || _ !== S.height) return { reset: { rects: !0 } }
        return {}
      },
    }
  }
function eK(Q) {
  let Z = R1(Q),
    J = parseFloat(Z.width) || 0,
    z = parseFloat(Z.height) || 0,
    q = m0(Q),
    $ = q ? Q.offsetWidth : J,
    X = q ? Q.offsetHeight : z,
    K = F8(J) !== $ || F8(z) !== X
  if (K) ((J = $), (z = X))
  return { width: J, height: z, $: K }
}
function sz(Q) {
  return !C0(Q) ? Q.contextElement : Q
}
function Q9(Q) {
  let Z = sz(Q)
  if (!m0(Z)) return l5(1)
  let J = Z.getBoundingClientRect(),
    { width: z, height: q, $ } = eK(Z),
    X = ($ ? F8(J.width) : J.width) / z,
    K = ($ ? F8(J.height) : J.height) / q
  if (!X || !Number.isFinite(X)) X = 1
  if (!K || !Number.isFinite(K)) K = 1
  return { x: X, y: K }
}
var VN = l5(0)
function QG(Q) {
  let Z = o0(Q)
  if (!v6() || !Z.visualViewport) return VN
  return { x: Z.visualViewport.offsetLeft, y: Z.visualViewport.offsetTop }
}
function AN(Q, Z, J) {
  if (Z === void 0) Z = !1
  if (!J || (Z && J !== o0(Q))) return !1
  return Z
}
function L6(Q, Z, J, z) {
  if (Z === void 0) Z = !1
  if (J === void 0) J = !1
  let q = Q.getBoundingClientRect(),
    $ = sz(Q),
    X = l5(1)
  if (Z)
    if (z) {
      if (C0(z)) X = Q9(z)
    } else X = Q9(Q)
  let K = AN($, J, z) ? QG($) : l5(0),
    G = (q.left + K.x) / X.x,
    Y = (q.top + K.y) / X.y,
    W = q.width / X.x,
    U = q.height / X.y
  if ($) {
    let B = o0($),
      H = z && C0(z) ? o0(z) : z,
      N = B,
      _ = t7(N)
    while (_ && z && H !== N) {
      let L = Q9(_),
        F = _.getBoundingClientRect(),
        k = R1(_),
        V = F.left + (_.clientLeft + parseFloat(k.paddingLeft)) * L.x,
        M = F.top + (_.clientTop + parseFloat(k.paddingTop)) * L.y
      ;((G *= L.x),
        (Y *= L.y),
        (W *= L.x),
        (U *= L.y),
        (G += V),
        (Y += M),
        (N = o0(_)),
        (_ = t7(N)))
    }
  }
  return K6({ width: W, height: U, x: G, y: Y })
}
function A4(Q, Z) {
  let J = v9(Q).scrollLeft
  if (!Z) return L6(i5(Q)).left + J
  return Z.left + J
}
function ZG(Q, Z) {
  let J = Q.getBoundingClientRect(),
    z = J.left + Z.scrollLeft - A4(Q, J),
    q = J.top + Z.scrollTop
  return { x: z, y: q }
}
function ON(Q) {
  let { elements: Z, rect: J, offsetParent: z, strategy: q } = Q,
    $ = q === 'fixed',
    X = i5(z),
    K = Z ? R9(Z.floating) : !1
  if (z === X || (K && $)) return J
  let G = { scrollLeft: 0, scrollTop: 0 },
    Y = l5(1),
    W = l5(0),
    U = m0(z)
  if (U || (!U && !$)) {
    if (d5(z) !== 'body' || K2(X)) G = v9(z)
    if (m0(z)) {
      let H = L6(z)
      ;((Y = Q9(z)), (W.x = H.x + z.clientLeft), (W.y = H.y + z.clientTop))
    }
  }
  let B = X && !U && !$ ? ZG(X, G) : l5(0)
  return {
    width: J.width * Y.x,
    height: J.height * Y.y,
    x: J.x * Y.x - G.scrollLeft * Y.x + W.x + B.x,
    y: J.y * Y.y - G.scrollTop * Y.y + W.y + B.y,
  }
}
function wN(Q) {
  return Array.from(Q.getClientRects())
}
function yN(Q) {
  let Z = i5(Q),
    J = v9(Q),
    z = Q.ownerDocument.body,
    q = a1(Z.scrollWidth, Z.clientWidth, z.scrollWidth, z.clientWidth),
    $ = a1(Z.scrollHeight, Z.clientHeight, z.scrollHeight, z.clientHeight),
    X = -J.scrollLeft + A4(Q),
    K = -J.scrollTop
  if (R1(z).direction === 'rtl') X += a1(Z.clientWidth, z.clientWidth) - q
  return { width: q, height: $, x: X, y: K }
}
var nK = 25
function DN(Q, Z) {
  let J = o0(Q),
    z = i5(Q),
    q = J.visualViewport,
    $ = z.clientWidth,
    X = z.clientHeight,
    K = 0,
    G = 0
  if (q) {
    ;(($ = q.width), (X = q.height))
    let W = v6()
    if (!W || (W && Z === 'fixed')) ((K = q.offsetLeft), (G = q.offsetTop))
  }
  let Y = A4(z)
  if (Y <= 0) {
    let W = z.ownerDocument,
      U = W.body,
      B = getComputedStyle(U),
      H =
        W.compatMode === 'CSS1Compat'
          ? parseFloat(B.marginLeft) + parseFloat(B.marginRight) || 0
          : 0,
      N = Math.abs(z.clientWidth - U.clientWidth - H)
    if (N <= nK) $ -= N
  } else if (Y <= nK) $ += Y
  return { width: $, height: X, x: K, y: G }
}
var TN = new Set(['absolute', 'fixed'])
function PN(Q, Z) {
  let J = L6(Q, !0, Z === 'fixed'),
    z = J.top + Q.clientTop,
    q = J.left + Q.clientLeft,
    $ = m0(Q) ? Q9(Q) : l5(1),
    X = Q.clientWidth * $.x,
    K = Q.clientHeight * $.y,
    G = q * $.x,
    Y = z * $.y
  return { width: X, height: K, x: G, y: Y }
}
function oK(Q, Z, J) {
  let z
  if (Z === 'viewport') z = DN(Q, J)
  else if (Z === 'document') z = yN(i5(Q))
  else if (C0(Z)) z = PN(Z, J)
  else {
    let q = QG(Q)
    z = { x: Z.x - q.x, y: Z.y - q.y, width: Z.width, height: Z.height }
  }
  return K6(z)
}
function JG(Q, Z) {
  let J = N5(Q)
  if (J === Z || !C0(J) || F5(J)) return !1
  return R1(J).position === 'fixed' || JG(J, Z)
}
function EN(Q, Z) {
  let J = Z.get(Q)
  if (J) return J
  let z = L5(Q, [], !1).filter((K) => C0(K) && d5(K) !== 'body'),
    q = null,
    $ = R1(Q).position === 'fixed',
    X = $ ? N5(Q) : Q
  while (C0(X) && !F5(X)) {
    let K = R1(X),
      G = o7(X)
    if (!G && K.position === 'fixed') q = null
    if (
      $
        ? !G && !q
        : (!G && K.position === 'static' && !!q && TN.has(q.position)) ||
          (K2(X) && !G && JG(Q, X))
    )
      z = z.filter((W) => W !== X)
    else q = K
    X = N5(X)
  }
  return (Z.set(Q, z), z)
}
function SN(Q) {
  let { element: Z, boundary: J, rootBoundary: z, strategy: q } = Q,
    X = [
      ...(J === 'clippingAncestors'
        ? R9(Z)
          ? []
          : EN(Z, this._c)
        : [].concat(J)),
      z,
    ],
    K = X[0],
    G = X.reduce(
      (Y, W) => {
        let U = oK(Z, W, q)
        return (
          (Y.top = a1(U.top, Y.top)),
          (Y.right = L8(U.right, Y.right)),
          (Y.bottom = L8(U.bottom, Y.bottom)),
          (Y.left = a1(U.left, Y.left)),
          Y
        )
      },
      oK(Z, K, q),
    )
  return {
    width: G.right - G.left,
    height: G.bottom - G.top,
    x: G.left,
    y: G.top,
  }
}
function IN(Q) {
  let { width: Z, height: J } = eK(Q)
  return { width: Z, height: J }
}
function CN(Q, Z, J) {
  let z = m0(Z),
    q = i5(Z),
    $ = J === 'fixed',
    X = L6(Q, !0, $, Z),
    K = { scrollLeft: 0, scrollTop: 0 },
    G = l5(0)
  function Y() {
    G.x = A4(q)
  }
  if (z || (!z && !$)) {
    if (d5(Z) !== 'body' || K2(q)) K = v9(Z)
    if (z) {
      let H = L6(Z, !0, $, Z)
      ;((G.x = H.x + Z.clientLeft), (G.y = H.y + Z.clientTop))
    } else if (q) Y()
  }
  if ($ && !z && q) Y()
  let W = q && !z && !$ ? ZG(q, K) : l5(0),
    U = X.left + K.scrollLeft - G.x - W.x,
    B = X.top + K.scrollTop - G.y - W.y
  return { x: U, y: B, width: X.width, height: X.height }
}
function az(Q) {
  return R1(Q).position === 'static'
}
function tK(Q, Z) {
  if (!m0(Q) || R1(Q).position === 'fixed') return null
  if (Z) return Z(Q)
  let J = Q.offsetParent
  if (i5(Q) === J) J = J.ownerDocument.body
  return J
}
function zG(Q, Z) {
  let J = o0(Q)
  if (R9(Q)) return J
  if (!m0(Q)) {
    let q = N5(Q)
    while (q && !F5(q)) {
      if (C0(q) && !az(q)) return q
      q = N5(q)
    }
    return J
  }
  let z = tK(Q, Z)
  while (z && w$(z) && az(z)) z = tK(z, Z)
  if (z && F5(z) && az(z) && !o7(z)) return J
  return z || y$(Q) || J
}
var xN = async function (Q) {
  let Z = this.getOffsetParent || zG,
    J = this.getDimensions,
    z = await J(Q.floating)
  return {
    reference: CN(Q.reference, await Z(Q.floating), Q.strategy),
    floating: { x: 0, y: 0, width: z.width, height: z.height },
  }
}
function hN(Q) {
  return R1(Q).direction === 'rtl'
}
var nz = {
  convertOffsetParentRelativeRectToViewportRelativeRect: ON,
  getDocumentElement: i5,
  getClippingRect: SN,
  getOffsetParent: zG,
  getElementRects: xN,
  getClientRects: wN,
  getDimensions: IN,
  getScale: Q9,
  isElement: C0,
  isRTL: hN,
}
function qG(Q, Z) {
  return (
    Q.x === Z.x && Q.y === Z.y && Q.width === Z.width && Q.height === Z.height
  )
}
function bN(Q, Z) {
  let J = null,
    z,
    q = i5(Q)
  function $() {
    var K
    ;(clearTimeout(z), (K = J) == null || K.disconnect(), (J = null))
  }
  function X(K, G) {
    if (K === void 0) K = !1
    if (G === void 0) G = 1
    $()
    let Y = Q.getBoundingClientRect(),
      { left: W, top: U, width: B, height: H } = Y
    if (!K) Z()
    if (!B || !H) return
    let N = k8(U),
      _ = k8(q.clientWidth - (W + B)),
      L = k8(q.clientHeight - (U + H)),
      F = k8(W),
      V = {
        rootMargin: -N + 'px ' + -_ + 'px ' + -L + 'px ' + -F + 'px',
        threshold: a1(0, L8(1, G)) || 1,
      },
      M = !0
    function j(A) {
      let w = A[0].intersectionRatio
      if (w !== G) {
        if (!M) return X()
        if (!w)
          z = setTimeout(() => {
            X(!1, 0.0000001)
          }, 1000)
        else X(!1, w)
      }
      if (w === 1 && !qG(Y, Q.getBoundingClientRect())) X()
      M = !1
    }
    try {
      J = new IntersectionObserver(j, { ...V, root: q.ownerDocument })
    } catch (A) {
      J = new IntersectionObserver(j, V)
    }
    J.observe(Q)
  }
  return (X(!0), $)
}
function F7(Q, Z, J, z) {
  if (z === void 0) z = {}
  let {
      ancestorScroll: q = !0,
      ancestorResize: $ = !0,
      elementResize: X = typeof ResizeObserver === 'function',
      layoutShift: K = typeof IntersectionObserver === 'function',
      animationFrame: G = !1,
    } = z,
    Y = sz(Q),
    W = q || $ ? [...(Y ? L5(Y) : []), ...L5(Z)] : []
  W.forEach((F) => {
    ;(q && F.addEventListener('scroll', J, { passive: !0 }),
      $ && F.addEventListener('resize', J))
  })
  let U = Y && K ? bN(Y, J) : null,
    B = -1,
    H = null
  if (X) {
    if (
      ((H = new ResizeObserver((F) => {
        let [k] = F
        if (k && k.target === Y && H)
          (H.unobserve(Z),
            cancelAnimationFrame(B),
            (B = requestAnimationFrame(() => {
              var V
              ;(V = H) == null || V.observe(Z)
            })))
        J()
      })),
      Y && !G)
    )
      H.observe(Y)
    H.observe(Z)
  }
  let N,
    _ = G ? L6(Q) : null
  if (G) L()
  function L() {
    let F = L6(Q)
    if (_ && !qG(_, F)) J()
    ;((_ = F), (N = requestAnimationFrame(L)))
  }
  return (
    J(),
    () => {
      var F
      if (
        (W.forEach((k) => {
          ;(q && k.removeEventListener('scroll', J),
            $ && k.removeEventListener('resize', J))
        }),
        U == null || U(),
        (F = H) == null || F.disconnect(),
        (H = null),
        G)
      )
        cancelAnimationFrame(N)
    }
  )
}
var $G = lK
var XG = rK,
  KG = cK,
  GG = sK,
  YG = dK
var WG = aK,
  O4 = (Q, Z, J) => {
    let z = new Map(),
      q = { platform: nz, ...J },
      $ = { ...q.platform, _c: z }
    return uK(Q, Z, { ...q, platform: $ })
  }
import * as D1 from 'react'
import { useLayoutEffect as vN } from 'react'
import * as BG from 'react-dom'
var fN = typeof document < 'u',
  gN = function () {},
  w4 = fN ? vN : gN
function y4(Q, Z) {
  if (Q === Z) return !0
  if (typeof Q !== typeof Z) return !1
  if (typeof Q === 'function' && Q.toString() === Z.toString()) return !0
  let J, z, q
  if (Q && Z && typeof Q === 'object') {
    if (Array.isArray(Q)) {
      if (((J = Q.length), J !== Z.length)) return !1
      for (z = J; z-- !== 0; ) if (!y4(Q[z], Z[z])) return !1
      return !0
    }
    if (((q = Object.keys(Q)), (J = q.length), J !== Object.keys(Z).length))
      return !1
    for (z = J; z-- !== 0; ) if (!{}.hasOwnProperty.call(Z, q[z])) return !1
    for (z = J; z-- !== 0; ) {
      let $ = q[z]
      if ($ === '_owner' && Q.$$typeof) continue
      if (!y4(Q[$], Z[$])) return !1
    }
    return !0
  }
  return Q !== Q && Z !== Z
}
function _G(Q) {
  if (typeof window > 'u') return 1
  return (Q.ownerDocument.defaultView || window).devicePixelRatio || 1
}
function UG(Q, Z) {
  let J = _G(Q)
  return Math.round(Z * J) / J
}
function oz(Q) {
  let Z = D1.useRef(Q)
  return (
    w4(() => {
      Z.current = Q
    }),
    Z
  )
}
function HG(Q) {
  if (Q === void 0) Q = {}
  let {
      placement: Z = 'bottom',
      strategy: J = 'absolute',
      middleware: z = [],
      platform: q,
      elements: { reference: $, floating: X } = {},
      transform: K = !0,
      whileElementsMounted: G,
      open: Y,
    } = Q,
    [W, U] = D1.useState({
      x: 0,
      y: 0,
      strategy: J,
      placement: Z,
      middlewareData: {},
      isPositioned: !1,
    }),
    [B, H] = D1.useState(z)
  if (!y4(B, z)) H(z)
  let [N, _] = D1.useState(null),
    [L, F] = D1.useState(null),
    k = D1.useCallback((D) => {
      if (D !== A.current) ((A.current = D), _(D))
    }, []),
    V = D1.useCallback((D) => {
      if (D !== w.current) ((w.current = D), F(D))
    }, []),
    M = $ || N,
    j = X || L,
    A = D1.useRef(null),
    w = D1.useRef(null),
    O = D1.useRef(W),
    S = G != null,
    x = oz(G),
    h = oz(q),
    I = oz(Y),
    y = D1.useCallback(() => {
      if (!A.current || !w.current) return
      let D = { placement: Z, strategy: J, middleware: B }
      if (h.current) D.platform = h.current
      O4(A.current, w.current, D).then((E) => {
        let C = { ...E, isPositioned: I.current !== !1 }
        if (T.current && !y4(O.current, C))
          ((O.current = C),
            BG.flushSync(() => {
              U(C)
            }))
      })
    }, [B, Z, J, h, I])
  w4(() => {
    if (Y === !1 && O.current.isPositioned)
      ((O.current.isPositioned = !1), U((D) => ({ ...D, isPositioned: !1 })))
  }, [Y])
  let T = D1.useRef(!1)
  ;(w4(() => {
    return (
      (T.current = !0),
      () => {
        T.current = !1
      }
    )
  }, []),
    w4(() => {
      if (M) A.current = M
      if (j) w.current = j
      if (M && j) {
        if (x.current) return x.current(M, j, y)
        y()
      }
    }, [M, j, y, x, S]))
  let R = D1.useMemo(
      () => ({ reference: A, floating: w, setReference: k, setFloating: V }),
      [k, V],
    ),
    v = D1.useMemo(() => ({ reference: M, floating: j }), [M, j]),
    P = D1.useMemo(() => {
      let D = { position: J, left: 0, top: 0 }
      if (!v.floating) return D
      let E = UG(v.floating, W.x),
        C = UG(v.floating, W.y)
      if (K)
        return {
          ...D,
          transform: 'translate(' + E + 'px, ' + C + 'px)',
          ...(_G(v.floating) >= 1.5 && { willChange: 'transform' }),
        }
      return { position: J, left: E, top: C }
    }, [J, K, v.floating, W.x, W.y])
  return D1.useMemo(
    () => ({ ...W, update: y, refs: R, elements: v, floatingStyles: P }),
    [W, y, R, v, P],
  )
}
var tz = (Q, Z) => ({ ...$G(Q), options: [Q, Z] }),
  ez = (Q, Z) => ({ ...XG(Q), options: [Q, Z] }),
  Qq = (Q, Z) => ({ ...WG(Q), options: [Q, Z] }),
  Zq = (Q, Z) => ({ ...KG(Q), options: [Q, Z] }),
  Jq = (Q, Z) => ({ ...GG(Q), options: [Q, Z] })
var zq = (Q, Z) => ({ ...YG(Q), options: [Q, Z] })
var mN = { intentional: 'onClick', sloppy: 'onPointerDown' }
function pN(Q) {
  return {
    escapeKey: typeof Q === 'boolean' ? Q : (Q?.escapeKey ?? !1),
    outsidePress: typeof Q === 'boolean' ? Q : (Q?.outsidePress ?? !0),
  }
}
function A5(Q, Z = {}) {
  let J = 'rootStore' in Q ? Q.rootStore : Q,
    z = J.useState('open'),
    q = J.useState('floatingElement'),
    $ = J.useState('referenceElement'),
    X = J.useState('domReferenceElement'),
    { onOpenChange: K, dataRef: G } = J.context,
    {
      enabled: Y = !0,
      escapeKey: W = !0,
      outsidePress: U = !0,
      outsidePressEvent: B = 'sloppy',
      referencePress: H = !1,
      referencePressEvent: N = 'sloppy',
      ancestorScroll: _ = !1,
      bubbles: L,
      externalTree: F,
    } = Z,
    k = d1(F),
    V = m(typeof U === 'function' ? U : () => !1),
    M = typeof U === 'function' ? V : U,
    j = h5.useRef(!1),
    { escapeKey: A, outsidePress: w } = pN(L),
    O = h5.useRef(null),
    S = c0(),
    x = c0(),
    h = m(() => {
      ;(x.clear(), (G.current.insideReactTree = !1))
    }),
    I = h5.useRef(!1),
    y = h5.useRef(''),
    T = m((b) => {
      y.current = b.pointerType
    }),
    R = m(() => {
      let b = y.current,
        r = b === 'pen' || !b ? 'mouse' : b,
        t = typeof B === 'function' ? B() : B
      if (typeof t === 'string') return t
      return t[r]
    }),
    v = m((b) => {
      if (!z || !Y || !W || b.key !== 'Escape') return
      if (I.current) return
      let r = G.current.floatingContext?.nodeId,
        t = k ? W2(k.nodesRef.current, r) : []
      if (!A) {
        if (t.length > 0) {
          let d = !0
          if (
            (t.forEach((o) => {
              if (
                o.context?.open &&
                !o.context.dataRef.current.__escapeKeyBubbles
              )
                d = !1
            }),
            !d)
          )
            return
        }
      }
      let e = KX(b) ? b.nativeEvent : b,
        s = $0(c.escapeKey, e)
      if ((J.setOpen(!1, s), !A && !s.isPropagationAllowed)) b.stopPropagation()
    }),
    P = m((b) => {
      let r = R()
      return (
        (r === 'intentional' && b.type !== 'click') ||
        (r === 'sloppy' && b.type === 'click')
      )
    }),
    D = m(() => {
      ;((G.current.insideReactTree = !0), x.start(0, h))
    }),
    E = m((b, r = !1) => {
      if (P(b)) {
        h()
        return
      }
      if (G.current.insideReactTree) {
        h()
        return
      }
      if (R() === 'intentional' && r) return
      if (typeof M === 'function' && !M(b)) return
      let t = K1(b),
        e = `[${j5('inert')}]`,
        s = V0(J.select('floatingElement')).querySelectorAll(e),
        d = J.context.triggerElements
      if (t && (d.hasElement(t) || d.hasMatchingElement((_0) => F0(_0, t))))
        return
      let o = C0(t) ? t : null
      while (o && !F5(o)) {
        let _0 = N5(o)
        if (F5(_0) || !C0(_0)) break
        o = _0
      }
      if (
        s.length &&
        C0(t) &&
        !$X(t) &&
        !F0(t, J.select('floatingElement')) &&
        Array.from(s).every((_0) => !F0(o, _0))
      )
        return
      if (m0(t) && !('touches' in b)) {
        let _0 = F5(t),
          H0 = R1(t),
          W0 = /auto|scroll/,
          O0 = _0 || W0.test(H0.overflowX),
          f0 = _0 || W0.test(H0.overflowY),
          A0 = O0 && t.clientWidth > 0 && t.scrollWidth > t.clientWidth,
          T0 = f0 && t.clientHeight > 0 && t.scrollHeight > t.clientHeight,
          y0 = H0.direction === 'rtl',
          P0 =
            T0 &&
            (y0
              ? b.offsetX <= t.offsetWidth - t.clientWidth
              : b.offsetX > t.clientWidth),
          b0 = A0 && b.offsetY > t.clientHeight
        if (P0 || b0) return
      }
      let l = G.current.floatingContext?.nodeId,
        q0 =
          k &&
          W2(k.nodesRef.current, l).some((_0) =>
            P5(b, _0.context?.elements.floating),
          )
      if (
        P5(b, J.select('floatingElement')) ||
        P5(b, J.select('domReferenceElement')) ||
        q0
      )
        return
      let n = k ? W2(k.nodesRef.current, l) : []
      if (n.length > 0) {
        let _0 = !0
        if (
          (n.forEach((H0) => {
            if (
              H0.context?.open &&
              !H0.context.dataRef.current.__outsidePressBubbles
            )
              _0 = !1
          }),
          !_0)
        )
          return
      }
      ;(J.setOpen(!1, $0(c.outsidePress, b)), h())
    }),
    C = m((b) => {
      if (
        R() !== 'sloppy' ||
        b.pointerType === 'touch' ||
        !J.select('open') ||
        !Y ||
        P5(b, J.select('floatingElement')) ||
        P5(b, J.select('domReferenceElement'))
      )
        return
      E(b)
    }),
    a = m((b) => {
      if (
        R() !== 'sloppy' ||
        !J.select('open') ||
        !Y ||
        P5(b, J.select('floatingElement')) ||
        P5(b, J.select('domReferenceElement'))
      )
        return
      let r = b.touches[0]
      if (r)
        ((O.current = {
          startTime: Date.now(),
          startX: r.clientX,
          startY: r.clientY,
          dismissOnTouchEnd: !1,
          dismissOnMouseDown: !0,
        }),
          S.start(1000, () => {
            if (O.current)
              ((O.current.dismissOnTouchEnd = !1),
                (O.current.dismissOnMouseDown = !1))
          }))
    }),
    p = m((b) => {
      let r = K1(b)
      function t() {
        ;(a(b), r?.removeEventListener(b.type, t))
      }
      r?.addEventListener(b.type, t)
    }),
    Q0 = m((b) => {
      let r = j.current
      if (
        ((j.current = !1),
        S.clear(),
        b.type === 'mousedown' && O.current && !O.current.dismissOnMouseDown)
      )
        return
      let t = K1(b)
      function e() {
        if (b.type === 'pointerdown') C(b)
        else E(b, r)
        t?.removeEventListener(b.type, e)
      }
      t?.addEventListener(b.type, e)
    }),
    g = m((b) => {
      if (
        R() !== 'sloppy' ||
        !O.current ||
        P5(b, J.select('floatingElement')) ||
        P5(b, J.select('domReferenceElement'))
      )
        return
      let r = b.touches[0]
      if (!r) return
      let t = Math.abs(r.clientX - O.current.startX),
        e = Math.abs(r.clientY - O.current.startY),
        s = Math.sqrt(t * t + e * e)
      if (s > 5) O.current.dismissOnTouchEnd = !0
      if (s > 10) (E(b), S.clear(), (O.current = null))
    }),
    Z0 = m((b) => {
      let r = K1(b)
      function t() {
        ;(g(b), r?.removeEventListener(b.type, t))
      }
      r?.addEventListener(b.type, t)
    }),
    i = m((b) => {
      if (
        R() !== 'sloppy' ||
        !O.current ||
        P5(b, J.select('floatingElement')) ||
        P5(b, J.select('domReferenceElement'))
      )
        return
      if (O.current.dismissOnTouchEnd) E(b)
      ;(S.clear(), (O.current = null))
    }),
    X0 = m((b) => {
      let r = K1(b)
      function t() {
        ;(i(b), r?.removeEventListener(b.type, t))
      }
      r?.addEventListener(b.type, t)
    })
  ;(h5.useEffect(() => {
    if (!z || !Y) return
    ;((G.current.__escapeKeyBubbles = A), (G.current.__outsidePressBubbles = w))
    let b = new p1()
    function r(o) {
      J.setOpen(!1, $0(c.none, o))
    }
    function t() {
      ;(b.clear(), (I.current = !0))
    }
    function e() {
      b.start(v6() ? 5 : 0, () => {
        I.current = !1
      })
    }
    let s = V0(q)
    if ((s.addEventListener('pointerdown', T, !0), W))
      (s.addEventListener('keydown', v),
        s.addEventListener('compositionstart', t),
        s.addEventListener('compositionend', e))
    if (M)
      (s.addEventListener('click', Q0, !0),
        s.addEventListener('pointerdown', Q0, !0),
        s.addEventListener('touchstart', p, !0),
        s.addEventListener('touchmove', Z0, !0),
        s.addEventListener('touchend', X0, !0),
        s.addEventListener('mousedown', Q0, !0))
    let d = []
    if (_) {
      if (C0(X)) d = L5(X)
      if (C0(q)) d = d.concat(L5(q))
      if (!C0($) && $ && $.contextElement) d = d.concat(L5($.contextElement))
    }
    return (
      (d = d.filter((o) => o !== s.defaultView?.visualViewport)),
      d.forEach((o) => {
        o.addEventListener('scroll', r, { passive: !0 })
      }),
      () => {
        if ((s.removeEventListener('pointerdown', T, !0), W))
          (s.removeEventListener('keydown', v),
            s.removeEventListener('compositionstart', t),
            s.removeEventListener('compositionend', e))
        if (M)
          (s.removeEventListener('click', Q0, !0),
            s.removeEventListener('pointerdown', Q0, !0),
            s.removeEventListener('touchstart', p, !0),
            s.removeEventListener('touchmove', Z0, !0),
            s.removeEventListener('touchend', X0, !0),
            s.removeEventListener('mousedown', Q0, !0))
        ;(d.forEach((o) => {
          o.removeEventListener('scroll', r)
        }),
          b.clear(),
          (j.current = !1))
      }
    )
  }, [G, q, $, X, W, M, z, K, _, Y, A, w, v, E, Q0, C, p, Z0, X0, T, J]),
    h5.useEffect(h, [M, h]))
  let Y0 = h5.useMemo(
      () => ({
        onKeyDown: v,
        ...(H && {
          [mN[N]]: (b) => {
            J.setOpen(!1, $0(c.triggerPress, b.nativeEvent))
          },
          ...(N !== 'intentional' && {
            onClick(b) {
              J.setOpen(!1, $0(c.triggerPress, b.nativeEvent))
            },
          }),
        }),
      }),
      [v, J, H, N],
    ),
    J0 = m((b) => {
      let r = K1(b.nativeEvent)
      if (!F0(J.select('floatingElement'), r) || b.button !== 0) return
      j.current = !0
    }),
    U0 = m((b) => {
      if (!z || !Y || b.button !== 0) return
      j.current = !0
    }),
    K0 = h5.useMemo(
      () => ({
        onKeyDown: v,
        onPointerDown: J0,
        onMouseDown: J0,
        onMouseUp: J0,
        onClickCapture: D,
        onMouseDownCapture(b) {
          ;(D(), U0(b))
        },
        onPointerDownCapture(b) {
          ;(D(), U0(b))
        },
        onMouseUpCapture: D,
        onTouchEndCapture: D,
        onTouchMoveCapture: D,
      }),
      [v, J0, D, U0],
    )
  return h5.useMemo(
    () => (Y ? { reference: Y0, floating: K0, trigger: Y0 } : {}),
    [Y, Y0, K0],
  )
}
import * as t1 from 'react'
var uN = {
  open: G0((Q) => Q.open),
  domReferenceElement: G0((Q) => Q.domReferenceElement),
  referenceElement: G0((Q) => Q.positionReference ?? Q.referenceElement),
  floatingElement: G0((Q) => Q.floatingElement),
  floatingId: G0((Q) => Q.floatingId),
}
class F6 extends M5 {
  constructor(Q) {
    let { nested: Z, noEmit: J, onOpenChange: z, triggerElements: q, ...$ } = Q
    super(
      {
        ...$,
        positionReference: $.referenceElement,
        domReferenceElement: $.referenceElement,
      },
      {
        onOpenChange: z,
        dataRef: { current: {} },
        events: L4(),
        nested: Z,
        noEmit: J,
        triggerElements: q,
      },
      uN,
    )
  }
  setOpen = (Q, Z) => {
    if (!Q || !this.state.open || VQ(Z.event))
      this.context.dataRef.current.openEvent = Q ? Z.event : void 0
    if (!this.context.noEmit) {
      let J = {
        open: Q,
        reason: Z.reason,
        nativeEvent: Z.event,
        nested: this.context.nested,
        triggerElement: Z.trigger,
      }
      this.context.events.emit('openchange', J)
    }
    this.context.onOpenChange?.(Q, Z)
  }
}
import * as k7 from 'react'
function qq(Q, Z) {
  let J = k7.useRef(null),
    z = k7.useRef(null)
  return k7.useCallback(
    (q) => {
      if (Q === void 0) return
      if (J.current !== null) {
        let $ = J.current,
          X = z.current,
          K = Z.context.triggerElements.getById($)
        if (X && K === X) Z.context.triggerElements.delete($)
        ;((J.current = null), (z.current = null))
      }
      if (q !== null)
        ((J.current = Q), (z.current = q), Z.context.triggerElements.add(Q, q))
    },
    [Z, Q],
  )
}
function j2(Q, Z, J, z) {
  let q = J.useState('isMountedByTrigger', Q),
    $ = qq(Q, J),
    X = m((K) => {
      if (($(K), !K || !J.select('open'))) return
      let G = J.select('activeTriggerId')
      if (G === Q) {
        J.update({ activeTriggerElement: K, ...z })
        return
      }
      if (G == null)
        J.update({ activeTriggerId: Q, activeTriggerElement: K, ...z })
    })
  return (
    u(() => {
      if (q) J.update({ activeTriggerElement: Z.current, ...z })
    }, [q, J, Z, ...Object.values(z)]),
    { registerTrigger: X, isMountedByThisTrigger: q }
  )
}
function V2(Q) {
  let Z = Q.useState('open')
  u(() => {
    if (
      Z &&
      !Q.select('activeTriggerId') &&
      Q.context.triggerElements.size === 1
    ) {
      let J = Q.context.triggerElements.entries().next()
      if (!J.done) {
        let [z, q] = J.value
        Q.update({ activeTriggerId: z, activeTriggerElement: q })
      }
    }
  }, [Z, Q])
}
function A2(Q, Z, J) {
  let { mounted: z, setMounted: q, transitionStatus: $ } = F1(Q)
  Z.useSyncedValues({ mounted: z, transitionStatus: $ })
  let X = m(() => {
      ;(q(!1),
        Z.update({
          activeTriggerId: null,
          activeTriggerElement: null,
          mounted: !1,
        }),
        J?.(),
        Z.context.onOpenChangeComplete?.(!1))
    }),
    K = Z.useState('preventUnmountingOnClose')
  return (
    a0({
      enabled: !K,
      open: Q,
      ref: Z.context.popupRef,
      onComplete() {
        if (!Q) X()
      },
    }),
    { forceUnmount: X, transitionStatus: $ }
  )
}
class o1 {
  constructor() {
    ;((this.elementsSet = new Set()), (this.idMap = new Map()))
  }
  add(Q, Z) {
    let J = this.idMap.get(Q)
    if (J === Z) return
    if (J !== void 0) this.elementsSet.delete(J)
    if (
      (this.elementsSet.add(Z),
      this.idMap.set(Q, Z),
      this.elementsSet.size !== this.idMap.size)
    )
      throw Error(
        'Base UI: A trigger element cannot be registered under multiple IDs in PopupTriggerMap.',
      )
  }
  delete(Q) {
    let Z = this.idMap.get(Q)
    if (Z) (this.elementsSet.delete(Z), this.idMap.delete(Q))
  }
  hasElement(Q) {
    return this.elementsSet.has(Q)
  }
  hasMatchingElement(Q) {
    for (let Z of this.elementsSet) if (Q(Z)) return !0
    return !1
  }
  getById(Q) {
    return this.idMap.get(Q)
  }
  entries() {
    return this.idMap.entries()
  }
  elements() {
    return this.elementsSet.values()
  }
  get size() {
    return this.idMap.size
  }
}
function NG() {
  return new F6({
    open: !1,
    floatingElement: null,
    referenceElement: null,
    triggerElements: new o1(),
    floatingId: '',
    nested: !1,
    noEmit: !1,
    onOpenChange: void 0,
  })
}
function O2() {
  return {
    open: !1,
    openProp: void 0,
    mounted: !1,
    transitionStatus: 'idle',
    floatingRootContext: NG(),
    preventUnmountingOnClose: !1,
    payload: void 0,
    activeTriggerId: null,
    activeTriggerElement: null,
    triggerIdProp: void 0,
    popupElement: null,
    positionerElement: null,
    activeTriggerProps: S0,
    inactiveTriggerProps: S0,
    popupProps: S0,
  }
}
var D4 = G0((Q) => Q.triggerIdProp ?? Q.activeTriggerId),
  w2 = {
    open: G0((Q) => Q.openProp ?? Q.open),
    mounted: G0((Q) => Q.mounted),
    transitionStatus: G0((Q) => Q.transitionStatus),
    floatingRootContext: G0((Q) => Q.floatingRootContext),
    preventUnmountingOnClose: G0((Q) => Q.preventUnmountingOnClose),
    payload: G0((Q) => Q.payload),
    activeTriggerId: D4,
    activeTriggerElement: G0((Q) =>
      Q.mounted ? Q.activeTriggerElement : null,
    ),
    isTriggerActive: G0((Q, Z) => Z !== void 0 && D4(Q) === Z),
    isOpenedByTrigger: G0((Q, Z) => Z !== void 0 && D4(Q) === Z && Q.open),
    isMountedByTrigger: G0((Q, Z) => Z !== void 0 && D4(Q) === Z && Q.mounted),
    triggerProps: G0((Q, Z) =>
      Z ? Q.activeTriggerProps : Q.inactiveTriggerProps,
    ),
    popupProps: G0((Q) => Q.popupProps),
    popupElement: G0((Q) => Q.popupElement),
    positionerElement: G0((Q) => Q.positionerElement),
  }
function M7(Q) {
  let { open: Z = !1, onOpenChange: J, elements: z = {} } = Q,
    q = q5(),
    $ = C1() != null
  {
    let K = z.reference
    if (K && !C0(K))
      console.error(
        'Cannot pass a virtual element to the `elements.reference` option,',
        'as it must be a real DOM element. Use `context.setPositionReference()`',
        'instead.',
      )
  }
  let X = R0(
    () =>
      new F6({
        open: Z,
        onOpenChange: J,
        referenceElement: z.reference ?? null,
        floatingElement: z.floating ?? null,
        triggerElements: new o1(),
        floatingId: q,
        nested: $,
        noEmit: !1,
      }),
  ).current
  return (
    u(() => {
      let K = { open: Z, floatingId: q }
      if (z.reference !== void 0)
        ((K.referenceElement = z.reference),
          (K.domReferenceElement = C0(z.reference) ? z.reference : null))
      if (z.floating !== void 0) K.floatingElement = z.floating
      X.update(K)
    }, [Z, q, z.reference, z.floating, X]),
    (X.context.onOpenChange = J),
    (X.context.nested = $),
    (X.context.noEmit = !1),
    X
  )
}
function $q(Q = {}) {
  let { nodeId: Z, externalTree: J } = Q,
    z = M7(Q),
    q = Q.rootContext || z,
    $ = {
      reference: q.useState('referenceElement'),
      floating: q.useState('floatingElement'),
      domReference: q.useState('domReferenceElement'),
    },
    [X, K] = t1.useState(null),
    G = t1.useRef(null),
    Y = d1(J)
  u(() => {
    if ($.domReference) G.current = $.domReference
  }, [$.domReference])
  let W = HG({ ...Q, elements: { ...$, ...(X && { reference: X }) } }),
    U = t1.useCallback(
      (w) => {
        let O = C0(w)
          ? {
              getBoundingClientRect: () => w.getBoundingClientRect(),
              getClientRects: () => w.getClientRects(),
              contextElement: w,
            }
          : w
        ;(K(O), W.refs.setReference(O))
      },
      [W.refs],
    ),
    [B, H] = t1.useState(null),
    [N, _] = t1.useState(null)
  ;(q.useSyncedValue('referenceElement', B),
    q.useSyncedValue('domReferenceElement', C0(B) ? B : null),
    q.useSyncedValue('floatingElement', N))
  let L = t1.useCallback(
      (w) => {
        if (C0(w) || w === null) ((G.current = w), H(w))
        if (
          C0(W.refs.reference.current) ||
          W.refs.reference.current === null ||
          (w !== null && !C0(w))
        )
          W.refs.setReference(w)
      },
      [W.refs, H],
    ),
    F = t1.useCallback(
      (w) => {
        ;(_(w), W.refs.setFloating(w))
      },
      [W.refs],
    ),
    k = t1.useMemo(
      () => ({
        ...W.refs,
        setReference: L,
        setFloating: F,
        setPositionReference: U,
        domReference: G,
      }),
      [W.refs, L, F, U],
    ),
    V = t1.useMemo(
      () => ({ ...W.elements, domReference: $.domReference }),
      [W.elements, $.domReference],
    ),
    M = q.useState('open'),
    j = q.useState('floatingId'),
    A = t1.useMemo(
      () => ({
        ...W,
        dataRef: q.context.dataRef,
        open: M,
        onOpenChange: q.setOpen,
        events: q.context.events,
        floatingId: j,
        refs: k,
        elements: V,
        nodeId: Z,
        rootStore: q,
      }),
      [W, k, V, Z, q, M, j],
    )
  return (
    u(() => {
      q.context.dataRef.current.floatingContext = A
      let w = Y?.nodesRef.current.find((O) => O.id === Z)
      if (w) w.context = A
    }),
    t1.useMemo(
      () => ({ ...W, context: A, refs: k, elements: V, rootStore: q }),
      [W, k, V, A, q],
    )
  )
}
function Z2(Q) {
  let {
      popupStore: Z,
      noEmit: J = !1,
      treatPopupAsFloatingElement: z = !1,
      onOpenChange: q,
    } = Q,
    $ = q5(),
    X = C1() != null,
    K = Z.useState('open'),
    G = Z.useState('activeTriggerElement'),
    Y = Z.useState(z ? 'popupElement' : 'positionerElement'),
    W = Z.context.triggerElements,
    U = R0(
      () =>
        new F6({
          open: K,
          referenceElement: G,
          floatingElement: Y,
          triggerElements: W,
          onOpenChange: q,
          floatingId: $,
          nested: X,
          noEmit: J,
        }),
    ).current
  return (
    u(() => {
      let B = {
        open: K,
        floatingId: $,
        referenceElement: G,
        floatingElement: Y,
      }
      if (C0(G)) B.domReferenceElement = G
      if (U.state.positionReference === U.state.referenceElement)
        B.positionReference = G
      U.update(B)
    }, [K, $, G, Y, U]),
    (U.context.onOpenChange = q),
    (U.context.nested = X),
    (U.context.noEmit = J),
    U
  )
}
import * as y2 from 'react'
var Xq = qX && LQ
function k6(Q, Z = {}) {
  let J = 'rootStore' in Q ? Q.rootStore : Q,
    { events: z, dataRef: q } = J.context,
    { enabled: $ = !0, delay: X } = Z,
    K = y2.useRef(!1),
    G = y2.useRef(null),
    Y = c0(),
    W = y2.useRef(!0)
  ;(y2.useEffect(() => {
    let B = J.select('domReferenceElement')
    if (!$) return
    let H = o0(B)
    function N() {
      let F = J.select('domReferenceElement')
      if (!J.select('open') && m0(F) && F === B1(V0(F))) K.current = !0
    }
    function _() {
      W.current = !0
    }
    function L() {
      W.current = !1
    }
    if ((H.addEventListener('blur', N), Xq))
      (H.addEventListener('keydown', _, !0),
        H.addEventListener('pointerdown', L, !0))
    return () => {
      if ((H.removeEventListener('blur', N), Xq))
        (H.removeEventListener('keydown', _, !0),
          H.removeEventListener('pointerdown', L, !0))
    }
  }, [J, $]),
    y2.useEffect(() => {
      if (!$) return
      function B(H) {
        if (H.reason === c.triggerPress || H.reason === c.escapeKey) {
          let N = J.select('domReferenceElement')
          if (C0(N)) ((G.current = N), (K.current = !0))
        }
      }
      return (
        z.on('openchange', B),
        () => {
          z.off('openchange', B)
        }
      )
    }, [z, $, J]))
  let U = y2.useMemo(
    () => ({
      onMouseLeave() {
        ;((K.current = !1), (G.current = null))
      },
      onFocus(B) {
        let H = B.currentTarget
        if (K.current) {
          if (G.current === H) return
          ;((K.current = !1), (G.current = null))
        }
        let N = K1(B.nativeEvent)
        if (C0(N)) {
          if (Xq && !B.relatedTarget) {
            if (!W.current && !X6(N)) return
          } else if (!XX(N)) return
        }
        let _ = $6(B.relatedTarget, J.context.triggerElements),
          { nativeEvent: L, currentTarget: F } = B,
          k = typeof X === 'function' ? X() : X
        if ((J.select('open') && _) || k === 0 || k === void 0) {
          J.setOpen(!0, $0(c.triggerFocus, L, F))
          return
        }
        Y.start(k, () => {
          if (K.current) return
          J.setOpen(!0, $0(c.triggerFocus, L, F))
        })
      },
      onBlur(B) {
        ;((K.current = !1), (G.current = null))
        let { relatedTarget: H, nativeEvent: N } = B,
          _ =
            C0(H) &&
            H.hasAttribute(j5('focus-guard')) &&
            H.getAttribute('data-type') === 'outside'
        Y.start(0, () => {
          let L = J.select('domReferenceElement'),
            F = B1(L ? L.ownerDocument : document)
          if (!H && F === L) return
          if (
            F0(q.current.floatingContext?.refs.floating.current, F) ||
            F0(L, F) ||
            _
          )
            return
          if ($6(H ?? F, J.context.triggerElements)) return
          J.setOpen(!1, $0(c.triggerFocus, N))
        })
      },
    }),
    [q, J, Y, X],
  )
  return y2.useMemo(() => ($ ? { reference: U, trigger: U } : {}), [$, U])
}
import * as Z9 from 'react'
var j7 = j5('safe-polygon'),
  cN = `button,a,[role="button"],select,[tabindex]:not([tabindex="-1"]),${u6}`
function LG(Q) {
  return Q ? Boolean(Q.closest(cN)) : !1
}
class Kq {
  constructor() {
    ;((this.pointerType = void 0),
      (this.interactedInside = !1),
      (this.handler = void 0),
      (this.blockMouseMove = !0),
      (this.performedPointerEventsMutation = !1),
      (this.unbindMouseMove = () => {}),
      (this.restTimeoutPending = !1),
      (this.openChangeTimeout = new p1()),
      (this.restTimeout = new p1()),
      (this.handleCloseOptions = void 0))
  }
  static create() {
    return new Kq()
  }
  dispose = () => {
    ;(this.openChangeTimeout.clear(), this.restTimeout.clear())
  }
  disposeEffect = () => {
    return this.dispose
  }
}
function T4(Q) {
  let Z = R0(Kq.create).current,
    J = Q.context.dataRef.current
  if (!J.hoverInteractionState) J.hoverInteractionState = Z
  return ($5(J.hoverInteractionState.disposeEffect), J.hoverInteractionState)
}
var dN = new Set(['click', 'mousedown'])
function n2(Q, Z = {}) {
  let J = 'rootStore' in Q ? Q.rootStore : Q,
    z = J.useState('open'),
    q = J.useState('floatingElement'),
    $ = J.useState('domReferenceElement'),
    { dataRef: X } = J.context,
    { enabled: K = !0, closeDelay: G = 0 } = Z,
    Y = T4(J),
    W = d1(),
    U = C1(),
    B = m(() => {
      if (Y.interactedInside) return !0
      return X.current.openEvent ? dN.has(X.current.openEvent.type) : !1
    }),
    H = m(() => {
      let V = X.current.openEvent?.type
      return V?.includes('mouse') && V !== 'mousedown'
    }),
    N = m((V) => {
      return $6(V, J.context.triggerElements)
    }),
    _ = Z9.useCallback(
      (V, M = !0) => {
        let j = iN(G, Y.pointerType)
        if (j && !Y.handler)
          Y.openChangeTimeout.start(j, () =>
            J.setOpen(!1, $0(c.triggerHover, V)),
          )
        else if (M)
          (Y.openChangeTimeout.clear(), J.setOpen(!1, $0(c.triggerHover, V)))
      },
      [G, J, Y],
    ),
    L = m(() => {
      ;(Y.unbindMouseMove(), (Y.handler = void 0))
    }),
    F = m(() => {
      if (Y.performedPointerEventsMutation) {
        let V = V0(q).body
        ;((V.style.pointerEvents = ''),
          V.removeAttribute(j7),
          (Y.performedPointerEventsMutation = !1))
      }
    }),
    k = m((V) => {
      let M = K1(V)
      if (!LG(M)) {
        Y.interactedInside = !1
        return
      }
      Y.interactedInside = !0
    })
  ;(u(() => {
    if (!z)
      ((Y.pointerType = void 0),
        (Y.restTimeoutPending = !1),
        (Y.interactedInside = !1),
        L(),
        F())
  }, [z, Y, L, F]),
    Z9.useEffect(() => {
      return () => {
        L()
      }
    }, [L]),
    Z9.useEffect(() => {
      return F
    }, [F]),
    u(() => {
      if (!K) return
      if (z && Y.handleCloseOptions?.blockPointerEvents && H() && C0($) && q) {
        Y.performedPointerEventsMutation = !0
        let V = V0(q).body
        V.setAttribute(j7, '')
        let M = $,
          j = q,
          A = W?.nodesRef.current.find((w) => w.id === U)?.context?.elements
            .floating
        if (A) A.style.pointerEvents = ''
        return (
          (V.style.pointerEvents = 'none'),
          (M.style.pointerEvents = 'auto'),
          (j.style.pointerEvents = 'auto'),
          () => {
            ;((V.style.pointerEvents = ''),
              (M.style.pointerEvents = ''),
              (j.style.pointerEvents = ''))
          }
        )
      }
      return
    }, [K, z, $, q, Y, H, W, U]),
    Z9.useEffect(() => {
      if (!K) return
      function V(w) {
        if (B() || !X.current.floatingContext || !J.select('open')) return
        if (N(w.relatedTarget)) return
        if ((F(), L(), !B())) _(w)
      }
      function M(w) {
        ;(Y.openChangeTimeout.clear(), F(), Y.handler?.(w), L())
      }
      function j(w) {
        if (!B()) _(w, !1)
      }
      let A = q
      if (A)
        (A.addEventListener('mouseleave', V),
          A.addEventListener('mouseenter', M),
          A.addEventListener('mouseleave', j),
          A.addEventListener('pointerdown', k, !0))
      return () => {
        if (A)
          (A.removeEventListener('mouseleave', V),
            A.removeEventListener('mouseenter', M),
            A.removeEventListener('mouseleave', j),
            A.removeEventListener('pointerdown', k, !0))
      }
    }, [K, q, J, X, B, N, _, F, L, k, Y]))
}
function iN(Q, Z) {
  if (Z && !E5(Z)) return 0
  if (typeof Q === 'function') return Q()
  return Q
}
import * as M6 from 'react'
import * as FG from 'react-dom'
function Gq(Q) {
  if (typeof Q === 'function') return Q()
  return Q
}
var lN = { current: null }
function J2(Q, Z = {}) {
  let J = 'rootStore' in Q ? Q.rootStore : Q,
    { dataRef: z, events: q } = J.context,
    {
      enabled: $ = !0,
      delay: X = 0,
      handleClose: K = null,
      mouseOnly: G = !1,
      restMs: Y = 0,
      move: W = !0,
      triggerElementRef: U = lN,
      externalTree: B,
      isActiveTrigger: H = !0,
    } = Z,
    N = d1(B),
    _ = T4(J),
    L = s0(K),
    F = s0(X),
    k = s0(Y),
    V = s0($)
  if (H) _.handleCloseOptions = L.current?.__options
  let M = m(() => {
      if (_.interactedInside) return !0
      return z.current.openEvent
        ? ['click', 'mousedown'].includes(z.current.openEvent.type)
        : !1
    }),
    j = m((x) => {
      return $6(x, J.context.triggerElements)
    }),
    A = M6.useCallback(
      (x, h = !0) => {
        let I = t6(F.current, 'close', _.pointerType)
        if (I && !_.handler)
          _.openChangeTimeout.start(I, () =>
            J.setOpen(!1, $0(c.triggerHover, x)),
          )
        else if (h)
          (_.openChangeTimeout.clear(), J.setOpen(!1, $0(c.triggerHover, x)))
      },
      [F, J, _],
    ),
    w = m(() => {
      ;(_.unbindMouseMove(), (_.handler = void 0))
    }),
    O = m(() => {
      if (_.performedPointerEventsMutation) {
        let x = V0(J.select('domReferenceElement')).body
        ;((x.style.pointerEvents = ''),
          x.removeAttribute(j7),
          (_.performedPointerEventsMutation = !1))
      }
    })
  M6.useEffect(() => {
    if (!$) return
    function x(h) {
      if (!h.open)
        (_.openChangeTimeout.clear(),
          _.restTimeout.clear(),
          (_.blockMouseMove = !0),
          (_.restTimeoutPending = !1))
    }
    return (
      q.on('openchange', x),
      () => {
        q.off('openchange', x)
      }
    )
  }, [$, q, _])
  let S = m((x) => {
    if (M()) return
    if (!z.current.floatingContext) return
    if (j(x.relatedTarget)) return
    let h = U.current
    L.current?.({
      ...z.current.floatingContext,
      tree: N,
      x: x.clientX,
      y: x.clientY,
      onClose() {
        if ((O(), w(), !M() && h === J.select('domReferenceElement'))) A(x)
      },
    })(x)
  })
  return (
    M6.useEffect(() => {
      if (!$) return
      let x = U.current ?? (H ? J.select('domReferenceElement') : null)
      if (!C0(x)) return
      function h(T) {
        if (
          (_.openChangeTimeout.clear(),
          (_.blockMouseMove = !1),
          G && !E5(_.pointerType))
        )
          return
        if (Gq(k.current) > 0 && !t6(F.current, 'open')) return
        let R = t6(F.current, 'open', _.pointerType),
          v = J.select('domReferenceElement'),
          P = J.context.triggerElements,
          D =
            (P.hasElement(T.target) ||
              P.hasMatchingElement((p) => F0(p, T.target))) &&
            (!v || !F0(v, T.target)),
          E = T.currentTarget ?? null,
          C = J.select('open'),
          a = !C || D
        if (D && C) J.setOpen(!0, $0(c.triggerHover, T, E))
        else if (R)
          _.openChangeTimeout.start(R, () => {
            if (a) J.setOpen(!0, $0(c.triggerHover, T, E))
          })
        else if (a) J.setOpen(!0, $0(c.triggerHover, T, E))
      }
      function I(T) {
        if (M()) {
          O()
          return
        }
        _.unbindMouseMove()
        let R = J.select('domReferenceElement'),
          v = V0(R)
        if (
          (_.restTimeout.clear(),
          (_.restTimeoutPending = !1),
          j(T.relatedTarget))
        )
          return
        if (L.current && z.current.floatingContext) {
          if (!J.select('open')) _.openChangeTimeout.clear()
          let D = U.current
          _.handler = L.current({
            ...z.current.floatingContext,
            tree: N,
            x: T.clientX,
            y: T.clientY,
            onClose() {
              if (
                (O(),
                w(),
                V.current && !M() && D === J.select('domReferenceElement'))
              )
                A(T, !0)
            },
          })
          let E = _.handler
          ;(E(T),
            v.addEventListener('mousemove', E),
            (_.unbindMouseMove = () => {
              v.removeEventListener('mousemove', E)
            }))
          return
        }
        if (
          _.pointerType === 'touch'
            ? !F0(J.select('floatingElement'), T.relatedTarget)
            : !0
        )
          A(T)
      }
      function y(T) {
        S(T)
      }
      if (J.select('open')) x.addEventListener('mouseleave', y)
      if (W) x.addEventListener('mousemove', h, { once: !0 })
      return (
        x.addEventListener('mouseenter', h),
        x.addEventListener('mouseleave', I),
        () => {
          if ((x.removeEventListener('mouseleave', y), W))
            x.removeEventListener('mousemove', h)
          ;(x.removeEventListener('mouseenter', h),
            x.removeEventListener('mouseleave', I))
        }
      )
    }, [w, O, z, F, A, J, $, L, S, _, H, M, j, G, W, k, U, N, V]),
    M6.useMemo(() => {
      if (!$) return
      function x(h) {
        _.pointerType = h.pointerType
      }
      return {
        onPointerDown: x,
        onPointerEnter: x,
        onMouseMove(h) {
          let { nativeEvent: I } = h,
            y = h.currentTarget,
            T = J.select('domReferenceElement'),
            R = J.context.triggerElements,
            v = J.select('open'),
            P =
              (R.hasElement(h.target) ||
                R.hasMatchingElement((E) => F0(E, h.target))) &&
              (!T || !F0(T, h.target))
          if (G && !E5(_.pointerType)) return
          if ((v && !P) || Gq(k.current) === 0) return
          if (
            !P &&
            _.restTimeoutPending &&
            h.movementX ** 2 + h.movementY ** 2 < 2
          )
            return
          _.restTimeout.clear()
          function D() {
            if (((_.restTimeoutPending = !1), M())) return
            let E = J.select('open')
            if (!_.blockMouseMove && (!E || P))
              J.setOpen(!0, $0(c.triggerHover, I, y))
          }
          if (_.pointerType === 'touch')
            FG.flushSync(() => {
              D()
            })
          else if (P && v) D()
          else
            ((_.restTimeoutPending = !0), _.restTimeout.start(Gq(k.current), D))
        },
      }
    }, [$, _, M, G, J, k])
  )
}
import * as j6 from 'react'
function O1(Q = []) {
  let Z = Q.map((Y) => Y?.reference),
    J = Q.map((Y) => Y?.floating),
    z = Q.map((Y) => Y?.item),
    q = Q.map((Y) => Y?.trigger),
    $ = j6.useCallback((Y) => P4(Y, Q, 'reference'), Z),
    X = j6.useCallback((Y) => P4(Y, Q, 'floating'), J),
    K = j6.useCallback((Y) => P4(Y, Q, 'item'), z),
    G = j6.useCallback((Y) => P4(Y, Q, 'trigger'), q)
  return j6.useMemo(
    () => ({
      getReferenceProps: $,
      getFloatingProps: X,
      getItemProps: K,
      getTriggerProps: G,
    }),
    [$, X, K, G],
  )
}
function P4(Q, Z, J) {
  let z = new Map(),
    q = J === 'item',
    $ = {}
  if (J === 'floating') (($.tabIndex = -1), ($[c9] = ''))
  for (let X in Q) {
    if (q && Q) {
      if (X === oJ || X === tJ) continue
    }
    $[X] = Q[X]
  }
  for (let X = 0; X < Z.length; X += 1) {
    let K,
      G = Z[X]?.[J]
    if (typeof G === 'function') K = Q ? G(Q) : null
    else K = G
    if (!K) continue
    kG($, K, q, z)
  }
  return (kG($, Q, q, z), $)
}
function kG(Q, Z, J, z) {
  for (let q in Z) {
    let $ = Z[q]
    if (J && (q === oJ || q === tJ)) continue
    if (!q.startsWith('on')) Q[q] = $
    else {
      if (!z.has(q)) z.set(q, [])
      if (typeof $ === 'function')
        (z.get(q)?.push($),
          (Q[q] = (...X) => {
            return z
              .get(q)
              ?.map((K) => K(...X))
              .find((K) => K !== void 0)
          }))
    }
  }
}
import * as h1 from 'react'
var rN = 'Escape'
function S4(Q, Z, J) {
  switch (Q) {
    case 'vertical':
      return Z
    case 'horizontal':
      return J
    default:
      return Z || J
  }
}
function E4(Q, Z) {
  return S4(Z, Q === d9 || Q === q6, Q === G2 || Q === Y2)
}
function Yq(Q, Z, J) {
  return (
    S4(Z, Q === q6, J ? Q === G2 : Q === Y2) ||
    Q === 'Enter' ||
    Q === ' ' ||
    Q === ''
  )
}
function aN(Q, Z, J) {
  return S4(Z, J ? Q === G2 : Q === Y2, Q === q6)
}
function sN(Q, Z, J, z) {
  let q = J ? Q === Y2 : Q === G2,
    $ = Q === d9
  if (Z === 'both' || (Z === 'horizontal' && z && z > 1)) return Q === rN
  return S4(Z, q, $)
}
function V7(Q, Z) {
  let J = 'rootStore' in Q ? Q.rootStore : Q,
    z = J.useState('open'),
    q = J.useState('floatingElement'),
    $ = J.useState('domReferenceElement'),
    X = J.context.dataRef,
    {
      listRef: K,
      activeIndex: G,
      onNavigate: Y = () => {},
      enabled: W = !0,
      selectedIndex: U = null,
      allowEscape: B = !1,
      loopFocus: H = !1,
      nested: N = !1,
      rtl: _ = !1,
      virtual: L = !1,
      focusItemOnOpen: F = 'auto',
      focusItemOnHover: k = !0,
      openOnArrowKeyDown: V = !0,
      disabledIndices: M = void 0,
      orientation: j = 'vertical',
      parentOrientation: A,
      cols: w = 1,
      id: O,
      resetOnPointerLeave: S = !0,
      externalTree: x,
    } = Z
  if (B) {
    if (!H)
      console.warn(
        '`useListNavigation` looping must be enabled to allow escaping.',
      )
    if (!L)
      console.warn('`useListNavigation` must be virtual to allow escaping.')
  }
  if (j === 'vertical' && w > 1)
    console.warn(
      'In grid list navigation mode (`cols` > 1), the `orientation` should',
      'be either "horizontal" or "both".',
    )
  let h = m2(q),
    I = s0(h),
    y = C1(),
    T = d1(x)
  u(() => {
    X.current.orientation = j
  }, [X, j])
  let R = i9($),
    v = h1.useRef(F),
    P = h1.useRef(U ?? -1),
    D = h1.useRef(null),
    E = h1.useRef(!0),
    C = m((l) => {
      Y(P.current === -1 ? null : P.current, l)
    }),
    a = h1.useRef(C),
    p = h1.useRef(!!q),
    Q0 = h1.useRef(z),
    g = h1.useRef(!1),
    Z0 = h1.useRef(!1),
    i = s0(M),
    X0 = s0(z),
    Y0 = s0(U),
    J0 = s0(S),
    U0 = m(() => {
      function l(H0) {
        if (L) T?.events.emit('virtualfocus', H0)
        else N6(H0, { sync: g.current, preventScroll: !0 })
      }
      let q0 = K.current[P.current],
        n = Z0.current
      if (q0) l(q0)
      ;(g.current ? (H0) => H0() : requestAnimationFrame)(() => {
        let H0 = K.current[P.current] || q0
        if (!H0) return
        if (!q0) l(H0)
        if (b && (n || !E.current))
          H0.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
      })
    })
  ;(u(() => {
    if (!W) return
    if (z && q) {
      if (((P.current = U ?? -1), v.current && U != null))
        ((Z0.current = !0), C())
    } else if (p.current) ((P.current = -1), a.current())
  }, [W, z, q, U, C]),
    u(() => {
      if (!W) return
      if (!z) {
        g.current = !1
        return
      }
      if (!q) return
      if (G == null) {
        if (((g.current = !1), Y0.current != null)) return
        if (p.current) ((P.current = -1), U0())
        if (
          (!Q0.current || !p.current) &&
          v.current &&
          (D.current != null || (v.current === !0 && D.current == null))
        ) {
          let l = 0,
            q0 = () => {
              if (K.current[0] == null) {
                if (l < 2) (l ? requestAnimationFrame : queueMicrotask)(q0)
                l += 1
              } else
                ((P.current =
                  D.current == null || Yq(D.current, j, _) || N
                    ? G6(K)
                    : c6(K)),
                  (D.current = null),
                  C())
            }
          q0()
        }
      } else if (!p2(K, G)) ((P.current = G), U0(), (Z0.current = !1))
    }, [W, z, q, G, Y0, N, K, j, _, C, U0, i]),
    u(() => {
      if (!W || q || !T || L || !p.current) return
      let l = T.nodesRef.current,
        q0 = l.find((H0) => H0.id === y)?.context?.elements.floating,
        n = B1(V0(q)),
        _0 = l.some((H0) => H0.context && F0(H0.context.elements.floating, n))
      if (q0 && !_0 && E.current) q0.focus({ preventScroll: !0 })
    }, [W, q, T, y, L]),
    u(() => {
      ;((a.current = C), (Q0.current = z), (p.current = !!q))
    }),
    u(() => {
      if (!z) ((D.current = null), (v.current = F))
    }, [z, F]))
  let K0 = G != null,
    b = h1.useMemo(() => {
      function l(n) {
        if (!X0.current) return
        let _0 = K.current.indexOf(n.currentTarget)
        if (_0 !== -1 && P.current !== _0) ((P.current = _0), C(n))
      }
      return {
        onFocus(n) {
          ;((g.current = !0), l(n))
        },
        onClick: ({ currentTarget: n }) => n.focus({ preventScroll: !0 }),
        onMouseMove(n) {
          if (((g.current = !0), (Z0.current = !1), k)) l(n)
        },
        onPointerLeave(n) {
          if (!X0.current || !E.current || n.pointerType === 'touch') return
          g.current = !0
          let _0 = n.relatedTarget
          if (!k || K.current.includes(_0)) return
          if (!J0.current) return
          if ((N6(null, { sync: !0 }), (P.current = -1), C(n), !L))
            I.current?.focus({ preventScroll: !0 })
        },
      }
    }, [X0, I, k, K, C, J0, L]),
    r = h1.useCallback(() => {
      return (
        A ??
        T?.nodesRef.current.find((l) => l.id === y)?.context?.dataRef?.current
          .orientation
      )
    }, [y, T, A]),
    t = m((l) => {
      if (((E.current = !1), (g.current = !0), l.which === 229)) return
      if (!X0.current && l.currentTarget === I.current) return
      if (N && sN(l.key, j, _, w)) {
        if (!E4(l.key, r())) A1(l)
        if ((J.setOpen(!1, $0(c.listNavigation, l.nativeEvent)), m0($)))
          if (L) T?.events.emit('virtualfocus', $)
          else $.focus()
        return
      }
      let q0 = P.current,
        n = G6(K, M),
        _0 = c6(K, M)
      if (!R) {
        if (l.key === 'Home') (A1(l), (P.current = n), C(l))
        if (l.key === 'End') (A1(l), (P.current = _0), C(l))
      }
      if (w > 1) {
        let H0 = Array.from({ length: K.current.length }, () => ({
            width: 1,
            height: 1,
          })),
          W0 = o9(H0, w, !1),
          O0 = W0.findIndex((T0) => T0 != null && !s5(K, T0, M)),
          f0 = W0.reduce(
            (T0, y0, P0) => (y0 != null && !s5(K, y0, M) ? P0 : T0),
            -1,
          ),
          A0 =
            W0[
              n9(
                {
                  current: W0.map((T0) => (T0 != null ? K.current[T0] : null)),
                },
                {
                  event: l,
                  orientation: j,
                  loopFocus: H,
                  rtl: _,
                  cols: w,
                  disabledIndices: e9(
                    [
                      ...((typeof M !== 'function' ? M : null) ||
                        K.current.map((T0, y0) =>
                          s5(K, y0, M) ? y0 : void 0,
                        )),
                      void 0,
                    ],
                    W0,
                  ),
                  minIndex: O0,
                  maxIndex: f0,
                  prevIndex: t9(
                    P.current > _0 ? n : P.current,
                    H0,
                    W0,
                    w,
                    l.key === q6 ? 'bl' : l.key === (_ ? G2 : Y2) ? 'tr' : 'tl',
                  ),
                  stopEvent: !0,
                },
              )
            ]
        if (A0 != null) ((P.current = A0), C(l))
        if (j === 'both') return
      }
      if (E4(l.key, j)) {
        if (
          (A1(l),
          z && !L && B1(l.currentTarget.ownerDocument) === l.currentTarget)
        ) {
          ;((P.current = Yq(l.key, j, _) ? n : _0), C(l))
          return
        }
        if (Yq(l.key, j, _))
          if (H)
            if (q0 >= _0)
              if (B && q0 !== K.current.length) P.current = -1
              else ((g.current = !1), (P.current = n))
            else P.current = w1(K, { startingIndex: q0, disabledIndices: M })
          else
            P.current = Math.min(
              _0,
              w1(K, { startingIndex: q0, disabledIndices: M }),
            )
        else if (H)
          if (q0 <= n)
            if (B && q0 !== -1) P.current = K.current.length
            else ((g.current = !1), (P.current = _0))
          else
            P.current = w1(K, {
              startingIndex: q0,
              decrement: !0,
              disabledIndices: M,
            })
        else
          P.current = Math.max(
            n,
            w1(K, { startingIndex: q0, decrement: !0, disabledIndices: M }),
          )
        if (p2(K, P.current)) P.current = -1
        C(l)
      }
    }),
    e = h1.useMemo(() => {
      return L && z && K0 && { 'aria-activedescendant': `${O}-${G}` }
    }, [L, z, K0, O, G]),
    s = h1.useMemo(() => {
      return {
        'aria-orientation': j === 'both' ? void 0 : j,
        ...(!R ? e : {}),
        onKeyDown(l) {
          if (l.key === 'Tab' && l.shiftKey && z && !L) {
            let q0 = K1(l.nativeEvent)
            if (q0 && !F0(I.current, q0)) return
            if ((A1(l), J.setOpen(!1, $0(c.focusOut, l.nativeEvent)), m0($)))
              $.focus()
            return
          }
          t(l)
        },
        onPointerMove() {
          E.current = !0
        },
      }
    }, [e, t, I, j, R, J, z, L, $]),
    d = h1.useMemo(() => {
      function l(n) {
        if (F === 'auto' && MQ(n.nativeEvent)) v.current = !L
      }
      function q0(n) {
        if (((v.current = F), F === 'auto' && jQ(n.nativeEvent))) v.current = !0
      }
      return {
        onKeyDown(n) {
          let _0 = J.select('open')
          E.current = !1
          let H0 = n.key.startsWith('Arrow'),
            W0 = aN(n.key, r(), _),
            O0 = E4(n.key, j),
            f0 = (N ? W0 : O0) || n.key === 'Enter' || n.key.trim() === ''
          if (L && _0) return t(n)
          if (!_0 && !V && H0) return
          if (f0) {
            let A0 = E4(n.key, r())
            D.current = N && A0 ? null : n.key
          }
          if (N) {
            if (W0)
              if ((A1(n), _0)) ((P.current = G6(K, i.current)), C(n))
              else
                J.setOpen(
                  !0,
                  $0(c.listNavigation, n.nativeEvent, n.currentTarget),
                )
            return
          }
          if (O0) {
            if (Y0.current != null) P.current = Y0.current
            if ((A1(n), !_0 && V))
              J.setOpen(
                !0,
                $0(c.listNavigation, n.nativeEvent, n.currentTarget),
              )
            else t(n)
            if (_0) C(n)
          }
          return
        },
        onFocus(n) {
          if (J.select('open') && !L) ((P.current = -1), C(n))
        },
        onPointerDown: q0,
        onPointerEnter: q0,
        onMouseDown: l,
        onClick: l,
      }
    }, [t, i, F, K, N, C, J, V, j, r, _, Y0, L]),
    o = h1.useMemo(() => {
      return { ...e, ...d }
    }, [e, d])
  return h1.useMemo(
    () => (W ? { reference: o, floating: s, item: b, trigger: d } : {}),
    [W, o, s, d, b],
  )
}
import * as P8 from 'react'
var nN = new Map([
  ['select', 'listbox'],
  ['combobox', 'listbox'],
  ['label', !1],
])
function V6(Q, Z = {}) {
  let J = 'rootStore' in Q ? Q.rootStore : Q,
    z = J.useState('open'),
    q = J.useState('floatingId'),
    $ = J.useState('domReferenceElement'),
    X = J.useState('floatingElement'),
    { role: K = 'dialog' } = Z,
    G = q5(),
    Y = $?.id || G,
    W = P8.useMemo(() => m2(X)?.id || q, [X, q]),
    U = nN.get(K) ?? K,
    H = C1() != null,
    N = P8.useMemo(() => {
      if (U === 'tooltip' || K === 'label') return S0
      return {
        'aria-haspopup': U === 'alertdialog' ? 'dialog' : U,
        'aria-expanded': 'false',
        ...(U === 'listbox' && { role: 'combobox' }),
        ...(U === 'menu' && H && { role: 'menuitem' }),
        ...(K === 'select' && { 'aria-autocomplete': 'none' }),
        ...(K === 'combobox' && { 'aria-autocomplete': 'list' }),
      }
    }, [U, H, K]),
    _ = P8.useMemo(() => {
      if (U === 'tooltip' || K === 'label')
        return {
          [`aria-${K === 'label' ? 'labelledby' : 'describedby'}`]: z
            ? W
            : void 0,
        }
      return {
        ...N,
        'aria-expanded': z ? 'true' : 'false',
        'aria-controls': z ? W : void 0,
        ...(U === 'menu' && { id: Y }),
      }
    }, [U, W, z, Y, K, N]),
    L = P8.useMemo(() => {
      let k = { id: W, ...(U && { role: U }) }
      if (U === 'tooltip' || K === 'label') return k
      return { ...k, ...(U === 'menu' && { 'aria-labelledby': Y }) }
    }, [U, W, Y, K]),
    F = P8.useCallback(
      ({ active: k, selected: V }) => {
        let M = { role: 'option', ...(k && { id: `${W}-fui-option` }) }
        switch (K) {
          case 'select':
          case 'combobox':
            return { ...M, 'aria-selected': V }
          default:
        }
        return {}
      },
      [W, K],
    )
  return P8.useMemo(
    () => ({ reference: _, floating: L, item: F, trigger: N }),
    [_, L, N, F],
  )
}
import * as E8 from 'react'
function A7(Q, Z) {
  let J = 'rootStore' in Q ? Q.rootStore : Q,
    z = J.context.dataRef,
    q = J.useState('open'),
    {
      listRef: $,
      activeIndex: X,
      onMatch: K,
      onTypingChange: G,
      enabled: Y = !0,
      resetMs: W = 750,
      selectedIndex: U = null,
    } = Z,
    B = c0(),
    H = E8.useRef(''),
    N = E8.useRef(U ?? X ?? -1),
    _ = E8.useRef(null)
  ;(u(() => {
    if (!q && U !== null) return
    if ((B.clear(), (_.current = null), H.current !== '')) H.current = ''
  }, [q, U, B]),
    u(() => {
      if (q && H.current === '') N.current = U ?? X ?? -1
    }, [q, U, X]))
  let L = m((j) => {
      if (j) {
        if (!z.current.typing) ((z.current.typing = j), G?.(j))
      } else if (z.current.typing) ((z.current.typing = j), G?.(j))
    }),
    F = m((j) => {
      function A(I, y, T) {
        let R = y.find(
          (v) => v?.toLocaleLowerCase().indexOf(T.toLocaleLowerCase()) === 0,
        )
        return R ? I.indexOf(R) : -1
      }
      let w = $.current
      if (H.current.length > 0 && H.current[0] !== ' ') {
        if (A(w, w, H.current) === -1) L(!1)
        else if (j.key === ' ') A1(j)
      }
      if (w == null || j.key.length !== 1 || j.ctrlKey || j.metaKey || j.altKey)
        return
      if (q && j.key !== ' ') (A1(j), L(!0))
      let O = H.current === ''
      if (O) N.current = U ?? X ?? -1
      if (
        w.every((I) =>
          I ? I[0]?.toLocaleLowerCase() !== I[1]?.toLocaleLowerCase() : !0,
        ) &&
        H.current === j.key
      )
        ((H.current = ''), (N.current = _.current))
      ;((H.current += j.key),
        B.start(W, () => {
          ;((H.current = ''), (N.current = _.current), L(!1))
        }))
      let x = O ? (U ?? X ?? -1) : N.current,
        h = A(
          w,
          [...w.slice((x || 0) + 1), ...w.slice(0, (x || 0) + 1)],
          H.current,
        )
      if (h !== -1) (K?.(h), (_.current = h))
      else if (j.key !== ' ') ((H.current = ''), L(!1))
    }),
    k = m((j) => {
      let A = j.relatedTarget,
        w = J.select('domReferenceElement'),
        O = J.select('floatingElement'),
        S = F0(w, A),
        x = F0(O, A)
      if (S || x) return
      ;(B.clear(), (H.current = ''), (N.current = _.current), L(!1))
    }),
    V = E8.useMemo(() => ({ onKeyDown: F, onBlur: k }), [F, k]),
    M = E8.useMemo(() => {
      return {
        onKeyDown: F,
        onKeyUp(j) {
          if (j.key === ' ') L(!1)
        },
        onBlur: k,
      }
    }, [F, k, L])
  return E8.useMemo(() => (Y ? { reference: V, floating: M } : {}), [Y, V, M])
}
function MG(Q, Z) {
  let [J, z] = Q,
    q = !1,
    $ = Z.length
  for (let X = 0, K = $ - 1; X < $; K = X++) {
    let [G, Y] = Z[X] || [0, 0],
      [W, U] = Z[K] || [0, 0]
    if (Y >= z !== U >= z && J <= ((W - G) * (z - Y)) / (U - Y) + G) q = !q
  }
  return q
}
function oN(Q, Z) {
  return (
    Q[0] >= Z.x &&
    Q[0] <= Z.x + Z.width &&
    Q[1] >= Z.y &&
    Q[1] <= Z.y + Z.height
  )
}
function z2(Q = {}) {
  let {
      buffer: Z = 0.5,
      blockPointerEvents: J = !1,
      requireIntent: z = !0,
    } = Q,
    q = new p1(),
    $ = !1,
    X = null,
    K = null,
    G = typeof performance < 'u' ? performance.now() : 0
  function Y(U, B) {
    let H = performance.now(),
      N = H - G
    if (X === null || K === null || N === 0)
      return ((X = U), (K = B), (G = H), null)
    let _ = U - X,
      L = B - K,
      k = Math.sqrt(_ * _ + L * L) / N
    return ((X = U), (K = B), (G = H), k)
  }
  let W = ({
    x: U,
    y: B,
    placement: H,
    elements: N,
    onClose: _,
    nodeId: L,
    tree: F,
  }) => {
    return function (V) {
      function M() {
        ;(q.clear(), _())
      }
      if (
        (q.clear(),
        !N.domReference || !N.floating || H == null || U == null || B == null)
      )
        return
      let { clientX: j, clientY: A } = V,
        w = [j, A],
        O = K1(V),
        S = V.type === 'mouseleave',
        x = F0(N.floating, O),
        h = F0(N.domReference, O),
        I = N.domReference.getBoundingClientRect(),
        y = N.floating.getBoundingClientRect(),
        T = H.split('-')[0],
        R = U > y.right - y.width / 2,
        v = B > y.bottom - y.height / 2,
        P = oN(w, I),
        D = y.width > I.width,
        E = y.height > I.height,
        C = (D ? I : y).left,
        a = (D ? I : y).right,
        p = (E ? I : y).top,
        Q0 = (E ? I : y).bottom
      if (x) {
        if ((($ = !0), !S)) return
      }
      if (h) $ = !1
      if (h && !S) {
        $ = !0
        return
      }
      if (S && C0(V.relatedTarget) && F0(N.floating, V.relatedTarget)) return
      if (F && W2(F.nodesRef.current, L).some(({ context: i }) => i?.open))
        return
      if (
        (T === 'top' && B >= I.bottom - 1) ||
        (T === 'bottom' && B <= I.top + 1) ||
        (T === 'left' && U >= I.right - 1) ||
        (T === 'right' && U <= I.left + 1)
      )
        return M()
      let g = []
      switch (T) {
        case 'top':
          g = [
            [C, I.top + 1],
            [C, y.bottom - 1],
            [a, y.bottom - 1],
            [a, I.top + 1],
          ]
          break
        case 'bottom':
          g = [
            [C, y.top + 1],
            [C, I.bottom - 1],
            [a, I.bottom - 1],
            [a, y.top + 1],
          ]
          break
        case 'left':
          g = [
            [y.right - 1, Q0],
            [y.right - 1, p],
            [I.left + 1, p],
            [I.left + 1, Q0],
          ]
          break
        case 'right':
          g = [
            [I.right - 1, Q0],
            [I.right - 1, p],
            [y.left + 1, p],
            [y.left + 1, Q0],
          ]
          break
        default:
      }
      function Z0([i, X0]) {
        switch (T) {
          case 'top': {
            let Y0 = [D ? i + Z / 2 : R ? i + Z * 4 : i - Z * 4, X0 + Z + 1],
              J0 = [D ? i - Z / 2 : R ? i + Z * 4 : i - Z * 4, X0 + Z + 1],
              U0 = [
                [y.left, R ? y.bottom - Z : D ? y.bottom - Z : y.top],
                [y.right, R ? (D ? y.bottom - Z : y.top) : y.bottom - Z],
              ]
            return [Y0, J0, ...U0]
          }
          case 'bottom': {
            let Y0 = [D ? i + Z / 2 : R ? i + Z * 4 : i - Z * 4, X0 - Z],
              J0 = [D ? i - Z / 2 : R ? i + Z * 4 : i - Z * 4, X0 - Z],
              U0 = [
                [y.left, R ? y.top + Z : D ? y.top + Z : y.bottom],
                [y.right, R ? (D ? y.top + Z : y.bottom) : y.top + Z],
              ]
            return [Y0, J0, ...U0]
          }
          case 'left': {
            let Y0 = [i + Z + 1, E ? X0 + Z / 2 : v ? X0 + Z * 4 : X0 - Z * 4],
              J0 = [i + Z + 1, E ? X0 - Z / 2 : v ? X0 + Z * 4 : X0 - Z * 4]
            return [
              ...[
                [v ? y.right - Z : E ? y.right - Z : y.left, y.top],
                [v ? (E ? y.right - Z : y.left) : y.right - Z, y.bottom],
              ],
              Y0,
              J0,
            ]
          }
          case 'right': {
            let Y0 = [i - Z, E ? X0 + Z / 2 : v ? X0 + Z * 4 : X0 - Z * 4],
              J0 = [i - Z, E ? X0 - Z / 2 : v ? X0 + Z * 4 : X0 - Z * 4],
              U0 = [
                [v ? y.left + Z : E ? y.left + Z : y.right, y.top],
                [v ? (E ? y.left + Z : y.right) : y.left + Z, y.bottom],
              ]
            return [Y0, J0, ...U0]
          }
          default:
            return []
        }
      }
      if (MG([j, A], g)) return
      if ($ && !P) return M()
      if (!S && z) {
        let i = Y(V.clientX, V.clientY),
          X0 = 0.1
        if (i !== null && i < 0.1) return M()
      }
      if (!MG([j, A], Z0([U, B]))) M()
      else if (!$ && z) q.start(40, M)
      return
    }
  }
  return ((W.__options = { blockPointerEvents: J }), W)
}
import * as J9 from 'react'
var I4 = J9.createContext(null)
I4.displayName = 'SelectRootContext'
var C4 = J9.createContext(null)
C4.displayName = 'SelectFloatingContext'
function W1() {
  let Q = J9.useContext(I4)
  if (Q === null)
    throw Error(
      'Base UI: SelectRootContext is missing. Select parts must be placed within <Select.Root>.',
    )
  return Q
}
function x4() {
  let Q = J9.useContext(C4)
  if (Q === null)
    throw Error(
      'Base UI: SelectFloatingContext is missing. Select parts must be placed within <Select.Root>.',
    )
  return Q
}
var jG = (Q, Z) => Object.is(Q, Z)
function S8(Q, Z, J) {
  if (Q == null || Z == null) return Object.is(Q, Z)
  return J(Q, Z)
}
function VG(Q, Z, J) {
  if (!Q || Q.length === 0) return !1
  return Q.some((z) => {
    if (z === void 0) return !1
    return S8(Z, z, J)
  })
}
function A6(Q, Z, J) {
  if (!Q || Q.length === 0) return -1
  return Q.findIndex((z) => {
    if (z === void 0) return !1
    return S8(z, Z, J)
  })
}
function AG(Q, Z, J) {
  return Q.filter((z) => !S8(Z, z, J))
}
import * as OG from 'react'
import { jsx as tN } from 'react/jsx-runtime'
function wG(Q) {
  return (
    Q != null &&
    Q.length > 0 &&
    typeof Q[0] === 'object' &&
    Q[0] != null &&
    'items' in Q[0]
  )
}
function yG(Q) {
  if (!Array.isArray(Q)) return Q != null && !('null' in Q)
  if (wG(Q)) {
    for (let Z of Q)
      for (let J of Z.items)
        if (J && J.value == null && J.label != null) return !0
    return !1
  }
  for (let Z of Q) if (Z && Z.value == null && Z.label != null) return !0
  return !1
}
function eN(Q, Z) {
  if (Z && Q != null) return Z(Q) ?? ''
  if (Q && typeof Q === 'object') {
    if ('label' in Q && Q.label != null) return String(Q.label)
    if ('value' in Q) return String(Q.value)
  }
  return n6(Q)
}
function I8(Q, Z) {
  if (Z && Q != null) return Z(Q) ?? ''
  if (Q && typeof Q === 'object' && 'value' in Q && 'label' in Q)
    return n6(Q.value)
  return n6(Q)
}
function Wq(Q, Z, J) {
  function z() {
    return eN(Q, J)
  }
  if (J && Q != null) return J(Q)
  if (Q && typeof Q === 'object' && 'label' in Q && Q.label != null)
    return Q.label
  if (Z && !Array.isArray(Z)) return Z[Q] ?? z()
  if (Array.isArray(Z)) {
    let q = wG(Z) ? Z.flatMap(($) => $.items) : Z
    if (Q == null || typeof Q !== 'object') {
      let $ = q.find((X) => X.value === Q)
      if ($ && $.label != null) return $.label
      return z()
    }
    if ('value' in Q) {
      let $ = q.find((X) => X && X.value === Q.value)
      if ($ && $.label != null) return $.label
    }
  }
  return z()
}
function DG(Q, Z, J) {
  return Q.reduce((z, q, $) => {
    if ($ > 0) z.push(', ')
    return (z.push(tN(OG.Fragment, { children: Wq(q, Z, J) }, $)), z)
  }, [])
}
var k0 = {
  id: G0((Q) => Q.id),
  modal: G0((Q) => Q.modal),
  multiple: G0((Q) => Q.multiple),
  items: G0((Q) => Q.items),
  itemToStringLabel: G0((Q) => Q.itemToStringLabel),
  itemToStringValue: G0((Q) => Q.itemToStringValue),
  isItemEqualToValue: G0((Q) => Q.isItemEqualToValue),
  value: G0((Q) => Q.value),
  hasSelectedValue: G0((Q) => {
    let { value: Z, multiple: J, itemToStringValue: z } = Q
    if (Z == null) return !1
    if (J && Array.isArray(Z)) return Z.length > 0
    return I8(Z, z) !== ''
  }),
  hasNullItemLabel: G0((Q, Z) => {
    return Z ? yG(Q.items) : !1
  }),
  open: G0((Q) => Q.open),
  mounted: G0((Q) => Q.mounted),
  forceMount: G0((Q) => Q.forceMount),
  transitionStatus: G0((Q) => Q.transitionStatus),
  openMethod: G0((Q) => Q.openMethod),
  activeIndex: G0((Q) => Q.activeIndex),
  selectedIndex: G0((Q) => Q.selectedIndex),
  isActive: G0((Q, Z) => Q.activeIndex === Z),
  isSelected: G0((Q, Z, J) => {
    let { isItemEqualToValue: z, value: q } = Q
    if (Q.multiple) return Array.isArray(q) && q.some(($) => S8(J, $, z))
    if (Q.selectedIndex === Z && Q.selectedIndex !== null) return !0
    return S8(J, q, z)
  }),
  isSelectedByFocus: G0((Q, Z) => {
    return Q.selectedIndex === Z
  }),
  popupProps: G0((Q) => Q.popupProps),
  triggerProps: G0((Q) => Q.triggerProps),
  triggerElement: G0((Q) => Q.triggerElement),
  positionerElement: G0((Q) => Q.positionerElement),
  listElement: G0((Q) => Q.listElement),
  scrollUpArrowVisible: G0((Q) => Q.scrollUpArrowVisible),
  scrollDownArrowVisible: G0((Q) => Q.scrollDownArrowVisible),
  hasScrollArrows: G0((Q) => Q.hasScrollArrows),
}
import * as z9 from 'react'
import * as O7 from 'react'
function TG(Q) {
  let Z = O7.useRef(''),
    J = O7.useCallback(
      (q) => {
        if (q.defaultPrevented) return
        ;((Z.current = q.pointerType), Q(q, q.pointerType))
      },
      [Q],
    )
  return {
    onClick: O7.useCallback(
      (q) => {
        if (q.detail === 0) {
          Q(q, 'keyboard')
          return
        }
        if ('pointerType' in q) Q(q, q.pointerType)
        else Q(q, Z.current)
        Z.current = ''
      },
      [Q],
    ),
    onPointerDown: J,
  }
}
function C8(Q) {
  let [Z, J] = z9.useState(null),
    z = m((K, G) => {
      if (!Q) J(G || (NQ ? 'touch' : ''))
    }),
    q = z9.useCallback(() => {
      J(null)
    }, []),
    { onClick: $, onPointerDown: X } = TG(z)
  return z9.useMemo(
    () => ({
      openMethod: Z,
      reset: q,
      triggerProps: { onClick: $, onPointerDown: X },
    }),
    [Z, q, $, X],
  )
}
import { jsx as Uq, jsxs as QL } from 'react/jsx-runtime'
function PG(Q) {
  let {
      id: Z,
      value: J,
      defaultValue: z = null,
      onValueChange: q,
      open: $,
      defaultOpen: X = !1,
      onOpenChange: K,
      name: G,
      autoComplete: Y,
      disabled: W = !1,
      readOnly: U = !1,
      required: B = !1,
      modal: H = !0,
      actionsRef: N,
      inputRef: _,
      onOpenChangeComplete: L,
      items: F,
      multiple: k = !1,
      itemToStringLabel: V,
      itemToStringValue: M,
      isItemEqualToValue: j = jG,
      highlightItemOnHover: A = !0,
      children: w,
    } = Q,
    { clearErrors: O } = v1(),
    {
      setDirty: S,
      setTouched: x,
      setFocused: h,
      shouldValidateOnChange: I,
      validityData: y,
      setFilled: T,
      name: R,
      disabled: v,
      validation: P,
      validationMode: D,
    } = r0(),
    E = I5({ id: Z }),
    C = v || W,
    a = R ?? G,
    [p, Q0] = _1({
      controlled: J,
      default: k ? (z ?? z5) : z,
      name: 'Select',
      state: 'value',
    }),
    [g, Z0] = _1({ controlled: $, default: X, name: 'Select', state: 'open' }),
    i = k1.useRef([]),
    X0 = k1.useRef([]),
    Y0 = k1.useRef(null),
    J0 = k1.useRef(null),
    U0 = k1.useRef(0),
    K0 = k1.useRef(null),
    b = k1.useRef([]),
    r = k1.useRef(!1),
    t = k1.useRef(!1),
    e = k1.useRef(null),
    s = k1.useRef({ allowSelectedMouseUp: !1, allowUnselectedMouseUp: !1 }),
    d = k1.useRef(!1),
    { mounted: o, setMounted: l, transitionStatus: q0 } = F1(g),
    { openMethod: n, triggerProps: _0, reset: H0 } = C8(g),
    W0 = R0(
      () =>
        new _7({
          id: E,
          modal: H,
          multiple: k,
          itemToStringLabel: V,
          itemToStringValue: M,
          isItemEqualToValue: j,
          value: p,
          open: g,
          mounted: o,
          transitionStatus: q0,
          items: F,
          forceMount: !1,
          openMethod: null,
          activeIndex: null,
          selectedIndex: null,
          popupProps: {},
          triggerProps: {},
          triggerElement: null,
          positionerElement: null,
          listElement: null,
          scrollUpArrowVisible: !1,
          scrollDownArrowVisible: !1,
          hasScrollArrows: !1,
        }),
    ).current,
    O0 = N0(W0, k0.activeIndex),
    f0 = N0(W0, k0.selectedIndex),
    A0 = N0(W0, k0.triggerElement),
    T0 = N0(W0, k0.positionerElement),
    y0 = k1.useMemo(() => {
      if (k && Array.isArray(p) && p.length === 0) return ''
      return I8(p, M)
    }, [k, p, M]),
    P0 = k1.useMemo(() => {
      if (k && Array.isArray(p)) return p.map((h0) => I8(h0, M))
      return I8(p, M)
    }, [k, p, M]),
    b0 = s0(W0.state.triggerElement)
  C5({
    id: E,
    commit: P.commit,
    value: p,
    controlRef: b0,
    name: a,
    getValue: () => P0,
  })
  let t0 = k1.useRef(p)
  ;(u(() => {
    if (p !== t0.current) W0.set('forceMount', !0)
  }, [W0, p]),
    u(() => {
      T(k ? Array.isArray(p) && p.length > 0 : p != null)
    }, [k, p, T]),
    u(
      function () {
        if (g) return
        let G1 = b.current
        if (k) {
          let J5 = Array.isArray(p) ? p : []
          if (J5.length === 0) {
            W0.set('selectedIndex', null)
            return
          }
          let S1 = J5[J5.length - 1],
            R6 = A6(G1, S1, j)
          W0.set('selectedIndex', R6 === -1 ? null : R6)
          return
        }
        let Z5 = A6(G1, p, j)
        W0.set('selectedIndex', Z5 === -1 ? null : Z5)
      },
      [k, g, p, b, j, W0],
    ),
    B2(p, () => {
      if ((O(a), S(p !== y.initialValue), I())) P.commit(p)
      else P.commit(p, !0)
    }))
  let L1 = m((h0, G1) => {
      if ((K?.(h0, G1), G1.isCanceled)) return
      if (
        (Z0(h0),
        !h0 && (G1.reason === c.focusOut || G1.reason === c.outsidePress))
      ) {
        if ((x(!0), h(!1), D === 'onBlur')) P.commit(p)
      }
      if (!h0 && W0.state.activeIndex !== null) {
        let Z5 = i.current[W0.state.activeIndex]
        queueMicrotask(() => {
          Z5?.setAttribute('tabindex', '-1')
        })
      }
    }),
    D0 = m(() => {
      ;(l(!1), W0.set('activeIndex', null), H0(), L?.(!1))
    })
  ;(a0({
    enabled: !N,
    open: g,
    ref: Y0,
    onComplete() {
      if (!g) D0()
    },
  }),
    k1.useImperativeHandle(N, () => ({ unmount: D0 }), [D0]))
  let B0 = m((h0, G1) => {
      if ((q?.(h0, G1), G1.isCanceled)) return
      Q0(h0)
    }),
    E0 = m(() => {
      let h0 = W0.state.listElement || Y0.current
      if (!h0) return
      let G1 = h0.scrollTop,
        Z5 = h0.scrollTop + h0.clientHeight,
        J5 = G1 > 1,
        S1 = Z5 < h0.scrollHeight - 1
      if (W0.state.scrollUpArrowVisible !== J5)
        W0.set('scrollUpArrowVisible', J5)
      if (W0.state.scrollDownArrowVisible !== S1)
        W0.set('scrollDownArrowVisible', S1)
    }),
    w0 = M7({
      open: g,
      onOpenChange: L1,
      elements: { reference: A0, floating: T0 },
    }),
    g0 = Q2(w0, { enabled: !U && !C, event: 'mousedown' }),
    e0 = A5(w0, { bubbles: !1 }),
    d0 = V7(w0, {
      enabled: !U && !C,
      listRef: i,
      activeIndex: O0,
      selectedIndex: f0,
      disabledIndices: z5,
      onNavigate(h0) {
        if (h0 === null && !g) return
        W0.set('activeIndex', h0)
      },
      focusItemOnHover: !1,
    }),
    x0 = A7(w0, {
      enabled: !U && !C && (g || !k),
      listRef: X0,
      activeIndex: O0,
      selectedIndex: f0,
      onMatch(h0) {
        if (g) W0.set('activeIndex', h0)
        else B0(b.current[h0], $0('none'))
      },
      onTypingChange(h0) {
        r.current = h0
      },
    }),
    {
      getReferenceProps: I0,
      getFloatingProps: p0,
      getItemProps: n0,
    } = O1([g0, e0, d0, x0]),
    H5 = k1.useMemo(() => {
      return q1(I0(), _0, E ? { id: E } : S0)
    }, [I0, _0, E])
  ;(x5(() => {
    W0.update({ popupProps: p0(), triggerProps: H5 })
  }),
    u(() => {
      W0.update({
        id: E,
        modal: H,
        multiple: k,
        value: p,
        open: g,
        mounted: o,
        transitionStatus: q0,
        popupProps: p0(),
        triggerProps: H5,
        items: F,
        itemToStringLabel: V,
        itemToStringValue: M,
        isItemEqualToValue: j,
        openMethod: n,
      })
    }, [W0, E, H, k, p, g, o, q0, p0, H5, F, V, M, j, n]))
  let c5 = k1.useMemo(
      () => ({
        store: W0,
        name: a,
        required: B,
        disabled: C,
        readOnly: U,
        multiple: k,
        itemToStringLabel: V,
        itemToStringValue: M,
        highlightItemOnHover: A,
        setValue: B0,
        setOpen: L1,
        listRef: i,
        popupRef: Y0,
        scrollHandlerRef: J0,
        handleScrollArrowVisibility: E0,
        scrollArrowsMountedCountRef: U0,
        getItemProps: n0,
        events: w0.context.events,
        valueRef: K0,
        valuesRef: b,
        labelsRef: X0,
        typingRef: r,
        selectionRef: s,
        selectedItemTextRef: e,
        validation: P,
        onOpenChangeComplete: L,
        keyboardActiveRef: t,
        alignItemWithTriggerActiveRef: d,
        initialValueRef: t0,
      }),
      [W0, a, B, C, U, k, V, M, A, B0, L1, n0, w0.context.events, P, L, E0],
    ),
    X8 = Y1(_, P.inputRef),
    b6 = k && Array.isArray(p) && p.length > 0,
    v2 = k1.useMemo(() => {
      if (!k || !Array.isArray(p) || !a) return null
      return p.map((h0) => {
        let G1 = I8(h0, M)
        return Uq('input', { type: 'hidden', name: a, value: G1 }, G1)
      })
    }, [k, p, a, M])
  return Uq(I4.Provider, {
    value: c5,
    children: QL(C4.Provider, {
      value: w0,
      children: [
        w,
        Uq('input', {
          ...P.getInputValidationProps({
            onFocus() {
              W0.state.triggerElement?.focus({ focusVisible: !0 })
            },
            onChange(h0) {
              if (h0.nativeEvent.defaultPrevented) return
              let G1 = h0.target.value,
                Z5 = $0(c.none, h0.nativeEvent)
              function J5() {
                if (k) return
                let S1 = b.current.find((R6) => {
                  if (I8(R6, M).toLowerCase() === G1.toLowerCase()) return !0
                  return !1
                })
                if (S1 != null) {
                  if ((S(S1 !== y.initialValue), B0(S1, Z5), I())) P.commit(S1)
                }
              }
              ;(W0.set('forceMount', !0), queueMicrotask(J5))
            },
          }),
          name: k ? void 0 : a,
          autoComplete: Y,
          value: y0,
          disabled: C,
          required: B && !b6,
          readOnly: U,
          ref: X8,
          style: a ? V8 : s1,
          tabIndex: -1,
          'aria-hidden': !0,
        }),
        v2,
      ],
    }),
  })
}
import * as x8 from 'react'
var O5 = (function (Q) {
    return (
      (Q.open = 'data-open'),
      (Q.closed = 'data-closed'),
      (Q[(Q.startingStyle = U6.startingStyle)] = 'startingStyle'),
      (Q[(Q.endingStyle = U6.endingStyle)] = 'endingStyle'),
      (Q.anchorHidden = 'data-anchor-hidden'),
      (Q.side = 'data-side'),
      (Q.align = 'data-align'),
      Q
    )
  })({}),
  w7 = (function (Q) {
    return ((Q.popupOpen = 'data-popup-open'), (Q.pressed = 'data-pressed'), Q)
  })({}),
  ZL = { [w7.popupOpen]: '' },
  JL = { [w7.popupOpen]: '', [w7.pressed]: '' },
  zL = { [O5.open]: '' },
  qL = { [O5.closed]: '' },
  $L = { [O5.anchorHidden]: '' },
  b5 = {
    open(Q) {
      if (Q) return ZL
      return null
    },
  },
  O6 = {
    open(Q) {
      if (Q) return JL
      return null
    },
  },
  v0 = {
    open(Q) {
      if (Q) return zL
      return qL
    },
    anchorHidden(Q) {
      if (Q) return $L
      return null
    },
  }
function h4(Q) {
  let Z = Q.getBoundingClientRect()
  return Z
}
var b4 = 2,
  XL = 400,
  EG = 200,
  KL = { ...O6, ...$1, value: () => null },
  Bq = x8.forwardRef(function (Z, J) {
    let {
        render: z,
        className: q,
        id: $,
        disabled: X = !1,
        nativeButton: K = !0,
        ...G
      } = Z,
      {
        setTouched: Y,
        setFocused: W,
        validationMode: U,
        state: B,
        disabled: H,
      } = r0(),
      { labelId: N } = X1(),
      {
        store: _,
        setOpen: L,
        selectionRef: F,
        validation: k,
        readOnly: V,
        required: M,
        alignItemWithTriggerActiveRef: j,
        disabled: A,
        keyboardActiveRef: w,
      } = W1(),
      O = H || A || X,
      S = N0(_, k0.open),
      x = N0(_, k0.value),
      h = N0(_, k0.triggerProps),
      I = N0(_, k0.positionerElement),
      y = N0(_, k0.listElement),
      T = N0(_, k0.id),
      R = N0(_, k0.hasSelectedValue),
      v = !R && S,
      P = N0(_, k0.hasNullItemLabel, v),
      D = $ ?? T
    I5({ id: D })
    let E = s0(I),
      C = x8.useRef(null),
      { getButtonProps: a, buttonRef: p } = Q1({ disabled: O, native: K }),
      Q0 = m((b) => {
        _.set('triggerElement', b)
      }),
      g = Y1(J, C, p, Q0),
      Z0 = c0(),
      i = c0(),
      X0 = c0(),
      Y0 = c0()
    x8.useEffect(() => {
      if (S) {
        if (!(R || P))
          X0.start(XL, () => {
            ;((F.current.allowUnselectedMouseUp = !0),
              (F.current.allowSelectedMouseUp = !0))
          })
        else
          Y0.start(EG, () => {
            ;((F.current.allowUnselectedMouseUp = !0),
              X0.start(EG, () => {
                F.current.allowSelectedMouseUp = !0
              }))
          })
        return () => {
          ;(X0.clear(), Y0.clear())
        }
      }
      ;((F.current = { allowSelectedMouseUp: !1, allowUnselectedMouseUp: !1 }),
        i.clear())
      return
    }, [S, R, P, F, i, X0, Y0])
    let J0 = x8.useMemo(() => {
        return y?.id ?? m2(I)?.id
      }, [y, I]),
      U0 = q1(
        h,
        {
          id: D,
          role: 'combobox',
          'aria-expanded': S ? 'true' : 'false',
          'aria-haspopup': 'listbox',
          'aria-controls': S ? J0 : void 0,
          'aria-labelledby': N,
          'aria-readonly': V || void 0,
          'aria-required': M || void 0,
          tabIndex: O ? -1 : 0,
          ref: g,
          onFocus(b) {
            if ((W(!0), S && j.current)) L(!1, $0(c.none, b.nativeEvent))
            Z0.start(0, () => {
              _.set('forceMount', !0)
            })
          },
          onBlur(b) {
            if (F0(I, b.relatedTarget)) return
            if ((Y(!0), W(!1), U === 'onBlur')) k.commit(x)
          },
          onPointerMove() {
            w.current = !1
          },
          onKeyDown() {
            w.current = !0
          },
          onMouseDown(b) {
            if (S) return
            let r = V0(b.currentTarget)
            function t(e) {
              if (!C.current) return
              let s = e.target
              if (F0(C.current, s) || F0(E.current, s) || s === C.current)
                return
              let d = h4(C.current)
              if (
                e.clientX >= d.left - b4 &&
                e.clientX <= d.right + b4 &&
                e.clientY >= d.top - b4 &&
                e.clientY <= d.bottom + b4
              )
                return
              L(!1, $0(c.cancelOpen, e))
            }
            i.start(0, () => {
              r.addEventListener('mouseup', t, { once: !0 })
            })
          },
        },
        k.getValidationProps,
        G,
        a,
      )
    U0.role = 'combobox'
    let K0 = {
      ...B,
      open: S,
      disabled: O,
      value: x,
      readOnly: V,
      placeholder: !R,
    }
    return f('button', Z, {
      ref: [J, C],
      state: K0,
      stateAttributesMapping: KL,
      props: U0,
    })
  })
Bq.displayName = 'SelectTrigger'
import * as SG from 'react'
var GL = { value: () => null },
  _q = SG.forwardRef(function (Z, J) {
    let { className: z, render: q, children: $, placeholder: X, ...K } = Z,
      { store: G, valueRef: Y } = W1(),
      W = N0(G, k0.value),
      U = N0(G, k0.items),
      B = N0(G, k0.itemToStringLabel),
      H = N0(G, k0.hasSelectedValue),
      N = !H && X != null && $ == null,
      _ = N0(G, k0.hasNullItemLabel, N),
      L = { value: W, placeholder: !H },
      F = null
    if (typeof $ === 'function') F = $(W)
    else if ($ != null) F = $
    else if (!H && X != null && !_) F = X
    else if (Array.isArray(W)) F = DG(W, U, B)
    else F = Wq(W, U, B)
    return f('span', Z, {
      state: L,
      ref: [J, Y],
      props: [{ children: F }, K],
      stateAttributesMapping: GL,
    })
  })
_q.displayName = 'SelectValue'
import * as IG from 'react'
var Hq = IG.forwardRef(function (Z, J) {
  let { className: z, render: q, ...$ } = Z,
    { store: X } = W1(),
    G = { open: N0(X, k0.open) }
  return f('span', Z, {
    state: G,
    ref: J,
    props: [{ 'aria-hidden': !0, children: '▼' }, $],
    stateAttributesMapping: b5,
  })
})
Hq.displayName = 'SelectIcon'
import * as xG from 'react'
import * as Nq from 'react'
var Lq = Nq.createContext(void 0)
Lq.displayName = 'SelectPortalContext'
import { jsx as CG } from 'react/jsx-runtime'
var Fq = xG.forwardRef(function (Z, J) {
  let { store: z } = W1(),
    q = N0(z, k0.mounted),
    $ = N0(z, k0.forceMount)
  if (!(q || $)) return null
  return CG(Lq.Provider, { value: !0, children: CG(M2, { ref: J, ...Z }) })
})
Fq.displayName = 'SelectPortal'
import * as hG from 'react'
var YL = { ...v0, ...i0 },
  kq = hG.forwardRef(function (Z, J) {
    let { className: z, render: q, ...$ } = Z,
      { store: X } = W1(),
      K = N0(X, k0.open),
      G = N0(X, k0.mounted),
      Y = N0(X, k0.transitionStatus)
    return f('div', Z, {
      state: { open: K, transitionStatus: Y },
      ref: J,
      props: [
        {
          role: 'presentation',
          hidden: !G,
          style: { userSelect: 'none', WebkitUserSelect: 'none' },
        },
        $,
      ],
      stateAttributesMapping: YL,
    })
  })
kq.displayName = 'SelectBackdrop'
import * as y5 from 'react'
function R5(Q) {
  if (g6(19)) return Q
  return Q ? 'true' : void 0
}
var bG = {},
  RG = {},
  vG = ''
function WL(Q) {
  if (typeof document > 'u') return !1
  let Z = V0(Q)
  return o0(Z).innerWidth - Z.documentElement.clientWidth > 0
}
function UL(Q) {
  if (
    !(
      typeof CSS < 'u' &&
      CSS.supports &&
      CSS.supports('scrollbar-gutter', 'stable')
    ) ||
    typeof document > 'u'
  )
    return !1
  let J = V0(Q),
    z = J.documentElement,
    q = J.body,
    $ = K2(z) ? z : q,
    X = $.style.overflowY,
    K = z.style.scrollbarGutter
  ;((z.style.scrollbarGutter = 'stable'), ($.style.overflowY = 'scroll'))
  let G = $.offsetWidth
  $.style.overflowY = 'hidden'
  let Y = $.offsetWidth
  return (($.style.overflowY = X), (z.style.scrollbarGutter = K), G === Y)
}
function BL(Q) {
  let Z = V0(Q),
    J = Z.documentElement,
    z = Z.body,
    q = K2(J) ? J : z,
    $ = { overflowY: q.style.overflowY, overflowX: q.style.overflowX }
  return (
    Object.assign(q.style, { overflowY: 'hidden', overflowX: 'hidden' }),
    () => {
      Object.assign(q.style, $)
    }
  )
}
function _L(Q) {
  let Z = V0(Q),
    J = Z.documentElement,
    z = Z.body,
    q = o0(J),
    $ = 0,
    X = 0,
    K = !1,
    G = S5.create()
  if (N8 && (q.visualViewport?.scale ?? 1) !== 1) return () => {}
  function Y() {
    let B = q.getComputedStyle(J),
      H = q.getComputedStyle(z),
      L = (B.scrollbarGutter || '').includes('both-edges')
        ? 'stable both-edges'
        : 'stable'
    ;(($ = J.scrollTop),
      (X = J.scrollLeft),
      (bG = {
        scrollbarGutter: J.style.scrollbarGutter,
        overflowY: J.style.overflowY,
        overflowX: J.style.overflowX,
      }),
      (vG = J.style.scrollBehavior),
      (RG = {
        position: z.style.position,
        height: z.style.height,
        width: z.style.width,
        boxSizing: z.style.boxSizing,
        overflowY: z.style.overflowY,
        overflowX: z.style.overflowX,
        scrollBehavior: z.style.scrollBehavior,
      }))
    let F = J.scrollHeight > J.clientHeight,
      k = J.scrollWidth > J.clientWidth,
      V = B.overflowY === 'scroll' || H.overflowY === 'scroll',
      M = B.overflowX === 'scroll' || H.overflowX === 'scroll',
      j = Math.max(0, q.innerWidth - z.clientWidth),
      A = Math.max(0, q.innerHeight - z.clientHeight),
      w = parseFloat(H.marginTop) + parseFloat(H.marginBottom),
      O = parseFloat(H.marginLeft) + parseFloat(H.marginRight),
      S = K2(J) ? J : z
    if (((K = UL(Q)), K)) {
      ;((J.style.scrollbarGutter = L),
        (S.style.overflowY = 'hidden'),
        (S.style.overflowX = 'hidden'))
      return
    }
    if (
      (Object.assign(J.style, {
        scrollbarGutter: L,
        overflowY: 'hidden',
        overflowX: 'hidden',
      }),
      F || V)
    )
      J.style.overflowY = 'scroll'
    if (k || M) J.style.overflowX = 'scroll'
    ;(Object.assign(z.style, {
      position: 'relative',
      height: w || A ? `calc(100dvh - ${w + A}px)` : '100dvh',
      width: O || j ? `calc(100vw - ${O + j}px)` : '100vw',
      boxSizing: 'border-box',
      overflow: 'hidden',
      scrollBehavior: 'unset',
    }),
      (z.scrollTop = $),
      (z.scrollLeft = X),
      J.setAttribute('data-base-ui-scroll-locked', ''),
      (J.style.scrollBehavior = 'unset'))
  }
  function W() {
    if ((Object.assign(J.style, bG), Object.assign(z.style, RG), !K))
      ((J.scrollTop = $),
        (J.scrollLeft = X),
        J.removeAttribute('data-base-ui-scroll-locked'),
        (J.style.scrollBehavior = vG))
  }
  function U() {
    ;(W(), G.request(Y))
  }
  return (
    Y(),
    q.addEventListener('resize', U),
    () => {
      if ((G.cancel(), W(), typeof q.removeEventListener === 'function'))
        q.removeEventListener('resize', U)
    }
  )
}
class fG {
  lockCount = 0
  restore = null
  timeoutLock = p1.create()
  timeoutUnlock = p1.create()
  acquire(Q) {
    if (((this.lockCount += 1), this.lockCount === 1 && this.restore === null))
      this.timeoutLock.start(0, () => this.lock(Q))
    return this.release
  }
  release = () => {
    if (((this.lockCount -= 1), this.lockCount === 0 && this.restore))
      this.timeoutUnlock.start(0, this.unlock)
  }
  unlock = () => {
    if (this.lockCount === 0 && this.restore)
      (this.restore?.(), (this.restore = null))
  }
  lock(Q) {
    if (this.lockCount === 0 || this.restore !== null) return
    let J = V0(Q).documentElement,
      z = o0(J).getComputedStyle(J).overflowY
    if (z === 'hidden' || z === 'clip') {
      this.restore = l0
      return
    }
    let q = NQ || !WL(Q)
    this.restore = q ? BL(Q) : _L(Q)
  }
}
var HL = new fG()
function h8(Q = !0, Z = null) {
  u(() => {
    if (!Q) return
    return HL.acquire(Z)
  }, [Q, Z])
}
import * as w5 from 'react'
var NL = (Q) => ({
    name: 'arrow',
    options: Q,
    async fn(Z) {
      let {
          x: J,
          y: z,
          placement: q,
          rects: $,
          platform: X,
          elements: K,
          middlewareData: G,
        } = Z,
        {
          element: Y,
          padding: W = 0,
          offsetParent: U = 'real',
        } = r5(Q, Z) || {}
      if (Y == null) return {}
      let B = wQ(W),
        H = { x: J, y: z },
        N = s9(q),
        _ = a9(N),
        L = await X.getDimensions(Y),
        F = N === 'y',
        k = F ? 'top' : 'left',
        V = F ? 'bottom' : 'right',
        M = F ? 'clientHeight' : 'clientWidth',
        j = $.reference[_] + $.reference[N] - H[N] - $.floating[_],
        A = H[N] - $.reference[N],
        w = U === 'real' ? await X.getOffsetParent?.(Y) : K.floating,
        O = K.floating[M] || $.floating[_]
      if (!O || !(await X.isElement?.(w))) O = K.floating[M] || $.floating[_]
      let S = j / 2 - A / 2,
        x = O / 2 - L[_] / 2 - 1,
        h = Math.min(B[k], x),
        I = Math.min(B[V], x),
        y = h,
        T = O - L[_] - I,
        R = O / 2 - L[_] / 2 + S,
        v = r9(y, R, T),
        P =
          !G.arrow &&
          a5(q) != null &&
          R !== v &&
          $.reference[_] / 2 - (R < y ? h : I) - L[_] / 2 < 0,
        D = P ? (R < y ? R - y : R - T) : 0
      return {
        [N]: H[N] + D,
        data: {
          [N]: v,
          centerOffset: R - v - D,
          ...(P && { alignmentOffset: D }),
        },
        reset: P,
      }
    },
  }),
  gG = (Q, Z) => ({ ...NL(Q), options: [Q, Z] })
var mG = {
  name: 'hide',
  async fn(Q) {
    let { width: Z, height: J, x: z, y: q } = Q.rects.reference,
      $ = Z === 0 && J === 0 && z === 0 && q === 0
    return {
      data: { referenceHidden: (await zq().fn(Q)).data?.referenceHidden || $ },
    }
  },
}
var y7 = { sideX: 'left', sideY: 'top' },
  q9 = {
    name: 'adaptiveOrigin',
    async fn(Q) {
      let {
          x: Z,
          y: J,
          rects: { floating: z },
          elements: { floating: q },
          platform: $,
          strategy: X,
          placement: K,
        } = Q,
        G = o0(q),
        Y = G.getComputedStyle(q)
      if (!(Y.transitionDuration !== '0s' && Y.transitionDuration !== ''))
        return { x: Z, y: J, data: y7 }
      let U = await $.getOffsetParent?.(q),
        B = { width: 0, height: 0 }
      if (X === 'fixed' && G?.visualViewport)
        B = { width: G.visualViewport.width, height: G.visualViewport.height }
      else if (U === G) {
        let k = V0(q)
        B = {
          width: k.documentElement.clientWidth,
          height: k.documentElement.clientHeight,
        }
      } else if (await $.isElement?.(U)) B = await $.getDimensions(U)
      let H = u1(K),
        N = Z,
        _ = J
      if (H === 'left') N = B.width - (Z + z.width)
      if (H === 'top') _ = B.height - (J + z.height)
      let L = H === 'left' ? 'right' : y7.sideX,
        F = H === 'top' ? 'bottom' : y7.sideY
      return { x: N, y: _, data: { sideX: L, sideY: F } }
    },
  }
function cG(Q, Z, J) {
  let z = Q === 'inline-start' || Q === 'inline-end'
  return {
    top: 'top',
    right: z ? (J ? 'inline-start' : 'inline-end') : 'right',
    bottom: 'bottom',
    left: z ? (J ? 'inline-end' : 'inline-start') : 'left',
  }[Z]
}
function pG(Q, Z, J) {
  let { rects: z, placement: q } = Q
  return {
    side: cG(Z, u1(q), J),
    align: a5(q) || 'center',
    anchor: { width: z.reference.width, height: z.reference.height },
    positioner: { width: z.floating.width, height: z.floating.height },
  }
}
function D2(Q) {
  let {
      anchor: Z,
      positionMethod: J = 'absolute',
      side: z = 'bottom',
      sideOffset: q = 0,
      align: $ = 'center',
      alignOffset: X = 0,
      collisionBoundary: K,
      collisionPadding: G = 5,
      sticky: Y = !1,
      arrowPadding: W = 5,
      disableAnchorTracking: U = !1,
      keepMounted: B = !1,
      floatingRootContext: H,
      mounted: N,
      collisionAvoidance: _,
      shiftCrossAxis: L = !1,
      nodeId: F,
      adaptiveOrigin: k,
      lazyFlip: V = !1,
      externalTree: M,
    } = Q,
    [j, A] = w5.useState(null)
  if (!N && j !== null) A(null)
  let w = _.side || 'flip',
    O = _.align || 'flip',
    S = _.fallbackAxisSide || 'end',
    x = typeof Z === 'function' ? Z : void 0,
    h = m(x),
    I = x ? h : Z,
    y = s0(Z),
    R = y1() === 'rtl',
    v =
      j ||
      {
        top: 'top',
        right: 'right',
        bottom: 'bottom',
        left: 'left',
        'inline-end': R ? 'left' : 'right',
        'inline-start': R ? 'right' : 'left',
      }[z],
    P = $ === 'center' ? v : `${v}-${$}`,
    D = G,
    E = 1,
    C = z === 'bottom' ? E : 0,
    a = z === 'top' ? E : 0,
    p = z === 'right' ? E : 0,
    Q0 = z === 'left' ? E : 0
  if (typeof D === 'number')
    D = { top: D + C, right: D + Q0, bottom: D + a, left: D + p }
  else if (D)
    D = {
      top: (D.top || 0) + C,
      right: (D.right || 0) + Q0,
      bottom: (D.bottom || 0) + a,
      left: (D.left || 0) + p,
    }
  let g = {
      boundary: K === 'clipping-ancestors' ? 'clippingAncestors' : K,
      padding: D,
    },
    Z0 = w5.useRef(null),
    i = s0(q),
    X0 = s0(X),
    U0 = [
      tz(
        (w0) => {
          let g0 = pG(w0, z, R),
            e0 = typeof i.current === 'function' ? i.current(g0) : i.current,
            d0 = typeof X0.current === 'function' ? X0.current(g0) : X0.current
          return { mainAxis: e0, crossAxis: d0, alignmentAxis: d0 }
        },
        [
          typeof q !== 'function' ? q : 0,
          typeof X !== 'function' ? X : 0,
          R,
          z,
        ],
      ),
    ],
    K0 = O === 'none' && w !== 'shift',
    b = !K0 && (Y || L || w === 'shift'),
    r =
      w === 'none'
        ? null
        : Zq({
            ...g,
            padding: {
              top: D.top + E,
              right: D.right + E,
              bottom: D.bottom + E,
              left: D.left + E,
            },
            mainAxis: !L && w === 'flip',
            crossAxis: O === 'flip' ? 'alignment' : !1,
            fallbackAxisSideDirection: S,
          }),
    t = K0
      ? null
      : ez(
          (w0) => {
            let g0 = V0(w0.elements.floating).documentElement
            return {
              ...g,
              rootBoundary: L
                ? { x: 0, y: 0, width: g0.clientWidth, height: g0.clientHeight }
                : void 0,
              mainAxis: O !== 'none',
              crossAxis: b,
              limiter:
                Y || L
                  ? void 0
                  : Qq((e0) => {
                      if (!Z0.current) return {}
                      let { width: d0, height: x0 } =
                          Z0.current.getBoundingClientRect(),
                        I0 = X5(u1(e0.placement)),
                        p0 = I0 === 'y' ? d0 : x0,
                        n0 = I0 === 'y' ? D.left + D.right : D.top + D.bottom
                      return { offset: p0 / 2 + n0 / 2 }
                    }),
            }
          },
          [g, Y, L, D, O],
        )
  if (w === 'shift' || O === 'shift' || $ === 'center') U0.push(t, r)
  else U0.push(r, t)
  ;(U0.push(
    Jq({
      ...g,
      apply({
        elements: { floating: w0 },
        rects: { reference: g0 },
        availableWidth: e0,
        availableHeight: d0,
      }) {
        let x0 = w0.style
        ;(x0.setProperty('--available-width', `${e0}px`),
          x0.setProperty('--available-height', `${d0}px`),
          x0.setProperty('--anchor-width', `${g0.width}px`),
          x0.setProperty('--anchor-height', `${g0.height}px`))
      },
    }),
    gG(
      () => ({
        element: Z0.current || document.createElement('div'),
        padding: W,
        offsetParent: 'floating',
      }),
      [W],
    ),
    {
      name: 'transformOrigin',
      fn(w0) {
        let {
            elements: g0,
            middlewareData: e0,
            placement: d0,
            rects: x0,
            y: I0,
          } = w0,
          p0 = u1(d0),
          n0 = X5(p0),
          H5 = Z0.current,
          c5 = e0.arrow?.x || 0,
          X8 = e0.arrow?.y || 0,
          b6 = H5?.clientWidth || 0,
          v2 = H5?.clientHeight || 0,
          h0 = c5 + b6 / 2,
          G1 = X8 + v2 / 2,
          Z5 = Math.abs(e0.shift?.y || 0),
          J5 = x0.reference.height / 2,
          S1 = typeof q === 'function' ? q(pG(w0, z, R)) : q,
          R6 = Z5 > S1,
          Q$ = {
            top: `${h0}px calc(100% + ${S1}px)`,
            bottom: `${h0}px ${-S1}px`,
            left: `calc(100% + ${S1}px) ${G1}px`,
            right: `${-S1}px ${G1}px`,
          }[p0],
          OU = `${h0}px ${x0.reference.y + J5 - I0}px`
        return (
          g0.floating.style.setProperty(
            '--transform-origin',
            b && n0 === 'y' && R6 ? OU : Q$,
          ),
          {}
        )
      },
    },
    mG,
    k,
  ),
    u(() => {
      if (!N && H)
        H.update({
          referenceElement: null,
          floatingElement: null,
          domReferenceElement: null,
        })
    }, [N, H]))
  let e = w5.useMemo(
      () => ({
        elementResize: !U && typeof ResizeObserver < 'u',
        layoutShift: !U && typeof IntersectionObserver < 'u',
      }),
      [U],
    ),
    {
      refs: s,
      elements: d,
      x: o,
      y: l,
      middlewareData: q0,
      update: n,
      placement: _0,
      context: H0,
      isPositioned: W0,
      floatingStyles: O0,
    } = $q({
      rootContext: H,
      placement: P,
      middleware: U0,
      strategy: J,
      whileElementsMounted: B ? void 0 : (...w0) => F7(...w0, e),
      nodeId: F,
      externalTree: M,
    }),
    { sideX: f0, sideY: A0 } = q0.adaptiveOrigin || y7,
    T0 = W0 ? J : 'fixed',
    y0 = w5.useMemo(() => {
      let w0 = k ? { position: T0, [f0]: o, [A0]: l } : { position: T0, ...O0 }
      if (!W0) w0.opacity = 0
      return w0
    }, [k, T0, f0, o, A0, l, O0, W0]),
    P0 = w5.useRef(null)
  ;(u(() => {
    if (!N) return
    let w0 = y.current,
      g0 = typeof w0 === 'function' ? w0() : w0,
      d0 = (uG(g0) ? g0.current : g0) || null || null
    if (d0 !== P0.current) (s.setPositionReference(d0), (P0.current = d0))
  }, [N, s, I, y]),
    w5.useEffect(() => {
      if (!N) return
      let w0 = y.current
      if (typeof w0 === 'function') return
      if (uG(w0) && w0.current !== P0.current)
        (s.setPositionReference(w0.current), (P0.current = w0.current))
    }, [N, s, I, y]),
    w5.useEffect(() => {
      if (B && N && d.domReference && d.floating)
        return F7(d.domReference, d.floating, n, e)
      return
    }, [B, N, d, n, e]))
  let b0 = u1(_0),
    t0 = cG(z, b0, R),
    L1 = a5(_0) || 'center',
    D0 = Boolean(q0.hide?.referenceHidden)
  u(() => {
    if (V && N && W0) A(b0)
  }, [V, N, W0, b0])
  let B0 = w5.useMemo(
      () => ({ position: 'absolute', top: q0.arrow?.y, left: q0.arrow?.x }),
      [q0.arrow],
    ),
    E0 = q0.arrow?.centerOffset !== 0
  return w5.useMemo(
    () => ({
      positionerStyles: y0,
      arrowStyles: B0,
      arrowRef: Z0,
      arrowUncentered: E0,
      side: t0,
      align: L1,
      physicalSide: b0,
      anchorHidden: D0,
      refs: s,
      context: H0,
      isPositioned: W0,
      update: n,
    }),
    [y0, B0, Z0, E0, t0, L1, b0, D0, s, H0, W0, n],
  )
}
function uG(Q) {
  return Q != null && 'current' in Q
}
import * as R4 from 'react'
var v4 = R4.createContext(void 0)
v4.displayName = 'SelectPositionerContext'
function b8() {
  let Q = R4.useContext(v4)
  if (!Q)
    throw Error(
      'Base UI: SelectPositionerContext is missing. SelectPositioner parts must be placed within <Select.Positioner>.',
    )
  return Q
}
import * as dG from 'react'
import { jsx as LL } from 'react/jsx-runtime'
var o2 = dG.forwardRef(function (Z, J) {
  let { cutout: z, ...q } = Z,
    $
  if (z) {
    let X = z?.getBoundingClientRect()
    $ = `polygon(
      0% 0%,
      100% 0%,
      100% 100%,
      0% 100%,
      0% 0%,
      ${X.left}px ${X.top}px,
      ${X.left}px ${X.bottom}px,
      ${X.right}px ${X.bottom}px,
      ${X.right}px ${X.top}px,
      ${X.left}px ${X.top}px
    )`
  }
  return LL('div', {
    ref: J,
    role: 'presentation',
    'data-base-ui-inert': '',
    ...q,
    style: {
      position: 'fixed',
      inset: 0,
      userSelect: 'none',
      WebkitUserSelect: 'none',
      clipPath: $,
    },
  })
})
o2.displayName = 'InternalBackdrop'
function T1(Q) {
  return Q === 'starting' ? c$ : S0
}
function $9(Q, Z) {
  if (Q) Object.assign(Q.style, Z)
}
var f4 = {
  position: 'relative',
  maxHeight: '100%',
  overflowX: 'hidden',
  overflowY: 'auto',
}
import { jsx as iG, jsxs as FL } from 'react/jsx-runtime'
var kL = { position: 'fixed' },
  Mq = y5.forwardRef(function (Z, J) {
    let {
        anchor: z,
        positionMethod: q = 'absolute',
        className: $,
        render: X,
        side: K = 'bottom',
        align: G = 'center',
        sideOffset: Y = 0,
        alignOffset: W = 0,
        collisionBoundary: U = 'clipping-ancestors',
        collisionPadding: B,
        arrowPadding: H = 5,
        sticky: N = !1,
        disableAnchorTracking: _,
        alignItemWithTrigger: L = !0,
        collisionAvoidance: F = zQ,
        ...k
      } = Z,
      {
        store: V,
        listRef: M,
        labelsRef: j,
        alignItemWithTriggerActiveRef: A,
        selectedItemTextRef: w,
        valuesRef: O,
        initialValueRef: S,
        popupRef: x,
        setValue: h,
      } = W1(),
      I = x4(),
      y = N0(V, k0.open),
      T = N0(V, k0.mounted),
      R = N0(V, k0.modal),
      v = N0(V, k0.value),
      P = N0(V, k0.openMethod),
      D = N0(V, k0.positionerElement),
      E = N0(V, k0.triggerElement),
      C = N0(V, k0.isItemEqualToValue),
      a = N0(V, k0.transitionStatus),
      p = y5.useRef(null),
      Q0 = y5.useRef(null),
      [g, Z0] = y5.useState(L),
      i = T && g && P !== 'touch'
    if (!T && g !== L) Z0(L)
    ;(u(() => {
      if (!T) {
        if (k0.scrollUpArrowVisible(V.state)) V.set('scrollUpArrowVisible', !1)
        if (k0.scrollDownArrowVisible(V.state))
          V.set('scrollDownArrowVisible', !1)
      }
    }, [V, T]),
      y5.useImperativeHandle(A, () => i),
      h8((i || R) && y && P !== 'touch', E))
    let X0 = D2({
        anchor: z,
        floatingRootContext: I,
        positionMethod: q,
        mounted: T,
        side: K,
        sideOffset: Y,
        align: G,
        alignOffset: W,
        arrowPadding: H,
        collisionBoundary: U,
        collisionPadding: B,
        sticky: N,
        disableAnchorTracking: _ ?? i,
        collisionAvoidance: F,
        keepMounted: !0,
      }),
      Y0 = i ? 'none' : X0.side,
      J0 = i ? kL : X0.positionerStyles,
      U0 = y5.useMemo(() => {
        let d = {}
        if (!y) d.pointerEvents = 'none'
        return { role: 'presentation', hidden: !T, style: { ...J0, ...d } }
      }, [y, T, J0]),
      K0 = {
        open: y,
        side: Y0,
        align: X0.align,
        anchorHidden: X0.anchorHidden,
      },
      b = m((d) => {
        V.set('positionerElement', d)
      }),
      r = f('div', Z, {
        ref: [J, b],
        state: K0,
        stateAttributesMapping: v0,
        props: [U0, T1(a), k],
      }),
      t = y5.useRef(0),
      e = m((d) => {
        if (d.size === 0 && t.current === 0) return
        if (O.current.length === 0) return
        let o = t.current
        if (((t.current = d.size), d.size === o)) return
        let l = $0(c.none)
        if (o !== 0 && !V.state.multiple && v !== null) {
          if (A6(O.current, v, C) === -1) {
            let n = S.current,
              H0 = n != null && A6(O.current, n, C) !== -1 ? n : null
            if ((h(H0, l), H0 === null))
              (V.set('selectedIndex', null), (w.current = null))
          }
        }
        if (o !== 0 && V.state.multiple && Array.isArray(v)) {
          let q0 = (_0) => A6(O.current, _0, C) !== -1,
            n = v.filter((_0) => q0(_0))
          if (n.length !== v.length || n.some((_0) => !VG(v, _0, C))) {
            if ((h(n, l), n.length === 0))
              (V.set('selectedIndex', null), (w.current = null))
          }
        }
        if (y && i) {
          V.update({ scrollUpArrowVisible: !1, scrollDownArrowVisible: !1 })
          let q0 = { height: '' }
          ;($9(D, q0), $9(x.current, q0))
        }
      }),
      s = y5.useMemo(
        () => ({
          ...X0,
          side: Y0,
          alignItemWithTriggerActive: i,
          setControlledAlignItemWithTrigger: Z0,
          scrollUpArrowRef: p,
          scrollDownArrowRef: Q0,
        }),
        [X0, Y0, i, Z0],
      )
    return iG(F2, {
      elementsRef: M,
      labelsRef: j,
      onMapChange: e,
      children: FL(v4.Provider, {
        value: s,
        children: [T && R && iG(o2, { inert: R5(!y), cutout: E }), r],
      }),
    })
  })
Mq.displayName = 'SelectPositioner'
import * as W5 from 'react'
import * as oG from 'react-dom'
function g4(Q) {
  let Z = Q.currentTarget.getBoundingClientRect()
  return (
    Z.top + 1 <= Q.clientY &&
    Q.clientY <= Z.bottom - 1 &&
    Z.left + 1 <= Q.clientX &&
    Q.clientX <= Z.right - 1
  )
}
import { jsx as ML } from 'react/jsx-runtime'
var m4 = 'base-ui-disable-scrollbar',
  T2 = {
    className: m4,
    getElement(Q) {
      return ML('style', {
        nonce: Q,
        href: m4,
        precedence: 'base-ui:low',
        children: `.${m4}{scrollbar-width:none}.${m4}::-webkit-scrollbar{display:none}`,
      })
    },
  }
T2.getElement.displayName = 'styleDisableScrollbar.getElement'
import * as p4 from 'react'
var lG = p4.createContext(void 0)
lG.displayName = 'ToolbarRootContext'
function R8(Q) {
  let Z = p4.useContext(lG)
  if (Z === void 0 && !Q)
    throw Error(
      'Base UI: ToolbarRootContext is missing. Toolbar parts must be placed within <Toolbar.Root>.',
    )
  return Z
}
function J1(Q, Z = Number.MIN_SAFE_INTEGER, J = Number.MAX_SAFE_INTEGER) {
  return Math.max(Z, Math.min(Q, J))
}
import * as u4 from 'react'
var rG = u4.createContext(void 0)
rG.displayName = 'CSPContext'
var jL = { disableStyleElements: !1 }
function v8() {
  return u4.useContext(rG) ?? jL
}
import { jsx as VL, jsxs as AL } from 'react/jsx-runtime'
var w6 = 1,
  OL = { ...v0, ...i0 },
  jq = W5.forwardRef(function (Z, J) {
    let { render: z, className: q, finalFocus: $, ...X } = Z,
      {
        store: K,
        popupRef: G,
        onOpenChangeComplete: Y,
        setOpen: W,
        valueRef: U,
        selectedItemTextRef: B,
        keyboardActiveRef: H,
        multiple: N,
        handleScrollArrowVisibility: _,
        scrollHandlerRef: L,
        highlightItemOnHover: F,
      } = W1(),
      {
        side: k,
        align: V,
        alignItemWithTriggerActive: M,
        setControlledAlignItemWithTrigger: j,
        scrollDownArrowRef: A,
        scrollUpArrowRef: w,
      } = b8(),
      O = R8(!0) != null,
      S = x4(),
      { nonce: x, disableStyleElements: h } = v8(),
      I = c0(),
      y = N0(K, k0.id),
      T = N0(K, k0.open),
      R = N0(K, k0.mounted),
      v = N0(K, k0.popupProps),
      P = N0(K, k0.transitionStatus),
      D = N0(K, k0.triggerElement),
      E = N0(K, k0.positionerElement),
      C = N0(K, k0.listElement),
      a = W5.useRef(0),
      p = W5.useRef(!1),
      Q0 = W5.useRef(0),
      g = W5.useRef(!1),
      Z0 = W5.useRef({}),
      i = K5(),
      X0 = m((K0) => {
        if (!E || !G.current || !g.current) return
        if (p.current || !M) {
          _()
          return
        }
        let b = E.style.top === '0px',
          r = E.style.bottom === '0px',
          t = E.getBoundingClientRect().height,
          e = V0(E),
          s = getComputedStyle(E),
          d = parseFloat(s.marginTop),
          o = parseFloat(s.marginBottom),
          l = aG(getComputedStyle(G.current)),
          q0 = Math.min(e.documentElement.clientHeight - d - o, l),
          n = K0.scrollTop,
          _0 = sG(K0),
          H0 = 0,
          W0 = null,
          O0 = !1,
          f0 = !1,
          A0 = (y0) => {
            E.style.height = `${y0}px`
          },
          T0 = (y0, P0) => {
            let b0 = J1(y0, 0, q0 - t)
            if (b0 > 0) A0(t + b0)
            if (((K0.scrollTop = P0), q0 - (t + b0) <= w6)) p.current = !0
            _()
          }
        if (b) {
          let y0 = _0 - n,
            P0 = t + y0,
            b0 = Math.min(P0, q0)
          if (((H0 = b0), y0 <= w6)) {
            T0(y0, _0)
            return
          }
          if (q0 - b0 > w6) f0 = !0
          else O0 = !0
        } else if (r) {
          let y0 = n,
            P0 = t + y0,
            b0 = Math.min(P0, q0),
            t0 = P0 - q0
          if (((H0 = b0), y0 <= w6)) {
            T0(y0, 0)
            return
          }
          if (q0 - b0 > w6) W0 = 0
          else if (((O0 = !0), n < _0)) W0 = n - (y0 - t0)
        }
        if (((H0 = Math.ceil(H0)), H0 !== 0)) A0(H0)
        if (f0 || W0 != null) {
          let y0 = sG(K0),
            P0 = f0 ? y0 : J1(W0, 0, y0)
          if (Math.abs(K0.scrollTop - P0) > w6) K0.scrollTop = P0
        }
        if (O0 || H0 >= q0 - w6) p.current = !0
        _()
      })
    ;(W5.useImperativeHandle(L, () => X0, [X0]),
      a0({
        open: T,
        ref: G,
        onComplete() {
          if (T) Y?.(!0)
        },
      }))
    let Y0 = { open: T, transitionStatus: P, side: k, align: V }
    ;(u(() => {
      if (!E || !G.current || Object.keys(Z0.current).length) return
      Z0.current = {
        top: E.style.top || '0',
        left: E.style.left || '0',
        right: E.style.right,
        height: E.style.height,
        bottom: E.style.bottom,
        minHeight: E.style.minHeight,
        maxHeight: E.style.maxHeight,
        marginTop: E.style.marginTop,
        marginBottom: E.style.marginBottom,
      }
    }, [G, E]),
      u(() => {
        if (T || M) return
        ;((g.current = !1),
          (p.current = !1),
          (a.current = 0),
          (Q0.current = 0),
          $9(E, Z0.current))
      }, [T, M, E, G]),
      u(() => {
        let K0 = G.current
        if (!T || !D || !E || !K0 || K.state.transitionStatus === 'ending')
          return
        if (!M) {
          ;((g.current = !0),
            i.request(_),
            K0.style.removeProperty('--transform-origin'))
          return
        }
        queueMicrotask(() => {
          let b = wL(K0)
          K0.style.removeProperty('--transform-origin')
          try {
            let r = getComputedStyle(E),
              t = getComputedStyle(K0),
              e = V0(D),
              s = o0(E),
              d = D.getBoundingClientRect(),
              o = E.getBoundingClientRect(),
              l = d.left,
              q0 = d.height,
              n = C || K0,
              _0 = n.scrollHeight,
              H0 = parseFloat(t.borderBottomWidth),
              W0 = parseFloat(r.marginTop) || 10,
              O0 = parseFloat(r.marginBottom) || 10,
              f0 = parseFloat(r.minHeight) || 100,
              A0 = aG(t),
              T0 = 5,
              y0 = 5,
              P0 = 20,
              b0 = e.documentElement.clientHeight - W0 - O0,
              t0 = e.documentElement.clientWidth,
              L1 = b0 - d.bottom + q0,
              D0 = B.current,
              B0 = U.current,
              E0,
              w0 = 0,
              g0 = 0
            if (D0 && B0) {
              let h0 = B0.getBoundingClientRect()
              E0 = D0.getBoundingClientRect()
              let G1 = h0.left - l,
                Z5 = E0.left - o.left,
                J5 = h0.top - d.top + h0.height / 2,
                S1 = E0.top - o.top + E0.height / 2
              ;((w0 = G1 - Z5), (g0 = S1 - J5))
            }
            let e0 = L1 + g0 + O0 + H0,
              d0 = Math.min(b0, e0),
              x0 = b0 - W0 - O0,
              I0 = e0 - d0,
              p0 = Math.max(5, l + w0),
              n0 = t0 - 5,
              H5 = Math.max(0, p0 + o.width - n0)
            ;((E.style.left = `${p0 - H5}px`),
              (E.style.height = `${d0}px`),
              (E.style.maxHeight = 'auto'),
              (E.style.marginTop = `${W0}px`),
              (E.style.marginBottom = `${O0}px`),
              (K0.style.height = '100%'))
            let c5 = n.scrollHeight - n.clientHeight,
              X8 = I0 >= c5
            if (X8) d0 = Math.min(b0, o.height) - (I0 - c5)
            let b6 = d.top < 20 || d.bottom > b0 - 20 || d0 < Math.min(_0, f0),
              v2 = (s.visualViewport?.scale ?? 1) !== 1 && N8
            if (b6 || v2) {
              ;((g.current = !0), $9(E, Z0.current), oG.flushSync(() => j(!1)))
              return
            }
            if (X8) {
              let h0 = Math.max(0, b0 - e0)
              ;((E.style.top = o.height >= x0 ? '0' : `${h0}px`),
                (E.style.height = `${d0}px`),
                (n.scrollTop = n.scrollHeight - n.clientHeight),
                (a.current = Math.max(f0, d0)))
            } else
              ((E.style.bottom = '0'),
                (a.current = Math.max(f0, d0)),
                (n.scrollTop = I0))
            if (E0) {
              let { top: h0, height: G1 } = o,
                Z5 = E0.top + E0.height / 2,
                J5 = G1 > 0 ? ((Z5 - h0) / G1) * 100 : 50,
                S1 = J1(J5, 0, 100)
              K0.style.setProperty('--transform-origin', `50% ${S1}%`)
            }
            if (a.current === b0 || d0 >= A0) p.current = !0
            ;(_(),
              setTimeout(() => {
                g.current = !0
              }))
          } finally {
            b()
          }
        })
      }, [K, T, E, D, U, B, G, _, M, j, i, A, w, C]),
      W5.useEffect(() => {
        if (!M || !E || !T) return
        let K0 = o0(E)
        function b(r) {
          W(!1, $0(c.windowResize, r))
        }
        return (
          K0.addEventListener('resize', b),
          () => {
            K0.removeEventListener('resize', b)
          }
        )
      }, [W, M, E, T]))
    let J0 = {
        ...(C
          ? { role: 'presentation', 'aria-orientation': void 0 }
          : {
              role: 'listbox',
              'aria-multiselectable': N || void 0,
              id: `${y}-list`,
            }),
        onKeyDown(K0) {
          if (((H.current = !0), O && L2.has(K0.key))) K0.stopPropagation()
        },
        onMouseMove() {
          H.current = !1
        },
        onPointerLeave(K0) {
          if (!F || g4(K0) || K0.pointerType === 'touch') return
          let b = K0.currentTarget
          I.start(0, () => {
            ;(K.set('activeIndex', null), b.focus({ preventScroll: !0 }))
          })
        },
        onScroll(K0) {
          if (C) return
          X0(K0.currentTarget)
        },
        ...(M && { style: C ? { height: '100%' } : f4 }),
      },
      U0 = f('div', Z, {
        ref: [J, G],
        state: Y0,
        stateAttributesMapping: OL,
        props: [
          v,
          J0,
          T1(P),
          { className: !C && M ? T2.className : void 0 },
          X,
        ],
      })
    return AL(W5.Fragment, {
      children: [
        !h && T2.getElement(x),
        VL(s2, {
          context: S,
          modal: !1,
          disabled: !R,
          returnFocus: $,
          restoreFocus: !0,
          children: U0,
        }),
      ],
    })
  })
jq.displayName = 'SelectPopup'
function aG(Q) {
  let Z = Q.maxHeight || ''
  return Z.endsWith('px') ? parseFloat(Z) || 1 / 0 : 1 / 0
}
function sG(Q) {
  return Math.max(0, Q.scrollHeight - Q.clientHeight)
}
var nG = [
  ['transform', 'none'],
  ['scale', '1'],
  ['translate', '0 0'],
]
function wL(Q) {
  let { style: Z } = Q,
    J = {}
  for (let [z, q] of nG)
    ((J[z] = Z.getPropertyValue(z)), Z.setProperty(z, q, 'important'))
  return () => {
    for (let [z] of nG) {
      let q = J[z]
      if (q) Z.setProperty(z, q)
      else Z.removeProperty(z)
    }
  }
}
import * as tG from 'react'
var Vq = tG.forwardRef(function (Z, J) {
  let { className: z, render: q, ...$ } = Z,
    { store: X, scrollHandlerRef: K } = W1(),
    { alignItemWithTriggerActive: G } = b8(),
    Y = N0(X, k0.hasScrollArrows),
    W = N0(X, k0.openMethod),
    U = N0(X, k0.multiple),
    H = {
      id: `${N0(X, k0.id)}-list`,
      role: 'listbox',
      'aria-multiselectable': U || void 0,
      onScroll(_) {
        K.current?.(_.currentTarget)
      },
      ...(G && { style: f4 }),
      className: Y && W !== 'touch' ? T2.className : void 0,
    },
    N = m((_) => {
      X.set('listElement', _)
    })
  return f('div', Z, { ref: [J, N], props: [H, $] })
})
Vq.displayName = 'SelectList'
import * as v5 from 'react'
import * as c4 from 'react'
var d4 = c4.createContext(void 0)
d4.displayName = 'SelectItemContext'
function D7() {
  let Q = c4.useContext(d4)
  if (!Q)
    throw Error(
      'Base UI: SelectItemContext is missing. SelectItem parts must be placed within <Select.Item>.',
    )
  return Q
}
import { jsx as yL } from 'react/jsx-runtime'
var Aq = v5.memo(
  v5.forwardRef(function (Z, J) {
    let {
        render: z,
        className: q,
        value: $ = null,
        label: X,
        disabled: K = !1,
        nativeButton: G = !1,
        ...Y
      } = Z,
      W = v5.useRef(null),
      U = g1({ label: X, textRef: W, indexGuessBehavior: Mz.GuessFromOrder }),
      {
        store: B,
        getItemProps: H,
        setOpen: N,
        setValue: _,
        selectionRef: L,
        typingRef: F,
        valuesRef: k,
        keyboardActiveRef: V,
        multiple: M,
        highlightItemOnHover: j,
      } = W1(),
      A = c0(),
      w = N0(B, k0.isActive, U.index),
      O = N0(B, k0.isSelected, U.index, $),
      S = N0(B, k0.isSelectedByFocus, U.index),
      x = N0(B, k0.isItemEqualToValue),
      h = U.index,
      I = h !== -1,
      y = v5.useRef(null),
      T = s0(h)
    ;(u(() => {
      if (!I) return
      let i = k.current
      return (
        (i[h] = $),
        () => {
          delete i[h]
        }
      )
    }, [I, h, $, k]),
      u(() => {
        if (!I) return
        let i = B.state.value,
          X0 = i
        if (M && Array.isArray(i) && i.length > 0) X0 = i[i.length - 1]
        if (X0 !== void 0 && S8($, X0, x)) B.set('selectedIndex', h)
        return
      }, [I, h, M, x, B, $]))
    let R = { disabled: K, selected: O, highlighted: w },
      v = H({ active: w, selected: O })
    ;((v.onFocus = void 0), (v.id = void 0))
    let P = v5.useRef(null),
      D = v5.useRef('mouse'),
      E = v5.useRef(!1),
      { getButtonProps: C, buttonRef: a } = Q1({
        disabled: K,
        focusableWhenDisabled: !0,
        native: G,
      })
    function p(i) {
      let X0 = B.state.value
      if (M) {
        let Y0 = Array.isArray(X0) ? X0 : [],
          J0 = O ? AG(Y0, $, x) : [...Y0, $]
        _(J0, $0(c.itemPress, i))
      } else (_($, $0(c.itemPress, i)), N(!1, $0(c.itemPress, i)))
    }
    let Q0 = {
        role: 'option',
        'aria-selected': O,
        tabIndex: w ? 0 : -1,
        onFocus() {
          B.set('activeIndex', h)
        },
        onMouseEnter() {
          if (!V.current && B.state.selectedIndex === null && j)
            B.set('activeIndex', h)
        },
        onMouseMove() {
          if (j) B.set('activeIndex', h)
        },
        onMouseLeave(i) {
          if (!j || V.current || g4(i)) return
          A.start(0, () => {
            if (B.state.activeIndex === h) B.set('activeIndex', null)
          })
        },
        onTouchStart() {
          L.current = { allowSelectedMouseUp: !1, allowUnselectedMouseUp: !1 }
        },
        onKeyDown(i) {
          ;((P.current = i.key), B.set('activeIndex', h))
        },
        onClick(i) {
          if (((E.current = !1), i.type === 'keydown' && P.current === null))
            return
          if (
            K ||
            (P.current === ' ' && F.current) ||
            (D.current !== 'touch' && !w)
          )
            return
          ;((P.current = null), p(i.nativeEvent))
        },
        onPointerEnter(i) {
          D.current = i.pointerType
        },
        onPointerDown(i) {
          ;((D.current = i.pointerType), (E.current = !0))
        },
        onMouseUp(i) {
          if (K) return
          if (E.current) {
            E.current = !1
            return
          }
          let X0 = !L.current.allowSelectedMouseUp && O,
            Y0 = !L.current.allowUnselectedMouseUp && !O
          if (X0 || Y0 || (D.current !== 'touch' && !w)) return
          p(i.nativeEvent)
        },
      },
      g = f('div', Z, {
        ref: [a, J, U.ref, y],
        state: R,
        props: [v, Q0, Y, C],
      }),
      Z0 = v5.useMemo(
        () => ({
          selected: O,
          indexRef: T,
          textRef: W,
          selectedByFocus: S,
          hasRegistered: I,
        }),
        [O, T, W, S, I],
      )
    return yL(d4.Provider, { value: Z0, children: g })
  }),
)
Aq.displayName = 'SelectItem'
import * as y6 from 'react'
import { jsx as DL } from 'react/jsx-runtime'
var Oq = y6.forwardRef(function (Z, J) {
  let z = Z.keepMounted ?? !1,
    { selected: q } = D7()
  if (!(z || q)) return null
  return DL(eG, { ...Z, ref: J })
})
Oq.displayName = 'SelectItemIndicator'
var eG = y6.memo(
  y6.forwardRef((Q, Z) => {
    let { render: J, className: z, keepMounted: q, ...$ } = Q,
      { selected: X } = D7(),
      K = y6.useRef(null),
      { transitionStatus: G, setMounted: Y } = F1(X),
      U = f('span', Q, {
        ref: [Z, K],
        state: { selected: X, transitionStatus: G },
        props: [{ 'aria-hidden': !0, children: '✔️' }, $],
        stateAttributesMapping: i0,
      })
    return (
      a0({
        open: X,
        ref: K,
        onComplete() {
          if (!X) Y(!1)
        },
      }),
      U
    )
  }),
)
eG.displayName = 'Inner'
import * as X9 from 'react'
var wq = X9.memo(
  X9.forwardRef(function (Z, J) {
    let {
        indexRef: z,
        textRef: q,
        selectedByFocus: $,
        hasRegistered: X,
      } = D7(),
      { selectedItemTextRef: K } = W1(),
      { className: G, render: Y, ...W } = Z,
      U = X9.useCallback(
        (H) => {
          if (!H || !X) return
          let N = K.current === null || !K.current.isConnected
          if ($ || (N && z.current === 0)) K.current = H
        },
        [K, z, $, X],
      )
    return f('div', Z, { ref: [U, J, q], props: W })
  }),
)
wq.displayName = 'SelectItemText'
import * as QY from 'react'
var TL = { ...v0, ...i0 },
  yq = QY.forwardRef(function (Z, J) {
    let { className: z, render: q, ...$ } = Z,
      { store: X } = W1(),
      {
        side: K,
        align: G,
        arrowRef: Y,
        arrowStyles: W,
        arrowUncentered: U,
        alignItemWithTriggerActive: B,
      } = b8(),
      N = { open: N0(X, k0.open, !0), side: K, align: G, uncentered: U },
      _ = f('div', Z, {
        state: N,
        ref: [Y, J],
        props: [{ style: W, 'aria-hidden': !0 }, $],
        stateAttributesMapping: TL,
      })
    if (B) return null
    return _
  })
yq.displayName = 'SelectArrow'
import * as JY from 'react'
import * as ZY from 'react'
var T7 = ZY.forwardRef(function (Z, J) {
  let { render: z, className: q, direction: $, keepMounted: X = !1, ...K } = Z,
    {
      store: G,
      popupRef: Y,
      listRef: W,
      handleScrollArrowVisibility: U,
      scrollArrowsMountedCountRef: B,
    } = W1(),
    { side: H, scrollDownArrowRef: N, scrollUpArrowRef: _ } = b8(),
    L = $ === 'up' ? k0.scrollUpArrowVisible : k0.scrollDownArrowVisible,
    F = N0(G, L),
    k = N0(G, k0.openMethod),
    V = F && k !== 'touch',
    M = c0(),
    j = $ === 'up' ? _ : N,
    { transitionStatus: A, setMounted: w } = F1(V)
  ;(u(() => {
    if (((B.current += 1), !G.state.hasScrollArrows))
      G.set('hasScrollArrows', !0)
    return () => {
      if (
        ((B.current = Math.max(0, B.current - 1)),
        B.current === 0 && G.state.hasScrollArrows)
      )
        G.set('hasScrollArrows', !1)
    }
  }, [G, B]),
    a0({
      open: V,
      ref: j,
      onComplete() {
        if (!V) w(!1)
      },
    }))
  let x = f('div', Z, {
    ref: [J, j],
    state: { direction: $, visible: V, side: H, transitionStatus: A },
    props: [
      {
        'aria-hidden': !0,
        children: $ === 'up' ? '▲' : '▼',
        style: { position: 'absolute' },
        onMouseMove(I) {
          if ((I.movementX === 0 && I.movementY === 0) || M.isStarted()) return
          G.set('activeIndex', null)
          function y() {
            let T = G.state.listElement ?? Y.current
            if (!T) return
            ;(G.set('activeIndex', null), U())
            let R = T.scrollTop === 0,
              v = Math.round(T.scrollTop + T.clientHeight) >= T.scrollHeight
            if (W.current.length === 0)
              if ($ === 'up') G.set('scrollUpArrowVisible', !R)
              else G.set('scrollDownArrowVisible', !v)
            if (($ === 'up' && R) || ($ === 'down' && v)) {
              M.clear()
              return
            }
            if (
              (G.state.listElement || Y.current) &&
              W.current &&
              W.current.length > 0
            ) {
              let D = W.current,
                E = j.current?.offsetHeight || 0
              if ($ === 'up') {
                let C = 0,
                  a = T.scrollTop + E
                for (let Q0 = 0; Q0 < D.length; Q0 += 1) {
                  let g = D[Q0]
                  if (g) {
                    if (g.offsetTop >= a) {
                      C = Q0
                      break
                    }
                  }
                }
                let p = Math.max(0, C - 1)
                if (p < C) {
                  let Q0 = D[p]
                  if (Q0) T.scrollTop = Math.max(0, Q0.offsetTop - E)
                } else T.scrollTop = 0
              } else {
                let C = D.length - 1,
                  a = T.scrollTop + T.clientHeight - E
                for (let Q0 = 0; Q0 < D.length; Q0 += 1) {
                  let g = D[Q0]
                  if (g) {
                    if (g.offsetTop + g.offsetHeight > a) {
                      C = Math.max(0, Q0 - 1)
                      break
                    }
                  }
                }
                let p = Math.min(D.length - 1, C + 1)
                if (p > C) {
                  let Q0 = D[p]
                  if (Q0)
                    T.scrollTop =
                      Q0.offsetTop + Q0.offsetHeight - T.clientHeight + E
                } else T.scrollTop = T.scrollHeight - T.clientHeight
              }
            }
            M.start(40, y)
          }
          M.start(40, y)
        },
        onMouseLeave() {
          M.clear()
        },
      },
      K,
    ],
  })
  if (!(V || X)) return null
  return x
})
T7.displayName = 'SelectScrollArrow'
import { jsx as PL } from 'react/jsx-runtime'
var Dq = JY.forwardRef(function (Z, J) {
  return PL(T7, { ...Z, ref: J, direction: 'down' })
})
Dq.displayName = 'SelectScrollDownArrow'
import * as zY from 'react'
import { jsx as EL } from 'react/jsx-runtime'
var Tq = zY.forwardRef(function (Z, J) {
  return EL(T7, { ...Z, ref: J, direction: 'up' })
})
Tq.displayName = 'SelectScrollUpArrow'
import * as K9 from 'react'
import * as i4 from 'react'
var l4 = i4.createContext(void 0)
l4.displayName = 'SelectGroupContext'
function qY() {
  let Q = i4.useContext(l4)
  if (Q === void 0)
    throw Error(
      'Base UI: SelectGroupContext is missing. SelectGroup parts must be placed within <Select.Group>.',
    )
  return Q
}
import { jsx as SL } from 'react/jsx-runtime'
var Pq = K9.forwardRef(function (Z, J) {
  let { className: z, render: q, ...$ } = Z,
    [X, K] = K9.useState(),
    G = K9.useMemo(() => ({ labelId: X, setLabelId: K }), [X, K]),
    Y = f('div', Z, {
      ref: J,
      props: [{ role: 'group', 'aria-labelledby': X }, $],
    })
  return SL(l4.Provider, { value: G, children: Y })
})
Pq.displayName = 'SelectGroup'
import * as $Y from 'react'
var Eq = $Y.forwardRef(function (Z, J) {
  let { className: z, render: q, id: $, ...X } = Z,
    { setLabelId: K } = qY(),
    G = L0($)
  return (
    u(() => {
      K(G)
    }, [G, K]),
    f('div', Z, { ref: J, props: [{ id: G }, X] })
  )
})
Eq.displayName = 'SelectGroupLabel'
import * as XY from 'react'
var f8 = XY.forwardRef(function (Z, J) {
  let { className: z, render: q, orientation: $ = 'horizontal', ...X } = Z
  return f('div', Z, {
    state: { orientation: $ },
    ref: J,
    props: [{ role: 'separator', 'aria-orientation': $ }, X],
  })
})
f8.displayName = 'Separator'
import { jsxDEV as M1 } from 'react/jsx-dev-runtime'
var bv = b1.Root
function Rv({ className: Q, ...Z }) {
  return M1(
    b1.Group,
    { 'data-slot': 'select-group', className: z0('scroll-my-1 p-1', Q), ...Z },
    void 0,
    !1,
    void 0,
    this,
  )
}
function vv({ className: Q, ...Z }) {
  return M1(
    b1.Value,
    {
      'data-slot': 'select-value',
      className: z0('flex flex-1 text-left', Q),
      ...Z,
    },
    void 0,
    !1,
    void 0,
    this,
  )
}
function fv({ className: Q, size: Z = 'default', children: J, ...z }) {
  return M1(
    b1.Trigger,
    {
      'data-slot': 'select-trigger',
      'data-size': Z,
      className: z0(
        "border-input data-placeholder:text-muted-foreground dark:bg-input/30 dark:hover:bg-input/50 focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:aria-invalid:border-destructive/50 gap-1.5 rounded-lg border bg-transparent py-2 pr-2 pl-2.5 text-sm transition-colors select-none focus-visible:ring-3 aria-invalid:ring-3 data-[size=default]:h-8 data-[size=sm]:h-7 data-[size=sm]:rounded-[min(var(--radius-md),10px)] *:data-[slot=select-value]:gap-1.5 [&_svg:not([class*='size-'])]:size-4 flex w-fit items-center justify-between whitespace-nowrap outline-none disabled:cursor-not-allowed disabled:opacity-50 *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center [&_svg]:pointer-events-none [&_svg]:shrink-0",
        Q,
      ),
      ...z,
      children: [
        J,
        M1(
          b1.Icon,
          {
            render: M1(
              r6,
              { className: 'text-muted-foreground size-4 pointer-events-none' },
              void 0,
              !1,
              void 0,
              this,
            ),
          },
          void 0,
          !1,
          void 0,
          this,
        ),
      ],
    },
    void 0,
    !0,
    void 0,
    this,
  )
}
function gv({
  className: Q,
  children: Z,
  side: J = 'bottom',
  sideOffset: z = 4,
  align: q = 'center',
  alignOffset: $ = 0,
  alignItemWithTrigger: X = !0,
  ...K
}) {
  return M1(
    b1.Portal,
    {
      children: M1(
        b1.Positioner,
        {
          side: J,
          sideOffset: z,
          align: q,
          alignOffset: $,
          alignItemWithTrigger: X,
          className: 'isolate z-50',
          children: M1(
            b1.Popup,
            {
              'data-slot': 'select-content',
              'data-align-trigger': X,
              className: z0(
                'bg-popover text-popover-foreground data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 ring-foreground/10 min-w-36 rounded-lg shadow-md ring-1 duration-100 data-[side=inline-start]:slide-in-from-right-2 data-[side=inline-end]:slide-in-from-left-2 relative isolate z-50 max-h-(--available-height) w-(--anchor-width) origin-(--transform-origin) overflow-x-hidden overflow-y-auto data-[align-trigger=true]:animate-none',
                Q,
              ),
              ...K,
              children: [
                M1(IL, {}, void 0, !1, void 0, this),
                M1(b1.List, { children: Z }, void 0, !1, void 0, this),
                M1(CL, {}, void 0, !1, void 0, this),
              ],
            },
            void 0,
            !0,
            void 0,
            this,
          ),
        },
        void 0,
        !1,
        void 0,
        this,
      ),
    },
    void 0,
    !1,
    void 0,
    this,
  )
}
function mv({ className: Q, ...Z }) {
  return M1(
    b1.GroupLabel,
    {
      'data-slot': 'select-label',
      className: z0('text-muted-foreground px-1.5 py-1 text-xs', Q),
      ...Z,
    },
    void 0,
    !1,
    void 0,
    this,
  )
}
function pv({ className: Q, children: Z, ...J }) {
  return M1(
    b1.Item,
    {
      'data-slot': 'select-item',
      className: z0(
        "focus:bg-accent focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm [&_svg:not([class*='size-'])]:size-4 *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2 relative flex w-full cursor-default items-center outline-hidden select-none data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
        Q,
      ),
      ...J,
      children: [
        M1(
          b1.ItemText,
          {
            className: 'flex flex-1 gap-2 shrink-0 whitespace-nowrap',
            children: Z,
          },
          void 0,
          !1,
          void 0,
          this,
        ),
        M1(
          b1.ItemIndicator,
          {
            render: M1(
              'span',
              {
                className:
                  'pointer-events-none absolute right-2 flex size-4 items-center justify-center',
              },
              void 0,
              !1,
              void 0,
              this,
            ),
            children: M1(
              _2,
              { className: 'pointer-events-none' },
              void 0,
              !1,
              void 0,
              this,
            ),
          },
          void 0,
          !1,
          void 0,
          this,
        ),
      ],
    },
    void 0,
    !0,
    void 0,
    this,
  )
}
function uv({ className: Q, ...Z }) {
  return M1(
    b1.Separator,
    {
      'data-slot': 'select-separator',
      className: z0('bg-border -mx-1 my-1 h-px pointer-events-none', Q),
      ...Z,
    },
    void 0,
    !1,
    void 0,
    this,
  )
}
function IL({ className: Q, ...Z }) {
  return M1(
    b1.ScrollUpArrow,
    {
      'data-slot': 'select-scroll-up-button',
      className: z0(
        "bg-popover z-10 flex cursor-default items-center justify-center py-1 [&_svg:not([class*='size-'])]:size-4 top-0 w-full",
        Q,
      ),
      ...Z,
      children: M1(X7, {}, void 0, !1, void 0, this),
    },
    void 0,
    !1,
    void 0,
    this,
  )
}
function CL({ className: Q, ...Z }) {
  return M1(
    b1.ScrollDownArrow,
    {
      'data-slot': 'select-scroll-down-button',
      className: z0(
        "bg-popover z-10 flex cursor-default items-center justify-center py-1 [&_svg:not([class*='size-'])]:size-4 bottom-0 w-full",
        Q,
      ),
      ...Z,
      children: M1(r6, {}, void 0, !1, void 0, this),
    },
    void 0,
    !1,
    void 0,
    this,
  )
}
import * as MY from 'react'
var g8 = {}
c1(g8, {
  Value: () => xq,
  Track: () => Rq,
  Thumb: () => vq,
  Root: () => Cq,
  Indicator: () => fq,
  Control: () => bq,
})
import * as j1 from 'react'
var Sq
Sq = new Set()
function KY(...Q) {
  {
    let Z = Q.join(' ')
    if (!Sq.has(Z)) (Sq.add(Z), console.warn(`Base UI: ${Z}`))
  }
}
function Iq(Q, Z, J = (z, q) => z === q) {
  return Q.length === Z.length && Q.every((z, q) => J(z, Z[q]))
}
function r4(Q, Z) {
  return Q - Z
}
function GY(Q, Z, J) {
  let z = Q.slice()
  return ((z[Z] = J), z.sort(r4))
}
function a4(Q, Z, J, z, q, $) {
  let X = Q
  if (((X = J1(X, J, z)), q))
    X = GY($, Z, J1(X, $[Z - 1] || -1 / 0, $[Z + 1] || 1 / 0))
  return X
}
function s4(Q, Z, J) {
  if (!Array.isArray(Q)) return !0
  let z = Q.reduce((q, $, X, K) => {
    if (X === K.length - 1) return q
    return (q.push(Math.abs($ - K[X + 1])), q)
  }, [])
  return Math.min(...z) >= Z * J
}
var f5 = {
  activeThumbIndex: () => null,
  max: () => null,
  min: () => null,
  minStepsBetweenValues: () => null,
  step: () => null,
  values: () => null,
  ...$1,
}
import * as n4 from 'react'
var o4 = n4.createContext(void 0)
o4.displayName = 'SliderRootContext'
function P2() {
  let Q = n4.useContext(o4)
  if (Q === void 0)
    throw Error(
      'Base UI: SliderRootContext is missing. Slider parts must be placed within <Slider.Root>.',
    )
  return Q
}
import { jsx as YY } from 'react/jsx-runtime'
function xL(Q) {
  return 'key' in Q ? c.keyboard : c.inputChange
}
function hL(Q, Z) {
  if (typeof Q === 'number' && typeof Z === 'number') return Q === Z
  if (Array.isArray(Q) && Array.isArray(Z)) return Iq(Q, Z)
  return !1
}
var Cq = j1.forwardRef(function (Z, J) {
  let {
      'aria-labelledby': z,
      className: q,
      defaultValue: $,
      disabled: X = !1,
      id: K,
      format: G,
      largeStep: Y = 10,
      locale: W,
      render: U,
      max: B = 100,
      min: H = 0,
      minStepsBetweenValues: N = 0,
      name: _,
      onValueChange: L,
      onValueCommitted: F,
      orientation: k = 'horizontal',
      step: V = 1,
      thumbCollisionBehavior: M = 'push',
      thumbAlignment: j = 'center',
      value: A,
      ...w
    } = Z,
    O = L0(K),
    S = m(L),
    x = m(F),
    { clearErrors: h } = v1(),
    {
      state: I,
      disabled: y,
      name: T,
      setTouched: R,
      setDirty: v,
      validityData: P,
      shouldValidateOnChange: D,
      validation: E,
    } = r0(),
    { labelId: C } = X1(),
    a = z ?? C,
    p = y || X,
    Q0 = T ?? _,
    [g, Z0] = _1({ controlled: A, default: $ ?? H, name: 'Slider' }),
    i = j1.useRef(null),
    X0 = j1.useRef(null),
    Y0 = j1.useRef([]),
    J0 = j1.useRef(null),
    U0 = j1.useRef(null),
    K0 = j1.useRef(-1),
    b = j1.useRef(null),
    r = j1.useRef(null),
    t = j1.useRef('none'),
    e = s0(G),
    [s, d] = j1.useState(-1),
    [o, l] = j1.useState(-1),
    [q0, n] = j1.useState(!1),
    [_0, H0] = j1.useState(() => new Map()),
    [W0, O0] = j1.useState([void 0, void 0]),
    f0 = m((B0) => {
      if ((d(B0), B0 !== -1)) l(B0)
    })
  ;(C5({
    id: O,
    commit: E.commit,
    value: g,
    controlRef: X0,
    name: Q0,
    getValue: () => g,
  }),
    B2(g, () => {
      if ((h(Q0), D())) E.commit(g)
      else E.commit(g, !0)
      let B0 = P.initialValue,
        E0
      if (Array.isArray(g) && Array.isArray(B0)) E0 = !Iq(g, B0)
      else E0 = g !== B0
      v(E0)
    }))
  let A0 = m((B0) => {
      if (B0) X0.current = B0
    }),
    T0 = Array.isArray(g),
    y0 = j1.useMemo(() => {
      if (!T0) return [J1(g, H, B)]
      return g.slice().sort(r4)
    }, [B, H, T0, g]),
    P0 = m((B0, E0) => {
      if (Number.isNaN(B0) || hL(B0, g)) return
      let w0 = E0 ?? $0(c.none, void 0, void 0, { activeThumbIndex: -1 })
      t.current = w0.reason
      let g0 = w0.event,
        d0 = new (g0.constructor ?? Event)(g0.type, g0)
      if (
        (Object.defineProperty(d0, 'target', {
          writable: !0,
          value: { value: B0, name: Q0 },
        }),
        (w0.event = d0),
        (r.current = B0),
        S(B0, w0),
        w0.isCanceled)
      )
        return
      Z0(B0)
    }),
    b0 = m((B0, E0, w0) => {
      let g0 = a4(B0, E0, H, B, T0, y0)
      if (s4(g0, V, N)) {
        let e0 = xL(w0)
        ;(P0(g0, $0(e0, w0.nativeEvent, void 0, { activeThumbIndex: E0 })),
          R(!0))
        let d0 = r.current ?? g0
        x(d0, bQ(e0, w0.nativeEvent))
      }
    })
  if (H >= B) KY('Slider `max` must be greater than `min`.')
  if (
    (u(() => {
      let B0 = B1(V0(i.current))
      if (p && B0 && i.current?.contains(B0)) B0.blur()
    }, [p]),
    p && s !== -1)
  )
    f0(-1)
  let t0 = j1.useMemo(
      () => ({
        ...I,
        activeThumbIndex: s,
        disabled: p,
        dragging: q0,
        orientation: k,
        max: B,
        min: H,
        minStepsBetweenValues: N,
        step: V,
        values: y0,
      }),
      [I, s, p, q0, B, H, N, k, V, y0],
    ),
    L1 = j1.useMemo(
      () => ({
        active: s,
        controlRef: X0,
        disabled: p,
        dragging: q0,
        validation: E,
        formatOptionsRef: e,
        handleInputChange: b0,
        indicatorPosition: W0,
        inset: j !== 'center',
        labelId: a,
        largeStep: Y,
        lastUsedThumbIndex: o,
        lastChangedValueRef: r,
        lastChangeReasonRef: t,
        locale: W,
        max: B,
        min: H,
        minStepsBetweenValues: N,
        name: Q0,
        onValueCommitted: x,
        orientation: k,
        pressedInputRef: J0,
        pressedThumbCenterOffsetRef: U0,
        pressedThumbIndexRef: K0,
        pressedValuesRef: b,
        registerFieldControlRef: A0,
        renderBeforeHydration: j === 'edge',
        setActive: f0,
        setDragging: n,
        setIndicatorPosition: O0,
        setValue: P0,
        state: t0,
        step: V,
        thumbCollisionBehavior: M,
        thumbMap: _0,
        thumbRefs: Y0,
        values: y0,
      }),
      [
        s,
        X0,
        a,
        p,
        q0,
        E,
        e,
        b0,
        W0,
        Y,
        o,
        r,
        t,
        W,
        B,
        H,
        N,
        Q0,
        x,
        k,
        J0,
        U0,
        K0,
        b,
        A0,
        f0,
        n,
        O0,
        P0,
        t0,
        V,
        M,
        j,
        _0,
        Y0,
        y0,
      ],
    ),
    D0 = f('div', Z, {
      state: t0,
      ref: [J, i],
      props: [
        { 'aria-labelledby': a, id: O, role: 'group' },
        E.getValidationProps,
        w,
      ],
      stateAttributesMapping: f5,
    })
  return YY(o4.Provider, {
    value: L1,
    children: YY(F2, { elementsRef: Y0, onMapChange: H0, children: D0 }),
  })
})
Cq.displayName = 'SliderRoot'
import * as G9 from 'react'
var WY = new Map()
function bL(Q, Z) {
  let J = JSON.stringify({ locale: Q, options: Z }),
    z = WY.get(J)
  if (z) return z
  let q = new Intl.NumberFormat(Q, Z)
  return (WY.set(J, q), q)
}
function t2(Q, Z, J) {
  if (Q == null) return ''
  return bL(Z, J).format(Q)
}
function UY(Q, Z, J) {
  if (Q == null) return ''
  if (!J) return t2(Q / 100, Z, { style: 'percent' })
  return t2(Q, Z, J)
}
var xq = G9.forwardRef(function (Z, J) {
  let {
      'aria-live': z = 'off',
      render: q,
      className: $,
      children: X,
      ...K
    } = Z,
    { thumbMap: G, state: Y, values: W, formatOptionsRef: U, locale: B } = P2(),
    H = G9.useMemo(() => {
      let F = ''
      for (let k of G.values()) if (k?.inputId) F += `${k.inputId} `
      return F.trim() === '' ? void 0 : F.trim()
    }, [G]),
    N = G9.useMemo(() => {
      let F = []
      for (let k = 0; k < W.length; k += 1)
        F.push(t2(W[k], B, U.current ?? void 0))
      return F
    }, [U, B, W]),
    _ = G9.useMemo(() => {
      let F = []
      for (let k = 0; k < W.length; k += 1) F.push(N[k] || W[k])
      return F.join(' – ')
    }, [W, N])
  return f('output', Z, {
    state: Y,
    ref: J,
    props: [
      {
        'aria-live': z,
        children: typeof X === 'function' ? X(N, W) : _,
        htmlFor: H,
      },
      K,
    ],
    stateAttributesMapping: f5,
  })
})
xq.displayName = 'SliderValue'
import * as q2 from 'react'
function t4(Q) {
  let Z = Q.getBoundingClientRect()
  return { x: (Z.left + Z.right) / 2, y: (Z.top + Z.bottom) / 2 }
}
function RL(Q) {
  if (Math.abs(Q) < 1) {
    let J = Q.toExponential().split('e-'),
      z = J[0].split('.')[1]
    return (z ? z.length : 0) + parseInt(J[1], 10)
  }
  let Z = Q.toString().split('.')[1]
  return Z ? Z.length : 0
}
function e4(Q, Z, J) {
  let z = Math.round((Q - J) / Z) * Z + J
  return Number(z.toFixed(RL(Z)))
}
function hq({
  values: Q,
  index: Z,
  nextValue: J,
  min: z,
  max: q,
  step: $,
  minStepsBetweenValues: X,
  initialValues: K,
}) {
  if (Q.length === 0) return []
  let G = Q.slice(),
    Y = $ * X,
    W = G.length - 1,
    U = K ?? Q,
    B = z + Z * Y,
    H = q - (W - Z) * Y
  G[Z] = J1(J, B, H)
  for (let N = Z + 1; N <= W; N += 1) {
    let _ = G[N - 1] + Y,
      L = q - (W - N) * Y,
      F = U[N] ?? G[N],
      k = Math.max(G[N], _)
    if (F < k) k = Math.max(F, _)
    G[N] = J1(k, _, L)
  }
  for (let N = Z - 1; N >= 0; N -= 1) {
    let _ = G[N + 1] - Y,
      L = z + N * Y,
      F = U[N] ?? G[N],
      k = Math.min(G[N], _)
    if (F > k) k = Math.min(F, _)
    G[N] = J1(k, L, _)
  }
  for (let N = 0; N <= W; N += 1) G[N] = Number(G[N].toFixed(12))
  return G
}
function BY({
  behavior: Q,
  values: Z,
  currentValues: J,
  initialValues: z,
  pressedIndex: q,
  nextValue: $,
  min: X,
  max: K,
  step: G,
  minStepsBetweenValues: Y,
}) {
  let W = J ?? Z,
    U = z ?? Z
  if (!(W.length > 1)) return { value: $, thumbIndex: 0, didSwap: !1 }
  let H = G * Y
  switch (Q) {
    case 'swap': {
      let N = W[q],
        _ = 0.0000001,
        L = W.slice(),
        F = L[q - 1],
        k = L[q + 1],
        V = F != null ? F + H : X,
        M = k != null ? k - H : K,
        j = J1($, V, M),
        A = Number(j.toFixed(12))
      L[q] = A
      let w = $ > N,
        O = $ < N,
        S = w && k != null && $ >= k - 0.0000001,
        x = O && F != null && $ <= F + 0.0000001
      if (!S && !x) return { value: L, thumbIndex: q, didSwap: !1 }
      let h = S ? q + 1 : q - 1,
        I = L.map((v, P) => {
          if (P === q) return A
          let D = U[P]
          if (D != null) return D
          return W[P]
        }),
        y = $
      if (S) y = Math.max($, L[h])
      else y = Math.min($, L[h])
      let T = hq({
          values: L,
          index: h,
          nextValue: y,
          min: X,
          max: K,
          step: G,
          minStepsBetweenValues: Y,
          initialValues: I,
        }),
        R = S ? h - 1 : h + 1
      if (R >= 0 && R < T.length) {
        let v = T[R - 1],
          P = T[R + 1],
          D = v != null ? v + H : X
        D = Math.max(D, X + R * H)
        let E = P != null ? P - H : K
        E = Math.min(E, K - (T.length - 1 - R) * H)
        let C = J1(A, D, E)
        T[R] = Number(C.toFixed(12))
      }
      return { value: T, thumbIndex: h, didSwap: !0 }
    }
    case 'push':
      return {
        value: hq({
          values: W,
          index: q,
          nextValue: $,
          min: X,
          max: K,
          step: G,
          minStepsBetweenValues: Y,
        }),
        thumbIndex: q,
        didSwap: !1,
      }
    case 'none':
    default: {
      let N = W.slice(),
        _ = N[q - 1],
        L = N[q + 1],
        F = _ != null ? _ + H : X,
        k = L != null ? L - H : K,
        V = J1($, F, k)
      return (
        (N[q] = Number(V.toFixed(12))),
        { value: N, thumbIndex: q, didSwap: !1 }
      )
    }
  }
}
var vL = 2
function fL(Q, Z) {
  if (!Q) return { start: 0, end: 0 }
  function J($) {
    let X = $ != null ? parseFloat($) : 0
    return Number.isNaN(X) ? 0 : X
  }
  let z = !Z ? 'InlineStart' : 'Top',
    q = !Z ? 'InlineEnd' : 'Bottom'
  return {
    start: J(Q[`border${z}Width`]) + J(Q[`padding${z}`]),
    end: J(Q[`border${q}Width`]) + J(Q[`padding${q}`]),
  }
}
function QZ(Q, Z) {
  if (Z.current != null && Q.changedTouches) {
    let J = Q
    for (let z = 0; z < J.changedTouches.length; z += 1) {
      let q = J.changedTouches[z]
      if (q.identifier === Z.current) return { x: q.clientX, y: q.clientY }
    }
    return null
  }
  return { x: Q.clientX, y: Q.clientY }
}
var bq = q2.forwardRef(function (Z, J) {
  let { render: z, className: q, ...$ } = Z,
    {
      disabled: X,
      dragging: K,
      validation: G,
      inset: Y,
      lastChangedValueRef: W,
      lastChangeReasonRef: U,
      max: B,
      min: H,
      minStepsBetweenValues: N,
      onValueCommitted: _,
      orientation: L,
      pressedInputRef: F,
      pressedThumbCenterOffsetRef: k,
      pressedThumbIndexRef: V,
      pressedValuesRef: M,
      registerFieldControlRef: j,
      renderBeforeHydration: A,
      setActive: w,
      setDragging: O,
      setValue: S,
      state: x,
      step: h,
      thumbCollisionBehavior: I,
      thumbRefs: y,
      values: T,
    } = P2(),
    R = y1(),
    v = T.length > 1,
    P = L === 'vertical',
    D = q2.useRef(null),
    E = q2.useRef(null),
    C = m((e) => {
      if (e && E.current == null) {
        if (E.current == null) E.current = getComputedStyle(e)
      }
    }),
    a = q2.useRef(null),
    p = q2.useRef(0),
    Q0 = q2.useRef(0),
    g = s0(T),
    Z0 = m((e) => {
      if (V.current !== e) V.current = e
      let s = y.current[e]
      if (!s) {
        ;((k.current = null), (F.current = null))
        return
      }
      F.current = s.querySelector('input[type="range"]')
    }),
    i = m((e) => {
      let s = D.current
      if (!s) return null
      let {
          width: d,
          height: o,
          bottom: l,
          left: q0,
          right: n,
        } = s.getBoundingClientRect(),
        _0 = fL(E.current, P),
        H0 = Q0.current,
        W0 = (P ? o : d) - _0.start - _0.end - H0 * 2,
        O0 = k.current ?? 0,
        f0 = e.x - O0,
        A0 = e.y - O0,
        T0 = P ? l - A0 - _0.end : (R === 'rtl' ? n - f0 : f0 - q0) - _0.start,
        y0 = J1((T0 - H0) / W0, 0, 1),
        P0 = (B - H) * y0 + H
      if (((P0 = e4(P0, h, H)), (P0 = J1(P0, H, B)), !v))
        return { value: P0, thumbIndex: 0, didSwap: !1 }
      let b0 = V.current
      if (b0 < 0) return null
      let t0 = BY({
        behavior: I,
        values: T,
        currentValues: g.current ?? T,
        initialValues: M.current,
        pressedIndex: b0,
        nextValue: P0,
        min: H,
        max: B,
        step: h,
        minStepsBetweenValues: N,
      })
      if (I === 'swap' && t0.didSwap) Z0(t0.thumbIndex)
      else V.current = t0.thumbIndex
      return t0
    }),
    X0 = m((e) => {
      ;((M.current = v ? T.slice() : null), (g.current = T))
      let s = V.current,
        d = s
      if (s > -1 && s < T.length) {
        if (T[s] === B) {
          let o = s
          while (o > 0 && T[o - 1] === B) o -= 1
          d = o
        }
      } else {
        let o = !P ? 'x' : 'y',
          l
        d = -1
        for (let q0 = 0; q0 < y.current.length; q0 += 1) {
          let n = y.current[q0]
          if (C0(n)) {
            let _0 = t4(n),
              H0 = Math.abs(e[o] - _0[o])
            if (l === void 0 || H0 <= l) ((d = q0), (l = H0))
          }
        }
      }
      if (d > -1 && d !== s) Z0(d)
      if (Y) {
        let o = y.current[d]
        if (C0(o)) {
          let l = o.getBoundingClientRect(),
            q0 = !P ? 'width' : 'height'
          Q0.current = l[q0] / 2
        }
      }
    }),
    Y0 = m((e) => {
      y.current?.[e]
        ?.querySelector('input[type="range"]')
        ?.focus({ preventScroll: !0 })
    }),
    J0 = m((e) => {
      let s = QZ(e, a)
      if (s == null) return
      if (((p.current += 1), e.type === 'pointermove' && e.buttons === 0)) {
        U0(e)
        return
      }
      let d = i(s)
      if (d == null) return
      if (s4(d.value, h, N)) {
        if (!K && p.current > vL) O(!0)
        if (
          (S(
            d.value,
            $0(c.drag, e, void 0, { activeThumbIndex: d.thumbIndex }),
          ),
          (g.current = Array.isArray(d.value) ? d.value : [d.value]),
          d.didSwap)
        )
          Y0(d.thumbIndex)
      }
    })
  function U0(e) {
    ;(w(-1), O(!1), (F.current = null), (k.current = null))
    let s = QZ(e, a),
      d = s != null ? i(s) : null
    if (d != null) {
      let o = U.current
      ;(G.commit(W.current ?? d.value), _(W.current ?? d.value, bQ(o, e)))
    }
    if ('pointerType' in e && D.current?.hasPointerCapture(e.pointerId))
      D.current?.releasePointerCapture(e.pointerId)
    ;((V.current = -1), (a.current = null), (M.current = null), b())
  }
  let K0 = m((e) => {
      if (X) return
      let s = e.changedTouches[0]
      if (s != null) a.current = s.identifier
      let d = QZ(e, a)
      if (d != null) {
        X0(d)
        let l = i(d)
        if (l == null) return
        if (
          (Y0(l.thumbIndex),
          S(
            l.value,
            $0(c.trackPress, e, void 0, { activeThumbIndex: l.thumbIndex }),
          ),
          (g.current = Array.isArray(l.value) ? l.value : [l.value]),
          l.didSwap)
        )
          Y0(l.thumbIndex)
      }
      p.current = 0
      let o = V0(D.current)
      ;(o.addEventListener('touchmove', J0, { passive: !0 }),
        o.addEventListener('touchend', U0, { passive: !0 }))
    }),
    b = m(() => {
      let e = V0(D.current)
      ;(e.removeEventListener('pointermove', J0),
        e.removeEventListener('pointerup', U0),
        e.removeEventListener('touchmove', J0),
        e.removeEventListener('touchend', U0),
        (M.current = null))
    }),
    r = K5()
  return (
    q2.useEffect(() => {
      let e = D.current
      if (!e) return () => b()
      return (
        e.addEventListener('touchstart', K0, { passive: !0 }),
        () => {
          ;(e.removeEventListener('touchstart', K0), r.cancel(), b())
        }
      )
    }, [b, K0, D, r]),
    q2.useEffect(() => {
      if (X) b()
    }, [X, b]),
    f('div', Z, {
      state: x,
      ref: [J, j, D, C],
      props: [
        {
          ['data-base-ui-slider-control']: A ? '' : void 0,
          onPointerDown(e) {
            let s = D.current
            if (
              !s ||
              X ||
              e.defaultPrevented ||
              !C0(e.target) ||
              e.button !== 0
            )
              return
            let d = QZ(e, a)
            if (d != null) {
              X0(d)
              let l = i(d)
              if (l == null) return
              if (F0(y.current[l.thumbIndex], B1(V0(s)))) e.preventDefault()
              else
                r.request(() => {
                  Y0(l.thumbIndex)
                })
              if ((O(!0), k.current == null)) {
                if (
                  (S(
                    l.value,
                    $0(c.trackPress, e.nativeEvent, void 0, {
                      activeThumbIndex: l.thumbIndex,
                    }),
                  ),
                  (g.current = Array.isArray(l.value) ? l.value : [l.value]),
                  l.didSwap)
                )
                  Y0(l.thumbIndex)
              }
            }
            if (e.nativeEvent.pointerId)
              s.setPointerCapture(e.nativeEvent.pointerId)
            p.current = 0
            let o = V0(D.current)
            ;(o.addEventListener('pointermove', J0, { passive: !0 }),
              o.addEventListener('pointerup', U0, { once: !0 }))
          },
          tabIndex: -1,
        },
        $,
      ],
      stateAttributesMapping: f5,
    })
  )
})
bq.displayName = 'SliderControl'
import * as _Y from 'react'
var Rq = _Y.forwardRef(function (Z, J) {
  let { render: z, className: q, ...$ } = Z,
    { state: X } = P2()
  return f('div', Z, {
    state: X,
    ref: J,
    props: [{ style: { position: 'relative' } }, $],
    stateAttributesMapping: f5,
  })
})
Rq.displayName = 'SliderTrack'
import * as U5 from 'react'
function D6(Q, Z, J) {
  return ((Q - Z) * 100) / (J - Z)
}
var HY = (function (Q) {
  return (
    (Q.index = 'data-index'),
    (Q.dragging = 'data-dragging'),
    (Q.orientation = 'data-orientation'),
    (Q.disabled = 'data-disabled'),
    (Q.valid = 'data-valid'),
    (Q.invalid = 'data-invalid'),
    (Q.touched = 'data-touched'),
    (Q.dirty = 'data-dirty'),
    (Q.focused = 'data-focused'),
    Q
  )
})({})
var NY =
  '!function(){const t=document.currentScript?.parentElement;if(!t)return;const e=t.closest("[data-base-ui-slider-control]");if(!e)return;const r=e.querySelector("[data-base-ui-slider-indicator]"),i=e.getBoundingClientRect(),n="vertical"===e.getAttribute("data-orientation")?"height":"width",o=e.querySelectorAll(\'input[type="range"]\'),l=o.length>1,s=o.length-1;let a=null,u=null;for(let t=0;t<o.length;t+=1){const e=o[t],y=parseFloat(e.getAttribute("value")??"");if(Number.isNaN(y))return;const c=e.parentElement;if(!c)return;const p=parseFloat(e.getAttribute("max")??"100"),g=parseFloat(e.getAttribute("min")??"0"),b=c?.getBoundingClientRect(),d=i[n]-b[n],m=100*(y-g)/(p-g),v=(b[n]/2+d*m/100)/i[n]*100;c.style.setProperty("--position",`${v}%`),Number.isFinite(v)&&(c.style.removeProperty("visibility"),r&&(0===t?(a=v,r.style.setProperty("--start-position",`${v}%`),l||r.style.removeProperty("visibility")):t===s&&(u=v-(a??0),r.style.setProperty("--end-position",`${v}%`),r.style.setProperty("--relative-size",`${u}%`),r.style.removeProperty("visibility"))))}}();'
import { jsx as LY, jsxs as gL } from 'react/jsx-runtime'
var FY = 'PageUp',
  kY = 'PageDown',
  mL = new Set([H2, e5, c2, N2, d2, i2, FY, kY])
function pL(Q, Z, J, z) {
  if (Z < 0) return
  if (Q.length === 2) {
    if (Z === 0) return `${t2(Q[Z], z, J)} start range`
    return `${t2(Q[Z], z, J)} end range`
  }
  return J ? t2(Q[Z], z, J) : void 0
}
function Y9(Q, Z, J, z, q) {
  return J === 1 ? Math.min(Q + Z, q) : Math.max(Q - Z, z)
}
var vq = U5.forwardRef(function (Z, J) {
  let {
      render: z,
      children: q,
      className: $,
      'aria-describedby': X,
      'aria-label': K,
      'aria-labelledby': G,
      disabled: Y = !1,
      getAriaLabel: W,
      getAriaValueText: U,
      id: B,
      index: H,
      inputRef: N,
      onBlur: _,
      onFocus: L,
      onKeyDown: F,
      tabIndex: k,
      ...V
    } = Z,
    { nonce: M } = v8(),
    j = L0(B),
    {
      active: A,
      lastUsedThumbIndex: w,
      controlRef: O,
      disabled: S,
      validation: x,
      formatOptionsRef: h,
      handleInputChange: I,
      inset: y,
      labelId: T,
      largeStep: R,
      locale: v,
      max: P,
      min: D,
      minStepsBetweenValues: E,
      name: C,
      orientation: a,
      pressedInputRef: p,
      pressedThumbCenterOffsetRef: Q0,
      pressedThumbIndexRef: g,
      renderBeforeHydration: Z0,
      setActive: i,
      setIndicatorPosition: X0,
      state: Y0,
      step: J0,
      values: U0,
    } = P2(),
    K0 = y1(),
    b = Y || S,
    r = U0.length > 1,
    t = a === 'vertical',
    e = K0 === 'rtl',
    { setTouched: s, setFocused: d, validationMode: o } = r0(),
    l = U5.useRef(null),
    q0 = U5.useRef(null),
    n = L0(),
    _0 = I5(),
    H0 = r ? n : _0,
    W0 = U5.useMemo(() => ({ inputId: H0 }), [H0]),
    { ref: O0, index: f0 } = g1({ metadata: W0 }),
    A0 = !r ? 0 : (H ?? f0),
    T0 = A0 === U0.length - 1,
    y0 = U0[A0],
    P0 = D6(y0, D, P),
    [b0, t0] = U5.useState(!1),
    [L1, D0] = U5.useState()
  $5(() => t0(!0))
  let B0 = w >= 0 && w < U0.length ? w : -1,
    E0 = m(() => {
      let I0 = O.current,
        p0 = l.current
      if (!I0 || !p0) return
      let n0 = p0.getBoundingClientRect(),
        H5 = I0.getBoundingClientRect(),
        c5 = t ? 'height' : 'width',
        X8 = H5[c5] - n0[c5],
        v2 = ((n0[c5] / 2 + (X8 * P0) / 100) / H5[c5]) * 100
      if ((D0(v2), A0 === 0)) X0((h0) => [v2, h0[1]])
      else if (T0) X0((h0) => [h0[0], v2])
    })
  ;(u(() => {
    if (y) queueMicrotask(E0)
  }, [E0, y]),
    u(() => {
      if (y) E0()
    }, [E0, y, P0]))
  let w0 = U5.useCallback(() => {
      let I0 = t ? 'bottom' : 'insetInlineStart',
        p0 = t ? 'left' : 'top',
        n0
      if (r) {
        if (A === A0) n0 = 2
        else if (B0 === A0) n0 = 1
      } else if (A === A0) n0 = 1
      if (!y) {
        if (!Number.isFinite(P0)) return s1
        return {
          position: 'absolute',
          [I0]: `${P0}%`,
          [p0]: '50%',
          translate: `${(t || !e ? -1 : 1) * 50}% ${(t ? 1 : -1) * 50}%`,
          zIndex: n0,
        }
      }
      return {
        ['--position']: `${L1}%`,
        visibility: (Z0 && !b0) || L1 === void 0 ? 'hidden' : void 0,
        position: 'absolute',
        [I0]: 'var(--position)',
        [p0]: '50%',
        translate: `${(t || !e ? -1 : 1) * 50}% ${(t ? 1 : -1) * 50}%`,
        zIndex: n0,
      }
    }, [A, A0, y, b0, L1, r, Z0, e, B0, P0, t]),
    g0
  if (a === 'vertical') g0 = e ? 'vertical-rl' : 'vertical-lr'
  let e0 = q1(
      {
        'aria-label': typeof W === 'function' ? W(A0) : K,
        'aria-labelledby': G ?? T,
        'aria-describedby': X,
        'aria-orientation': a,
        'aria-valuenow': y0,
        'aria-valuetext':
          typeof U === 'function'
            ? U(t2(y0, v, h.current ?? void 0), y0, A0)
            : pL(U0, A0, h.current ?? void 0, v),
        disabled: b,
        id: H0,
        max: P,
        min: D,
        name: C,
        onChange(I0) {
          I(I0.target.valueAsNumber, A0, I0)
        },
        onFocus() {
          ;(i(A0), d(!0))
        },
        onBlur() {
          if (!l.current) return
          if ((i(-1), s(!0), d(!1), o === 'onBlur'))
            x.commit(a4(y0, A0, D, P, r, U0))
        },
        onKeyDown(I0) {
          if (!mL.has(I0.key)) return
          if (L2.has(I0.key)) I0.stopPropagation()
          let p0 = null,
            n0 = e4(y0, J0, D)
          switch (I0.key) {
            case H2:
              p0 = Y9(n0, I0.shiftKey ? R : J0, 1, D, P)
              break
            case N2:
              p0 = Y9(n0, I0.shiftKey ? R : J0, e ? -1 : 1, D, P)
              break
            case e5:
              p0 = Y9(n0, I0.shiftKey ? R : J0, -1, D, P)
              break
            case c2:
              p0 = Y9(n0, I0.shiftKey ? R : J0, e ? 1 : -1, D, P)
              break
            case FY:
              p0 = Y9(n0, R, 1, D, P)
              break
            case kY:
              p0 = Y9(n0, R, -1, D, P)
              break
            case i2:
              if (((p0 = P), r))
                p0 = Number.isFinite(U0[A0 + 1]) ? U0[A0 + 1] - J0 * E : P
              break
            case d2:
              if (((p0 = D), r))
                p0 = Number.isFinite(U0[A0 - 1]) ? U0[A0 - 1] + J0 * E : D
              break
            default:
              break
          }
          if (p0 !== null) (I(p0, A0, I0), I0.preventDefault())
        },
        step: J0,
        style: { ...s1, width: '100%', height: '100%', writingMode: g0 },
        tabIndex: k ?? void 0,
        type: 'range',
        value: y0 ?? '',
      },
      x.getInputValidationProps,
    ),
    d0 = Y1(q0, x.inputRef, N)
  return f('div', Z, {
    state: Y0,
    ref: [J, O0, l],
    props: [
      {
        [HY.index]: A0,
        children: gL(U5.Fragment, {
          children: [
            q,
            LY('input', { ref: d0, ...e0 }),
            y &&
              !b0 &&
              Z0 &&
              T0 &&
              LY('script', {
                nonce: M,
                dangerouslySetInnerHTML: { __html: NY },
                suppressHydrationWarning: !0,
              }),
          ],
        }),
        id: j,
        onBlur: _,
        onFocus: L,
        onPointerDown(I0) {
          if (((g.current = A0), l.current != null)) {
            let p0 = a === 'horizontal' ? 'x' : 'y',
              n0 = t4(l.current),
              H5 = (a === 'horizontal' ? I0.clientX : I0.clientY) - n0[p0]
            Q0.current = H5
          }
          if (q0.current != null && p.current !== q0.current)
            p.current = q0.current
        },
        style: w0(),
        suppressHydrationWarning: Z0 || void 0,
        tabIndex: -1,
      },
      V,
    ],
    stateAttributesMapping: f5,
  })
})
vq.displayName = 'SliderThumb'
import * as ZZ from 'react'
function uL(Q, Z, J, z, q, $) {
  let X = J === void 0 || (Z && z === void 0) ? 'hidden' : void 0,
    K = Q ? 'bottom' : 'insetInlineStart',
    G = Q ? 'height' : 'width',
    W = {
      visibility: q && !$ ? 'hidden' : X,
      position: Q ? 'absolute' : 'relative',
      [Q ? 'width' : 'height']: 'inherit',
    }
  if (((W['--start-position'] = `${J ?? 0}%`), !Z))
    return ((W[K] = 0), (W[G] = 'var(--start-position)'), W)
  return (
    (W['--relative-size'] = `${(z ?? 0) - (J ?? 0)}%`),
    (W[K] = 'var(--start-position)'),
    (W[G] = 'var(--relative-size)'),
    W
  )
}
function cL(Q, Z, J, z) {
  let q = Q ? 'bottom' : 'insetInlineStart',
    $ = Q ? 'height' : 'width',
    K = {
      position: Q ? 'absolute' : 'relative',
      [Q ? 'width' : 'height']: 'inherit',
    }
  if (!Z) return ((K[q] = 0), (K[$] = `${J}%`), K)
  let G = z - J
  return ((K[q] = `${J}%`), (K[$] = `${G}%`), K)
}
var fq = ZZ.forwardRef(function (Z, J) {
  let { render: z, className: q, ...$ } = Z,
    {
      indicatorPosition: X,
      inset: K,
      max: G,
      min: Y,
      orientation: W,
      renderBeforeHydration: U,
      state: B,
      values: H,
    } = P2(),
    [N, _] = ZZ.useState(!1)
  $5(() => _(!0))
  let L = W === 'vertical',
    F = H.length > 1,
    k = K
      ? uL(L, F, X[0], X[1], U, N)
      : cL(L, F, D6(H[0], Y, G), D6(H[H.length - 1], Y, G))
  return f('div', Z, {
    state: B,
    ref: J,
    props: [
      {
        ['data-base-ui-slider-indicator']: U ? '' : void 0,
        style: k,
        suppressHydrationWarning: U || void 0,
      },
      $,
    ],
    stateAttributesMapping: f5,
  })
})
fq.displayName = 'SliderIndicator'
import { jsxDEV as P7 } from 'react/jsx-dev-runtime'
function Qm({
  className: Q,
  defaultValue: Z,
  value: J,
  min: z = 0,
  max: q = 100,
  ...$
}) {
  let X = MY.useMemo(
    () => (Array.isArray(J) ? J : Array.isArray(Z) ? Z : [z, q]),
    [J, Z, z, q],
  )
  return P7(
    g8.Root,
    {
      className: z0('data-horizontal:w-full data-vertical:h-full', Q),
      'data-slot': 'slider',
      defaultValue: Z,
      value: J,
      min: z,
      max: q,
      thumbAlignment: 'edge',
      ...$,
      children: P7(
        g8.Control,
        {
          className:
            'data-vertical:min-h-40 relative flex w-full touch-none items-center select-none data-disabled:opacity-50 data-vertical:h-full data-vertical:w-auto data-vertical:flex-col',
          children: [
            P7(
              g8.Track,
              {
                'data-slot': 'slider-track',
                className:
                  'bg-muted rounded-full data-horizontal:h-1 data-horizontal:w-full data-vertical:h-full data-vertical:w-1 relative grow overflow-hidden select-none',
                children: P7(
                  g8.Indicator,
                  {
                    'data-slot': 'slider-range',
                    className:
                      'bg-primary select-none data-horizontal:h-full data-vertical:w-full',
                  },
                  void 0,
                  !1,
                  void 0,
                  this,
                ),
              },
              void 0,
              !1,
              void 0,
              this,
            ),
            Array.from({ length: X.length }, (K, G) =>
              P7(
                g8.Thumb,
                {
                  'data-slot': 'slider-thumb',
                  className:
                    'border-ring ring-ring/50 relative size-3 rounded-full border bg-white transition-[color,box-shadow] after:absolute after:-inset-2 hover:ring-3 focus-visible:ring-3 focus-visible:outline-hidden active:ring-3 block shrink-0 select-none disabled:pointer-events-none disabled:opacity-50',
                },
                G,
                !1,
                void 0,
                this,
              ),
            ),
          ],
        },
        void 0,
        !0,
        void 0,
        this,
      ),
    },
    void 0,
    !1,
    void 0,
    this,
  )
}
import * as VY from 'react'
import * as JZ from 'react'
var zZ = JZ.createContext(void 0)
zZ.displayName = 'ToggleGroupContext'
function jY(Q = !0) {
  let Z = JZ.useContext(zZ)
  if (Z === void 0 && !Q)
    throw Error(
      'Base UI: ToggleGroupContext is missing. ToggleGroup parts must be placed within <ToggleGroup>.',
    )
  return Z
}
import { jsx as dL } from 'react/jsx-runtime'
var W9 = VY.forwardRef(function (Z, J) {
  let {
      className: z,
      defaultPressed: q = !1,
      disabled: $ = !1,
      form: X,
      onPressedChange: K,
      pressed: G,
      render: Y,
      type: W,
      value: U,
      nativeButton: B = !0,
      ...H
    } = Z,
    N = L0(U || void 0),
    _ = jY(),
    L = _?.value ?? [],
    F = _ ? void 0 : q,
    k = ($ || _?.disabled) ?? !1
  u(() => {
    if (_ && U === void 0 && _.isValueInitialized)
      W8(
        'A `<Toggle>` component rendered in a `<ToggleGroup>` has no explicit `value` prop.',
        'This will cause issues between the Toggle Group and Toggle values.',
        'Provide the `<Toggle>` with a `value` prop matching the `<ToggleGroup>` values prop type.',
      )
  }, [_, U, _?.isValueInitialized])
  let [V, M] = _1({
      controlled: _ ? N !== void 0 && L.indexOf(N) > -1 : G,
      default: F,
      name: 'Toggle',
      state: 'pressed',
    }),
    j = m((I, y) => {
      if (N) _?.setGroupValue?.(N, I, y)
      K?.(I, y)
    }),
    { getButtonProps: A, buttonRef: w } = Q1({ disabled: k, native: B }),
    O = { disabled: k, pressed: V },
    S = [w, J],
    x = [
      {
        'aria-pressed': V,
        onClick(I) {
          let y = !V,
            T = $0(c.none, I.nativeEvent)
          if ((j(y, T), T.isCanceled)) return
          M(y)
        },
      },
      H,
      A,
    ],
    h = f('button', Z, { enabled: !_, state: O, ref: S, props: x })
  if (_)
    return dL(s6, {
      tag: 'button',
      render: Y,
      className: z,
      state: O,
      refs: S,
      props: x,
    })
  return h
})
W9.displayName = 'Toggle'
import { jsxDEV as iL } from 'react/jsx-dev-runtime'
var gq = T5(
  "hover:text-foreground aria-pressed:bg-muted focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive data-[state=on]:bg-muted gap-1 rounded-lg text-sm font-medium transition-all [&_svg:not([class*='size-'])]:size-4 group/toggle hover:bg-muted inline-flex items-center justify-center whitespace-nowrap outline-none focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: 'bg-transparent',
        outline: 'border-input hover:bg-muted border bg-transparent',
      },
      size: {
        default: 'h-8 min-w-8 px-2',
        sm: 'h-7 min-w-7 rounded-[min(var(--radius-md),12px)] px-1.5 text-[0.8rem]',
        lg: 'h-9 min-w-9 px-2.5',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)
function Am({
  className: Q,
  variant: Z = 'default',
  size: J = 'default',
  ...z
}) {
  return iL(
    W9,
    {
      'data-slot': 'toggle',
      className: z0(gq({ variant: Z, size: J, className: Q })),
      ...z,
    },
    void 0,
    !1,
    void 0,
    this,
  )
}
import * as $Z from 'react'
import * as U9 from 'react'
var AY = (function (Q) {
  return (
    (Q.disabled = 'data-disabled'),
    (Q.orientation = 'data-orientation'),
    (Q.multiple = 'data-multiple'),
    Q
  )
})({})
import { jsx as OY } from 'react/jsx-runtime'
var wY = {
    multiple(Q) {
      if (Q) return { [AY.multiple]: '' }
      return null
    },
  },
  qZ = U9.forwardRef(function (Z, J) {
    let {
        defaultValue: z,
        disabled: q = !1,
        loopFocus: $ = !0,
        onValueChange: X,
        orientation: K = 'horizontal',
        multiple: G = !1,
        value: Y,
        className: W,
        render: U,
        ...B
      } = Z,
      H = R8(!0),
      N = U9.useMemo(() => {
        if (Y === void 0) return z ?? []
        return
      }, [Y, z]),
      _ = U9.useMemo(() => Y !== void 0 || z !== void 0, [Y, z]),
      L = (H?.disabled ?? !1) || q,
      [F, k] = _1({
        controlled: Y,
        default: N,
        name: 'ToggleGroup',
        state: 'value',
      }),
      V = m((O, S, x) => {
        let h
        if (G)
          if (((h = F.slice()), S)) h.push(O)
          else h.splice(F.indexOf(O), 1)
        else h = S ? [O] : []
        if (Array.isArray(h)) {
          if ((X?.(h, x), x.isCanceled)) return
          k(h)
        }
      }),
      M = { disabled: L, multiple: G, orientation: K },
      j = U9.useMemo(
        () => ({
          disabled: L,
          orientation: K,
          setGroupValue: V,
          value: F,
          isValueInitialized: _,
        }),
        [L, K, V, F, _],
      ),
      A = { role: 'group' },
      w = f('div', Z, {
        enabled: Boolean(H),
        state: M,
        ref: J,
        props: [A, B],
        stateAttributesMapping: wY,
      })
    return OY(zZ.Provider, {
      value: j,
      children: H
        ? w
        : OY(o6, {
            render: U,
            className: W,
            state: M,
            refs: [J],
            props: [A, B],
            stateAttributesMapping: wY,
            loopFocus: $,
            enableHomeAndEndKeys: !0,
          }),
    })
  })
qZ.displayName = 'ToggleGroup'
import { jsxDEV as mq } from 'react/jsx-dev-runtime'
var yY = $Z.createContext({
  size: 'default',
  variant: 'default',
  spacing: 0,
  orientation: 'horizontal',
})
function pm({
  className: Q,
  variant: Z,
  size: J,
  spacing: z = 0,
  orientation: q = 'horizontal',
  children: $,
  ...X
}) {
  return mq(
    qZ,
    {
      'data-slot': 'toggle-group',
      'data-variant': Z,
      'data-size': J,
      'data-spacing': z,
      'data-orientation': q,
      style: { '--gap': z },
      className: z0(
        'rounded-lg data-[size=sm]:rounded-[min(var(--radius-md),10px)] group/toggle-group flex w-fit flex-row items-center gap-[--spacing(var(--gap))] data-vertical:flex-col data-vertical:items-stretch',
        Q,
      ),
      ...X,
      children: mq(
        yY.Provider,
        {
          value: { variant: Z, size: J, spacing: z, orientation: q },
          children: $,
        },
        void 0,
        !1,
        void 0,
        this,
      ),
    },
    void 0,
    !1,
    void 0,
    this,
  )
}
function um({
  className: Q,
  children: Z,
  variant: J = 'default',
  size: z = 'default',
  ...q
}) {
  let $ = $Z.useContext(yY)
  return mq(
    W9,
    {
      'data-slot': 'toggle-group-item',
      'data-variant': $.variant || J,
      'data-size': $.size || z,
      'data-spacing': $.spacing,
      className: z0(
        'group-data-[spacing=0]/toggle-group:rounded-none group-data-[spacing=0]/toggle-group:px-2 group-data-horizontal/toggle-group:data-[spacing=0]:first:rounded-l-lg group-data-vertical/toggle-group:data-[spacing=0]:first:rounded-t-lg group-data-horizontal/toggle-group:data-[spacing=0]:last:rounded-r-lg group-data-vertical/toggle-group:data-[spacing=0]:last:rounded-b-lg shrink-0 focus:z-10 focus-visible:z-10 group-data-horizontal/toggle-group:data-[spacing=0]:data-[variant=outline]:border-l-0 group-data-vertical/toggle-group:data-[spacing=0]:data-[variant=outline]:border-t-0 group-data-horizontal/toggle-group:data-[spacing=0]:data-[variant=outline]:first:border-l group-data-vertical/toggle-group:data-[spacing=0]:data-[variant=outline]:first:border-t',
        gq({ variant: $.variant || J, size: $.size || z }),
        Q,
      ),
      ...q,
      children: Z,
    },
    void 0,
    !1,
    void 0,
    this,
  )
}
import { jsxDEV as T6 } from 'react/jsx-dev-runtime'
function lm({ className: Q, size: Z = 'default', ...J }) {
  return T6(
    'div',
    {
      'data-slot': 'card',
      'data-size': Z,
      className: z0(
        'ring-foreground/10 bg-card text-card-foreground gap-4 overflow-hidden rounded-xl py-4 text-sm ring-1 has-data-[slot=card-footer]:pb-0 has-[>img:first-child]:pt-0 data-[size=sm]:gap-3 data-[size=sm]:py-3 data-[size=sm]:has-data-[slot=card-footer]:pb-0 *:[img:first-child]:rounded-t-xl *:[img:last-child]:rounded-b-xl group/card flex flex-col',
        Q,
      ),
      ...J,
    },
    void 0,
    !1,
    void 0,
    this,
  )
}
function rm({ className: Q, ...Z }) {
  return T6(
    'div',
    {
      'data-slot': 'card-header',
      className: z0(
        'gap-1 rounded-t-xl px-4 group-data-[size=sm]/card:px-3 [.border-b]:pb-4 group-data-[size=sm]/card:[.border-b]:pb-3 group/card-header @container/card-header grid auto-rows-min items-start has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto]',
        Q,
      ),
      ...Z,
    },
    void 0,
    !1,
    void 0,
    this,
  )
}
function am({ className: Q, ...Z }) {
  return T6(
    'div',
    {
      'data-slot': 'card-title',
      className: z0(
        'text-base leading-snug font-medium group-data-[size=sm]/card:text-sm',
        Q,
      ),
      ...Z,
    },
    void 0,
    !1,
    void 0,
    this,
  )
}
function sm({ className: Q, ...Z }) {
  return T6(
    'div',
    {
      'data-slot': 'card-description',
      className: z0('text-muted-foreground text-sm', Q),
      ...Z,
    },
    void 0,
    !1,
    void 0,
    this,
  )
}
function nm({ className: Q, ...Z }) {
  return T6(
    'div',
    {
      'data-slot': 'card-action',
      className: z0(
        'col-start-2 row-span-2 row-start-1 self-start justify-self-end',
        Q,
      ),
      ...Z,
    },
    void 0,
    !1,
    void 0,
    this,
  )
}
function om({ className: Q, ...Z }) {
  return T6(
    'div',
    {
      'data-slot': 'card-content',
      className: z0('px-4 group-data-[size=sm]/card:px-3', Q),
      ...Z,
    },
    void 0,
    !1,
    void 0,
    this,
  )
}
function tm({ className: Q, ...Z }) {
  return T6(
    'div',
    {
      'data-slot': 'card-footer',
      className: z0(
        'bg-muted/50 rounded-b-xl border-t p-4 group-data-[size=sm]/card:p-3 flex items-center',
        Q,
      ),
      ...Z,
    },
    void 0,
    !1,
    void 0,
    this,
  )
}
import { jsxDEV as lL } from 'react/jsx-dev-runtime'
function $p({ className: Q, orientation: Z = 'horizontal', ...J }) {
  return lL(
    f8,
    {
      'data-slot': 'separator',
      orientation: Z,
      className: z0(
        'bg-border shrink-0 data-horizontal:h-px data-horizontal:w-full data-vertical:w-px data-vertical:self-stretch',
        Q,
      ),
      ...J,
    },
    void 0,
    !1,
    void 0,
    this,
  )
}
var p8 = {}
c1(p8, {
  Viewport: () => dq,
  Thumb: () => rq,
  Scrollbar: () => iq,
  Root: () => uq,
  Corner: () => aq,
  Content: () => lq,
})
import * as Z1 from 'react'
import * as XZ from 'react'
var KZ = XZ.createContext(void 0)
KZ.displayName = 'ScrollAreaRootContext'
function E2() {
  let Q = XZ.useContext(KZ)
  if (Q === void 0)
    throw Error(
      'Base UI: ScrollAreaRootContext is missing. ScrollArea parts must be placed within <ScrollArea.Root>.',
    )
  return Q
}
var B9 = (function (Q) {
  return (
    (Q.scrollAreaCornerHeight = '--scroll-area-corner-height'),
    (Q.scrollAreaCornerWidth = '--scroll-area-corner-width'),
    Q
  )
})({})
var E7 = 500,
  pq = 16
function e1(Q, Z, J) {
  if (!Q) return 0
  let z = getComputedStyle(Q),
    q = J === 'x' ? 'Inline' : 'Block'
  if (J === 'x' && Z === 'margin') return parseFloat(z[`${Z}InlineStart`]) * 2
  return parseFloat(z[`${Z}${q}Start`]) + parseFloat(z[`${Z}${q}End`])
}
var DY = (function (Q) {
  return (
    (Q.orientation = 'data-orientation'),
    (Q.hovering = 'data-hovering'),
    (Q.scrolling = 'data-scrolling'),
    (Q.hasOverflowX = 'data-has-overflow-x'),
    (Q.hasOverflowY = 'data-has-overflow-y'),
    (Q.overflowXStart = 'data-overflow-x-start'),
    (Q.overflowXEnd = 'data-overflow-x-end'),
    (Q.overflowYStart = 'data-overflow-y-start'),
    (Q.overflowYEnd = 'data-overflow-y-end'),
    Q
  )
})({})
var P6 = (function (Q) {
  return (
    (Q.scrolling = 'data-scrolling'),
    (Q.hasOverflowX = 'data-has-overflow-x'),
    (Q.hasOverflowY = 'data-has-overflow-y'),
    (Q.overflowXStart = 'data-overflow-x-start'),
    (Q.overflowXEnd = 'data-overflow-x-end'),
    (Q.overflowYStart = 'data-overflow-y-start'),
    (Q.overflowYEnd = 'data-overflow-y-end'),
    Q
  )
})({})
var m8 = {
  hasOverflowX: (Q) => (Q ? { [P6.hasOverflowX]: '' } : null),
  hasOverflowY: (Q) => (Q ? { [P6.hasOverflowY]: '' } : null),
  overflowXStart: (Q) => (Q ? { [P6.overflowXStart]: '' } : null),
  overflowXEnd: (Q) => (Q ? { [P6.overflowXEnd]: '' } : null),
  overflowYStart: (Q) => (Q ? { [P6.overflowYStart]: '' } : null),
  overflowYEnd: (Q) => (Q ? { [P6.overflowYEnd]: '' } : null),
  cornerHidden: () => null,
}
import { jsxs as rL } from 'react/jsx-runtime'
var aL = { x: 0, y: 0 },
  TY = { width: 0, height: 0 },
  sL = { xStart: !1, xEnd: !1, yStart: !1, yEnd: !1 },
  nL = { x: !1, y: !1, corner: !1 },
  uq = Z1.forwardRef(function (Z, J) {
    let { render: z, className: q, overflowEdgeThreshold: $, ...X } = Z,
      K = oL($),
      G = L0(),
      Y = c0(),
      W = c0(),
      { nonce: U, disableStyleElements: B } = v8(),
      [H, N] = Z1.useState(!1),
      [_, L] = Z1.useState(!1),
      [F, k] = Z1.useState(!1),
      [V, M] = Z1.useState(!1),
      [j, A] = Z1.useState(TY),
      [w, O] = Z1.useState(TY),
      [S, x] = Z1.useState(sL),
      [h, I] = Z1.useState(nL),
      y = Z1.useRef(null),
      T = Z1.useRef(null),
      R = Z1.useRef(null),
      v = Z1.useRef(null),
      P = Z1.useRef(null),
      D = Z1.useRef(null),
      E = Z1.useRef(null),
      C = Z1.useRef(!1),
      a = Z1.useRef(0),
      p = Z1.useRef(0),
      Q0 = Z1.useRef(0),
      g = Z1.useRef(0),
      Z0 = Z1.useRef('vertical'),
      i = Z1.useRef(aL),
      X0 = m((d) => {
        let o = d.x - i.current.x,
          l = d.y - i.current.y
        if (((i.current = d), l !== 0))
          (k(!0),
            Y.start(E7, () => {
              k(!1)
            }))
        if (o !== 0)
          (L(!0),
            W.start(E7, () => {
              L(!1)
            }))
      }),
      Y0 = m((d) => {
        if (d.button !== 0) return
        if (
          ((C.current = !0),
          (a.current = d.clientY),
          (p.current = d.clientX),
          (Z0.current = d.currentTarget.getAttribute(DY.orientation)),
          T.current)
        )
          ((Q0.current = T.current.scrollTop),
            (g.current = T.current.scrollLeft))
        if (P.current && Z0.current === 'vertical')
          P.current.setPointerCapture(d.pointerId)
        if (D.current && Z0.current === 'horizontal')
          D.current.setPointerCapture(d.pointerId)
      }),
      J0 = m((d) => {
        if (!C.current) return
        let o = d.clientY - a.current,
          l = d.clientX - p.current
        if (T.current) {
          let q0 = T.current.scrollHeight,
            n = T.current.clientHeight,
            _0 = T.current.scrollWidth,
            H0 = T.current.clientWidth
          if (P.current && R.current && Z0.current === 'vertical') {
            let W0 = e1(R.current, 'padding', 'y'),
              O0 = e1(P.current, 'margin', 'y'),
              f0 = P.current.offsetHeight,
              A0 = R.current.offsetHeight - f0 - W0 - O0,
              T0 = o / A0
            ;((T.current.scrollTop = Q0.current + T0 * (q0 - n)),
              d.preventDefault(),
              k(!0),
              Y.start(E7, () => {
                k(!1)
              }))
          }
          if (D.current && v.current && Z0.current === 'horizontal') {
            let W0 = e1(v.current, 'padding', 'x'),
              O0 = e1(D.current, 'margin', 'x'),
              f0 = D.current.offsetWidth,
              A0 = v.current.offsetWidth - f0 - W0 - O0,
              T0 = l / A0
            ;((T.current.scrollLeft = g.current + T0 * (_0 - H0)),
              d.preventDefault(),
              L(!0),
              W.start(E7, () => {
                L(!1)
              }))
          }
        }
      }),
      U0 = m((d) => {
        if (((C.current = !1), P.current && Z0.current === 'vertical'))
          P.current.releasePointerCapture(d.pointerId)
        if (D.current && Z0.current === 'horizontal')
          D.current.releasePointerCapture(d.pointerId)
      })
    function K0(d) {
      M(d.pointerType === 'touch')
    }
    function b(d) {
      if ((K0(d), d.pointerType !== 'touch')) {
        let o = F0(y.current, d.target)
        N(o)
      }
    }
    let r = Z1.useMemo(
        () => ({
          scrolling: _ || F,
          hasOverflowX: !h.x,
          hasOverflowY: !h.y,
          overflowXStart: S.xStart,
          overflowXEnd: S.xEnd,
          overflowYStart: S.yStart,
          overflowYEnd: S.yEnd,
          cornerHidden: h.corner,
        }),
        [_, F, h.x, h.y, h.corner, S],
      ),
      t = {
        role: 'presentation',
        onPointerEnter: b,
        onPointerMove: b,
        onPointerDown: K0,
        onPointerLeave() {
          N(!1)
        },
        style: {
          position: 'relative',
          [B9.scrollAreaCornerHeight]: `${j.height}px`,
          [B9.scrollAreaCornerWidth]: `${j.width}px`,
        },
      },
      e = f('div', Z, {
        state: r,
        ref: [J, y],
        props: [t, X],
        stateAttributesMapping: m8,
      }),
      s = Z1.useMemo(
        () => ({
          handlePointerDown: Y0,
          handlePointerMove: J0,
          handlePointerUp: U0,
          handleScroll: X0,
          cornerSize: j,
          setCornerSize: A,
          thumbSize: w,
          setThumbSize: O,
          touchModality: V,
          cornerRef: E,
          scrollingX: _,
          setScrollingX: L,
          scrollingY: F,
          setScrollingY: k,
          hovering: H,
          setHovering: N,
          viewportRef: T,
          rootRef: y,
          scrollbarYRef: R,
          scrollbarXRef: v,
          thumbYRef: P,
          thumbXRef: D,
          rootId: G,
          hiddenState: h,
          setHiddenState: I,
          overflowEdges: S,
          setOverflowEdges: x,
          viewportState: r,
          overflowEdgeThreshold: K,
        }),
        [Y0, J0, U0, X0, j, w, V, _, L, F, k, H, N, G, h, S, r, K],
      )
    return rL(KZ.Provider, { value: s, children: [!B && T2.getElement(U), e] })
  })
uq.displayName = 'ScrollAreaRoot'
function oL(Q) {
  if (typeof Q === 'number') {
    let Z = Math.max(0, Q)
    return { xStart: Z, xEnd: Z, yStart: Z, yEnd: Z }
  }
  return {
    xStart: Math.max(0, Q?.xStart || 0),
    xEnd: Math.max(0, Q?.xEnd || 0),
    yStart: Math.max(0, Q?.yStart || 0),
    yEnd: Math.max(0, Q?.yEnd || 0),
  }
}
import * as Q8 from 'react'
import * as GZ from 'react'
var YZ = GZ.createContext(void 0)
YZ.displayName = 'ScrollAreaViewportContext'
function PY() {
  let Q = GZ.useContext(YZ)
  if (Q === void 0)
    throw Error(
      'Base UI: ScrollAreaViewportContext missing. ScrollAreaViewport parts must be placed within <ScrollArea.Viewport>.',
    )
  return Q
}
function EY(Q, Z) {
  if (typeof IntersectionObserver > 'u') return () => {}
  let J = new IntersectionObserver((z) => {
    z.forEach((q) => {
      if (q.intersectionRatio > 0) (Z(), J.disconnect())
    })
  })
  return (
    J.observe(Q),
    () => {
      J.disconnect()
    }
  )
}
var e2 = (function (Q) {
  return (
    (Q.scrollAreaOverflowXStart = '--scroll-area-overflow-x-start'),
    (Q.scrollAreaOverflowXEnd = '--scroll-area-overflow-x-end'),
    (Q.scrollAreaOverflowYStart = '--scroll-area-overflow-y-start'),
    (Q.scrollAreaOverflowYEnd = '--scroll-area-overflow-y-end'),
    Q
  )
})({})
var SY = 1
function cq(Q, Z) {
  if (Z <= 0) return 0
  let J = J1(Q, 0, Z),
    z = J,
    q = Z - J,
    $ = z <= SY,
    X = q <= SY
  if ($ && X) return z <= q ? 0 : Z
  if ($) return 0
  if (X) return Z
  return J
}
import { jsx as tL } from 'react/jsx-runtime'
var IY = !1
function eL() {
  if (IY || N8) return
  if (typeof CSS < 'u' && 'registerProperty' in CSS)
    [
      e2.scrollAreaOverflowXStart,
      e2.scrollAreaOverflowXEnd,
      e2.scrollAreaOverflowYStart,
      e2.scrollAreaOverflowYEnd,
    ].forEach((Q) => {
      try {
        CSS.registerProperty({
          name: Q,
          syntax: '<length>',
          inherits: !1,
          initialValue: '0px',
        })
      } catch {}
    })
  IY = !0
}
var dq = Q8.forwardRef(function (Z, J) {
  let { render: z, className: q, ...$ } = Z,
    {
      viewportRef: X,
      scrollbarYRef: K,
      scrollbarXRef: G,
      thumbYRef: Y,
      thumbXRef: W,
      cornerRef: U,
      cornerSize: B,
      setCornerSize: H,
      setThumbSize: N,
      rootId: _,
      setHiddenState: L,
      hiddenState: F,
      handleScroll: k,
      setHovering: V,
      setOverflowEdges: M,
      overflowEdges: j,
      overflowEdgeThreshold: A,
      scrollingX: w,
      scrollingY: O,
    } = E2(),
    S = y1(),
    x = Q8.useRef(!0),
    h = c0(),
    I = c0(),
    y = m(() => {
      let E = X.current,
        C = K.current,
        a = G.current,
        p = Y.current,
        Q0 = W.current,
        g = U.current
      if (!E) return
      let {
        scrollHeight: Z0,
        scrollWidth: i,
        clientHeight: X0,
        clientWidth: Y0,
        scrollTop: J0,
        scrollLeft: U0,
      } = E
      if (Z0 === 0 || i === 0) return
      let K0 = X0 >= Z0,
        b = Y0 >= i,
        r = Y0 / i,
        t = X0 / Z0,
        e = Math.max(0, i - Y0),
        s = Math.max(0, Z0 - X0),
        d = 0,
        o = 0
      if (!b) {
        let x0 = 0
        if (S === 'rtl') x0 = J1(-U0, 0, e)
        else x0 = J1(U0, 0, e)
        ;((d = cq(x0, e)), (o = e - d))
      }
      let l = !K0 ? J1(J0, 0, s) : 0,
        q0 = !K0 ? cq(l, s) : 0,
        n = !K0 ? s - q0 : 0,
        _0 = b ? 0 : Y0,
        H0 = K0 ? 0 : X0,
        W0 = 0,
        O0 = 0
      if (!b && !K0) ((W0 = C?.offsetWidth || 0), (O0 = a?.offsetHeight || 0))
      let f0 = B.width === 0 && B.height === 0,
        A0 = f0 ? W0 : 0,
        T0 = f0 ? O0 : 0,
        y0 = e1(a, 'padding', 'x'),
        P0 = e1(C, 'padding', 'y'),
        b0 = e1(Q0, 'margin', 'x'),
        t0 = e1(p, 'margin', 'y'),
        L1 = _0 - y0 - b0,
        D0 = H0 - P0 - t0,
        B0 = a ? Math.min(a.offsetWidth - A0, L1) : L1,
        E0 = C ? Math.min(C.offsetHeight - T0, D0) : D0,
        w0 = Math.max(pq, B0 * r),
        g0 = Math.max(pq, E0 * t)
      if (
        (N((x0) => {
          if (x0.height === g0 && x0.width === w0) return x0
          return { width: w0, height: g0 }
        }),
        C && p)
      ) {
        let x0 = C.offsetHeight - g0 - P0 - t0,
          I0 = Z0 - X0,
          p0 = I0 === 0 ? 0 : J0 / I0,
          n0 = Math.min(x0, Math.max(0, p0 * x0))
        p.style.transform = `translate3d(0,${n0}px,0)`
      }
      if (a && Q0) {
        let x0 = a.offsetWidth - w0 - y0 - b0,
          I0 = i - Y0,
          p0 = I0 === 0 ? 0 : U0 / I0,
          n0 = S === 'rtl' ? J1(p0 * x0, -x0, 0) : J1(p0 * x0, 0, x0)
        Q0.style.transform = `translate3d(${n0}px,0,0)`
      }
      let e0 = [
        [e2.scrollAreaOverflowXStart, d],
        [e2.scrollAreaOverflowXEnd, o],
        [e2.scrollAreaOverflowYStart, q0],
        [e2.scrollAreaOverflowYEnd, n],
      ]
      for (let [x0, I0] of e0) E.style.setProperty(x0, `${I0}px`)
      if (g) {
        if (b || K0) H({ width: 0, height: 0 })
        else if (!b && !K0) H({ width: W0, height: O0 })
      }
      L((x0) => {
        let I0 = K0 || b
        if (x0.y === K0 && x0.x === b && x0.corner === I0) return x0
        return { y: K0, x: b, corner: I0 }
      })
      let d0 = {
        xStart: !b && d > A.xStart,
        xEnd: !b && o > A.xEnd,
        yStart: !K0 && q0 > A.yStart,
        yEnd: !K0 && n > A.yEnd,
      }
      M((x0) => {
        if (
          x0.xStart === d0.xStart &&
          x0.xEnd === d0.xEnd &&
          x0.yStart === d0.yStart &&
          x0.yEnd === d0.yEnd
        )
          return x0
        return d0
      })
    })
  ;(u(() => {
    if (!X.current) return
    eL()
    let E = !1
    return EY(X.current, () => {
      if (!E) {
        E = !0
        return
      }
      y()
    })
  }, [y, X]),
    u(() => {
      queueMicrotask(y)
    }, [y, F, S]),
    u(() => {
      if (X.current?.matches(':hover')) V(!0)
    }, [X, V]),
    Q8.useEffect(() => {
      let E = X.current
      if (typeof ResizeObserver > 'u' || !E) return
      let C = !1,
        a = new ResizeObserver(() => {
          if (!C) {
            C = !0
            return
          }
          y()
        })
      return (
        a.observe(E),
        I.start(0, () => {
          let p = E.getAnimations({ subtree: !0 })
          if (p.length === 0) return
          Promise.allSettled(p.map((Q0) => Q0.finished))
            .then(y)
            .catch(() => {})
        }),
        () => {
          ;(a.disconnect(), I.clear())
        }
      )
    }, [y, X, I]))
  function T() {
    x.current = !1
  }
  let R = {
      role: 'presentation',
      ...(_ && { 'data-id': `${_}-viewport` }),
      ...((!F.x || !F.y) && { tabIndex: 0 }),
      className: T2.className,
      style: { overflow: 'scroll' },
      onScroll() {
        if (!X.current) return
        if ((y(), !x.current))
          k({ x: X.current.scrollLeft, y: X.current.scrollTop })
        h.start(100, () => {
          x.current = !0
        })
      },
      onWheel: T,
      onTouchMove: T,
      onPointerMove: T,
      onPointerEnter: T,
      onKeyDown: T,
    },
    v = Q8.useMemo(
      () => ({
        scrolling: w || O,
        hasOverflowX: !F.x,
        hasOverflowY: !F.y,
        overflowXStart: j.xStart,
        overflowXEnd: j.xEnd,
        overflowYStart: j.yStart,
        overflowYEnd: j.yEnd,
        cornerHidden: F.corner,
      }),
      [w, O, F.x, F.y, F.corner, j],
    ),
    P = f('div', Z, {
      ref: [J, X],
      state: v,
      props: [R, $],
      stateAttributesMapping: m8,
    }),
    D = Q8.useMemo(() => ({ computeThumbPosition: y }), [y])
  return tL(YZ.Provider, { value: D, children: P })
})
dq.displayName = 'ScrollAreaViewport'
import * as H9 from 'react'
import * as WZ from 'react'
var UZ = WZ.createContext(void 0)
UZ.displayName = 'ScrollAreaScrollbarContext'
function CY() {
  let Q = WZ.useContext(UZ)
  if (Q === void 0)
    throw Error(
      'Base UI: ScrollAreaScrollbarContext is missing. ScrollAreaScrollbar parts must be placed within <ScrollArea.Scrollbar>.',
    )
  return Q
}
var _9 = (function (Q) {
  return (
    (Q.scrollAreaThumbHeight = '--scroll-area-thumb-height'),
    (Q.scrollAreaThumbWidth = '--scroll-area-thumb-width'),
    Q
  )
})({})
import { jsx as QF } from 'react/jsx-runtime'
var iq = H9.forwardRef(function (Z, J) {
  let {
      render: z,
      className: q,
      orientation: $ = 'vertical',
      keepMounted: X = !1,
      ...K
    } = Z,
    {
      hovering: G,
      scrollingX: Y,
      scrollingY: W,
      hiddenState: U,
      overflowEdges: B,
      scrollbarYRef: H,
      scrollbarXRef: N,
      viewportRef: _,
      thumbYRef: L,
      thumbXRef: F,
      handlePointerDown: k,
      handlePointerUp: V,
      rootId: M,
      thumbSize: j,
    } = E2(),
    A = {
      hovering: G,
      scrolling: { horizontal: Y, vertical: W }[$],
      orientation: $,
      hasOverflowX: !U.x,
      hasOverflowY: !U.y,
      overflowXStart: B.xStart,
      overflowXEnd: B.xEnd,
      overflowYStart: B.yStart,
      overflowYEnd: B.yEnd,
      cornerHidden: U.corner,
    },
    w = y1()
  H9.useEffect(() => {
    let y = _.current,
      T = $ === 'vertical' ? H.current : N.current
    if (!T) return
    function R(v) {
      if (!y || !T || v.ctrlKey) return
      if ((v.preventDefault(), $ === 'vertical')) {
        if (y.scrollTop === 0 && v.deltaY < 0) return
      } else if (y.scrollLeft === 0 && v.deltaX < 0) return
      if ($ === 'vertical') {
        if (y.scrollTop === y.scrollHeight - y.clientHeight && v.deltaY > 0)
          return
      } else if (y.scrollLeft === y.scrollWidth - y.clientWidth && v.deltaX > 0)
        return
      if ($ === 'vertical') y.scrollTop += v.deltaY
      else y.scrollLeft += v.deltaX
    }
    return (
      T.addEventListener('wheel', R, { passive: !1 }),
      () => {
        T.removeEventListener('wheel', R)
      }
    )
  }, [$, N, H, _])
  let O = {
      ...(M && { 'data-id': `${M}-scrollbar` }),
      onPointerDown(y) {
        if (y.button !== 0) return
        if (y.currentTarget !== y.target) return
        if (!_.current) return
        if (L.current && H.current && $ === 'vertical') {
          let T = e1(L.current, 'margin', 'y'),
            R = e1(H.current, 'padding', 'y'),
            v = L.current.offsetHeight,
            P = H.current.getBoundingClientRect(),
            D = y.clientY - P.top - v / 2 - R + T / 2,
            E = _.current.scrollHeight,
            C = _.current.clientHeight,
            a = H.current.offsetHeight - v - R - T,
            Q0 = (D / a) * (E - C)
          _.current.scrollTop = Q0
        }
        if (F.current && N.current && $ === 'horizontal') {
          let T = e1(F.current, 'margin', 'x'),
            R = e1(N.current, 'padding', 'x'),
            v = F.current.offsetWidth,
            P = N.current.getBoundingClientRect(),
            D = y.clientX - P.left - v / 2 - R + T / 2,
            E = _.current.scrollWidth,
            C = _.current.clientWidth,
            a = N.current.offsetWidth - v - R - T,
            p = D / a,
            Q0
          if (w === 'rtl') {
            if (((Q0 = (1 - p) * (E - C)), _.current.scrollLeft <= 0)) Q0 = -Q0
          } else Q0 = p * (E - C)
          _.current.scrollLeft = Q0
        }
        k(y)
      },
      onPointerUp: V,
      style: {
        position: 'absolute',
        touchAction: 'none',
        WebkitUserSelect: 'none',
        userSelect: 'none',
        ...($ === 'vertical' && {
          top: 0,
          bottom: `var(${B9.scrollAreaCornerHeight})`,
          insetInlineEnd: 0,
          [_9.scrollAreaThumbHeight]: `${j.height}px`,
        }),
        ...($ === 'horizontal' && {
          insetInlineStart: 0,
          insetInlineEnd: `var(${B9.scrollAreaCornerWidth})`,
          bottom: 0,
          [_9.scrollAreaThumbWidth]: `${j.width}px`,
        }),
      },
    },
    S = f('div', Z, {
      ref: [J, $ === 'vertical' ? H : N],
      state: A,
      props: [O, K],
      stateAttributesMapping: m8,
    }),
    x = H9.useMemo(() => ({ orientation: $ }), [$]),
    h = $ === 'vertical' ? U.y : U.x
  if (!(X || !h)) return null
  return QF(UZ.Provider, { value: x, children: S })
})
iq.displayName = 'ScrollAreaScrollbar'
import * as BZ from 'react'
var lq = BZ.forwardRef(function (Z, J) {
  let { render: z, className: q, ...$ } = Z,
    X = BZ.useRef(null),
    { computeThumbPosition: K } = PY(),
    { viewportState: G } = E2()
  return (
    u(() => {
      if (typeof ResizeObserver > 'u') return
      let W = !1,
        U = new ResizeObserver(() => {
          if (!W) {
            W = !0
            return
          }
          K()
        })
      if (X.current) U.observe(X.current)
      return () => {
        U.disconnect()
      }
    }, [K]),
    f('div', Z, {
      ref: [J, X],
      state: G,
      stateAttributesMapping: m8,
      props: [{ role: 'presentation', style: { minWidth: 'fit-content' } }, $],
    })
  )
})
lq.displayName = 'ScrollAreaContent'
import * as xY from 'react'
var rq = xY.forwardRef(function (Z, J) {
  let { render: z, className: q, ...$ } = Z,
    {
      thumbYRef: X,
      thumbXRef: K,
      handlePointerDown: G,
      handlePointerMove: Y,
      handlePointerUp: W,
      setScrollingX: U,
      setScrollingY: B,
    } = E2(),
    { orientation: H } = CY()
  return f('div', Z, {
    ref: [J, H === 'vertical' ? X : K],
    state: { orientation: H },
    props: [
      {
        onPointerDown: G,
        onPointerMove: Y,
        onPointerUp(L) {
          if (H === 'vertical') B(!1)
          if (H === 'horizontal') U(!1)
          W(L)
        },
        style: {
          ...(H === 'vertical' && {
            height: `var(${_9.scrollAreaThumbHeight})`,
          }),
          ...(H === 'horizontal' && {
            width: `var(${_9.scrollAreaThumbWidth})`,
          }),
        },
      },
      $,
    ],
  })
})
rq.displayName = 'ScrollAreaThumb'
import * as hY from 'react'
var aq = hY.forwardRef(function (Z, J) {
  let { render: z, className: q, ...$ } = Z,
    { cornerRef: X, cornerSize: K, hiddenState: G } = E2(),
    Y = f('div', Z, {
      ref: [J, X],
      props: [
        {
          style: {
            position: 'absolute',
            bottom: 0,
            insetInlineEnd: 0,
            width: K.width,
            height: K.height,
          },
        },
        $,
      ],
    })
  if (G.corner) return null
  return Y
})
aq.displayName = 'ScrollAreaCorner'
import { jsxDEV as N9 } from 'react/jsx-dev-runtime'
function bu({ className: Q, children: Z, ...J }) {
  return N9(
    p8.Root,
    {
      'data-slot': 'scroll-area',
      className: z0('relative', Q),
      ...J,
      children: [
        N9(
          p8.Viewport,
          {
            'data-slot': 'scroll-area-viewport',
            className:
              'focus-visible:ring-ring/50 size-full rounded-[inherit] transition-[color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:outline-1',
            children: Z,
          },
          void 0,
          !1,
          void 0,
          this,
        ),
        N9(ZF, {}, void 0, !1, void 0, this),
        N9(p8.Corner, {}, void 0, !1, void 0, this),
      ],
    },
    void 0,
    !0,
    void 0,
    this,
  )
}
function ZF({ className: Q, orientation: Z = 'vertical', ...J }) {
  return N9(
    p8.Scrollbar,
    {
      'data-slot': 'scroll-area-scrollbar',
      'data-orientation': Z,
      orientation: Z,
      className: z0(
        'data-horizontal:h-2.5 data-horizontal:flex-col data-horizontal:border-t data-horizontal:border-t-transparent data-vertical:h-full data-vertical:w-2.5 data-vertical:border-l data-vertical:border-l-transparent flex touch-none p-px transition-colors select-none',
        Q,
      ),
      ...J,
      children: N9(
        p8.Thumb,
        {
          'data-slot': 'scroll-area-thumb',
          className: 'rounded-full bg-border relative flex-1',
        },
        void 0,
        !1,
        void 0,
        this,
      ),
    },
    void 0,
    !1,
    void 0,
    this,
  )
}
var S6 = {}
c1(S6, {
  Tab: () => nq,
  Root: () => sq,
  Panel: () => tq,
  List: () => eq,
  Indicator: () => oq,
})
import * as i1 from 'react'
import * as _Z from 'react'
var HZ = _Z.createContext(void 0)
HZ.displayName = 'TabsRootContext'
function Z8() {
  let Q = _Z.useContext(HZ)
  if (Q === void 0)
    throw Error(
      'Base UI: TabsRootContext is missing. Tabs parts must be placed within <Tabs.Root>.',
    )
  return Q
}
var bY = (function (Q) {
  return (
    (Q.activationDirection = 'data-activation-direction'),
    (Q.orientation = 'data-orientation'),
    Q
  )
})({})
var u8 = { tabActivationDirection: (Q) => ({ [bY.activationDirection]: Q }) }
import { jsx as RY } from 'react/jsx-runtime'
var sq = i1.forwardRef(function (Z, J) {
  let {
      className: z,
      defaultValue: q = 0,
      onValueChange: $,
      orientation: X = 'horizontal',
      render: K,
      value: G,
      ...Y
    } = Z,
    W = y1(),
    U = Object.hasOwn(Z, 'defaultValue'),
    B = i1.useRef([]),
    [H, N] = i1.useState(() => new Map()),
    [_, L] = _1({ controlled: G, default: q, name: 'Tabs', state: 'value' }),
    F = G !== void 0,
    [k, V] = i1.useState(() => new Map()),
    [M, j] = i1.useState('none'),
    A = m((P, D) => {
      if (($?.(P, D), D.isCanceled)) return
      ;(L(P), j(D.activationDirection))
    }),
    w = m((P, D) => {
      N((E) => {
        if (E.get(P) === D) return E
        let C = new Map(E)
        return (C.set(P, D), C)
      })
    }),
    O = m((P, D) => {
      N((E) => {
        if (!E.has(P) || E.get(P) !== D) return E
        let C = new Map(E)
        return (C.delete(P), C)
      })
    }),
    S = i1.useCallback(
      (P) => {
        return H.get(P)
      },
      [H],
    ),
    x = i1.useCallback(
      (P) => {
        for (let D of k.values()) if (P === D?.value) return D?.id
        return
      },
      [k],
    ),
    h = i1.useCallback(
      (P) => {
        if (P === void 0) return null
        for (let [D, E] of k.entries())
          if (E != null && P === (E.value ?? E.index)) return D
        return null
      },
      [k],
    ),
    I = i1.useMemo(
      () => ({
        direction: W,
        getTabElementBySelectedValue: h,
        getTabIdByPanelValue: x,
        getTabPanelIdByValue: S,
        onValueChange: A,
        orientation: X,
        registerMountedTabPanel: w,
        setTabMap: V,
        unregisterMountedTabPanel: O,
        tabActivationDirection: M,
        value: _,
      }),
      [W, h, x, S, A, X, w, V, O, M, _],
    ),
    y = i1.useMemo(() => {
      for (let P of k.values()) if (P != null && P.value === _) return P
      return
    }, [k, _]),
    T = i1.useMemo(() => {
      for (let P of k.values()) if (P != null && !P.disabled) return P.value
      return
    }, [k])
  u(() => {
    if (F || k.size === 0) return
    let P = y?.disabled,
      D = y == null && _ !== null
    if (U && P && _ === q) return
    if (!P && !D) return
    let C = T ?? null
    if (_ === C) return
    ;(L(C), j('none'))
  }, [q, T, U, F, y, j, L, k, _])
  let v = f('div', Z, {
    state: { orientation: X, tabActivationDirection: M },
    ref: J,
    props: Y,
    stateAttributesMapping: u8,
  })
  return RY(HZ.Provider, {
    value: I,
    children: RY(F2, { elementsRef: B, children: v }),
  })
})
sq.displayName = 'TabsRoot'
import * as c8 from 'react'
import * as NZ from 'react'
var LZ = NZ.createContext(void 0)
LZ.displayName = 'TabsListContext'
function FZ() {
  let Q = NZ.useContext(LZ)
  if (Q === void 0)
    throw Error(
      'Base UI: TabsListContext is missing. TabsList parts must be placed within <Tabs.List>.',
    )
  return Q
}
var nq = c8.forwardRef(function (Z, J) {
  let {
      className: z,
      disabled: q = !1,
      render: $,
      value: X,
      id: K,
      nativeButton: G = !0,
      ...Y
    } = Z,
    { value: W, getTabPanelIdByValue: U, orientation: B } = Z8(),
    {
      activateOnFocus: H,
      highlightedTabIndex: N,
      onTabActivation: _,
      setHighlightedTabIndex: L,
      tabsListElement: F,
    } = FZ(),
    k = L0(K),
    V = c8.useMemo(() => ({ disabled: q, id: k, value: X }), [q, k, X]),
    { compositeProps: M, compositeRef: j, index: A } = Z4({ metadata: V }),
    w = X === W,
    O = c8.useRef(!1)
  u(() => {
    if (O.current) {
      O.current = !1
      return
    }
    if (!(w && A > -1 && N !== A)) return
    let E = F
    if (E != null) {
      let C = B1(V0(E))
      if (C && F0(E, C)) return
    }
    if (!q) L(A)
  }, [w, A, N, L, q, F])
  let { getButtonProps: S, buttonRef: x } = Q1({
      disabled: q,
      native: G,
      focusableWhenDisabled: !0,
    }),
    h = U(X),
    I = c8.useRef(!1),
    y = c8.useRef(!1)
  function T(E) {
    if (w || q) return
    _(X, $0(c.none, E.nativeEvent, void 0, { activationDirection: 'none' }))
  }
  function R(E) {
    if (w) return
    if (A > -1 && !q) L(A)
    if (q) return
    if (H && (!I.current || (I.current && y.current)))
      _(X, $0(c.none, E.nativeEvent, void 0, { activationDirection: 'none' }))
  }
  function v(E) {
    if (w || q) return
    I.current = !0
    function C() {
      ;((I.current = !1), (y.current = !1))
    }
    if (!E.button || E.button === 0)
      ((y.current = !0),
        V0(E.currentTarget).addEventListener('pointerup', C, { once: !0 }))
  }
  return f('button', Z, {
    state: { disabled: q, active: w, orientation: B },
    ref: [J, x, j],
    props: [
      M,
      {
        role: 'tab',
        'aria-controls': h,
        'aria-selected': w,
        id: k,
        onClick: T,
        onFocus: R,
        onPointerDown: v,
        [a6]: w ? '' : void 0,
        onKeyDownCapture() {
          O.current = !0
        },
      },
      Y,
      S,
    ],
  })
})
nq.displayName = 'TabsTab'
import * as g5 from 'react'
function L9(Q) {
  let Z = R1(Q),
    J = parseFloat(Z.width) || 0,
    z = parseFloat(Z.height) || 0,
    q = m0(Q),
    $ = q ? Q.offsetWidth : J,
    X = q ? Q.offsetHeight : z
  if (F8(J) !== $ || F8(z) !== X) ((J = $), (z = X))
  return { width: J, height: z }
}
var vY =
  '!function(){const t=document.currentScript.previousElementSibling;if(!t)return;const e=t.closest(\'[role="tablist"]\');if(!e)return;const i=e.querySelector("[data-active]");if(!i)return;if(0===i.offsetWidth||0===e.offsetWidth)return;let o=0,n=0,h=0,l=0,r=0,f=0;function s(t){const e=getComputedStyle(t);let i=parseFloat(e.width)||0,o=parseFloat(e.height)||0;return(Math.round(i)!==t.offsetWidth||Math.round(o)!==t.offsetHeight)&&(i=t.offsetWidth,o=t.offsetHeight),{width:i,height:o}}if(null!=i&&null!=e){const{width:t,height:c}=s(i),{width:u,height:d}=s(e),a=i.getBoundingClientRect(),g=e.getBoundingClientRect(),p=u>0?g.width/u:1,b=d>0?g.height/d:1;if(Math.abs(p)>Number.EPSILON&&Math.abs(b)>Number.EPSILON){const t=a.left-g.left,i=a.top-g.top;o=t/p+e.scrollLeft-e.clientLeft,h=i/b+e.scrollTop-e.clientTop}else o=i.offsetLeft,h=i.offsetTop;r=t,f=c,n=e.scrollWidth-o-r,l=e.scrollHeight-h-f}function c(e,i){t.style.setProperty(`--active-tab-${e}`,`${i}px`)}c("left",o),c("right",n),c("top",h),c("bottom",l),c("width",r),c("height",f),r>0&&f>0&&t.removeAttribute("hidden")}();'
var E6 = (function (Q) {
  return (
    (Q.activeTabLeft = '--active-tab-left'),
    (Q.activeTabRight = '--active-tab-right'),
    (Q.activeTabTop = '--active-tab-top'),
    (Q.activeTabBottom = '--active-tab-bottom'),
    (Q.activeTabWidth = '--active-tab-width'),
    (Q.activeTabHeight = '--active-tab-height'),
    Q
  )
})({})
import { jsx as JF, jsxs as zF } from 'react/jsx-runtime'
var qF = { ...u8, activeTabPosition: () => null, activeTabSize: () => null },
  oq = g5.forwardRef(function (Z, J) {
    let { className: z, render: q, renderBeforeHydration: $ = !1, ...X } = Z,
      { nonce: K } = v8(),
      {
        getTabElementBySelectedValue: G,
        orientation: Y,
        tabActivationDirection: W,
        value: U,
      } = Z8(),
      { tabsListElement: B } = FZ(),
      [H, N] = g5.useState(!1),
      { value: _ } = Z8()
    $5(() => N(!0))
    let L = TK()
    g5.useEffect(() => {
      if (U != null && B != null && typeof ResizeObserver < 'u') {
        let T = new ResizeObserver(L)
        return (
          T.observe(B),
          () => {
            T.disconnect()
          }
        )
      }
      return
    }, [U, B, L])
    let F = 0,
      k = 0,
      V = 0,
      M = 0,
      j = 0,
      A = 0,
      w = !1
    if (U != null && B != null) {
      let T = G(U)
      if (((w = !0), T != null)) {
        let { width: R, height: v } = L9(T),
          { width: P, height: D } = L9(B),
          E = T.getBoundingClientRect(),
          C = B.getBoundingClientRect(),
          a = P > 0 ? C.width / P : 1,
          p = D > 0 ? C.height / D : 1
        if (Math.abs(a) > Number.EPSILON && Math.abs(p) > Number.EPSILON) {
          let g = E.left - C.left,
            Z0 = E.top - C.top
          ;((F = g / a + B.scrollLeft - B.clientLeft),
            (V = Z0 / p + B.scrollTop - B.clientTop))
        } else ((F = T.offsetLeft), (V = T.offsetTop))
        ;((j = R),
          (A = v),
          (k = B.scrollWidth - F - j),
          (M = B.scrollHeight - V - A))
      }
    }
    let O = g5.useMemo(
        () => (w ? { left: F, right: k, top: V, bottom: M } : null),
        [F, k, V, M, w],
      ),
      S = g5.useMemo(() => (w ? { width: j, height: A } : null), [j, A, w]),
      x = g5.useMemo(() => {
        if (!w) return
        return {
          [E6.activeTabLeft]: `${F}px`,
          [E6.activeTabRight]: `${k}px`,
          [E6.activeTabTop]: `${V}px`,
          [E6.activeTabBottom]: `${M}px`,
          [E6.activeTabWidth]: `${j}px`,
          [E6.activeTabHeight]: `${A}px`,
        }
      }, [F, k, V, M, j, A, w]),
      h = w && j > 0 && A > 0,
      y = f('span', Z, {
        state: {
          orientation: Y,
          activeTabPosition: O,
          activeTabSize: S,
          tabActivationDirection: W,
        },
        ref: J,
        props: [
          { role: 'presentation', style: x, hidden: !h },
          X,
          { suppressHydrationWarning: !0 },
        ],
        stateAttributesMapping: qF,
      })
    if (_ == null) return null
    return zF(g5.Fragment, {
      children: [
        y,
        !H &&
          $ &&
          JF('script', {
            nonce: K,
            dangerouslySetInnerHTML: { __html: vY },
            suppressHydrationWarning: !0,
          }),
      ],
    })
  })
oq.displayName = 'TabsIndicator'
import * as F9 from 'react'
var fY = (function (Q) {
  return (
    (Q.index = 'data-index'),
    (Q.activationDirection = 'data-activation-direction'),
    (Q.orientation = 'data-orientation'),
    (Q.hidden = 'data-hidden'),
    Q
  )
})({})
var $F = { ...u8, ...i0 },
  tq = F9.forwardRef(function (Z, J) {
    let { className: z, value: q, render: $, keepMounted: X = !1, ...K } = Z,
      {
        value: G,
        getTabIdByPanelValue: Y,
        orientation: W,
        tabActivationDirection: U,
        registerMountedTabPanel: B,
        unregisterMountedTabPanel: H,
      } = Z8(),
      N = L0(),
      _ = F9.useMemo(() => ({ id: N, value: q }), [N, q]),
      { ref: L, index: F } = g1({ metadata: _ }),
      k = q === G,
      { mounted: V, transitionStatus: M, setMounted: j } = F1(k),
      A = !V,
      w = Y(q),
      O = {
        hidden: A,
        orientation: W,
        tabActivationDirection: U,
        transitionStatus: M,
      },
      S = F9.useRef(null),
      x = f('div', Z, {
        state: O,
        ref: [J, L, S],
        props: [
          {
            'aria-labelledby': w,
            hidden: A,
            id: N,
            role: 'tabpanel',
            tabIndex: k ? 0 : -1,
            inert: R5(!k),
            [fY.index]: F,
          },
          K,
        ],
        stateAttributesMapping: $F,
      })
    if (
      (a0({
        open: k,
        ref: S,
        onComplete() {
          if (!k) j(!1)
        },
      }),
      u(() => {
        if (A && !X) return
        if (N == null) return
        return (
          B(q, N),
          () => {
            H(q, N)
          }
        )
      }, [A, X, q, N, B, H]),
      !(X || V))
    )
      return null
    return x
  })
tq.displayName = 'TabsPanel'
import * as S2 from 'react'
import { jsx as gY } from 'react/jsx-runtime'
var eq = S2.forwardRef(function (Z, J) {
  let {
      activateOnFocus: z = !1,
      className: q,
      loopFocus: $ = !0,
      render: X,
      ...K
    } = Z,
    {
      getTabElementBySelectedValue: G,
      onValueChange: Y,
      orientation: W,
      value: U,
      setTabMap: B,
      tabActivationDirection: H,
    } = Z8(),
    [N, _] = S2.useState(0),
    [L, F] = S2.useState(null),
    k = XF(U, W, L, G),
    V = m((w, O) => {
      if (w !== U) {
        let S = k(w)
        ;((O.activationDirection = S), Y(w, O))
      }
    }),
    M = { orientation: W, tabActivationDirection: H },
    j = {
      'aria-orientation': W === 'vertical' ? 'vertical' : void 0,
      role: 'tablist',
    },
    A = S2.useMemo(
      () => ({
        activateOnFocus: z,
        highlightedTabIndex: N,
        onTabActivation: V,
        setHighlightedTabIndex: _,
        tabsListElement: L,
        value: U,
      }),
      [z, N, V, _, L, U],
    )
  return gY(LZ.Provider, {
    value: A,
    children: gY(o6, {
      render: X,
      className: q,
      state: M,
      refs: [J, F],
      props: [j, K],
      stateAttributesMapping: u8,
      highlightedIndex: N,
      enableHomeAndEndKeys: !0,
      loopFocus: $,
      orientation: W,
      onHighlightedIndexChange: _,
      onMapChange: B,
      disabledIndices: z5,
    }),
  })
})
eq.displayName = 'TabsList'
function mY(Q, Z) {
  let { left: J, top: z } = Q.getBoundingClientRect(),
    { left: q, top: $ } = Z.getBoundingClientRect(),
    X = J - q,
    K = z - $
  return { left: X, top: K }
}
function XF(Q, Z, J, z) {
  let [q, $] = S2.useState(null)
  return (
    u(() => {
      if (Q == null || J == null) {
        $(null)
        return
      }
      let X = z(Q)
      if (X == null) {
        $(null)
        return
      }
      let { left: K, top: G } = mY(X, J)
      $(Z === 'horizontal' ? K : G)
    }, [Z, z, J, Q]),
    S2.useCallback(
      (X) => {
        if (X === Q) return 'none'
        if (X == null) return ($(null), 'none')
        if (X != null && J != null) {
          let K = z(X)
          if (K != null) {
            let { left: G, top: Y } = mY(K, J)
            if (q == null) return ($(Z === 'horizontal' ? G : Y), 'none')
            if (Z === 'horizontal') {
              if (G < q) return ($(G), 'left')
              if (G > q) return ($(G), 'right')
            } else if (Y < q) return ($(Y), 'up')
            else if (Y > q) return ($(Y), 'down')
          }
        }
        return 'none'
      },
      [z, Z, q, J, Q],
    )
  )
}
import { jsxDEV as kZ } from 'react/jsx-dev-runtime'
function Xd({ className: Q, orientation: Z = 'horizontal', ...J }) {
  return kZ(
    S6.Root,
    {
      'data-slot': 'tabs',
      'data-orientation': Z,
      className: z0('gap-2 group/tabs flex data-horizontal:flex-col', Q),
      ...J,
    },
    void 0,
    !1,
    void 0,
    this,
  )
}
var KF = T5(
  'rounded-lg p-[3px] group-data-horizontal/tabs:h-8 data-[variant=line]:rounded-none group/tabs-list text-muted-foreground inline-flex w-fit items-center justify-center group-data-vertical/tabs:h-fit group-data-vertical/tabs:flex-col',
  {
    variants: {
      variant: { default: 'bg-muted', line: 'gap-1 bg-transparent' },
    },
    defaultVariants: { variant: 'default' },
  },
)
function Kd({ className: Q, variant: Z = 'default', ...J }) {
  return kZ(
    S6.List,
    {
      'data-slot': 'tabs-list',
      'data-variant': Z,
      className: z0(KF({ variant: Z }), Q),
      ...J,
    },
    void 0,
    !1,
    void 0,
    this,
  )
}
function Gd({ className: Q, ...Z }) {
  return kZ(
    S6.Tab,
    {
      'data-slot': 'tabs-trigger',
      className: z0(
        "gap-1.5 rounded-md border border-transparent px-1.5 py-0.5 text-sm font-medium group-data-[variant=default]/tabs-list:data-active:shadow-sm group-data-[variant=line]/tabs-list:data-active:shadow-none [&_svg:not([class*='size-'])]:size-4 focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:outline-ring text-foreground/60 hover:text-foreground dark:text-muted-foreground dark:hover:text-foreground relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center whitespace-nowrap transition-all group-data-vertical/tabs:w-full group-data-vertical/tabs:justify-start focus-visible:ring-[3px] focus-visible:outline-1 disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
        'group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-active:bg-transparent dark:group-data-[variant=line]/tabs-list:data-active:border-transparent dark:group-data-[variant=line]/tabs-list:data-active:bg-transparent',
        'data-active:bg-background dark:data-active:text-foreground dark:data-active:border-input dark:data-active:bg-input/30 data-active:text-foreground',
        'after:bg-foreground after:absolute after:opacity-0 after:transition-opacity group-data-horizontal/tabs:after:inset-x-0 group-data-horizontal/tabs:after:bottom-[-5px] group-data-horizontal/tabs:after:h-0.5 group-data-vertical/tabs:after:inset-y-0 group-data-vertical/tabs:after:-right-1 group-data-vertical/tabs:after:w-0.5 group-data-[variant=line]/tabs-list:data-active:after:opacity-100',
        Q,
      ),
      ...Z,
    },
    void 0,
    !1,
    void 0,
    this,
  )
}
function Yd({ className: Q, ...Z }) {
  return kZ(
    S6.Panel,
    {
      'data-slot': 'tabs-content',
      className: z0('text-sm flex-1 outline-none', Q),
      ...Z,
    },
    void 0,
    !1,
    void 0,
    this,
  )
}
import { jsxDEV as J8 } from 'react/jsx-dev-runtime'
function _d({ className: Q, ...Z }) {
  return J8(
    'div',
    {
      'data-slot': 'table-container',
      className: 'relative w-full overflow-x-auto',
      children: J8(
        'table',
        {
          'data-slot': 'table',
          className: z0('w-full caption-bottom text-sm', Q),
          ...Z,
        },
        void 0,
        !1,
        void 0,
        this,
      ),
    },
    void 0,
    !1,
    void 0,
    this,
  )
}
function Hd({ className: Q, ...Z }) {
  return J8(
    'thead',
    { 'data-slot': 'table-header', className: z0('[&_tr]:border-b', Q), ...Z },
    void 0,
    !1,
    void 0,
    this,
  )
}
function Nd({ className: Q, ...Z }) {
  return J8(
    'tbody',
    {
      'data-slot': 'table-body',
      className: z0('[&_tr:last-child]:border-0', Q),
      ...Z,
    },
    void 0,
    !1,
    void 0,
    this,
  )
}
function Ld({ className: Q, ...Z }) {
  return J8(
    'tfoot',
    {
      'data-slot': 'table-footer',
      className: z0(
        'bg-muted/50 border-t font-medium [&>tr]:last:border-b-0',
        Q,
      ),
      ...Z,
    },
    void 0,
    !1,
    void 0,
    this,
  )
}
function Fd({ className: Q, ...Z }) {
  return J8(
    'tr',
    {
      'data-slot': 'table-row',
      className: z0(
        'hover:bg-muted/50 data-[state=selected]:bg-muted border-b transition-colors',
        Q,
      ),
      ...Z,
    },
    void 0,
    !1,
    void 0,
    this,
  )
}
function kd({ className: Q, ...Z }) {
  return J8(
    'th',
    {
      'data-slot': 'table-head',
      className: z0(
        'text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap [&:has([role=checkbox])]:pr-0',
        Q,
      ),
      ...Z,
    },
    void 0,
    !1,
    void 0,
    this,
  )
}
function Md({ className: Q, ...Z }) {
  return J8(
    'td',
    {
      'data-slot': 'table-cell',
      className: z0(
        'p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0',
        Q,
      ),
      ...Z,
    },
    void 0,
    !1,
    void 0,
    this,
  )
}
function jd({ className: Q, ...Z }) {
  return J8(
    'caption',
    {
      'data-slot': 'table-caption',
      className: z0('text-muted-foreground mt-4 text-sm', Q),
      ...Z,
    },
    void 0,
    !1,
    void 0,
    this,
  )
}
import { jsxDEV as GF } from 'react/jsx-dev-runtime'
function wd({ className: Q, ...Z }) {
  return GF(
    'div',
    {
      'data-slot': 'skeleton',
      className: z0('bg-muted rounded-md animate-pulse', Q),
      ...Z,
    },
    void 0,
    !1,
    void 0,
    this,
  )
}
import { jsxDEV as YF } from 'react/jsx-dev-runtime'
function Ed({ className: Q, ...Z }) {
  return YF(
    O8,
    {
      role: 'status',
      'aria-label': 'Loading',
      className: z0('size-4 animate-spin', Q),
      ...Z,
    },
    void 0,
    !1,
    void 0,
    this,
  )
}
var i8 = {}
c1(i8, {
  Value: () => z3,
  Track: () => Z3,
  Root: () => Q3,
  Label: () => q3,
  Indicator: () => J3,
})
import * as I6 from 'react'
import * as MZ from 'react'
var jZ = MZ.createContext(void 0)
jZ.displayName = 'ProgressRootContext'
function d8() {
  let Q = MZ.useContext(jZ)
  if (Q === void 0)
    throw Error(
      'Base UI: ProgressRootContext is missing. Progress parts must be placed within <Progress.Root>.',
    )
  return Q
}
var VZ = (function (Q) {
  return (
    (Q.complete = 'data-complete'),
    (Q.indeterminate = 'data-indeterminate'),
    (Q.progressing = 'data-progressing'),
    Q
  )
})({})
var I2 = {
  status(Q) {
    if (Q === 'progressing') return { [VZ.progressing]: '' }
    if (Q === 'complete') return { [VZ.complete]: '' }
    if (Q === 'indeterminate') return { [VZ.indeterminate]: '' }
    return null
  },
}
import { jsx as WF } from 'react/jsx-runtime'
function UF(Q, Z) {
  if (Z == null) return 'indeterminate progress'
  return Q || `${Z}%`
}
var Q3 = I6.forwardRef(function (Z, J) {
  let {
      format: z,
      getAriaValueText: q = UF,
      locale: $,
      max: X = 100,
      min: K = 0,
      value: G,
      render: Y,
      className: W,
      ...U
    } = Z,
    [B, H] = I6.useState(),
    N = s0(z),
    _ = 'indeterminate'
  if (Number.isFinite(G)) _ = G === X ? 'complete' : 'progressing'
  let L = UY(G, $, N.current),
    F = I6.useMemo(() => ({ status: _ }), [_]),
    k = {
      'aria-labelledby': B,
      'aria-valuemax': X,
      'aria-valuemin': K,
      'aria-valuenow': G ?? void 0,
      'aria-valuetext': q(L, G),
      role: 'progressbar',
    },
    V = I6.useMemo(
      () => ({
        formattedValue: L,
        max: X,
        min: K,
        setLabelId: H,
        state: F,
        status: _,
        value: G,
      }),
      [L, X, K, H, F, _, G],
    ),
    M = f('div', Z, {
      state: F,
      ref: J,
      props: [k, U],
      stateAttributesMapping: I2,
    })
  return WF(jZ.Provider, { value: V, children: M })
})
Q3.displayName = 'ProgressRoot'
import * as pY from 'react'
var Z3 = pY.forwardRef(function (Z, J) {
  let { render: z, className: q, ...$ } = Z,
    { state: X } = d8()
  return f('div', Z, { state: X, ref: J, props: $, stateAttributesMapping: I2 })
})
Z3.displayName = 'ProgressTrack'
import * as AZ from 'react'
var J3 = AZ.forwardRef(function (Z, J) {
  let { render: z, className: q, ...$ } = Z,
    { max: X, min: K, value: G, state: Y } = d8(),
    W = Number.isFinite(G) && G !== null ? D6(G, K, X) : null,
    U = AZ.useCallback(() => {
      if (W == null) return {}
      return { insetInlineStart: 0, height: 'inherit', width: `${W}%` }
    }, [W])
  return f('div', Z, {
    state: Y,
    ref: J,
    props: [{ style: U() }, $],
    stateAttributesMapping: I2,
  })
})
J3.displayName = 'ProgressIndicator'
import * as uY from 'react'
var z3 = uY.forwardRef(function (Z, J) {
  let { className: z, render: q, children: $, ...X } = Z,
    { value: K, formattedValue: G, state: Y } = d8(),
    W = K == null ? 'indeterminate' : G,
    U = K == null ? null : G
  return f('span', Z, {
    state: Y,
    ref: J,
    props: [
      { 'aria-hidden': !0, children: typeof $ === 'function' ? $(W, K) : U },
      X,
    ],
    stateAttributesMapping: I2,
  })
})
z3.displayName = 'ProgressValue'
import * as cY from 'react'
var q3 = cY.forwardRef(function (Z, J) {
  let { render: z, className: q, id: $, ...X } = Z,
    K = L0($),
    { setLabelId: G, state: Y } = d8()
  return (
    u(() => {
      return (G(K), () => G(void 0))
    }, [K, G]),
    f('span', Z, {
      state: Y,
      ref: J,
      props: [{ id: K }, X],
      stateAttributesMapping: I2,
    })
  )
})
q3.displayName = 'ProgressLabel'
import { jsxDEV as C6 } from 'react/jsx-dev-runtime'
function Li({ className: Q, children: Z, value: J, ...z }) {
  return C6(
    i8.Root,
    {
      value: J,
      'data-slot': 'progress',
      className: z0('flex flex-wrap gap-3', Q),
      ...z,
      children: [
        Z,
        C6(
          BF,
          { children: C6(_F, {}, void 0, !1, void 0, this) },
          void 0,
          !1,
          void 0,
          this,
        ),
      ],
    },
    void 0,
    !0,
    void 0,
    this,
  )
}
function BF({ className: Q, ...Z }) {
  return C6(
    i8.Track,
    {
      className: z0(
        'bg-muted h-1 rounded-full relative flex w-full items-center overflow-x-hidden',
        Q,
      ),
      'data-slot': 'progress-track',
      ...Z,
    },
    void 0,
    !1,
    void 0,
    this,
  )
}
function _F({ className: Q, ...Z }) {
  return C6(
    i8.Indicator,
    {
      'data-slot': 'progress-indicator',
      className: z0('bg-primary h-full transition-all', Q),
      ...Z,
    },
    void 0,
    !1,
    void 0,
    this,
  )
}
function Fi({ className: Q, ...Z }) {
  return C6(
    i8.Label,
    {
      className: z0('text-sm font-medium', Q),
      'data-slot': 'progress-label',
      ...Z,
    },
    void 0,
    !1,
    void 0,
    this,
  )
}
function ki({ className: Q, ...Z }) {
  return C6(
    i8.Value,
    {
      className: z0('text-muted-foreground ml-auto text-sm tabular-nums', Q),
      'data-slot': 'progress-value',
      ...Z,
    },
    void 0,
    !1,
    void 0,
    this,
  )
}
import { jsxDEV as dY } from 'react/jsx-dev-runtime'
function Ai({ className: Q, ...Z }) {
  return dY(
    'kbd',
    {
      'data-slot': 'kbd',
      className: z0(
        "bg-muted text-muted-foreground in-data-[slot=tooltip-content]:bg-background/20 in-data-[slot=tooltip-content]:text-background dark:in-data-[slot=tooltip-content]:bg-background/10 h-5 w-fit min-w-5 gap-1 rounded-sm px-1 font-sans text-xs font-medium [&_svg:not([class*='size-'])]:size-3 pointer-events-none inline-flex items-center justify-center select-none",
        Q,
      ),
      ...Z,
    },
    void 0,
    !1,
    void 0,
    this,
  )
}
function Oi({ className: Q, ...Z }) {
  return dY(
    'kbd',
    {
      'data-slot': 'kbd-group',
      className: z0('gap-1 inline-flex items-center', Q),
      ...Z,
    },
    void 0,
    !1,
    void 0,
    this,
  )
}
import { jsxDEV as k9 } from 'react/jsx-dev-runtime'
function Pi({ className: Q, ...Z }) {
  return k9(
    'div',
    {
      'data-slot': 'empty',
      className: z0(
        'gap-4 rounded-xl border-dashed p-6 flex w-full min-w-0 flex-1 flex-col items-center justify-center text-center text-balance',
        Q,
      ),
      ...Z,
    },
    void 0,
    !1,
    void 0,
    this,
  )
}
function Ei({ className: Q, ...Z }) {
  return k9(
    'div',
    {
      'data-slot': 'empty-header',
      className: z0('gap-2 flex max-w-sm flex-col items-center', Q),
      ...Z,
    },
    void 0,
    !1,
    void 0,
    this,
  )
}
var HF = T5(
  'mb-2 flex shrink-0 items-center justify-center [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-transparent',
        icon: "bg-muted text-foreground flex size-8 shrink-0 items-center justify-center rounded-lg [&_svg:not([class*='size-'])]:size-4",
      },
    },
    defaultVariants: { variant: 'default' },
  },
)
function Si({ className: Q, variant: Z = 'default', ...J }) {
  return k9(
    'div',
    {
      'data-slot': 'empty-icon',
      'data-variant': Z,
      className: z0(HF({ variant: Z, className: Q })),
      ...J,
    },
    void 0,
    !1,
    void 0,
    this,
  )
}
function Ii({ className: Q, ...Z }) {
  return k9(
    'div',
    {
      'data-slot': 'empty-title',
      className: z0('text-sm font-medium tracking-tight', Q),
      ...Z,
    },
    void 0,
    !1,
    void 0,
    this,
  )
}
function Ci({ className: Q, ...Z }) {
  return k9(
    'div',
    {
      'data-slot': 'empty-description',
      className: z0(
        'text-sm/relaxed text-muted-foreground [&>a:hover]:text-primary [&>a]:underline [&>a]:underline-offset-4',
        Q,
      ),
      ...Z,
    },
    void 0,
    !1,
    void 0,
    this,
  )
}
function xi({ className: Q, ...Z }) {
  return k9(
    'div',
    {
      'data-slot': 'empty-content',
      className: z0(
        'gap-2.5 text-sm flex w-full max-w-sm min-w-0 flex-col items-center text-balance',
        Q,
      ),
      ...Z,
    },
    void 0,
    !1,
    void 0,
    this,
  )
}
import { jsxDEV as OZ } from 'react/jsx-dev-runtime'
var NF = T5(
  "grid gap-0.5 rounded-lg border px-2.5 py-2 text-left text-sm has-data-[slot=alert-action]:relative has-data-[slot=alert-action]:pr-18 has-[>svg]:grid-cols-[auto_1fr] has-[>svg]:gap-x-2 *:[svg]:row-span-2 *:[svg]:translate-y-0.5 *:[svg]:text-current *:[svg:not([class*='size-'])]:size-4 w-full relative group/alert",
  {
    variants: {
      variant: {
        default: 'bg-card text-card-foreground',
        destructive:
          'text-destructive bg-card *:data-[slot=alert-description]:text-destructive/90 *:[svg]:text-current',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)
function fi({ className: Q, variant: Z, ...J }) {
  return OZ(
    'div',
    {
      'data-slot': 'alert',
      role: 'alert',
      className: z0(NF({ variant: Z }), Q),
      ...J,
    },
    void 0,
    !1,
    void 0,
    this,
  )
}
function gi({ className: Q, ...Z }) {
  return OZ(
    'div',
    {
      'data-slot': 'alert-title',
      className: z0(
        'font-medium group-has-[>svg]/alert:col-start-2 [&_a]:hover:text-foreground [&_a]:underline [&_a]:underline-offset-3',
        Q,
      ),
      ...Z,
    },
    void 0,
    !1,
    void 0,
    this,
  )
}
function mi({ className: Q, ...Z }) {
  return OZ(
    'div',
    {
      'data-slot': 'alert-description',
      className: z0(
        'text-muted-foreground text-sm text-balance md:text-pretty [&_p:not(:last-child)]:mb-4 [&_a]:hover:text-foreground [&_a]:underline [&_a]:underline-offset-3',
        Q,
      ),
      ...Z,
    },
    void 0,
    !1,
    void 0,
    this,
  )
}
function pi({ className: Q, ...Z }) {
  return OZ(
    'div',
    {
      'data-slot': 'alert-action',
      className: z0('absolute top-2 right-2', Q),
      ...Z,
    },
    void 0,
    !1,
    void 0,
    this,
  )
}
var D5 = {}
c1(D5, {
  createHandle: () => zW,
  Viewport: () => b7,
  Trigger: () => v7,
  Title: () => R7,
  Root: () => QW,
  Portal: () => h7,
  Popup: () => x7,
  Handle: () => l8,
  Description: () => C7,
  Close: () => I7,
  Backdrop: () => S7,
})
import * as iY from 'react'
import * as wZ from 'react'
var M9 = wZ.createContext(void 0)
M9.displayName = 'DialogRootContext'
function P1(Q) {
  let Z = wZ.useContext(M9)
  if (Q === !1 && Z === void 0)
    throw Error(
      'Base UI: DialogRootContext is missing. Dialog parts must be placed within <Dialog.Root>.',
    )
  return Z
}
var LF = { ...v0, ...i0 },
  S7 = iY.forwardRef(function (Z, J) {
    let { render: z, className: q, forceRender: $ = !1, ...X } = Z,
      { store: K } = P1(),
      G = K.useState('open'),
      Y = K.useState('nested'),
      W = K.useState('mounted'),
      U = K.useState('transitionStatus')
    return f('div', Z, {
      state: { open: G, transitionStatus: U },
      ref: [K.context.backdropRef, J],
      stateAttributesMapping: LF,
      props: [
        {
          role: 'presentation',
          hidden: !W,
          style: { userSelect: 'none', WebkitUserSelect: 'none' },
        },
        X,
      ],
      enabled: $ || !Y,
    })
  })
S7.displayName = 'DialogBackdrop'
import * as lY from 'react'
var I7 = lY.forwardRef(function (Z, J) {
  let {
      render: z,
      className: q,
      disabled: $ = !1,
      nativeButton: X = !0,
      ...K
    } = Z,
    { store: G } = P1(),
    Y = G.useState('open')
  function W(N) {
    if (Y) G.setOpen(!1, $0(c.closePress, N.nativeEvent))
  }
  let { getButtonProps: U, buttonRef: B } = Q1({ disabled: $, native: X })
  return f('button', Z, {
    state: { disabled: $ },
    ref: [J, B],
    props: [{ onClick: W }, K, U],
  })
})
I7.displayName = 'DialogClose'
import * as rY from 'react'
var C7 = rY.forwardRef(function (Z, J) {
  let { render: z, className: q, id: $, ...X } = Z,
    { store: K } = P1(),
    G = L0($)
  return (
    K.useSyncedValueWithCleanup('descriptionElementId', G),
    f('p', Z, { ref: J, props: [{ id: G }, X] })
  )
})
C7.displayName = 'DialogDescription'
import * as nY from 'react'
var aY = (function (Q) {
  return ((Q.nestedDialogs = '--nested-dialogs'), Q)
})({})
var sY = (function (Q) {
  return (
    (Q[(Q.open = O5.open)] = 'open'),
    (Q[(Q.closed = O5.closed)] = 'closed'),
    (Q[(Q.startingStyle = O5.startingStyle)] = 'startingStyle'),
    (Q[(Q.endingStyle = O5.endingStyle)] = 'endingStyle'),
    (Q.nested = 'data-nested'),
    (Q.nestedDialogOpen = 'data-nested-dialog-open'),
    Q
  )
})({})
import * as yZ from 'react'
var DZ = yZ.createContext(void 0)
DZ.displayName = 'DialogPortalContext'
function TZ() {
  let Q = yZ.useContext(DZ)
  if (Q === void 0) throw Error('Base UI: <Dialog.Portal> is missing.')
  return Q
}
import { jsx as FF } from 'react/jsx-runtime'
var kF = {
    ...v0,
    ...i0,
    nestedDialogOpen(Q) {
      return Q ? { [sY.nestedDialogOpen]: '' } : null
    },
  },
  x7 = nY.forwardRef(function (Z, J) {
    let { className: z, finalFocus: q, initialFocus: $, render: X, ...K } = Z,
      { store: G } = P1(),
      Y = G.useState('descriptionElementId'),
      W = G.useState('disablePointerDismissal'),
      U = G.useState('floatingRootContext'),
      B = G.useState('popupProps'),
      H = G.useState('modal'),
      N = G.useState('mounted'),
      _ = G.useState('nested'),
      L = G.useState('nestedOpenDialogCount'),
      F = G.useState('open'),
      k = G.useState('openMethod'),
      V = G.useState('titleElementId'),
      M = G.useState('transitionStatus'),
      j = G.useState('role')
    ;(TZ(),
      a0({
        open: F,
        ref: G.context.popupRef,
        onComplete() {
          if (F) G.context.onOpenChangeComplete?.(!0)
        },
      }))
    function A(h) {
      if (h === 'touch') return G.context.popupRef.current
      return !0
    }
    let w = $ === void 0 ? A : $,
      O = L > 0,
      x = f('div', Z, {
        state: { open: F, nested: _, transitionStatus: M, nestedDialogOpen: O },
        props: [
          B,
          {
            'aria-labelledby': V ?? void 0,
            'aria-describedby': Y ?? void 0,
            role: j,
            tabIndex: -1,
            hidden: !N,
            onKeyDown(h) {
              if (L2.has(h.key)) h.stopPropagation()
            },
            style: { [aY.nestedDialogs]: L },
          },
          K,
        ],
        ref: [J, G.context.popupRef, G.useStateSetter('popupElement')],
        stateAttributesMapping: kF,
      })
    return FF(s2, {
      context: U,
      openInteractionType: k,
      disabled: !N,
      closeOnFocusOut: !W,
      initialFocus: w,
      returnFocus: q,
      modal: H !== !1,
      restoreFocus: 'popup',
      children: x,
    })
  })
x7.displayName = 'DialogPopup'
import * as tY from 'react'
import { jsx as oY, jsxs as MF } from 'react/jsx-runtime'
var h7 = tY.forwardRef(function (Z, J) {
  let { keepMounted: z = !1, ...q } = Z,
    { store: $ } = P1(),
    X = $.useState('mounted'),
    K = $.useState('modal'),
    G = $.useState('open')
  if (!(X || z)) return null
  return oY(DZ.Provider, {
    value: z,
    children: MF(M2, {
      ref: J,
      ...q,
      children: [
        X &&
          K === !0 &&
          oY(o2, { ref: $.context.internalBackdropRef, inert: R5(!G) }),
        Z.children,
      ],
    }),
  })
})
h7.displayName = 'DialogPortal'
import * as eY from 'react'
import * as m5 from 'react'
function PZ(Q) {
  let { store: Z, parentContext: J, actionsRef: z } = Q,
    q = Z.useState('open'),
    $ = Z.useState('disablePointerDismissal'),
    X = Z.useState('modal'),
    K = Z.useState('popupElement'),
    { openMethod: G, triggerProps: Y, reset: W } = C8(q)
  V2(Z)
  let { forceUnmount: U } = A2(q, Z, () => {
      W()
    }),
    B = m((x) => {
      let h = $0(x)
      return (
        (h.preventUnmountOnClose = () => {
          Z.set('preventUnmountingOnClose', !0)
        }),
        h
      )
    }),
    H = m5.useCallback(() => {
      Z.setOpen(!1, B(c.imperativeAction))
    }, [Z, B])
  m5.useImperativeHandle(z, () => ({ unmount: U, close: H }), [U, H])
  let N = Z2({
      popupStore: Z,
      onOpenChange: Z.setOpen,
      treatPopupAsFloatingElement: !0,
      noEmit: !0,
    }),
    [_, L] = m5.useState(0),
    F = _ === 0,
    k = V6(N),
    V = A5(N, {
      outsidePressEvent() {
        if (
          Z.context.internalBackdropRef.current ||
          Z.context.backdropRef.current
        )
          return 'intentional'
        return {
          mouse: X === 'trap-focus' ? 'sloppy' : 'intentional',
          touch: 'sloppy',
        }
      },
      outsidePress(x) {
        if (!Z.context.outsidePressEnabledRef.current) return !1
        if ('button' in x && x.button !== 0) return !1
        if ('touches' in x && x.touches.length !== 1) return !1
        let h = K1(x)
        if (F && !$) {
          let I = h
          if (X)
            return Z.context.internalBackdropRef.current ||
              Z.context.backdropRef.current
              ? Z.context.internalBackdropRef.current === I ||
                  Z.context.backdropRef.current === I ||
                  (F0(I, K) && !I?.hasAttribute('data-base-ui-portal'))
              : !0
          return !0
        }
        return !1
      },
      escapeKey: F,
    })
  h8(q && X === !0, K)
  let {
    getReferenceProps: M,
    getFloatingProps: j,
    getTriggerProps: A,
  } = O1([k, V])
  ;(Z.useContextCallback('onNestedDialogOpen', (x) => {
    L(x + 1)
  }),
    Z.useContextCallback('onNestedDialogClose', () => {
      L(0)
    }),
    m5.useEffect(() => {
      if (J?.onNestedDialogOpen && q) J.onNestedDialogOpen(_)
      if (J?.onNestedDialogClose && !q) J.onNestedDialogClose()
      return () => {
        if (J?.onNestedDialogClose && q) J.onNestedDialogClose()
      }
    }, [q, J, _]))
  let w = m5.useMemo(() => M(Y), [M, Y]),
    O = m5.useMemo(() => A(Y), [A, Y]),
    S = m5.useMemo(() => j(), [j])
  Z.useSyncedValues({
    openMethod: G,
    activeTriggerProps: w,
    inactiveTriggerProps: O,
    popupProps: S,
    floatingRootContext: N,
    nestedOpenDialogCount: _,
  })
}
import * as EZ from 'react'
var jF = {
  ...w2,
  modal: G0((Q) => Q.modal),
  nested: G0((Q) => Q.nested),
  nestedOpenDialogCount: G0((Q) => Q.nestedOpenDialogCount),
  disablePointerDismissal: G0((Q) => Q.disablePointerDismissal),
  openMethod: G0((Q) => Q.openMethod),
  descriptionElementId: G0((Q) => Q.descriptionElementId),
  titleElementId: G0((Q) => Q.titleElementId),
  viewportElement: G0((Q) => Q.viewportElement),
  role: G0((Q) => Q.role),
}
class z8 extends M5 {
  constructor(Q) {
    super(
      VF(Q),
      {
        popupRef: EZ.createRef(),
        backdropRef: EZ.createRef(),
        internalBackdropRef: EZ.createRef(),
        outsidePressEnabledRef: { current: !0 },
        triggerElements: new o1(),
        onOpenChange: void 0,
        onOpenChangeComplete: void 0,
      },
      jF,
    )
  }
  setOpen = (Q, Z) => {
    if (
      ((Z.preventUnmountOnClose = () => {
        this.set('preventUnmountingOnClose', !0)
      }),
      !Q && Z.trigger == null && this.state.activeTriggerId != null)
    )
      Z.trigger = this.state.activeTriggerElement ?? void 0
    if ((this.context.onOpenChange?.(Q, Z), Z.isCanceled)) return
    let J = {
      open: Q,
      nativeEvent: Z.event,
      reason: Z.reason,
      nested: this.state.nested,
    }
    this.state.floatingRootContext.context.events?.emit('openchange', J)
    let z = { open: Q },
      q = Z.trigger?.id ?? null
    if (q || Q)
      ((z.activeTriggerId = q), (z.activeTriggerElement = Z.trigger ?? null))
    this.update(z)
  }
}
function VF(Q = {}) {
  return {
    ...O2(),
    modal: !0,
    disablePointerDismissal: !1,
    popupElement: null,
    viewportElement: null,
    descriptionElementId: void 0,
    titleElementId: void 0,
    openMethod: null,
    nested: !1,
    nestedOpenDialogCount: 0,
    role: 'dialog',
    ...Q,
  }
}
import { jsx as AF } from 'react/jsx-runtime'
function QW(Q) {
  let {
      children: Z,
      open: J,
      defaultOpen: z = !1,
      onOpenChange: q,
      onOpenChangeComplete: $,
      disablePointerDismissal: X = !1,
      modal: K = !0,
      actionsRef: G,
      handle: Y,
      triggerId: W,
      defaultTriggerId: U = null,
    } = Q,
    B = P1(!0),
    H = Boolean(B),
    N = R0(() => {
      return (
        Y?.store ??
        new z8({
          open: z,
          openProp: J,
          activeTriggerId: U,
          triggerIdProp: W,
          modal: K,
          disablePointerDismissal: X,
          nested: H,
        })
      )
    }).current
  ;(x5(() => {
    if (J === void 0 && N.state.open === !1 && z === !0)
      N.update({ open: !0, activeTriggerId: U })
  }),
    N.useControlledProp('openProp', J),
    N.useControlledProp('triggerIdProp', W),
    N.useSyncedValues({ disablePointerDismissal: X, nested: H, modal: K }),
    N.useContextCallback('onOpenChange', q),
    N.useContextCallback('onOpenChangeComplete', $))
  let _ = N.useState('payload')
  PZ({
    store: N,
    actionsRef: G,
    parentContext: B?.store.context,
    onOpenChange: q,
    triggerIdProp: W,
  })
  let L = eY.useMemo(() => ({ store: N }), [N])
  return AF(M9.Provider, {
    value: L,
    children: typeof Z === 'function' ? Z({ payload: _ }) : Z,
  })
}
import * as ZW from 'react'
var $3 = (function (Q) {
  return (
    (Q[(Q.open = O5.open)] = 'open'),
    (Q[(Q.closed = O5.closed)] = 'closed'),
    (Q[(Q.startingStyle = O5.startingStyle)] = 'startingStyle'),
    (Q[(Q.endingStyle = O5.endingStyle)] = 'endingStyle'),
    (Q.nested = 'data-nested'),
    (Q.nestedDialogOpen = 'data-nested-dialog-open'),
    Q
  )
})({})
var OF = {
    ...v0,
    ...i0,
    nested(Q) {
      return Q ? { [$3.nested]: '' } : null
    },
    nestedDialogOpen(Q) {
      return Q ? { [$3.nestedDialogOpen]: '' } : null
    },
  },
  b7 = ZW.forwardRef(function (Z, J) {
    let { className: z, render: q, children: $, ...X } = Z,
      K = TZ(),
      { store: G } = P1(),
      Y = G.useState('open'),
      W = G.useState('nested'),
      U = G.useState('transitionStatus'),
      B = G.useState('nestedOpenDialogCount'),
      H = G.useState('mounted'),
      N = B > 0
    return f('div', Z, {
      enabled: K || H,
      state: { open: Y, nested: W, transitionStatus: U, nestedDialogOpen: N },
      ref: [J, G.useStateSetter('viewportElement')],
      stateAttributesMapping: OF,
      props: [
        {
          role: 'presentation',
          hidden: !H,
          style: { pointerEvents: !Y ? 'none' : void 0 },
          children: $,
        },
        X,
      ],
    })
  })
b7.displayName = 'DialogViewport'
import * as JW from 'react'
var R7 = JW.forwardRef(function (Z, J) {
  let { render: z, className: q, id: $, ...X } = Z,
    { store: K } = P1(),
    G = L0($)
  return (
    K.useSyncedValueWithCleanup('titleElementId', G),
    f('h2', Z, { ref: J, props: [{ id: G }, X] })
  )
})
R7.displayName = 'DialogTitle'
import * as SZ from 'react'
var v7 = SZ.forwardRef(function (Z, J) {
  let {
      render: z,
      className: q,
      disabled: $ = !1,
      nativeButton: X = !0,
      id: K,
      payload: G,
      handle: Y,
      ...W
    } = Z,
    U = P1(!0),
    B = Y?.store ?? U?.store
  if (!B)
    throw Error(
      'Base UI: <Dialog.Trigger> must be used within <Dialog.Root> or provided with a handle.',
    )
  let H = L0(K),
    N = B.useState('floatingRootContext'),
    _ = B.useState('isOpenedByTrigger', H),
    L = SZ.useRef(null),
    { registerTrigger: F, isMountedByThisTrigger: k } = j2(H, L, B, {
      payload: G,
    }),
    { getButtonProps: V, buttonRef: M } = Q1({ disabled: $, native: X }),
    j = Q2(N, { enabled: N != null }),
    A = O1([j]),
    w = { disabled: $, open: _ },
    O = B.useState('triggerProps', k)
  return f('button', Z, {
    state: w,
    ref: [M, J, F, L],
    props: [A.getReferenceProps(), O, { [m6]: '', id: H }, W, V],
    stateAttributesMapping: b5,
  })
})
v7.displayName = 'DialogTrigger'
class l8 {
  constructor(Q) {
    this.store = Q ?? new z8()
  }
  open(Q) {
    let Z = Q ? this.store.context.triggerElements.getById(Q) : void 0
    if (Q && !Z)
      console.warn(
        `Base UI: DialogHandle.open: No trigger found with id "${Q}". The dialog will open, but the trigger will not be associated with the dialog.`,
      )
    this.store.setOpen(!0, $0(c.imperativeAction, void 0, Z))
  }
  openWithPayload(Q) {
    ;(this.store.set('payload', Q),
      this.store.setOpen(!0, $0(c.imperativeAction, void 0, void 0)))
  }
  close() {
    this.store.setOpen(!1, $0(c.imperativeAction, void 0, void 0))
  }
  get isOpen() {
    return this.store.state.open
  }
}
function zW() {
  return new l8()
}
import { jsxDEV as m1 } from 'react/jsx-dev-runtime'
function br({ ...Q }) {
  return m1(D5.Root, { 'data-slot': 'dialog', ...Q }, void 0, !1, void 0, this)
}
function Rr({ ...Q }) {
  return m1(
    D5.Trigger,
    { 'data-slot': 'dialog-trigger', ...Q },
    void 0,
    !1,
    void 0,
    this,
  )
}
function wF({ ...Q }) {
  return m1(
    D5.Portal,
    { 'data-slot': 'dialog-portal', ...Q },
    void 0,
    !1,
    void 0,
    this,
  )
}
function vr({ ...Q }) {
  return m1(
    D5.Close,
    { 'data-slot': 'dialog-close', ...Q },
    void 0,
    !1,
    void 0,
    this,
  )
}
function yF({ className: Q, ...Z }) {
  return m1(
    D5.Backdrop,
    {
      'data-slot': 'dialog-overlay',
      className: z0(
        'data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs fixed inset-0 isolate z-50',
        Q,
      ),
      ...Z,
    },
    void 0,
    !1,
    void 0,
    this,
  )
}
function fr({ className: Q, children: Z, showCloseButton: J = !0, ...z }) {
  return m1(
    wF,
    {
      children: [
        m1(yF, {}, void 0, !1, void 0, this),
        m1(
          D5.Popup,
          {
            'data-slot': 'dialog-content',
            className: z0(
              'bg-background data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 ring-foreground/10 grid max-w-[calc(100%-2rem)] gap-4 rounded-xl p-4 text-sm ring-1 duration-100 sm:max-w-sm fixed top-1/2 left-1/2 z-50 w-full -translate-x-1/2 -translate-y-1/2 outline-none',
              Q,
            ),
            ...z,
            children: [
              Z,
              J &&
                m1(
                  D5.Close,
                  {
                    'data-slot': 'dialog-close',
                    render: m1(
                      p6,
                      {
                        variant: 'ghost',
                        className: 'absolute top-2 right-2',
                        size: 'icon-sm',
                      },
                      void 0,
                      !1,
                      void 0,
                      this,
                    ),
                    children: [
                      m1(G7, {}, void 0, !1, void 0, this),
                      m1(
                        'span',
                        { className: 'sr-only', children: 'Close' },
                        void 0,
                        !1,
                        void 0,
                        this,
                      ),
                    ],
                  },
                  void 0,
                  !0,
                  void 0,
                  this,
                ),
            ],
          },
          void 0,
          !0,
          void 0,
          this,
        ),
      ],
    },
    void 0,
    !0,
    void 0,
    this,
  )
}
function gr({ className: Q, ...Z }) {
  return m1(
    'div',
    {
      'data-slot': 'dialog-header',
      className: z0('gap-2 flex flex-col', Q),
      ...Z,
    },
    void 0,
    !1,
    void 0,
    this,
  )
}
function mr({ className: Q, showCloseButton: Z = !1, children: J, ...z }) {
  return m1(
    'div',
    {
      'data-slot': 'dialog-footer',
      className: z0(
        'bg-muted/50 -mx-4 -mb-4 rounded-b-xl border-t p-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end',
        Q,
      ),
      ...z,
      children: [
        J,
        Z &&
          m1(
            D5.Close,
            {
              render: m1(p6, { variant: 'outline' }, void 0, !1, void 0, this),
              children: 'Close',
            },
            void 0,
            !1,
            void 0,
            this,
          ),
      ],
    },
    void 0,
    !0,
    void 0,
    this,
  )
}
function pr({ className: Q, ...Z }) {
  return m1(
    D5.Title,
    {
      'data-slot': 'dialog-title',
      className: z0('text-base leading-none font-medium', Q),
      ...Z,
    },
    void 0,
    !1,
    void 0,
    this,
  )
}
function ur({ className: Q, ...Z }) {
  return m1(
    D5.Description,
    {
      'data-slot': 'dialog-description',
      className: z0(
        'text-muted-foreground *:[a]:hover:text-foreground text-sm *:[a]:underline *:[a]:underline-offset-3',
        Q,
      ),
      ...Z,
    },
    void 0,
    !1,
    void 0,
    this,
  )
}
var $2 = {}
c1($2, {
  createHandle: () => XW,
  Viewport: () => b7,
  Trigger: () => v7,
  Title: () => R7,
  Root: () => $W,
  Portal: () => h7,
  Popup: () => x7,
  Handle: () => l8,
  Description: () => C7,
  Close: () => I7,
  Backdrop: () => S7,
})
import * as qW from 'react'
import { jsx as DF } from 'react/jsx-runtime'
function $W(Q) {
  let {
      children: Z,
      open: J,
      defaultOpen: z = !1,
      onOpenChange: q,
      onOpenChangeComplete: $,
      actionsRef: X,
      handle: K,
      triggerId: G,
      defaultTriggerId: Y = null,
    } = Q,
    W = P1(),
    U = Boolean(W),
    B = R0(() => {
      return (
        K?.store ??
        new z8({
          open: z,
          openProp: J,
          activeTriggerId: Y,
          triggerIdProp: G,
          modal: !0,
          disablePointerDismissal: !0,
          nested: U,
          role: 'alertdialog',
        })
      )
    }).current
  ;(B.useControlledProp('openProp', J),
    B.useControlledProp('triggerIdProp', G),
    B.useSyncedValue('nested', U),
    B.useContextCallback('onOpenChange', q),
    B.useContextCallback('onOpenChangeComplete', $))
  let H = B.useState('payload')
  PZ({
    store: B,
    actionsRef: X,
    parentContext: W?.store.context,
    onOpenChange: q,
    triggerIdProp: G,
  })
  let N = qW.useMemo(() => ({ store: B }), [B])
  return DF(M9.Provider, {
    value: N,
    children: typeof Z === 'function' ? Z({ payload: H }) : Z,
  })
}
function XW() {
  return new l8(
    new z8({ modal: !0, disablePointerDismissal: !0, role: 'alertdialog' }),
  )
}
import { jsxDEV as Q5 } from 'react/jsx-dev-runtime'
function Na({ ...Q }) {
  return Q5(
    $2.Root,
    { 'data-slot': 'alert-dialog', ...Q },
    void 0,
    !1,
    void 0,
    this,
  )
}
function La({ ...Q }) {
  return Q5(
    $2.Trigger,
    { 'data-slot': 'alert-dialog-trigger', ...Q },
    void 0,
    !1,
    void 0,
    this,
  )
}
function TF({ ...Q }) {
  return Q5(
    $2.Portal,
    { 'data-slot': 'alert-dialog-portal', ...Q },
    void 0,
    !1,
    void 0,
    this,
  )
}
function PF({ className: Q, ...Z }) {
  return Q5(
    $2.Backdrop,
    {
      'data-slot': 'alert-dialog-overlay',
      className: z0(
        'data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs fixed inset-0 isolate z-50',
        Q,
      ),
      ...Z,
    },
    void 0,
    !1,
    void 0,
    this,
  )
}
function Fa({ className: Q, size: Z = 'default', ...J }) {
  return Q5(
    TF,
    {
      children: [
        Q5(PF, {}, void 0, !1, void 0, this),
        Q5(
          $2.Popup,
          {
            'data-slot': 'alert-dialog-content',
            'data-size': Z,
            className: z0(
              'data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 bg-background ring-foreground/10 gap-4 rounded-xl p-4 ring-1 duration-100 data-[size=default]:max-w-xs data-[size=sm]:max-w-xs data-[size=default]:sm:max-w-sm group/alert-dialog-content fixed top-1/2 left-1/2 z-50 grid w-full -translate-x-1/2 -translate-y-1/2 outline-none',
              Q,
            ),
            ...J,
          },
          void 0,
          !1,
          void 0,
          this,
        ),
      ],
    },
    void 0,
    !0,
    void 0,
    this,
  )
}
function ka({ className: Q, ...Z }) {
  return Q5(
    'div',
    {
      'data-slot': 'alert-dialog-header',
      className: z0(
        'grid grid-rows-[auto_1fr] place-items-center gap-1.5 text-center has-data-[slot=alert-dialog-media]:grid-rows-[auto_auto_1fr] has-data-[slot=alert-dialog-media]:gap-x-4 sm:group-data-[size=default]/alert-dialog-content:place-items-start sm:group-data-[size=default]/alert-dialog-content:text-left sm:group-data-[size=default]/alert-dialog-content:has-data-[slot=alert-dialog-media]:grid-rows-[auto_1fr]',
        Q,
      ),
      ...Z,
    },
    void 0,
    !1,
    void 0,
    this,
  )
}
function Ma({ className: Q, ...Z }) {
  return Q5(
    'div',
    {
      'data-slot': 'alert-dialog-footer',
      className: z0(
        'bg-muted/50 -mx-4 -mb-4 rounded-b-xl border-t p-4 flex flex-col-reverse gap-2 group-data-[size=sm]/alert-dialog-content:grid group-data-[size=sm]/alert-dialog-content:grid-cols-2 sm:flex-row sm:justify-end',
        Q,
      ),
      ...Z,
    },
    void 0,
    !1,
    void 0,
    this,
  )
}
function ja({ className: Q, ...Z }) {
  return Q5(
    'div',
    {
      'data-slot': 'alert-dialog-media',
      className: z0(
        "bg-muted mb-2 inline-flex size-10 items-center justify-center rounded-md sm:group-data-[size=default]/alert-dialog-content:row-span-2 *:[svg:not([class*='size-'])]:size-6",
        Q,
      ),
      ...Z,
    },
    void 0,
    !1,
    void 0,
    this,
  )
}
function Va({ className: Q, ...Z }) {
  return Q5(
    $2.Title,
    {
      'data-slot': 'alert-dialog-title',
      className: z0(
        'text-base font-medium sm:group-data-[size=default]/alert-dialog-content:group-has-data-[slot=alert-dialog-media]/alert-dialog-content:col-start-2',
        Q,
      ),
      ...Z,
    },
    void 0,
    !1,
    void 0,
    this,
  )
}
function Aa({ className: Q, ...Z }) {
  return Q5(
    $2.Description,
    {
      'data-slot': 'alert-dialog-description',
      className: z0(
        'text-muted-foreground *:[a]:hover:text-foreground text-sm text-balance md:text-pretty *:[a]:underline *:[a]:underline-offset-3',
        Q,
      ),
      ...Z,
    },
    void 0,
    !1,
    void 0,
    this,
  )
}
function Oa({ className: Q, ...Z }) {
  return Q5(
    p6,
    { 'data-slot': 'alert-dialog-action', className: z0(Q), ...Z },
    void 0,
    !1,
    void 0,
    this,
  )
}
function wa({
  className: Q,
  variant: Z = 'outline',
  size: J = 'default',
  ...z
}) {
  return Q5(
    $2.Close,
    {
      'data-slot': 'alert-dialog-cancel',
      className: z0(Q),
      render: Q5(p6, { variant: Z, size: J }, void 0, !1, void 0, this),
      ...z,
    },
    void 0,
    !1,
    void 0,
    this,
  )
}
var C2 = {}
c1(C2, {
  createHandle: () => TW,
  Viewport: () => F3,
  Trigger: () => K3,
  Title: () => _3,
  Root: () => YW,
  Positioner: () => Y3,
  Portal: () => G3,
  Popup: () => W3,
  Handle: () => uZ,
  Description: () => H3,
  Close: () => N3,
  Backdrop: () => B3,
  Arrow: () => U3,
})
import * as p5 from 'react'
import * as IZ from 'react'
var CZ = IZ.createContext(void 0)
CZ.displayName = 'PopoverRootContext'
function V1(Q) {
  let Z = IZ.useContext(CZ)
  if (Z === void 0 && !Q)
    throw Error(
      'Base UI: PopoverRootContext is missing. Popover parts must be placed within <Popover.Root>.',
    )
  return Z
}
import * as j9 from 'react'
import * as KW from 'react-dom'
function EF() {
  return {
    ...O2(),
    disabled: !1,
    modal: !1,
    instantType: void 0,
    openMethod: null,
    openChangeReason: null,
    titleElementId: void 0,
    descriptionElementId: void 0,
    stickIfOpen: !0,
    nested: !1,
    openOnHover: !1,
    closeDelay: 0,
    hasViewport: !1,
  }
}
var SF = {
  ...w2,
  disabled: G0((Q) => Q.disabled),
  instantType: G0((Q) => Q.instantType),
  openMethod: G0((Q) => Q.openMethod),
  openChangeReason: G0((Q) => Q.openChangeReason),
  modal: G0((Q) => Q.modal),
  stickIfOpen: G0((Q) => Q.stickIfOpen),
  titleElementId: G0((Q) => Q.titleElementId),
  descriptionElementId: G0((Q) => Q.descriptionElementId),
  openOnHover: G0((Q) => Q.openOnHover),
  closeDelay: G0((Q) => Q.closeDelay),
  hasViewport: G0((Q) => Q.hasViewport),
}
class V9 extends M5 {
  constructor(Q) {
    let Z = { ...EF(), ...Q }
    if (Z.open && Q?.mounted === void 0) Z.mounted = !0
    super(
      Z,
      {
        popupRef: j9.createRef(),
        backdropRef: j9.createRef(),
        internalBackdropRef: j9.createRef(),
        onOpenChange: void 0,
        onOpenChangeComplete: void 0,
        triggerFocusTargetRef: j9.createRef(),
        beforeContentFocusGuardRef: j9.createRef(),
        stickIfOpenTimeout: new p1(),
        triggerElements: new o1(),
      },
      SF,
    )
  }
  setOpen = (Q, Z) => {
    let J = Z.reason === c.triggerHover,
      z = Z.reason === c.triggerPress && Z.event.detail === 0,
      q = !Q && (Z.reason === c.escapeKey || Z.reason == null)
    if (
      ((Z.preventUnmountOnClose = () => {
        this.set('preventUnmountingOnClose', !0)
      }),
      this.context.onOpenChange?.(Q, Z),
      Z.isCanceled)
    )
      return
    let $ = {
      open: Q,
      nativeEvent: Z.event,
      reason: Z.reason,
      nested: this.state.nested,
      triggerElement: Z.trigger,
    }
    this.state.floatingRootContext.context.events?.emit('openchange', $)
    let K = () => {
      let G = { open: Q, openChangeReason: Z.reason },
        Y = Z.trigger?.id ?? null
      if (Y || Q)
        ((G.activeTriggerId = Y), (G.activeTriggerElement = Z.trigger ?? null))
      this.update(G)
    }
    if (J)
      (this.set('stickIfOpen', !0),
        this.context.stickIfOpenTimeout.start(JQ, () => {
          this.set('stickIfOpen', !1)
        }),
        KW.flushSync(K))
    else K()
    if (z || q) this.set('instantType', z ? 'click' : 'dismiss')
    else if (Z.reason === c.focusOut) this.set('instantType', 'focus')
    else this.set('instantType', void 0)
  }
  static useStore(Q, Z) {
    let J = R0(() => {
        return new V9(Z)
      }).current,
      z = Q ?? J
    return ($5(J.disposeEffect), z)
  }
  disposeEffect = () => {
    return this.context.stickIfOpenTimeout.disposeEffect()
  }
}
import { jsx as xZ } from 'react/jsx-runtime'
function GW({ props: Q }) {
  let {
      children: Z,
      open: J,
      defaultOpen: z = !1,
      onOpenChange: q,
      onOpenChangeComplete: $,
      modal: X = !1,
      handle: K,
      triggerId: G,
      defaultTriggerId: Y = null,
    } = Q,
    W = V9.useStore(K?.store, {
      modal: X,
      open: z,
      openProp: J,
      activeTriggerId: Y,
      triggerIdProp: G,
    })
  ;(x5(() => {
    if (J === void 0 && W.state.open === !1 && z === !0)
      W.update({ open: !0, activeTriggerId: Y })
  }),
    W.useControlledProp('openProp', J),
    W.useControlledProp('triggerIdProp', G))
  let U = W.useState('open'),
    B = W.useState('positionerElement'),
    H = W.useState('payload'),
    N = W.useState('openChangeReason')
  ;(W.useContextCallback('onOpenChange', q),
    W.useContextCallback('onOpenChangeComplete', $))
  let { openMethod: _, triggerProps: L, reset: F } = C8(U)
  V2(W)
  let { forceUnmount: k } = A2(U, W, () => {
    ;(W.update({ stickIfOpen: !0, openChangeReason: null }), F())
  })
  ;(h8(U && X === !0 && N !== c.triggerHover && _ !== 'touch', B),
    p5.useEffect(() => {
      if (!U) W.context.stickIfOpenTimeout.clear()
    }, [W, U]))
  let V = p5.useCallback(
      (R) => {
        let v = $0(R)
        return (
          (v.preventUnmountOnClose = () => {
            W.set('preventUnmountingOnClose', !0)
          }),
          v
        )
      },
      [W],
    ),
    M = p5.useCallback(() => {
      W.setOpen(!1, V(c.imperativeAction))
    }, [W, V])
  p5.useImperativeHandle(Q.actionsRef, () => ({ unmount: k, close: M }), [k, M])
  let j = Z2({ popupStore: W, onOpenChange: W.setOpen }),
    A = A5(j, {
      outsidePressEvent: {
        mouse: X === 'trap-focus' ? 'sloppy' : 'intentional',
        touch: 'sloppy',
      },
    }),
    w = V6(j),
    {
      getReferenceProps: O,
      getFloatingProps: S,
      getTriggerProps: x,
    } = O1([A, w]),
    h = p5.useMemo(() => {
      return O(L)
    }, [O, L]),
    I = p5.useMemo(() => {
      return x(L)
    }, [x, L]),
    y = p5.useMemo(() => {
      return S()
    }, [S])
  W.useSyncedValues({
    modal: X,
    openMethod: _,
    activeTriggerProps: h,
    inactiveTriggerProps: I,
    popupProps: y,
    floatingRootContext: j,
    nested: C1() != null,
  })
  let T = p5.useMemo(() => ({ store: W }), [W])
  return xZ(CZ.Provider, {
    value: T,
    children: typeof Z === 'function' ? Z({ payload: H }) : Z,
  })
}
function YW(Q) {
  if (V1(!0)) return xZ(GW, { props: Q })
  return xZ(N7, { children: xZ(GW, { props: Q }) })
}
import * as X2 from 'react'
import * as X3 from 'react-dom'
var WW = 300
import { jsx as hZ, jsxs as IF } from 'react/jsx-runtime'
var K3 = X2.forwardRef(function (Z, J) {
  let {
      render: z,
      className: q,
      disabled: $ = !1,
      nativeButton: X = !0,
      handle: K,
      payload: G,
      openOnHover: Y = !1,
      delay: W = WW,
      closeDelay: U = 0,
      id: B,
      ...H
    } = Z,
    N = V1(!0),
    _ = K?.store ?? N?.store
  if (!_)
    throw Error(
      'Base UI: <Popover.Trigger> must be either used within a <Popover.Root> component or provided with a handle.',
    )
  let L = L0(B),
    F = _.useState('isTriggerActive', L),
    k = _.useState('floatingRootContext'),
    V = _.useState('isOpenedByTrigger', L),
    M = X2.useRef(null),
    { registerTrigger: j, isMountedByThisTrigger: A } = j2(L, M, _, {
      payload: G,
      disabled: $,
      openOnHover: Y,
      closeDelay: U,
    }),
    w = _.useState('openChangeReason'),
    O = _.useState('stickIfOpen'),
    S = _.useState('openMethod'),
    x = J2(k, {
      enabled: k != null && Y && (S !== 'touch' || w !== c.triggerPress),
      mouseOnly: !0,
      move: !1,
      handleClose: z2(),
      restMs: W,
      delay: { close: U },
      triggerElementRef: M,
      isActiveTrigger: F,
    }),
    h = Q2(k, { enabled: k != null, stickIfOpen: O }),
    I = O1([h]),
    y = _.useState('triggerProps', A),
    T = { disabled: $, open: V },
    { getButtonProps: R, buttonRef: v } = Q1({ disabled: $, native: X }),
    P = X2.useMemo(
      () => ({
        open(p) {
          if (p && w === c.triggerPress) return O6.open(p)
          return b5.open(p)
        },
      }),
      [w],
    ),
    D = f('button', Z, {
      state: T,
      ref: [v, J, j, M],
      props: [I.getReferenceProps(), x, y, { [m6]: '', id: L }, H, R],
      stateAttributesMapping: P,
    }),
    E = X2.useRef(null),
    C = m((p) => {
      ;(X3.flushSync(() => {
        _.setOpen(!1, $0(c.focusOut, p.nativeEvent, p.currentTarget))
      }),
        CQ(E.current)?.focus())
    }),
    a = m((p) => {
      let Q0 = _.select('positionerElement')
      if (Q0 && n5(p, Q0)) _.context.beforeContentFocusGuardRef.current?.focus()
      else {
        X3.flushSync(() => {
          _.setOpen(!1, $0(c.focusOut, p.nativeEvent, p.currentTarget))
        })
        let g = IQ(_.context.triggerFocusTargetRef.current || M.current)
        while (g !== null && F0(Q0, g)) {
          let Z0 = g
          if (((g = M8(g)), g === Z0)) break
        }
        g?.focus()
      }
    })
  if (F)
    return IF(X2.Fragment, {
      children: [
        hZ(V5, { ref: E, onFocus: C }),
        hZ(X2.Fragment, { children: D }, L),
        hZ(V5, { ref: _.context.triggerFocusTargetRef, onFocus: a }),
      ],
    })
  return hZ(X2.Fragment, { children: D }, L)
})
K3.displayName = 'PopoverTrigger'
import * as _W from 'react'
import * as bZ from 'react'
var RZ = bZ.createContext(void 0)
RZ.displayName = 'PopoverPortalContext'
function UW() {
  let Q = bZ.useContext(RZ)
  if (Q === void 0) throw Error('Base UI: <Popover.Portal> is missing.')
  return Q
}
import { jsx as BW } from 'react/jsx-runtime'
var G3 = _W.forwardRef(function (Z, J) {
  let { keepMounted: z = !1, ...q } = Z,
    { store: $ } = V1()
  if (!($.useState('mounted') || z)) return null
  return BW(RZ.Provider, { value: z, children: BW(M2, { ref: J, ...q }) })
})
G3.displayName = 'PopoverPortal'
import * as q8 from 'react'
import * as vZ from 'react'
var fZ = vZ.createContext(void 0)
fZ.displayName = 'PopoverPositionerContext'
function A9() {
  let Q = vZ.useContext(fZ)
  if (!Q)
    throw Error(
      'Base UI: PopoverPositionerContext is missing. PopoverPositioner parts must be placed within <Popover.Positioner>.',
    )
  return Q
}
import { jsx as HW, jsxs as CF } from 'react/jsx-runtime'
var Y3 = q8.forwardRef(function (Z, J) {
  let {
      render: z,
      className: q,
      anchor: $,
      positionMethod: X = 'absolute',
      side: K = 'bottom',
      align: G = 'center',
      sideOffset: Y = 0,
      alignOffset: W = 0,
      collisionBoundary: U = 'clipping-ancestors',
      collisionPadding: B = 5,
      arrowPadding: H = 5,
      sticky: N = !1,
      disableAnchorTracking: _ = !1,
      collisionAvoidance: L = B8,
      ...F
    } = Z,
    { store: k } = V1(),
    V = UW(),
    M = H6(),
    j = k.useState('floatingRootContext'),
    A = k.useState('mounted'),
    w = k.useState('open'),
    O = k.useState('openChangeReason'),
    S = k.useState('activeTriggerElement'),
    x = k.useState('modal'),
    h = k.useState('positionerElement'),
    I = k.useState('instantType'),
    y = k.useState('transitionStatus'),
    T = k.useState('hasViewport'),
    R = q8.useRef(null),
    v = j8(h, !1, !1),
    P = D2({
      anchor: $,
      floatingRootContext: j,
      positionMethod: X,
      mounted: A,
      side: K,
      sideOffset: Y,
      align: G,
      alignOffset: W,
      arrowPadding: H,
      collisionBoundary: U,
      collisionPadding: B,
      sticky: N,
      disableAnchorTracking: _,
      keepMounted: V,
      nodeId: M,
      collisionAvoidance: L,
      adaptiveOrigin: T ? q9 : void 0,
    }),
    D = q8.useMemo(() => {
      let g = {}
      if (!w) g.pointerEvents = 'none'
      return {
        role: 'presentation',
        hidden: !A,
        style: { ...P.positionerStyles, ...g },
      }
    }, [w, A, P.positionerStyles]),
    E = q8.useMemo(() => ({ props: D, ...P }), [D, P]),
    C = j.useState('domReferenceElement')
  u(() => {
    let g = C,
      Z0 = R.current
    if (g) R.current = g
    if (Z0 && g && g !== Z0) {
      k.set('instantType', void 0)
      let i = new AbortController()
      return (
        v(() => {
          k.set('instantType', 'trigger-change')
        }, i.signal),
        () => {
          i.abort()
        }
      )
    }
    return
  }, [C, v, k])
  let a = {
      open: w,
      side: E.side,
      align: E.align,
      anchorHidden: E.anchorHidden,
      instant: I,
    },
    p = q8.useCallback(
      (g) => {
        k.set('positionerElement', g)
      },
      [k],
    ),
    Q0 = f('div', Z, {
      state: a,
      props: [E.props, T1(y), F],
      ref: [J, p],
      stateAttributesMapping: v0,
    })
  return CF(fZ.Provider, {
    value: E,
    children: [
      A &&
        x === !0 &&
        O !== c.triggerHover &&
        HW(o2, {
          ref: k.context.internalBackdropRef,
          inert: R5(!w),
          cutout: S,
        }),
      HW(H7, { id: M, children: Q0 }),
    ],
  })
})
Y3.displayName = 'PopoverPositioner'
import * as gZ from 'react'
import { jsx as xF } from 'react/jsx-runtime'
var hF = { ...v0, ...i0 },
  W3 = gZ.forwardRef(function (Z, J) {
    let { className: z, render: q, initialFocus: $, finalFocus: X, ...K } = Z,
      { store: G } = V1(),
      Y = A9(),
      W = R8(!0) != null,
      U = G.useState('open'),
      B = G.useState('openMethod'),
      H = G.useState('instantType'),
      N = G.useState('transitionStatus'),
      _ = G.useState('popupProps'),
      L = G.useState('titleElementId'),
      F = G.useState('descriptionElementId'),
      k = G.useState('modal'),
      V = G.useState('mounted'),
      M = G.useState('openChangeReason'),
      j = G.useState('activeTriggerElement'),
      A = G.useState('floatingRootContext')
    a0({
      open: U,
      ref: G.context.popupRef,
      onComplete() {
        if (U) G.context.onOpenChangeComplete?.(!0)
      },
    })
    let w = G.useState('disabled'),
      O = G.useState('openOnHover'),
      S = G.useState('closeDelay')
    n2(A, { enabled: O && !w, closeDelay: S })
    function x(R) {
      if (R === 'touch') return G.context.popupRef.current
      return !0
    }
    let h = $ === void 0 ? x : $,
      I = {
        open: U,
        side: Y.side,
        align: Y.align,
        instant: H,
        transitionStatus: N,
      },
      y = gZ.useCallback(
        (R) => {
          G.set('popupElement', R)
        },
        [G],
      ),
      T = f('div', Z, {
        state: I,
        ref: [J, G.context.popupRef, y],
        props: [
          _,
          {
            'aria-labelledby': L,
            'aria-describedby': F,
            onKeyDown(R) {
              if (W && L2.has(R.key)) R.stopPropagation()
            },
          },
          T1(N),
          K,
        ],
        stateAttributesMapping: hF,
      })
    return xF(s2, {
      context: A,
      openInteractionType: B,
      modal: k === 'trap-focus',
      disabled: !V || M === c.triggerHover,
      initialFocus: h,
      returnFocus: X,
      restoreFocus: 'popup',
      previousFocusableElement: m0(j) ? j : void 0,
      nextFocusableElement: G.context.triggerFocusTargetRef,
      beforeContentFocusGuardRef: G.context.beforeContentFocusGuardRef,
      children: T,
    })
  })
W3.displayName = 'PopoverPopup'
import * as NW from 'react'
var U3 = NW.forwardRef(function (Z, J) {
  let { className: z, render: q, ...$ } = Z,
    { store: X } = V1(),
    K = X.useState('open'),
    {
      arrowRef: G,
      side: Y,
      align: W,
      arrowUncentered: U,
      arrowStyles: B,
    } = A9()
  return f('div', Z, {
    state: { open: K, side: Y, align: W, uncentered: U },
    ref: [J, G],
    props: [{ style: B, 'aria-hidden': !0 }, $],
    stateAttributesMapping: v0,
  })
})
U3.displayName = 'PopoverArrow'
import * as LW from 'react'
var bF = { ...v0, ...i0 },
  B3 = LW.forwardRef(function (Z, J) {
    let { className: z, render: q, ...$ } = Z,
      { store: X } = V1(),
      K = X.useState('open'),
      G = X.useState('mounted'),
      Y = X.useState('transitionStatus'),
      W = X.useState('openChangeReason')
    return f('div', Z, {
      state: { open: K, transitionStatus: Y },
      ref: [X.context.backdropRef, J],
      props: [
        {
          role: 'presentation',
          hidden: !G,
          style: {
            pointerEvents: W === c.triggerHover ? 'none' : void 0,
            userSelect: 'none',
            WebkitUserSelect: 'none',
          },
        },
        $,
      ],
      stateAttributesMapping: bF,
    })
  })
B3.displayName = 'PopoverBackdrop'
import * as FW from 'react'
var _3 = FW.forwardRef(function (Z, J) {
  let { render: z, className: q, ...$ } = Z,
    { store: X } = V1(),
    K = L0($.id)
  return (
    u(() => {
      return (
        X.set('titleElementId', K),
        () => {
          X.set('titleElementId', void 0)
        }
      )
    }, [X, K]),
    f('h2', Z, { ref: J, props: [{ id: K }, $] })
  )
})
_3.displayName = 'PopoverTitle'
import * as kW from 'react'
var H3 = kW.forwardRef(function (Z, J) {
  let { render: z, className: q, ...$ } = Z,
    { store: X } = V1(),
    K = L0($.id)
  return (
    u(() => {
      return (
        X.set('descriptionElementId', K),
        () => {
          X.set('descriptionElementId', void 0)
        }
      )
    }, [X, K]),
    f('p', Z, { ref: J, props: [{ id: K }, $] })
  )
})
H3.displayName = 'PopoverDescription'
import * as MW from 'react'
var N3 = MW.forwardRef(function (Z, J) {
  let {
      render: z,
      className: q,
      disabled: $ = !1,
      nativeButton: X = !0,
      ...K
    } = Z,
    { buttonRef: G, getButtonProps: Y } = Q1({
      disabled: $,
      focusableWhenDisabled: !1,
      native: X,
    }),
    { store: W } = V1()
  return f('button', Z, {
    ref: [J, G],
    props: [
      {
        onClick(B) {
          W.setOpen(!1, $0(c.closePress, B.nativeEvent, B.currentTarget))
        },
      },
      K,
      Y,
    ],
  })
})
N3.displayName = 'PopoverClose'
import * as DW from 'react'
var jW = (function (Q) {
  return (
    (Q.popupWidth = '--popup-width'),
    (Q.popupHeight = '--popup-height'),
    Q
  )
})({})
import * as l1 from 'react'
import * as VW from 'react'
function AW(Q) {
  let [Z, J] = VW.useState({ current: Q, previous: null })
  if (Q !== Z.current) J({ current: Q, previous: Z.current })
  return Z.previous
}
import * as x6 from 'react'
var RF = typeof ResizeObserver < 'u',
  vF = () => !0
function wW(Q) {
  let {
      popupElement: Z,
      positionerElement: J,
      content: z,
      mounted: q,
      enabled: $ = vF,
      onMeasureLayout: X,
      onMeasureLayoutComplete: K,
      side: G,
      direction: Y,
    } = Q,
    W = j8(Z, !0, !1),
    U = K5(),
    B = x6.useRef(null),
    H = x6.useRef(null),
    N = x6.useRef(!0),
    _ = x6.useRef(l0),
    L = m(X),
    F = m(K),
    k = x6.useMemo(() => {
      let V = G === 'top',
        M = G === 'left'
      if (Y === 'rtl')
        ((V = V || G === 'inline-end'), (M = M || G === 'inline-end'))
      else ((V = V || G === 'inline-start'), (M = M || G === 'inline-start'))
      return V
        ? {
            position: 'absolute',
            [G === 'top' ? 'bottom' : 'top']: '0',
            [M ? 'right' : 'left']: '0',
          }
        : S0
    }, [G, Y])
  u(() => {
    if (!q || !$() || !RF) {
      ;((_.current = l0),
        (N.current = !0),
        (B.current = null),
        (H.current = null))
      return
    }
    if (!Z || !J) return
    _.current = OW(Z, k)
    let V = new ResizeObserver((y) => {
      let T = y[0]
      if (T)
        H.current = {
          width: Math.ceil(T.borderBoxSize[0].inlineSize),
          height: Math.ceil(T.borderBoxSize[0].blockSize),
        }
    })
    ;(V.observe(Z), mZ(Z, 'auto'))
    let M = pZ(Z, 'position', 'static'),
      j = pZ(Z, 'transform', 'none'),
      A = pZ(Z, 'scale', '1'),
      w = OW(J, {
        '--available-width': 'max-content',
        '--available-height': 'max-content',
      })
    function O() {
      ;(M(), j(), w())
    }
    function S() {
      ;(O(), A())
    }
    if ((L?.(), N.current || B.current === null)) {
      f7(J, 'max-content')
      let y = L9(Z)
      return (
        (B.current = y),
        f7(J, y),
        S(),
        F?.(null, y),
        (N.current = !1),
        () => {
          ;(V.disconnect(), _.current(), (_.current = l0))
        }
      )
    }
    ;(mZ(Z, 'auto'), f7(J, 'max-content'))
    let x = B.current ?? H.current,
      h = L9(Z)
    if (((B.current = h), !x))
      return (
        f7(J, h),
        S(),
        F?.(null, h),
        () => {
          ;(V.disconnect(), U.cancel(), _.current(), (_.current = l0))
        }
      )
    ;(mZ(Z, x), S(), F?.(x, h), f7(J, h))
    let I = new AbortController()
    return (
      U.request(() => {
        ;(mZ(Z, h),
          W(() => {
            ;(Z.style.setProperty('--popup-width', 'auto'),
              Z.style.setProperty('--popup-height', 'auto'))
          }, I.signal))
      }),
      () => {
        ;(V.disconnect(), I.abort(), U.cancel(), _.current(), (_.current = l0))
      }
    )
  }, [z, Z, J, W, U, $, q, L, F, k])
}
function pZ(Q, Z, J) {
  let z = Q.style.getPropertyValue(Z)
  return (
    Q.style.setProperty(Z, J),
    () => {
      Q.style.setProperty(Z, z)
    }
  )
}
function OW(Q, Z) {
  let J = []
  for (let [z, q] of Object.entries(Z)) J.push(pZ(Q, z, q))
  return J.length
    ? () => {
        J.forEach((z) => z())
      }
    : l0
}
function mZ(Q, Z) {
  let J = Z === 'auto' ? 'auto' : `${Z.width}px`,
    z = Z === 'auto' ? 'auto' : `${Z.height}px`
  ;(Q.style.setProperty('--popup-width', J),
    Q.style.setProperty('--popup-height', z))
}
function f7(Q, Z) {
  let J = Z === 'max-content' ? 'max-content' : `${Z.width}px`,
    z = Z === 'max-content' ? 'max-content' : `${Z.height}px`
  ;(Q.style.setProperty('--positioner-width', J),
    Q.style.setProperty('--positioner-height', z))
}
import { jsx as L3, jsxs as fF } from 'react/jsx-runtime'
function O9(Q) {
  let { store: Z, side: J, cssVars: z, children: q } = Q,
    $ = y1(),
    X = Z.useState('activeTriggerElement'),
    K = Z.useState('activeTriggerId'),
    G = Z.useState('open'),
    Y = Z.useState('payload'),
    W = Z.useState('mounted'),
    U = Z.useState('popupElement'),
    B = Z.useState('positionerElement'),
    H = AW(G ? X : null),
    N = pF(K, Y),
    _ = l1.useRef(null),
    [L, F] = l1.useState(null),
    [k, V] = l1.useState(null),
    M = l1.useRef(null),
    j = l1.useRef(null),
    A = j8(M, !0, !1),
    w = K5(),
    [O, S] = l1.useState(null),
    [x, h] = l1.useState(!1)
  u(() => {
    return (
      Z.set('hasViewport', !0),
      () => {
        Z.set('hasViewport', !1)
      }
    )
  }, [Z])
  let I = m(() => {
      ;(M.current?.style.setProperty('animation', 'none'),
        M.current?.style.setProperty('transition', 'none'),
        j.current?.style.setProperty('display', 'none'))
    }),
    y = m((D) => {
      if (
        (M.current?.style.removeProperty('animation'),
        M.current?.style.removeProperty('transition'),
        j.current?.style.removeProperty('display'),
        D)
      )
        S(D)
    }),
    T = l1.useRef(null)
  ;(u(() => {
    if (X && H && X !== H && T.current !== X && _.current) {
      ;(F(_.current), h(!0))
      let D = mF(H, X)
      ;(V(D),
        w.request(() => {
          w.request(() => {
            ;(h(!1),
              A(() => {
                ;(F(null), S(null), (_.current = null))
              }))
          })
        }),
        (T.current = X))
    }
  }, [X, H, L, A, w]),
    u(() => {
      let D = M.current
      if (!D) return
      let E = document.createElement('div')
      for (let C of Array.from(D.childNodes)) E.appendChild(C.cloneNode(!0))
      _.current = E
    }))
  let R = L != null,
    v
  if (!R) v = L3('div', { 'data-current': !0, ref: M, children: q }, N)
  else
    v = fF(l1.Fragment, {
      children: [
        L3(
          'div',
          {
            'data-previous': !0,
            inert: R5(!0),
            ref: j,
            style: {
              [z.popupWidth]: `${O?.width}px`,
              [z.popupHeight]: `${O?.height}px`,
              position: 'absolute',
            },
            'data-ending-style': x ? void 0 : '',
          },
          'previous',
        ),
        L3(
          'div',
          {
            'data-current': !0,
            ref: M,
            'data-starting-style': x ? '' : void 0,
            children: q,
          },
          N,
        ),
      ],
    })
  ;(u(() => {
    let D = j.current
    if (!D || !L) return
    D.replaceChildren(...Array.from(L.childNodes))
  }, [L]),
    wW({
      popupElement: U,
      positionerElement: B,
      mounted: W,
      content: Y,
      onMeasureLayout: I,
      onMeasureLayoutComplete: y,
      side: J,
      direction: $,
    }))
  let P = { activationDirection: gF(k), transitioning: R }
  return { children: v, state: P }
}
function gF(Q) {
  if (!Q) return
  return `${yW(Q.horizontal, 5, 'right', 'left')} ${yW(Q.vertical, 5, 'down', 'up')}`
}
function yW(Q, Z, J, z) {
  if (Q > Z) return J
  if (Q < -Z) return z
  return ''
}
function mF(Q, Z) {
  let J = Q.getBoundingClientRect(),
    z = Z.getBoundingClientRect(),
    q = { x: J.left + J.width / 2, y: J.top + J.height / 2 },
    $ = { x: z.left + z.width / 2, y: z.top + z.height / 2 }
  return { horizontal: $.x - q.x, vertical: $.y - q.y }
}
function pF(Q, Z) {
  let [J, z] = l1.useState(0),
    q = l1.useRef(Q),
    $ = l1.useRef(Z),
    X = l1.useRef(!1)
  return (
    u(() => {
      let K = q.current,
        G = $.current,
        Y = Q !== K,
        W = Z !== G
      if (Y) (z((U) => U + 1), (X.current = !W))
      else if (X.current && W) (z((U) => U + 1), (X.current = !1))
      ;((q.current = Q), ($.current = Z))
    }, [Q, Z]),
    `${Q ?? 'current'}-${J}`
  )
}
var uF = {
    activationDirection: (Q) => (Q ? { 'data-activation-direction': Q } : null),
  },
  F3 = DW.forwardRef(function (Z, J) {
    let { render: z, className: q, children: $, ...X } = Z,
      { store: K } = V1(),
      { side: G } = A9(),
      Y = K.useState('instantType'),
      { children: W, state: U } = O9({
        store: K,
        side: G,
        cssVars: jW,
        children: $,
      }),
      B = {
        activationDirection: U.activationDirection,
        transitioning: U.transitioning,
        instant: Y,
      }
    return f('div', Z, {
      state: B,
      ref: J,
      props: [X, { children: W }],
      stateAttributesMapping: uF,
    })
  })
F3.displayName = 'PopoverViewport'
class uZ {
  constructor() {
    this.store = new V9()
  }
  open(Q) {
    let Z = Q
      ? (this.store.context.triggerElements.getById(Q) ?? void 0)
      : void 0
    if (Q && !Z)
      throw Error(
        `Base UI: PopoverHandle.open: No trigger found with id "${Q}".`,
      )
    this.store.setOpen(!0, $0(c.imperativeAction, void 0, Z))
  }
  close() {
    this.store.setOpen(!1, $0(c.imperativeAction, void 0, void 0))
  }
  get isOpen() {
    return this.store.state.open
  }
}
function TW() {
  return new uZ()
}
import { jsxDEV as r8 } from 'react/jsx-dev-runtime'
function ko({ ...Q }) {
  return r8(C2.Root, { 'data-slot': 'popover', ...Q }, void 0, !1, void 0, this)
}
function Mo({ ...Q }) {
  return r8(
    C2.Trigger,
    { 'data-slot': 'popover-trigger', ...Q },
    void 0,
    !1,
    void 0,
    this,
  )
}
function jo({
  className: Q,
  align: Z = 'center',
  alignOffset: J = 0,
  side: z = 'bottom',
  sideOffset: q = 4,
  ...$
}) {
  return r8(
    C2.Portal,
    {
      children: r8(
        C2.Positioner,
        {
          align: Z,
          alignOffset: J,
          side: z,
          sideOffset: q,
          className: 'isolate z-50',
          children: r8(
            C2.Popup,
            {
              'data-slot': 'popover-content',
              className: z0(
                'bg-popover text-popover-foreground data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 ring-foreground/10 flex flex-col gap-2.5 rounded-lg p-2.5 text-sm shadow-md ring-1 duration-100 data-[side=inline-start]:slide-in-from-right-2 data-[side=inline-end]:slide-in-from-left-2 z-50 w-72 origin-(--transform-origin) outline-hidden',
                Q,
              ),
              ...$,
            },
            void 0,
            !1,
            void 0,
            this,
          ),
        },
        void 0,
        !1,
        void 0,
        this,
      ),
    },
    void 0,
    !1,
    void 0,
    this,
  )
}
function Vo({ className: Q, ...Z }) {
  return r8(
    'div',
    {
      'data-slot': 'popover-header',
      className: z0('flex flex-col gap-0.5 text-sm', Q),
      ...Z,
    },
    void 0,
    !1,
    void 0,
    this,
  )
}
function Ao({ className: Q, ...Z }) {
  return r8(
    C2.Title,
    { 'data-slot': 'popover-title', className: z0('font-medium', Q), ...Z },
    void 0,
    !1,
    void 0,
    this,
  )
}
function Oo({ className: Q, ...Z }) {
  return r8(
    C2.Description,
    {
      'data-slot': 'popover-description',
      className: z0('text-muted-foreground', Q),
      ...Z,
    },
    void 0,
    !1,
    void 0,
    this,
  )
}
var h2 = {}
c1(h2, {
  createHandle: () => cW,
  Viewport: () => D3,
  Trigger: () => M3,
  Root: () => k3,
  Provider: () => y3,
  Positioner: () => V3,
  Portal: () => j3,
  Popup: () => A3,
  Handle: () => tZ,
  Arrow: () => O3,
})
import * as x2 from 'react'
import * as cZ from 'react'
var dZ = cZ.createContext(void 0)
dZ.displayName = 'TooltipRootContext'
function u5(Q) {
  let Z = cZ.useContext(dZ)
  if (Z === void 0 && !Q)
    throw Error(
      'Base UI: TooltipRootContext is missing. Tooltip parts must be placed within <Tooltip.Root>.',
    )
  return Z
}
import * as PW from 'react'
import * as EW from 'react-dom'
var cF = {
  ...w2,
  disabled: G0((Q) => Q.disabled),
  instantType: G0((Q) => Q.instantType),
  isInstantPhase: G0((Q) => Q.isInstantPhase),
  trackCursorAxis: G0((Q) => Q.trackCursorAxis),
  disableHoverablePopup: G0((Q) => Q.disableHoverablePopup),
  lastOpenChangeReason: G0((Q) => Q.openChangeReason),
  closeDelay: G0((Q) => Q.closeDelay),
  hasViewport: G0((Q) => Q.hasViewport),
}
class w9 extends M5 {
  constructor(Q) {
    super(
      { ...dF(), ...Q },
      {
        popupRef: PW.createRef(),
        onOpenChange: void 0,
        onOpenChangeComplete: void 0,
        triggerElements: new o1(),
      },
      cF,
    )
  }
  setOpen = (Q, Z) => {
    let J = Z.reason,
      z = J === c.triggerHover,
      q = Q && J === c.triggerFocus,
      $ = !Q && (J === c.triggerPress || J === c.escapeKey)
    if (
      ((Z.preventUnmountOnClose = () => {
        this.set('preventUnmountingOnClose', !0)
      }),
      this.context.onOpenChange?.(Q, Z),
      Z.isCanceled)
    )
      return
    let X = () => {
      let K = { open: Q, openChangeReason: J }
      if (q) K.instantType = 'focus'
      else if ($) K.instantType = 'dismiss'
      else if (J === c.triggerHover) K.instantType = void 0
      let G = Z.trigger?.id ?? null
      if (G || Q)
        ((K.activeTriggerId = G), (K.activeTriggerElement = Z.trigger ?? null))
      this.update(K)
    }
    if (z) EW.flushSync(X)
    else X()
  }
  static useStore(Q, Z) {
    let J = R0(() => {
        return new w9(Z)
      }).current,
      z = Q ?? J,
      q = Z2({ popupStore: z, onOpenChange: z.setOpen })
    return ((z.state.floatingRootContext = q), z)
  }
}
function dF() {
  return {
    ...O2(),
    disabled: !1,
    instantType: void 0,
    isInstantPhase: !1,
    trackCursorAxis: 'none',
    disableHoverablePopup: !1,
    openChangeReason: null,
    closeDelay: 0,
    hasViewport: !1,
  }
}
import { jsx as iF } from 'react/jsx-runtime'
var k3 = B7(function (Z) {
  let {
      disabled: J = !1,
      defaultOpen: z = !1,
      open: q,
      disableHoverablePopup: $ = !1,
      trackCursorAxis: X = 'none',
      actionsRef: K,
      onOpenChange: G,
      onOpenChangeComplete: Y,
      handle: W,
      triggerId: U,
      defaultTriggerId: B = null,
      children: H,
    } = Z,
    N = w9.useStore(W?.store, {
      open: z,
      openProp: q,
      activeTriggerId: B,
      triggerIdProp: U,
    })
  ;(x5(() => {
    if (q === void 0 && N.state.open === !1 && z === !0)
      N.update({ open: !0, activeTriggerId: B })
  }),
    N.useControlledProp('openProp', q),
    N.useControlledProp('triggerIdProp', U),
    N.useContextCallback('onOpenChange', G),
    N.useContextCallback('onOpenChangeComplete', Y))
  let _ = N.useState('open'),
    L = !J && _,
    F = N.useState('activeTriggerId'),
    k = N.useState('payload')
  ;(N.useSyncedValues({ trackCursorAxis: X, disableHoverablePopup: $ }),
    u(() => {
      if (_ && J) N.setOpen(!1, $0(c.disabled))
    }, [_, J, N]),
    N.useSyncedValue('disabled', J),
    V2(N))
  let { forceUnmount: V, transitionStatus: M } = A2(L, N),
    j = N.useState('isInstantPhase'),
    A = N.useState('instantType'),
    w = N.useState('lastOpenChangeReason'),
    O = x2.useRef(null)
  ;(u(() => {
    if ((M === 'ending' && w === c.none) || (M !== 'ending' && j)) {
      if (A !== 'delay') O.current = A
      N.set('instantType', 'delay')
    } else if (O.current !== null)
      (N.set('instantType', O.current), (O.current = null))
  }, [M, j, w, A, N]),
    u(() => {
      if (L) {
        if (F == null) N.set('payload', void 0)
      }
    }, [N, F, L]))
  let S = x2.useCallback(() => {
    N.setOpen(!1, lF(N, c.imperativeAction))
  }, [N])
  x2.useImperativeHandle(K, () => ({ unmount: V, close: S }), [V, S])
  let x = N.useState('floatingRootContext'),
    h = A5(x, { enabled: !J, referencePress: !0 }),
    I = rz(x, { enabled: !J && X !== 'none', axis: X === 'none' ? void 0 : X }),
    {
      getReferenceProps: y,
      getFloatingProps: T,
      getTriggerProps: R,
    } = O1([h, I]),
    v = x2.useMemo(() => y(), [y]),
    P = x2.useMemo(() => R(), [R]),
    D = x2.useMemo(() => T(), [T])
  return (
    N.useSyncedValues({
      activeTriggerProps: v,
      inactiveTriggerProps: P,
      popupProps: D,
    }),
    iF(dZ.Provider, {
      value: N,
      children: typeof H === 'function' ? H({ payload: k }) : H,
    })
  )
})
k3.displayName = 'TooltipRoot'
function lF(Q, Z) {
  let J = $0(Z)
  return (
    (J.preventUnmountOnClose = () => {
      Q.set('preventUnmountingOnClose', !0)
    }),
    J
  )
}
import * as xW from 'react'
import * as iZ from 'react'
var lZ = iZ.createContext(void 0)
lZ.displayName = 'TooltipProviderContext'
function SW() {
  return iZ.useContext(lZ)
}
var IW = (function (Q) {
  return (
    (Q[(Q.popupOpen = w7.popupOpen)] = 'popupOpen'),
    (Q.triggerDisabled = 'data-trigger-disabled'),
    Q
  )
})({})
var CW = 600
var M3 = H4(function (Z, J) {
  let {
      className: z,
      render: q,
      handle: $,
      payload: X,
      disabled: K,
      delay: G,
      closeDelay: Y,
      id: W,
      ...U
    } = Z,
    B = u5(!0),
    H = $?.store ?? B
  if (!H)
    throw Error(
      'Base UI: <Tooltip.Trigger> must be either used within a <Tooltip.Root> component or provided with a handle.',
    )
  let N = L0(W),
    _ = H.useState('isTriggerActive', N),
    L = H.useState('isOpenedByTrigger', N),
    F = H.useState('floatingRootContext'),
    k = xW.useRef(null),
    V = G ?? CW,
    M = Y ?? 0,
    { registerTrigger: j, isMountedByThisTrigger: A } = j2(N, k, H, {
      payload: X,
      closeDelay: M,
    }),
    w = SW(),
    { delayRef: O, isInstantPhase: S, hasProvider: x } = gz(F, { open: L })
  H.useSyncedValue('isInstantPhase', S)
  let h = H.useState('disabled'),
    I = K ?? h,
    y = H.useState('trackCursorAxis'),
    T = H.useState('disableHoverablePopup'),
    R = J2(F, {
      enabled: !I,
      mouseOnly: !0,
      move: !1,
      handleClose: !T && y !== 'both' ? z2() : null,
      restMs() {
        let C = w?.delay,
          a = typeof O.current === 'object' ? O.current.open : void 0,
          p = V
        if (x)
          if (a !== 0) p = G ?? C ?? V
          else p = 0
        return p
      },
      delay() {
        let C = typeof O.current === 'object' ? O.current.close : void 0,
          a = M
        if (Y == null && x) a = C
        return { close: a }
      },
      triggerElementRef: k,
      isActiveTrigger: _,
    }),
    v = k6(F, { enabled: !I }).reference,
    P = { open: L },
    D = H.useState('triggerProps', A)
  return f('button', Z, {
    state: P,
    ref: [J, j, k],
    props: [R, v, D, { id: N, [IW.triggerDisabled]: I ? '' : void 0 }, U],
    stateAttributesMapping: b5,
  })
})
M3.displayName = 'TooltipTrigger'
import * as vW from 'react'
import * as rZ from 'react'
var aZ = rZ.createContext(void 0)
aZ.displayName = 'TooltipPortalContext'
function hW() {
  let Q = rZ.useContext(aZ)
  if (Q === void 0) throw Error('Base UI: <Tooltip.Portal> is missing.')
  return Q
}
import * as sZ from 'react'
import * as bW from 'react-dom'
import { jsxs as rF } from 'react/jsx-runtime'
var g7 = sZ.forwardRef(function (Z, J) {
  let { children: z, container: q, className: $, render: X, ...K } = Z,
    { portalNode: G, portalSubtree: Y } = V4({
      container: q,
      ref: J,
      componentProps: Z,
      elementProps: K,
    })
  if (!Y && !G) return null
  return rF(sZ.Fragment, { children: [Y, G && bW.createPortal(z, G)] })
})
g7.displayName = 'FloatingPortalLite'
import { jsx as RW } from 'react/jsx-runtime'
var j3 = vW.forwardRef(function (Z, J) {
  let { keepMounted: z = !1, ...q } = Z
  if (!(u5().useState('mounted') || z)) return null
  return RW(aZ.Provider, { value: z, children: RW(g7, { ref: J, ...q }) })
})
j3.displayName = 'TooltipPortal'
import * as D9 from 'react'
import * as nZ from 'react'
var oZ = nZ.createContext(void 0)
oZ.displayName = 'TooltipPositionerContext'
function y9() {
  let Q = nZ.useContext(oZ)
  if (Q === void 0)
    throw Error(
      'Base UI: TooltipPositionerContext is missing. TooltipPositioner parts must be placed within <Tooltip.Positioner>.',
    )
  return Q
}
import { jsx as aF } from 'react/jsx-runtime'
var V3 = D9.forwardRef(function (Z, J) {
  let {
      render: z,
      className: q,
      anchor: $,
      positionMethod: X = 'absolute',
      side: K = 'top',
      align: G = 'center',
      sideOffset: Y = 0,
      alignOffset: W = 0,
      collisionBoundary: U = 'clipping-ancestors',
      collisionPadding: B = 5,
      arrowPadding: H = 5,
      sticky: N = !1,
      disableAnchorTracking: _ = !1,
      collisionAvoidance: L = B8,
      ...F
    } = Z,
    k = u5(),
    V = hW(),
    M = k.useState('open'),
    j = k.useState('mounted'),
    A = k.useState('trackCursorAxis'),
    w = k.useState('disableHoverablePopup'),
    O = k.useState('floatingRootContext'),
    S = k.useState('instantType'),
    x = k.useState('transitionStatus'),
    h = k.useState('hasViewport'),
    I = D2({
      anchor: $,
      positionMethod: X,
      floatingRootContext: O,
      mounted: j,
      side: K,
      sideOffset: Y,
      align: G,
      alignOffset: W,
      collisionBoundary: U,
      collisionPadding: B,
      sticky: N,
      arrowPadding: H,
      disableAnchorTracking: _,
      keepMounted: V,
      collisionAvoidance: L,
      adaptiveOrigin: h ? q9 : void 0,
    }),
    y = D9.useMemo(() => {
      let P = {}
      if (!M || A === 'both' || w) P.pointerEvents = 'none'
      return {
        role: 'presentation',
        hidden: !j,
        style: { ...I.positionerStyles, ...P },
      }
    }, [M, A, w, j, I.positionerStyles]),
    T = D9.useMemo(
      () => ({
        open: M,
        side: I.side,
        align: I.align,
        anchorHidden: I.anchorHidden,
        instant: A !== 'none' ? 'tracking-cursor' : S,
      }),
      [M, I.side, I.align, I.anchorHidden, A, S],
    ),
    R = D9.useMemo(
      () => ({
        ...T,
        arrowRef: I.arrowRef,
        arrowStyles: I.arrowStyles,
        arrowUncentered: I.arrowUncentered,
      }),
      [T, I.arrowRef, I.arrowStyles, I.arrowUncentered],
    ),
    v = f('div', Z, {
      state: T,
      props: [y, T1(x), F],
      ref: [J, k.useStateSetter('positionerElement')],
      stateAttributesMapping: v0,
    })
  return aF(oZ.Provider, { value: R, children: v })
})
V3.displayName = 'TooltipPositioner'
import * as fW from 'react'
var sF = { ...v0, ...i0 },
  A3 = fW.forwardRef(function (Z, J) {
    let { className: z, render: q, ...$ } = Z,
      X = u5(),
      { side: K, align: G } = y9(),
      Y = X.useState('open'),
      W = X.useState('instantType'),
      U = X.useState('transitionStatus'),
      B = X.useState('popupProps'),
      H = X.useState('floatingRootContext')
    a0({
      open: Y,
      ref: X.context.popupRef,
      onComplete() {
        if (Y) X.context.onOpenChangeComplete?.(!0)
      },
    })
    let N = X.useState('disabled'),
      _ = X.useState('closeDelay')
    return (
      n2(H, { enabled: !N, closeDelay: _ }),
      f('div', Z, {
        state: { open: Y, side: K, align: G, instant: W, transitionStatus: U },
        ref: [J, X.context.popupRef, X.useStateSetter('popupElement')],
        props: [B, T1(U), $],
        stateAttributesMapping: sF,
      })
    )
  })
A3.displayName = 'TooltipPopup'
import * as gW from 'react'
var O3 = gW.forwardRef(function (Z, J) {
  let { className: z, render: q, ...$ } = Z,
    K = u5().useState('instantType'),
    {
      open: G,
      arrowRef: Y,
      side: W,
      align: U,
      arrowUncentered: B,
      arrowStyles: H,
    } = y9()
  return f('div', Z, {
    state: { open: G, side: W, align: U, uncentered: B, instant: K },
    ref: [J, Y],
    props: [{ style: H, 'aria-hidden': !0 }, $],
    stateAttributesMapping: v0,
  })
})
O3.displayName = 'TooltipArrow'
import * as w3 from 'react'
import { jsx as mW } from 'react/jsx-runtime'
var y3 = function (Z) {
  let { delay: J, closeDelay: z, timeout: q = 400 } = Z,
    $ = w3.useMemo(() => ({ delay: J, closeDelay: z }), [J, z]),
    X = w3.useMemo(() => ({ open: J, close: z }), [J, z])
  return mW(lZ.Provider, {
    value: $,
    children: mW(fz, { delay: X, timeoutMs: q, children: Z.children }),
  })
}
y3.displayName = 'TooltipProvider'
import * as uW from 'react'
var pW = (function (Q) {
  return (
    (Q.popupWidth = '--popup-width'),
    (Q.popupHeight = '--popup-height'),
    Q
  )
})({})
var nF = {
    activationDirection: (Q) => (Q ? { 'data-activation-direction': Q } : null),
  },
  D3 = uW.forwardRef(function (Z, J) {
    let { render: z, className: q, children: $, ...X } = Z,
      K = u5(),
      G = y9(),
      Y = K.useState('instantType'),
      { children: W, state: U } = O9({
        store: K,
        side: G.side,
        cssVars: pW,
        children: $,
      }),
      B = {
        activationDirection: U.activationDirection,
        transitioning: U.transitioning,
        instant: Y,
      }
    return f('div', Z, {
      state: B,
      ref: J,
      props: [X, { children: W }],
      stateAttributesMapping: nF,
    })
  })
D3.displayName = 'TooltipViewport'
class tZ {
  constructor() {
    this.store = new w9()
  }
  open(Q) {
    let Z = Q ? this.store.context.triggerElements.getById(Q) : void 0
    if (Q && !Z)
      throw Error(
        `Base UI: TooltipHandle.open: No trigger found with id "${Q}".`,
      )
    this.store.setOpen(!0, $0(c.imperativeAction, void 0, Z))
  }
  close() {
    this.store.setOpen(!1, $0(c.imperativeAction, void 0, void 0))
  }
  get isOpen() {
    return this.store.state.open
  }
}
function cW() {
  return new tZ()
}
import { jsxDEV as h6 } from 'react/jsx-dev-runtime'
function He({ delay: Q = 0, ...Z }) {
  return h6(
    h2.Provider,
    { 'data-slot': 'tooltip-provider', delay: Q, ...Z },
    void 0,
    !1,
    void 0,
    this,
  )
}
function Ne({ ...Q }) {
  return h6(h2.Root, { 'data-slot': 'tooltip', ...Q }, void 0, !1, void 0, this)
}
function Le({ ...Q }) {
  return h6(
    h2.Trigger,
    { 'data-slot': 'tooltip-trigger', ...Q },
    void 0,
    !1,
    void 0,
    this,
  )
}
function Fe({
  className: Q,
  side: Z = 'top',
  sideOffset: J = 4,
  align: z = 'center',
  alignOffset: q = 0,
  children: $,
  ...X
}) {
  return h6(
    h2.Portal,
    {
      children: h6(
        h2.Positioner,
        {
          align: z,
          alignOffset: q,
          side: Z,
          sideOffset: J,
          className: 'isolate z-50',
          children: h6(
            h2.Popup,
            {
              'data-slot': 'tooltip-content',
              className: z0(
                'data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 rounded-md px-3 py-1.5 text-xs data-[side=inline-start]:slide-in-from-right-2 data-[side=inline-end]:slide-in-from-left-2 bg-foreground text-background z-50 w-fit max-w-xs origin-(--transform-origin)',
                Q,
              ),
              ...X,
              children: [
                $,
                h6(
                  h2.Arrow,
                  {
                    className:
                      'size-2.5 translate-y-[calc(-50%-2px)] rotate-45 rounded-[2px] data-[side=inline-end]:top-1/2! data-[side=inline-end]:-left-1 data-[side=inline-end]:-translate-y-1/2 data-[side=inline-start]:top-1/2! data-[side=inline-start]:-right-1 data-[side=inline-start]:-translate-y-1/2 bg-foreground fill-foreground z-50 data-[side=bottom]:top-1 data-[side=left]:top-1/2! data-[side=left]:-right-1 data-[side=left]:-translate-y-1/2 data-[side=right]:top-1/2! data-[side=right]:-left-1 data-[side=right]:-translate-y-1/2 data-[side=top]:-bottom-2.5',
                  },
                  void 0,
                  !1,
                  void 0,
                  this,
                ),
              ],
            },
            void 0,
            !0,
            void 0,
            this,
          ),
        },
        void 0,
        !1,
        void 0,
        this,
      ),
    },
    void 0,
    !1,
    void 0,
    this,
  )
}
var E1 = {}
c1(E1, {
  createHandle: () => YU,
  Trigger: () => i3,
  SubmenuTrigger: () => l3,
  SubmenuRoot: () => KU,
  Separator: () => f8,
  Root: () => p7,
  RadioItemIndicator: () => u3,
  RadioItem: () => p3,
  RadioGroup: () => m3,
  Positioner: () => g3,
  Portal: () => v3,
  Popup: () => R3,
  LinkItem: () => b3,
  Item: () => h3,
  Handle: () => TJ,
  GroupLabel: () => x3,
  Group: () => C3,
  CheckboxItemIndicator: () => I3,
  CheckboxItem: () => S3,
  Backdrop: () => P3,
  Arrow: () => T3,
})
import * as dW from 'react'
import * as eZ from 'react'
var QJ = eZ.createContext(void 0)
QJ.displayName = 'MenuPositionerContext'
function B5(Q) {
  let Z = eZ.useContext(QJ)
  if (Z === void 0 && !Q)
    throw Error(
      'Base UI: MenuPositionerContext is missing. MenuPositioner parts must be placed within <Menu.Positioner>.',
    )
  return Z
}
import * as ZJ from 'react'
var JJ = ZJ.createContext(void 0)
JJ.displayName = 'MenuRootContext'
function z1(Q) {
  let Z = ZJ.useContext(JJ)
  if (Z === void 0 && !Q)
    throw Error(
      'Base UI: MenuRootContext is missing. Menu parts must be placed within <Menu.Root>.',
    )
  return Z
}
var T3 = dW.forwardRef(function (Z, J) {
  let { className: z, render: q, ...$ } = Z,
    { store: X } = z1(),
    {
      arrowRef: K,
      side: G,
      align: Y,
      arrowUncentered: W,
      arrowStyles: U,
    } = B5(),
    H = { open: X.useState('open'), side: G, align: Y, uncentered: W }
  return f('div', Z, {
    ref: [K, J],
    stateAttributesMapping: v0,
    state: H,
    props: { style: U, 'aria-hidden': !0, ...$ },
  })
})
T3.displayName = 'MenuArrow'
import * as lW from 'react'
import * as zJ from 'react'
var iW = zJ.createContext(void 0)
iW.displayName = 'ContextMenuRootContext'
function b2(Q = !0) {
  let Z = zJ.useContext(iW)
  if (Z === void 0 && !Q)
    throw Error(
      'Base UI: ContextMenuRootContext is missing. ContextMenu parts must be placed within <ContextMenu.Root>.',
    )
  return Z
}
var oF = { ...v0, ...i0 },
  P3 = lW.forwardRef(function (Z, J) {
    let { className: z, render: q, ...$ } = Z,
      { store: X } = z1(),
      K = X.useState('open'),
      G = X.useState('mounted'),
      Y = X.useState('transitionStatus'),
      W = X.useState('lastOpenChangeReason'),
      U = b2(),
      B = { open: K, transitionStatus: Y }
    return f('div', Z, {
      ref: U?.backdropRef ? [J, U.backdropRef] : J,
      state: B,
      stateAttributesMapping: oF,
      props: [
        {
          role: 'presentation',
          hidden: !G,
          style: {
            pointerEvents: W === c.triggerHover ? 'none' : void 0,
            userSelect: 'none',
            WebkitUserSelect: 'none',
          },
        },
        $,
      ],
    })
  })
P3.displayName = 'MenuBackdrop'
import * as KJ from 'react'
import * as qJ from 'react'
var $J = qJ.createContext(void 0)
$J.displayName = 'MenuCheckboxItemContext'
function rW() {
  let Q = qJ.useContext($J)
  if (Q === void 0)
    throw Error(
      'Base UI: MenuCheckboxItemContext is missing. MenuCheckboxItem parts must be placed within <Menu.CheckboxItem>.',
    )
  return Q
}
import * as T9 from 'react'
import * as aW from 'react'
function XJ(Q) {
  let {
      closeOnClick: Z,
      highlighted: J,
      id: z,
      nodeId: q,
      store: $,
      itemRef: X,
      itemMetadata: K,
    } = Q,
    { events: G } = $.useState('floatingTreeRoot'),
    Y = b2(!0),
    W = Y !== void 0
  return aW.useMemo(
    () => ({
      id: z,
      role: 'menuitem',
      tabIndex: J ? 0 : -1,
      onMouseMove(U) {
        if (!q) return
        G.emit('itemhover', { nodeId: q, target: U.currentTarget })
      },
      onClick(U) {
        if (Z) G.emit('close', { domEvent: U, reason: c.itemPress })
      },
      onMouseUp(U) {
        if (Y) {
          let B = Y.initialCursorPointRef.current
          if (
            ((Y.initialCursorPointRef.current = null),
            W &&
              B &&
              Math.abs(U.clientX - B.x) <= 1 &&
              Math.abs(U.clientY - B.y) <= 1)
          )
            return
        }
        if (
          X.current &&
          $.context.allowMouseUpTriggerRef.current &&
          (!W || U.button === 2)
        ) {
          if (!K || K.type === 'regular-item') X.current.click()
        }
      },
    }),
    [Z, J, z, G, q, $, X, Y, W, K],
  )
}
var P9 = { type: 'regular-item' }
function a8(Q) {
  let {
      closeOnClick: Z,
      disabled: J = !1,
      highlighted: z,
      id: q,
      store: $,
      nativeButton: X,
      itemMetadata: K,
      nodeId: G,
    } = Q,
    Y = T9.useRef(null),
    { getButtonProps: W, buttonRef: U } = Q1({
      disabled: J,
      focusableWhenDisabled: !0,
      native: X,
    }),
    B = XJ({
      closeOnClick: Z,
      highlighted: z,
      id: q,
      nodeId: G,
      store: $,
      itemRef: Y,
      itemMetadata: K,
    }),
    H = T9.useCallback(
      (_) => {
        return q1(
          B,
          {
            onMouseEnter() {
              if (K.type !== 'submenu-trigger') return
              K.setActive()
            },
            onKeyUp(L) {
              if (L.key === ' ' && $.context.typingRef.current)
                L.preventBaseUIHandler()
            },
          },
          _,
          W,
        )
      },
      [B, W, $, K],
    ),
    N = Y1(Y, U)
  return T9.useMemo(() => ({ getItemProps: H, itemRef: N }), [H, N])
}
var E3 = (function (Q) {
  return (
    (Q.checked = 'data-checked'),
    (Q.unchecked = 'data-unchecked'),
    (Q.disabled = 'data-disabled'),
    (Q.highlighted = 'data-highlighted'),
    Q
  )
})({})
var s8 = {
  checked(Q) {
    if (Q) return { [E3.checked]: '' }
    return { [E3.unchecked]: '' }
  },
  ...i0,
}
import { jsx as tF } from 'react/jsx-runtime'
var S3 = KJ.forwardRef(function (Z, J) {
  let {
      render: z,
      className: q,
      id: $,
      label: X,
      nativeButton: K = !1,
      disabled: G = !1,
      closeOnClick: Y = !1,
      checked: W,
      defaultChecked: U,
      onCheckedChange: B,
      ...H
    } = Z,
    N = g1({ label: X }),
    _ = B5(!0),
    L = L0($),
    { store: F } = z1(),
    k = F.useState('isActive', N.index),
    V = F.useState('itemProps'),
    [M, j] = _1({
      controlled: W,
      default: U ?? !1,
      name: 'MenuCheckboxItem',
      state: 'checked',
    }),
    { getItemProps: A, itemRef: w } = a8({
      closeOnClick: Y,
      disabled: G,
      highlighted: k,
      id: L,
      store: F,
      nativeButton: K,
      nodeId: _?.nodeId,
      itemMetadata: P9,
    }),
    O = KJ.useMemo(
      () => ({ disabled: G, highlighted: k, checked: M }),
      [G, k, M],
    ),
    S = m((h) => {
      let I = {
        ...$0(c.itemPress, h.nativeEvent),
        preventUnmountOnClose: () => {},
      }
      if ((B?.(!M, I), I.isCanceled)) return
      j((y) => !y)
    }),
    x = f('div', Z, {
      state: O,
      stateAttributesMapping: s8,
      props: [
        V,
        { role: 'menuitemcheckbox', 'aria-checked': M, onClick: S },
        H,
        A,
      ],
      ref: [w, J, N.ref],
    })
  return tF($J.Provider, { value: O, children: x })
})
S3.displayName = 'MenuCheckboxItem'
import * as GJ from 'react'
var I3 = GJ.forwardRef(function (Z, J) {
  let { render: z, className: q, keepMounted: $ = !1, ...X } = Z,
    K = rW(),
    G = GJ.useRef(null),
    { transitionStatus: Y, setMounted: W } = F1(K.checked)
  a0({
    open: K.checked,
    ref: G,
    onComplete() {
      if (!K.checked) W(!1)
    },
  })
  let U = {
    checked: K.checked,
    disabled: K.disabled,
    highlighted: K.highlighted,
    transitionStatus: Y,
  }
  return f('span', Z, {
    state: U,
    ref: [J, G],
    stateAttributesMapping: s8,
    props: { 'aria-hidden': !0, ...X },
    enabled: $ || K.checked,
  })
})
I3.displayName = 'MenuCheckboxItemIndicator'
import * as E9 from 'react'
import * as YJ from 'react'
var WJ = YJ.createContext(void 0)
WJ.displayName = 'MenuGroupContext'
function sW() {
  let Q = YJ.useContext(WJ)
  if (Q === void 0)
    throw Error(
      'Base UI: MenuGroupRootContext is missing. Menu group parts must be used within <Menu.Group>.',
    )
  return Q
}
import { jsx as eF } from 'react/jsx-runtime'
var C3 = E9.forwardRef(function (Z, J) {
  let { render: z, className: q, ...$ } = Z,
    [X, K] = E9.useState(void 0),
    G = E9.useMemo(() => ({ setLabelId: K }), [K]),
    Y = f('div', Z, {
      ref: J,
      props: { role: 'group', 'aria-labelledby': X, ...$ },
    })
  return eF(WJ.Provider, { value: G, children: Y })
})
C3.displayName = 'MenuGroup'
import * as nW from 'react'
var x3 = nW.forwardRef(function (Z, J) {
  let { className: z, render: q, id: $, ...X } = Z,
    K = L0($),
    { setLabelId: G } = sW()
  return (
    u(() => {
      return (
        G(K),
        () => {
          G(void 0)
        }
      )
    }, [G, K]),
    f('div', Z, { ref: J, props: { id: K, role: 'presentation', ...X } })
  )
})
x3.displayName = 'MenuGroupLabel'
import * as oW from 'react'
var h3 = oW.forwardRef(function (Z, J) {
  let {
      render: z,
      className: q,
      id: $,
      label: X,
      nativeButton: K = !1,
      disabled: G = !1,
      closeOnClick: Y = !0,
      ...W
    } = Z,
    U = g1({ label: X }),
    B = B5(!0),
    H = L0($),
    { store: N } = z1(),
    _ = N.useState('isActive', U.index),
    L = N.useState('itemProps'),
    { getItemProps: F, itemRef: k } = a8({
      closeOnClick: Y,
      disabled: G,
      highlighted: _,
      id: H,
      store: N,
      nativeButton: K,
      nodeId: B?.nodeId,
      itemMetadata: P9,
    })
  return f('div', Z, {
    state: { disabled: G, highlighted: _ },
    props: [L, W, F],
    ref: [k, J, U.ref],
  })
})
h3.displayName = 'MenuItem'
import * as S9 from 'react'
var b3 = S9.forwardRef(function (Z, J) {
  let {
      render: z,
      className: q,
      id: $,
      label: X,
      closeOnClick: K = !1,
      ...G
    } = Z,
    Y = S9.useRef(null),
    W = g1({ label: X }),
    B = B5(!0)?.nodeId,
    H = L0($),
    { store: N } = z1(),
    _ = N.useState('isActive', W.index),
    L = N.useState('itemProps'),
    F = XJ({
      closeOnClick: K,
      highlighted: _,
      id: H,
      nodeId: B,
      store: N,
      itemRef: Y,
    }),
    k = S9.useMemo(() => ({ highlighted: _ }), [_])
  return f('a', Z, { state: k, props: [L, G, F], ref: [Y, J, W.ref] })
})
b3.displayName = 'MenuLinkItem'
import * as UJ from 'react'
import { jsx as Qk } from 'react/jsx-runtime'
var Zk = { ...v0, ...i0 },
  R3 = UJ.forwardRef(function (Z, J) {
    let { render: z, className: q, finalFocus: $, ...X } = Z,
      { store: K } = z1(),
      { side: G, align: Y } = B5(),
      W = R8(!0) != null,
      U = K.useState('open'),
      B = K.useState('transitionStatus'),
      H = K.useState('popupProps'),
      N = K.useState('mounted'),
      _ = K.useState('instantType'),
      L = K.useState('activeTriggerElement'),
      F = K.useState('parent'),
      k = K.useState('lastOpenChangeReason'),
      V = K.useState('rootId'),
      M = K.useState('floatingRootContext'),
      j = K.useState('floatingTreeRoot'),
      A = K.useState('closeDelay'),
      w = K.useState('activeTriggerElement'),
      O = F.type === 'context-menu'
    ;(a0({
      open: U,
      ref: K.context.popupRef,
      onComplete() {
        if (U) K.context.onOpenChangeComplete?.(!0)
      },
    }),
      UJ.useEffect(() => {
        function T(R) {
          K.setOpen(!1, $0(R.reason, R.domEvent))
        }
        return (
          j.events.on('close', T),
          () => {
            j.events.off('close', T)
          }
        )
      }, [j.events, K]))
    let S = K.useState('hoverEnabled'),
      x = K.useState('disabled')
    n2(M, { enabled: S && !x && !O && F.type !== 'menubar', closeDelay: A })
    let h = {
        transitionStatus: B,
        side: G,
        align: Y,
        open: U,
        nested: F.type === 'menu',
        instant: _,
      },
      I = f('div', Z, {
        state: h,
        ref: [J, K.context.popupRef],
        stateAttributesMapping: Zk,
        props: [
          H,
          {
            onKeyDown(T) {
              if (W && L2.has(T.key)) T.stopPropagation()
            },
          },
          T1(B),
          X,
          { 'data-rootownerid': V },
        ],
      }),
      y = F.type === void 0 || O
    if (L || (F.type === 'menubar' && k !== c.outsidePress)) y = !0
    return Qk(s2, {
      context: M,
      modal: O,
      disabled: !N,
      returnFocus: $ === void 0 ? y : $,
      initialFocus: F.type !== 'menu',
      restoreFocus: !0,
      externalTree: F.type !== 'menubar' ? j : void 0,
      previousFocusableElement: w,
      nextFocusableElement:
        F.type === void 0 ? K.context.triggerFocusTargetRef : void 0,
      beforeContentFocusGuardRef:
        F.type === void 0 ? K.context.beforeContentFocusGuardRef : void 0,
      children: I,
    })
  })
R3.displayName = 'MenuPopup'
import * as QU from 'react'
import * as BJ from 'react'
var _J = BJ.createContext(void 0)
_J.displayName = 'MenuPortalContext'
function tW() {
  let Q = BJ.useContext(_J)
  if (Q === void 0) throw Error('Base UI: <Menu.Portal> is missing.')
  return Q
}
import { jsx as eW } from 'react/jsx-runtime'
var v3 = QU.forwardRef(function (Z, J) {
  let { keepMounted: z = !1, ...q } = Z,
    { store: $ } = z1()
  if (!($.useState('mounted') || z)) return null
  return eW(_J.Provider, { value: z, children: eW(M2, { ref: J, ...q }) })
})
v3.displayName = 'MenuPortal'
import * as R2 from 'react'
import { jsx as f3, jsxs as Jk } from 'react/jsx-runtime'
var g3 = R2.forwardRef(function (Z, J) {
  let {
      anchor: z,
      positionMethod: q = 'absolute',
      className: $,
      render: X,
      side: K,
      align: G,
      sideOffset: Y = 0,
      alignOffset: W = 0,
      collisionBoundary: U = 'clipping-ancestors',
      collisionPadding: B = 5,
      arrowPadding: H = 5,
      sticky: N = !1,
      disableAnchorTracking: _ = !1,
      collisionAvoidance: L = zQ,
      ...F
    } = Z,
    { store: k } = z1(),
    V = tW(),
    M = b2(!0),
    j = k.useState('parent'),
    A = k.useState('floatingRootContext'),
    w = k.useState('floatingTreeRoot'),
    O = k.useState('mounted'),
    S = k.useState('open'),
    x = k.useState('modal'),
    h = k.useState('activeTriggerElement'),
    I = k.useState('transitionStatus'),
    y = k.useState('lastOpenChangeReason'),
    T = k.useState('floatingNodeId'),
    R = k.useState('floatingParentNodeId'),
    v = z,
    P = Y,
    D = W,
    E = G,
    C = L
  if (j.type === 'context-menu') {
    if (
      ((v = z ?? j.context?.anchor), (E = E ?? 'start'), !K && E !== 'center')
    )
      ((D = Z.alignOffset ?? 2), (P = Z.sideOffset ?? -5))
  }
  let a = K,
    p = E
  if (j.type === 'menu')
    ((a = a ?? 'inline-end'),
      (p = p ?? 'start'),
      (C = Z.collisionAvoidance ?? B8))
  else if (j.type === 'menubar') ((a = a ?? 'bottom'), (p = p ?? 'start'))
  let Q0 = j.type === 'context-menu',
    g = D2({
      anchor: v,
      floatingRootContext: A,
      positionMethod: M ? 'fixed' : q,
      mounted: O,
      side: a,
      sideOffset: P,
      align: p,
      alignOffset: D,
      arrowPadding: Q0 ? 0 : H,
      collisionBoundary: U,
      collisionPadding: B,
      sticky: N,
      nodeId: T,
      keepMounted: V,
      disableAnchorTracking: _,
      collisionAvoidance: C,
      shiftCrossAxis: Q0 && !('side' in C && C.side === 'flip'),
      externalTree: w,
    }),
    Z0 = R2.useMemo(() => {
      let K0 = {}
      if (!S) K0.pointerEvents = 'none'
      return {
        role: 'presentation',
        hidden: !O,
        style: { ...g.positionerStyles, ...K0 },
      }
    }, [S, O, g.positionerStyles])
  ;(R2.useEffect(() => {
    function K0(b) {
      if (b.open) {
        if (b.parentNodeId === T) k.set('hoverEnabled', !1)
        if (
          b.nodeId !== T &&
          b.parentNodeId === k.select('floatingParentNodeId')
        )
          k.setOpen(!1, $0(c.siblingOpen))
      }
    }
    return (
      w.events.on('menuopenchange', K0),
      () => {
        w.events.off('menuopenchange', K0)
      }
    )
  }, [k, w.events, T]),
    R2.useEffect(() => {
      if (k.select('floatingParentNodeId') == null) return
      function K0(b) {
        if (b.open || b.nodeId !== k.select('floatingParentNodeId')) return
        let r = b.reason ?? c.siblingOpen
        k.setOpen(!1, $0(r))
      }
      return (
        w.events.on('menuopenchange', K0),
        () => {
          w.events.off('menuopenchange', K0)
        }
      )
    }, [w.events, k]),
    R2.useEffect(() => {
      function K0(b) {
        if (!S || b.nodeId !== k.select('floatingParentNodeId')) return
        if (b.target && h && h !== b.target) k.setOpen(!1, $0(c.siblingOpen))
      }
      return (
        w.events.on('itemhover', K0),
        () => {
          w.events.off('itemhover', K0)
        }
      )
    }, [w.events, S, h, k]),
    R2.useEffect(() => {
      let K0 = {
        open: S,
        nodeId: T,
        parentNodeId: R,
        reason: k.select('lastOpenChangeReason'),
      }
      w.events.emit('menuopenchange', K0)
    }, [w.events, S, k, T, R]))
  let i = {
      open: S,
      side: g.side,
      align: g.align,
      anchorHidden: g.anchorHidden,
      nested: j.type === 'menu',
    },
    X0 = R2.useMemo(
      () => ({
        side: g.side,
        align: g.align,
        arrowRef: g.arrowRef,
        arrowUncentered: g.arrowUncentered,
        arrowStyles: g.arrowStyles,
        nodeId: g.context.nodeId,
      }),
      [
        g.side,
        g.align,
        g.arrowRef,
        g.arrowUncentered,
        g.arrowStyles,
        g.context.nodeId,
      ],
    ),
    Y0 = f('div', Z, {
      state: i,
      stateAttributesMapping: v0,
      ref: [J, k.useStateSetter('positionerElement')],
      props: [Z0, T1(I), F],
    }),
    J0 =
      O &&
      j.type !== 'menu' &&
      ((j.type !== 'menubar' && x && y !== c.triggerHover) ||
        (j.type === 'menubar' && j.context.modal)),
    U0 = null
  if (j.type === 'menubar') U0 = j.context.contentElement
  else if (j.type === void 0) U0 = h
  return Jk(QJ.Provider, {
    value: X0,
    children: [
      J0 &&
        f3(o2, {
          ref:
            j.type === 'context-menu' || j.type === 'nested-context-menu'
              ? j.context.internalBackdropRef
              : null,
          inert: R5(!S),
          cutout: U0,
        }),
      f3(H7, {
        id: T,
        children: f3(F2, {
          elementsRef: k.context.itemDomElements,
          labelsRef: k.context.itemLabels,
          children: Y0,
        }),
      }),
    ],
  })
})
g3.displayName = 'MenuPositioner'
import * as I9 from 'react'
import * as HJ from 'react'
var NJ = HJ.createContext(void 0)
NJ.displayName = 'MenuRadioGroupContext'
function ZU() {
  let Q = HJ.useContext(NJ)
  if (Q === void 0)
    throw Error(
      'Base UI: MenuRadioGroupContext is missing. MenuRadioGroup parts must be placed within <Menu.RadioGroup>.',
    )
  return Q
}
import { jsx as zk } from 'react/jsx-runtime'
var m3 = I9.memo(
  I9.forwardRef(function (Z, J) {
    let {
        render: z,
        className: q,
        value: $,
        defaultValue: X,
        onValueChange: K,
        disabled: G = !1,
        ...Y
      } = Z,
      [W, U] = _1({ controlled: $, default: X, name: 'MenuRadioGroup' }),
      B = m(K),
      H = m((F, k) => {
        if ((B?.(F, k), k.isCanceled)) return
        U(F)
      }),
      _ = f('div', Z, {
        state: { disabled: G },
        ref: J,
        props: { role: 'group', 'aria-disabled': G || void 0, ...Y },
      }),
      L = I9.useMemo(() => ({ value: W, setValue: H, disabled: G }), [W, H, G])
    return zk(NJ.Provider, { value: L, children: _ })
  }),
)
m3.displayName = 'MenuRadioGroup'
import * as kJ from 'react'
import * as LJ from 'react'
var FJ = LJ.createContext(void 0)
FJ.displayName = 'MenuRadioItemContext'
function JU() {
  let Q = LJ.useContext(FJ)
  if (Q === void 0)
    throw Error(
      'Base UI: MenuRadioItemContext is missing. MenuRadioItem parts must be placed within <Menu.RadioItem>.',
    )
  return Q
}
import { jsx as qk } from 'react/jsx-runtime'
var p3 = kJ.forwardRef(function (Z, J) {
  let {
      render: z,
      className: q,
      id: $,
      label: X,
      nativeButton: K = !1,
      disabled: G = !1,
      closeOnClick: Y = !1,
      value: W,
      ...U
    } = Z,
    B = g1({ label: X }),
    H = B5(!0),
    N = L0($),
    { store: _ } = z1(),
    L = _.useState('isActive', B.index),
    F = _.useState('itemProps'),
    { value: k, setValue: V, disabled: M } = ZU(),
    j = M || G,
    A = k === W,
    { getItemProps: w, itemRef: O } = a8({
      closeOnClick: Y,
      disabled: j,
      highlighted: L,
      id: N,
      store: _,
      nativeButton: K,
      nodeId: H?.nodeId,
      itemMetadata: P9,
    }),
    S = kJ.useMemo(
      () => ({ disabled: j, highlighted: L, checked: A }),
      [j, L, A],
    ),
    x = m((I) => {
      let y = {
        ...$0(c.itemPress, I.nativeEvent),
        preventUnmountOnClose: () => {},
      }
      V(W, y)
    }),
    h = f('div', Z, {
      state: S,
      stateAttributesMapping: s8,
      props: [
        F,
        { role: 'menuitemradio', 'aria-checked': A, onClick: x },
        U,
        w,
      ],
      ref: [O, J, B.ref],
    })
  return qk(FJ.Provider, { value: S, children: h })
})
p3.displayName = 'MenuRadioItem'
import * as MJ from 'react'
var u3 = MJ.forwardRef(function (Z, J) {
  let { render: z, className: q, keepMounted: $ = !1, ...X } = Z,
    K = JU(),
    G = MJ.useRef(null),
    { transitionStatus: Y, setMounted: W } = F1(K.checked)
  a0({
    open: K.checked,
    ref: G,
    onComplete() {
      if (!K.checked) W(!1)
    },
  })
  let U = {
    checked: K.checked,
    disabled: K.disabled,
    highlighted: K.highlighted,
    transitionStatus: Y,
  }
  return f('span', Z, {
    state: U,
    stateAttributesMapping: s8,
    ref: [J, G],
    props: { 'aria-hidden': !0, ...X },
    enabled: $ || K.checked,
  })
})
u3.displayName = 'MenuRadioItemIndicator'
import * as N1 from 'react'
import * as jJ from 'react'
var zU = jJ.createContext(null)
zU.displayName = 'MenubarContext'
function VJ(Q) {
  let Z = jJ.useContext(zU)
  if (Z === null && !Q)
    throw Error(
      'Base UI: MenubarContext is missing. Menubar parts must be placed within <Menubar>.',
    )
  return Z
}
import * as m7 from 'react'
var $k = {
  ...w2,
  disabled: G0((Q) =>
    Q.parent.type === 'menubar'
      ? Q.parent.context.disabled || Q.disabled
      : Q.disabled,
  ),
  modal: G0(
    (Q) =>
      (Q.parent.type === void 0 || Q.parent.type === 'context-menu') &&
      (Q.modal ?? !0),
  ),
  allowMouseEnter: G0((Q) => Q.allowMouseEnter),
  stickIfOpen: G0((Q) => Q.stickIfOpen),
  parent: G0((Q) => Q.parent),
  rootId: G0((Q) => {
    if (Q.parent.type === 'menu') return Q.parent.store.select('rootId')
    return Q.parent.type !== void 0 ? Q.parent.context.rootId : Q.rootId
  }),
  activeIndex: G0((Q) => Q.activeIndex),
  isActive: G0((Q, Z) => Q.activeIndex === Z),
  hoverEnabled: G0((Q) => Q.hoverEnabled),
  instantType: G0((Q) => Q.instantType),
  lastOpenChangeReason: G0((Q) => Q.openChangeReason),
  floatingTreeRoot: G0((Q) => {
    if (Q.parent.type === 'menu')
      return Q.parent.store.select('floatingTreeRoot')
    return Q.floatingTreeRoot
  }),
  floatingNodeId: G0((Q) => Q.floatingNodeId),
  floatingParentNodeId: G0((Q) => Q.floatingParentNodeId),
  itemProps: G0((Q) => Q.itemProps),
  closeDelay: G0((Q) => Q.closeDelay),
  keyboardEventRelay: G0((Q) => {
    if (Q.keyboardEventRelay) return Q.keyboardEventRelay
    if (Q.parent.type === 'menu')
      return Q.parent.store.select('keyboardEventRelay')
    return
  }),
}
class C9 extends M5 {
  constructor(Q) {
    super(
      { ...Xk(), ...Q },
      {
        positionerRef: m7.createRef(),
        popupRef: m7.createRef(),
        typingRef: { current: !1 },
        itemDomElements: { current: [] },
        itemLabels: { current: [] },
        allowMouseUpTriggerRef: { current: !1 },
        triggerFocusTargetRef: m7.createRef(),
        beforeContentFocusGuardRef: m7.createRef(),
        onOpenChangeComplete: void 0,
        triggerElements: new o1(),
      },
      $k,
    )
    this.unsubscribeParentListener = this.observe('parent', (Z) => {
      if ((this.unsubscribeParentListener?.(), Z.type === 'menu')) {
        ;((this.unsubscribeParentListener = Z.store.subscribe(() => {
          this.notifyAll()
        })),
          (this.context.allowMouseUpTriggerRef =
            Z.store.context.allowMouseUpTriggerRef))
        return
      }
      if (Z.type !== void 0)
        this.context.allowMouseUpTriggerRef = Z.context.allowMouseUpTriggerRef
      this.unsubscribeParentListener = null
    })
  }
  setOpen(Q, Z) {
    this.state.floatingRootContext.context.events.emit('setOpen', {
      open: Q,
      eventDetails: Z,
    })
  }
  static useStore(Q, Z) {
    let J = R0(() => {
      return new C9(Z)
    }).current
    return Q ?? J
  }
  unsubscribeParentListener = null
}
function Xk() {
  return {
    ...O2(),
    disabled: !1,
    modal: !0,
    allowMouseEnter: !1,
    stickIfOpen: !0,
    parent: { type: void 0 },
    rootId: void 0,
    activeIndex: null,
    hoverEnabled: !0,
    instantType: void 0,
    openChangeReason: null,
    floatingTreeRoot: new _6(),
    floatingNodeId: void 0,
    floatingParentNodeId: null,
    itemProps: S0,
    keyboardEventRelay: void 0,
    closeDelay: 0,
  }
}
import * as AJ from 'react'
var OJ = AJ.createContext(void 0)
OJ.displayName = 'MenuSubmenuRootContext'
function wJ() {
  return AJ.useContext(OJ)
}
import { jsx as qU } from 'react/jsx-runtime'
var p7 = B7(function (Z) {
  let {
      children: J,
      open: z,
      onOpenChange: q,
      onOpenChangeComplete: $,
      defaultOpen: X = !1,
      disabled: K = !1,
      modal: G,
      loopFocus: Y = !0,
      orientation: W = 'vertical',
      actionsRef: U,
      closeParentOnEsc: B = !1,
      handle: H,
      triggerId: N,
      defaultTriggerId: _ = null,
      highlightItemOnHover: L = !0,
    } = Z,
    F = b2(!0),
    k = z1(!0),
    V = VJ(!0),
    M = wJ(),
    j = N1.useMemo(() => {
      if (M && k) return { type: 'menu', store: k.store }
      if (V) return { type: 'menubar', context: V }
      if (F && !k) return { type: 'context-menu', context: F }
      return { type: void 0 }
    }, [F, k, V, M]),
    A = C9.useStore(H?.store, {
      open: X,
      openProp: z,
      activeTriggerId: _,
      triggerIdProp: N,
      parent: j,
    })
  ;(x5(() => {
    if (z === void 0 && A.state.open === !1 && X === !0)
      A.update({ open: !0, activeTriggerId: _ })
  }),
    A.useControlledProp('openProp', z),
    A.useControlledProp('triggerIdProp', N),
    A.useContextCallback('onOpenChangeComplete', $))
  let w = A.useState('floatingTreeRoot'),
    O = H6(w),
    S = C1()
  u(() => {
    if (F && !k)
      A.update({
        parent: { type: 'context-menu', context: F },
        floatingNodeId: O,
        floatingParentNodeId: S,
      })
    else if (k) A.update({ floatingNodeId: O, floatingParentNodeId: S })
  }, [F, k, O, S, A])
  let x = A.useState('open'),
    h = A.useState('activeTriggerElement'),
    I = A.useState('positionerElement'),
    y = A.useState('hoverEnabled'),
    T = A.useState('modal'),
    R = A.useState('disabled'),
    v = A.useState('lastOpenChangeReason'),
    P = A.useState('parent'),
    D = A.useState('activeIndex'),
    E = A.useState('payload'),
    C = A.useState('floatingParentNodeId'),
    a = N1.useRef(null),
    p = C != null,
    Q0
  if (P.type !== void 0 && G !== void 0)
    console.warn(
      'Base UI: The `modal` prop is not supported on nested menus. It will be ignored.',
    )
  A.useSyncedValues({
    disabled: K,
    modal: P.type === void 0 ? G : void 0,
    rootId: q5(),
  })
  let { openMethod: g, triggerProps: Z0, reset: i } = C8(x)
  V2(A)
  let { forceUnmount: X0 } = A2(x, A, () => {
      ;(A.update({ allowMouseEnter: !1, stickIfOpen: !0 }), i())
    }),
    Y0 = N1.useRef(P.type !== 'context-menu'),
    J0 = c0()
  ;(N1.useEffect(() => {
    if (!x) a.current = null
    if (P.type !== 'context-menu') return
    if (!x) {
      ;(J0.clear(), (Y0.current = !1))
      return
    }
    J0.start(500, () => {
      Y0.current = !0
    })
  }, [J0, x, P.type]),
    h8(x && T && v !== c.triggerHover && g !== 'touch', I),
    u(() => {
      if (!x && !y) A.set('hoverEnabled', !0)
    }, [x, y, A]))
  let U0 = N1.useRef(!0),
    K0 = c0(),
    b = m((D0, B0) => {
      let E0 = B0.reason
      if (x === D0 && B0.trigger === h && v === E0) return
      if (
        ((B0.preventUnmountOnClose = () => {
          A.set('preventUnmountingOnClose', !0)
        }),
        !D0 && B0.trigger == null)
      )
        B0.trigger = h ?? void 0
      if ((q?.(D0, B0), B0.isCanceled)) return
      let w0 = { open: D0, nativeEvent: B0.event, reason: B0.reason, nested: p }
      Q0?.emit('openchange', w0)
      let g0 = B0.event
      if (
        D0 === !1 &&
        g0?.type === 'click' &&
        g0.pointerType === 'touch' &&
        !U0.current
      )
        return
      if (!D0 && D !== null) {
        let p0 = A.context.itemDomElements.current[D]
        queueMicrotask(() => {
          p0?.setAttribute('tabindex', '-1')
        })
      }
      if (D0 && E0 === c.triggerFocus)
        ((U0.current = !1),
          K0.start(300, () => {
            U0.current = !0
          }))
      else ((U0.current = !0), K0.clear())
      let e0 =
          (E0 === c.triggerPress || E0 === c.itemPress) &&
          g0.detail === 0 &&
          g0?.isTrusted,
        d0 = !D0 && (E0 === c.escapeKey || E0 == null),
        x0 = { open: D0, openChangeReason: E0 }
      a.current = B0.event ?? null
      let I0 = B0.trigger?.id ?? null
      if (I0 || D0)
        ((x0.activeTriggerId = I0),
          (x0.activeTriggerElement = B0.trigger ?? null))
      if (
        (A.update(x0),
        P.type === 'menubar' &&
          (E0 === c.triggerFocus ||
            E0 === c.focusOut ||
            E0 === c.triggerHover ||
            E0 === c.listNavigation ||
            E0 === c.siblingOpen))
      )
        A.set('instantType', 'group')
      else if (e0 || d0) A.set('instantType', e0 ? 'click' : 'dismiss')
      else A.set('instantType', void 0)
    }),
    r = N1.useCallback(
      (D0) => {
        let B0 = $0(D0)
        return (
          (B0.preventUnmountOnClose = () => {
            A.set('preventUnmountingOnClose', !0)
          }),
          B0
        )
      },
      [A],
    ),
    t = N1.useCallback(() => {
      A.setOpen(!1, r(c.imperativeAction))
    }, [A, r])
  N1.useImperativeHandle(U, () => ({ unmount: X0, close: t }), [X0, t])
  let e
  if (P.type === 'context-menu') e = P.context
  ;(N1.useImperativeHandle(e?.positionerRef, () => I, [I]),
    N1.useImperativeHandle(e?.actionsRef, () => ({ setOpen: b }), [b]))
  let s = Z2({ popupStore: A, onOpenChange: b })
  ;((Q0 = s.context.events),
    N1.useEffect(() => {
      let D0 = ({ open: B0, eventDetails: E0 }) => b(B0, E0)
      return (
        Q0.on('setOpen', D0),
        () => {
          Q0?.off('setOpen', D0)
        }
      )
    }, [Q0, b]))
  let d = A5(s, {
      enabled: !R,
      bubbles: { escapeKey: B && P.type === 'menu' },
      outsidePress() {
        if (P.type !== 'context-menu' || a.current?.type === 'contextmenu')
          return !0
        return Y0.current
      },
      externalTree: p ? w : void 0,
    }),
    o = V6(s, { role: 'menu' }),
    l = y1(),
    q0 = N1.useCallback(
      (D0) => {
        if (A.select('activeIndex') === D0) return
        A.set('activeIndex', D0)
      },
      [A],
    ),
    n = V7(s, {
      enabled: !R,
      listRef: A.context.itemDomElements,
      activeIndex: D,
      nested: P.type !== void 0,
      loopFocus: Y,
      orientation: W,
      parentOrientation: P.type === 'menubar' ? P.context.orientation : void 0,
      rtl: l === 'rtl',
      disabledIndices: z5,
      onNavigate: q0,
      openOnArrowKeyDown: P.type !== 'context-menu',
      externalTree: p ? w : void 0,
      focusItemOnHover: L,
    }),
    _0 = N1.useCallback(
      (D0) => {
        A.context.typingRef.current = D0
      },
      [A],
    ),
    H0 = A7(s, {
      listRef: A.context.itemLabels,
      activeIndex: D,
      resetMs: u$,
      onMatch: (D0) => {
        if (x && D0 !== D) A.set('activeIndex', D0)
      },
      onTypingChange: _0,
    }),
    {
      getReferenceProps: W0,
      getFloatingProps: O0,
      getItemProps: f0,
      getTriggerProps: A0,
    } = O1([d, o, n, H0]),
    T0 = N1.useMemo(() => {
      let D0 = q1(
        W0(),
        {
          onMouseMove() {
            A.set('allowMouseEnter', !0)
          },
        },
        Z0,
      )
      return (delete D0.role, D0)
    }, [W0, A, Z0]),
    y0 = N1.useMemo(() => {
      let D0 = A0()
      if (!D0) return D0
      let B0 = q1(D0, Z0)
      return (delete B0.role, delete B0['aria-controls'], B0)
    }, [A0, Z0]),
    P0 = N1.useMemo(
      () =>
        O0({
          onMouseMove() {
            if ((A.set('allowMouseEnter', !0), P.type === 'menu'))
              A.set('hoverEnabled', !1)
          },
          onClick() {
            if (A.select('hoverEnabled')) A.set('hoverEnabled', !1)
          },
          onKeyDown(D0) {
            let B0 = A.select('keyboardEventRelay')
            if (B0 && !D0.isPropagationStopped()) B0(D0)
          },
        }),
      [O0, P.type, A],
    ),
    b0 = N1.useMemo(() => f0(), [f0])
  A.useSyncedValues({
    floatingRootContext: s,
    activeTriggerProps: T0,
    inactiveTriggerProps: y0,
    popupProps: P0,
    itemProps: b0,
  })
  let t0 = N1.useMemo(() => ({ store: A, parent: j }), [A, j]),
    L1 = qU(JJ.Provider, {
      value: t0,
      children: typeof J === 'function' ? J({ payload: E }) : J,
    })
  if (P.type === void 0 || P.type === 'context-menu')
    return qU(N7, { externalTree: w, children: L1 })
  return L1
})
p7.displayName = 'MenuRoot'
import * as XU from 'react'
import { jsx as $U } from 'react/jsx-runtime'
function KU(Q) {
  let Z = z1().store,
    J = XU.useMemo(() => ({ parentMenu: Z }), [Z])
  return $U(OJ.Provider, { value: J, children: $U(p7, { ...Q }) })
}
import * as r1 from 'react'
import * as d3 from 'react-dom'
function c3(Q) {
  if (m0(Q) && Q.hasAttribute('data-rootownerid'))
    return Q.getAttribute('data-rootownerid') ?? void 0
  if (F5(Q)) return
  return c3(N5(Q))
}
import * as yJ from 'react'
function GU(Q) {
  let { enabled: Z = !0, mouseDownAction: J, open: z } = Q,
    q = yJ.useRef(!1)
  return yJ.useMemo(() => {
    if (!Z) return S0
    return {
      onMouseDown: ($) => {
        if ((J === 'open' && !z) || (J === 'close' && z))
          ((q.current = !0),
            V0($.currentTarget).addEventListener(
              'click',
              () => {
                q.current = !1
              },
              { once: !0 },
            ))
      },
      onClick: ($) => {
        if (q.current) ((q.current = !1), $.preventBaseUIHandler())
      },
    }
  }, [Z, J, z])
}
import { jsx as u7, jsxs as Kk } from 'react/jsx-runtime'
var DJ = 2,
  i3 = H4(function (Z, J) {
    let {
        render: z,
        className: q,
        disabled: $ = !1,
        nativeButton: X = !0,
        id: K,
        openOnHover: G,
        delay: Y = 100,
        closeDelay: W = 0,
        handle: U,
        payload: B,
        ...H
      } = Z,
      N = z1(!0),
      _ = U?.store ?? N?.store
    if (!_)
      throw Error(
        'Base UI: <Menu.Trigger> must be either used within a <Menu.Root> component or provided with a handle.',
      )
    let L = L0(K),
      F = _.useState('isTriggerActive', L),
      k = _.useState('floatingRootContext'),
      V = _.useState('isOpenedByTrigger', L),
      M = r1.useRef(null),
      j = Yk(),
      A = f6(!0),
      w = d1(),
      O = r1.useMemo(() => {
        return w ?? new _6()
      }, [w]),
      S = H6(O),
      x = C1(),
      { registerTrigger: h, isMountedByThisTrigger: I } = j2(L, M, _, {
        payload: B,
        closeDelay: W,
        parent: j,
        floatingTreeRoot: O,
        floatingNodeId: S,
        floatingParentNodeId: x,
        keyboardEventRelay: A?.relayKeyboardEvent,
      }),
      y = j.type === 'menubar',
      T = _.useState('disabled'),
      R = $ || T || (y && j.context.disabled),
      { getButtonProps: v, buttonRef: P } = Q1({ disabled: R, native: X })
    r1.useEffect(() => {
      if (!V && j.type === void 0) _.context.allowMouseUpTriggerRef.current = !1
    }, [_, V, j.type])
    let D = r1.useRef(null),
      E = c0(),
      C = m((d) => {
        if (!D.current) return
        ;(E.clear(), (_.context.allowMouseUpTriggerRef.current = !1))
        let o = d.target
        if (
          F0(D.current, o) ||
          F0(_.select('positionerElement'), o) ||
          o === D.current
        )
          return
        if (o != null && c3(o) === _.select('rootId')) return
        let l = h4(D.current)
        if (
          d.clientX >= l.left - DJ &&
          d.clientX <= l.right + DJ &&
          d.clientY >= l.top - DJ &&
          d.clientY <= l.bottom + DJ
        )
          return
        O.events.emit('close', { domEvent: d, reason: c.cancelOpen })
      })
    r1.useEffect(() => {
      if (V && _.select('lastOpenChangeReason') === c.triggerHover)
        V0(D.current).addEventListener('mouseup', C, { once: !0 })
    }, [V, C, _])
    let a = y && j.context.hasSubmenuOpen,
      Q0 = J2(k, {
        enabled:
          (G ?? a) && !R && j.type !== 'context-menu' && (!y || (a && !I)),
        handleClose: z2({ blockPointerEvents: !y }),
        mouseOnly: !0,
        move: !1,
        restMs: j.type === void 0 ? Y : void 0,
        delay: { close: W },
        triggerElementRef: M,
        externalTree: O,
        isActiveTrigger: F,
      }),
      g = Gk(V, _.select('lastOpenChangeReason')),
      Z0 = Q2(k, {
        enabled: !R && j.type !== 'context-menu',
        event: V && y ? 'click' : 'mousedown',
        toggle: !0,
        ignoreMouse: !1,
        stickIfOpen: j.type === void 0 ? g : !1,
      }),
      i = k6(k, { enabled: !R && a }),
      X0 = GU({ open: V, enabled: y, mouseDownAction: 'open' }),
      Y0 = O1([Z0, i]),
      J0 = { disabled: R, open: V },
      U0 = _.useState('triggerProps', I),
      K0 = [D, J, P, h, M],
      b = [
        Y0.getReferenceProps(),
        Q0 ?? S0,
        U0,
        {
          'aria-haspopup': 'menu',
          id: L,
          onMouseDown: (d) => {
            if (_.select('open')) return
            ;(E.start(200, () => {
              _.context.allowMouseUpTriggerRef.current = !0
            }),
              V0(d.currentTarget).addEventListener('mouseup', C, { once: !0 }))
          },
        },
        y ? { role: 'menuitem' } : {},
        X0,
        H,
        v,
      ],
      r = r1.useRef(null),
      t = m((d) => {
        ;(d3.flushSync(() => {
          _.setOpen(!1, $0(c.focusOut, d.nativeEvent, d.currentTarget))
        }),
          CQ(r.current)?.focus())
      }),
      e = m((d) => {
        let o = _.select('positionerElement')
        if (o && n5(d, o)) _.context.beforeContentFocusGuardRef.current?.focus()
        else {
          d3.flushSync(() => {
            _.setOpen(!1, $0(c.focusOut, d.nativeEvent, d.currentTarget))
          })
          let l = IQ(_.context.triggerFocusTargetRef.current || M.current)
          while (l !== null && F0(o, l)) {
            let q0 = l
            if (((l = M8(l)), l === q0)) break
          }
          l?.focus()
        }
      }),
      s = f('button', Z, {
        enabled: !y,
        stateAttributesMapping: O6,
        state: J0,
        ref: K0,
        props: b,
      })
    if (y)
      return u7(s6, {
        tag: 'button',
        render: z,
        className: q,
        state: J0,
        refs: K0,
        props: b,
        stateAttributesMapping: O6,
      })
    if (V)
      return Kk(r1.Fragment, {
        children: [
          u7(V5, { ref: r, onFocus: t }, `${L}-pre-focus-guard`),
          u7(r1.Fragment, { children: s }, L),
          u7(
            V5,
            { ref: _.context.triggerFocusTargetRef, onFocus: e },
            `${L}-post-focus-guard`,
          ),
        ],
      })
    return u7(r1.Fragment, { children: s }, L)
  })
i3.displayName = 'MenuTrigger'
function Gk(Q, Z) {
  let J = c0(),
    [z, q] = r1.useState(!1)
  return (
    u(() => {
      if (Q && Z === 'trigger-hover')
        (q(!0),
          J.start(JQ, () => {
            q(!1)
          }))
      else if (!Q) (J.clear(), q(!1))
    }, [Q, Z, J]),
    z
  )
}
function Yk() {
  let Q = b2(!0),
    Z = z1(!0),
    J = VJ(!0)
  return r1.useMemo(() => {
    if (J) return { type: 'menubar', context: J }
    if (Q && !Z) return { type: 'context-menu', context: Q }
    return { type: void 0 }
  }, [Q, Z, J])
}
import * as $8 from 'react'
var l3 = $8.forwardRef(function (Z, J) {
  let {
      render: z,
      className: q,
      label: $,
      id: X,
      nativeButton: K = !1,
      openOnHover: G = !0,
      delay: Y = 100,
      closeDelay: W = 0,
      disabled: U = !1,
      ...B
    } = Z,
    H = g1(),
    N = B5(),
    { store: _ } = z1(),
    L = L0(X),
    F = _.useState('open'),
    k = _.useState('floatingRootContext'),
    V = _.useState('floatingTreeRoot'),
    M = qq(L, _),
    j = $8.useCallback(
      (Z0) => {
        let i = M(Z0)
        if (
          Z0 !== null &&
          _.select('open') &&
          _.select('activeTriggerId') == null
        )
          _.update({
            activeTriggerId: L,
            activeTriggerElement: Z0,
            closeDelay: W,
          })
        return i
      },
      [M, W, _, L],
    ),
    A = $8.useRef(null),
    w = $8.useCallback(
      (Z0) => {
        ;((A.current = Z0), _.set('activeTriggerElement', Z0))
      },
      [_],
    ),
    O = wJ()
  if (!O?.parentMenu)
    throw Error(
      'Base UI: <Menu.SubmenuTrigger> must be placed in <Menu.SubmenuRoot>.',
    )
  _.useSyncedValue('closeDelay', W)
  let S = O.parentMenu,
    x = S.useState('itemProps'),
    h = S.useState('isActive', H.index),
    I = $8.useMemo(
      () => ({
        type: 'submenu-trigger',
        setActive() {
          S.set('activeIndex', H.index)
        },
      }),
      [S, H.index],
    ),
    y = _.useState('disabled'),
    T = U || y,
    { getItemProps: R, itemRef: v } = a8({
      closeOnClick: !1,
      disabled: T,
      highlighted: h,
      id: L,
      store: _,
      nativeButton: K,
      itemMetadata: I,
      nodeId: N?.nodeId,
    }),
    P = _.useState('hoverEnabled'),
    D = S.useState('allowMouseEnter'),
    E = J2(k, {
      enabled: P && G && !T,
      handleClose: z2({ blockPointerEvents: !0 }),
      mouseOnly: !0,
      move: !0,
      restMs: Y,
      delay: D ? { open: Y, close: W } : 0,
      triggerElementRef: A,
      externalTree: V,
    }),
    C = Q2(k, {
      enabled: !T,
      event: 'mousedown',
      toggle: !G,
      ignoreMouse: G,
      stickIfOpen: !1,
    }),
    a = O1([C]),
    p = _.useState('triggerProps', !0)
  return (
    delete p.id,
    f('div', Z, {
      state: { disabled: T, highlighted: h, open: F },
      stateAttributesMapping: b5,
      props: [
        a.getReferenceProps(),
        E,
        p,
        x,
        {
          tabIndex: F || h ? 0 : -1,
          onBlur() {
            if (h) S.set('activeIndex', null)
          },
        },
        B,
        R,
      ],
      ref: [J, H.ref, v, j, w],
    })
  )
})
l3.displayName = 'MenuSubmenuTrigger'
class TJ {
  constructor() {
    this.store = new C9()
  }
  open(Q) {
    let Z = Q ? this.store.context.triggerElements.getById(Q) : void 0
    if (Q && !Z)
      throw Error(`Base UI: MenuHandle.open: No trigger found with id "${Q}".`)
    this.store.setOpen(!0, $0('imperative-action', void 0, Z))
  }
  close() {
    this.store.setOpen(!1, $0('imperative-action', void 0, void 0))
  }
  get isOpen() {
    return this.store.state.open
  }
}
function YU() {
  return new TJ()
}
import { jsxDEV as U1 } from 'react/jsx-dev-runtime'
function a20({ ...Q }) {
  return U1(
    E1.Root,
    { 'data-slot': 'dropdown-menu', ...Q },
    void 0,
    !1,
    void 0,
    this,
  )
}
function s20({ ...Q }) {
  return U1(
    E1.Portal,
    { 'data-slot': 'dropdown-menu-portal', ...Q },
    void 0,
    !1,
    void 0,
    this,
  )
}
function n20({ ...Q }) {
  return U1(
    E1.Trigger,
    { 'data-slot': 'dropdown-menu-trigger', ...Q },
    void 0,
    !1,
    void 0,
    this,
  )
}
function Wk({
  align: Q = 'start',
  alignOffset: Z = 0,
  side: J = 'bottom',
  sideOffset: z = 4,
  className: q,
  ...$
}) {
  return U1(
    E1.Portal,
    {
      children: U1(
        E1.Positioner,
        {
          className: 'isolate z-50 outline-none',
          align: Q,
          alignOffset: Z,
          side: J,
          sideOffset: z,
          children: U1(
            E1.Popup,
            {
              'data-slot': 'dropdown-menu-content',
              className: z0(
                'data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 ring-foreground/10 bg-popover text-popover-foreground min-w-32 rounded-lg p-1 shadow-md ring-1 duration-100 data-[side=inline-start]:slide-in-from-right-2 data-[side=inline-end]:slide-in-from-left-2 z-50 max-h-(--available-height) w-(--anchor-width) origin-(--transform-origin) overflow-x-hidden overflow-y-auto outline-none data-closed:overflow-hidden',
                q,
              ),
              ...$,
            },
            void 0,
            !1,
            void 0,
            this,
          ),
        },
        void 0,
        !1,
        void 0,
        this,
      ),
    },
    void 0,
    !1,
    void 0,
    this,
  )
}
function o20({ ...Q }) {
  return U1(
    E1.Group,
    { 'data-slot': 'dropdown-menu-group', ...Q },
    void 0,
    !1,
    void 0,
    this,
  )
}
function t20({ className: Q, inset: Z, ...J }) {
  return U1(
    E1.GroupLabel,
    {
      'data-slot': 'dropdown-menu-label',
      'data-inset': Z,
      className: z0(
        'text-muted-foreground px-1.5 py-1 text-xs font-medium data-inset:pl-7',
        Q,
      ),
      ...J,
    },
    void 0,
    !1,
    void 0,
    this,
  )
}
function e20({ className: Q, inset: Z, variant: J = 'default', ...z }) {
  return U1(
    E1.Item,
    {
      'data-slot': 'dropdown-menu-item',
      'data-inset': Z,
      'data-variant': J,
      className: z0(
        "focus:bg-accent focus:text-accent-foreground data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive/10 dark:data-[variant=destructive]:focus:bg-destructive/20 data-[variant=destructive]:focus:text-destructive data-[variant=destructive]:*:[svg]:text-destructive not-data-[variant=destructive]:focus:**:text-accent-foreground gap-1.5 rounded-md px-1.5 py-1 text-sm data-inset:pl-7 [&_svg:not([class*='size-'])]:size-4 group/dropdown-menu-item relative flex cursor-default items-center outline-hidden select-none data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
        Q,
      ),
      ...z,
    },
    void 0,
    !1,
    void 0,
    this,
  )
}
function Q80({ ...Q }) {
  return U1(
    E1.SubmenuRoot,
    { 'data-slot': 'dropdown-menu-sub', ...Q },
    void 0,
    !1,
    void 0,
    this,
  )
}
function Z80({ className: Q, inset: Z, children: J, ...z }) {
  return U1(
    E1.SubmenuTrigger,
    {
      'data-slot': 'dropdown-menu-sub-trigger',
      'data-inset': Z,
      className: z0(
        "focus:bg-accent focus:text-accent-foreground data-open:bg-accent data-open:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground gap-1.5 rounded-md px-1.5 py-1 text-sm data-inset:pl-7 [&_svg:not([class*='size-'])]:size-4 data-popup-open:bg-accent data-popup-open:text-accent-foreground flex cursor-default items-center outline-hidden select-none [&_svg]:pointer-events-none [&_svg]:shrink-0",
        Q,
      ),
      ...z,
      children: [J, U1($7, { className: 'ml-auto' }, void 0, !1, void 0, this)],
    },
    void 0,
    !0,
    void 0,
    this,
  )
}
function J80({
  align: Q = 'start',
  alignOffset: Z = -3,
  side: J = 'right',
  sideOffset: z = 0,
  className: q,
  ...$
}) {
  return U1(
    Wk,
    {
      'data-slot': 'dropdown-menu-sub-content',
      className: z0(
        'data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 ring-foreground/10 bg-popover text-popover-foreground min-w-[96px] rounded-lg p-1 shadow-lg ring-1 duration-100 w-auto',
        q,
      ),
      align: Q,
      alignOffset: Z,
      side: J,
      sideOffset: z,
      ...$,
    },
    void 0,
    !1,
    void 0,
    this,
  )
}
function z80({ className: Q, children: Z, checked: J, inset: z, ...q }) {
  return U1(
    E1.CheckboxItem,
    {
      'data-slot': 'dropdown-menu-checkbox-item',
      'data-inset': z,
      className: z0(
        "focus:bg-accent focus:text-accent-foreground focus:**:text-accent-foreground gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm data-inset:pl-7 [&_svg:not([class*='size-'])]:size-4 relative flex cursor-default items-center outline-hidden select-none data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
        Q,
      ),
      checked: J,
      ...q,
      children: [
        U1(
          'span',
          {
            className:
              'absolute right-2 flex items-center justify-center pointer-events-none',
            'data-slot': 'dropdown-menu-checkbox-item-indicator',
            children: U1(
              E1.CheckboxItemIndicator,
              { children: U1(_2, {}, void 0, !1, void 0, this) },
              void 0,
              !1,
              void 0,
              this,
            ),
          },
          void 0,
          !1,
          void 0,
          this,
        ),
        Z,
      ],
    },
    void 0,
    !0,
    void 0,
    this,
  )
}
function q80({ ...Q }) {
  return U1(
    E1.RadioGroup,
    { 'data-slot': 'dropdown-menu-radio-group', ...Q },
    void 0,
    !1,
    void 0,
    this,
  )
}
function $80({ className: Q, children: Z, inset: J, ...z }) {
  return U1(
    E1.RadioItem,
    {
      'data-slot': 'dropdown-menu-radio-item',
      'data-inset': J,
      className: z0(
        "focus:bg-accent focus:text-accent-foreground focus:**:text-accent-foreground gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm data-inset:pl-7 [&_svg:not([class*='size-'])]:size-4 relative flex cursor-default items-center outline-hidden select-none data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
        Q,
      ),
      ...z,
      children: [
        U1(
          'span',
          {
            className:
              'absolute right-2 flex items-center justify-center pointer-events-none',
            'data-slot': 'dropdown-menu-radio-item-indicator',
            children: U1(
              E1.RadioItemIndicator,
              { children: U1(_2, {}, void 0, !1, void 0, this) },
              void 0,
              !1,
              void 0,
              this,
            ),
          },
          void 0,
          !1,
          void 0,
          this,
        ),
        Z,
      ],
    },
    void 0,
    !0,
    void 0,
    this,
  )
}
function X80({ className: Q, ...Z }) {
  return U1(
    E1.Separator,
    {
      'data-slot': 'dropdown-menu-separator',
      className: z0('bg-border -mx-1 my-1 h-px', Q),
      ...Z,
    },
    void 0,
    !1,
    void 0,
    this,
  )
}
function K80({ className: Q, ...Z }) {
  return U1(
    'span',
    {
      'data-slot': 'dropdown-menu-shortcut',
      className: z0(
        'text-muted-foreground group-focus/dropdown-menu-item:text-accent-foreground ml-auto text-xs tracking-widest',
        Q,
      ),
      ...Z,
    },
    void 0,
    !1,
    void 0,
    this,
  )
}
var o8 = {}
c1(o8, {
  createHandle: () => AU,
  Viewport: () => e3,
  Trigger: () => a3,
  Root: () => _U,
  Positioner: () => s3,
  Portal: () => r3,
  Popup: () => n3,
  Handle: () => RJ,
  Backdrop: () => t3,
  Arrow: () => o3,
})
import * as n8 from 'react'
import * as PJ from 'react'
var EJ = PJ.createContext(void 0)
EJ.displayName = 'PreviewCardRootContext'
function _5(Q) {
  let Z = PJ.useContext(EJ)
  if (Z === void 0 && !Q)
    throw Error(
      'Base UI: PreviewCardRootContext is missing. PreviewCard parts must be placed within <PreviewCard.Root>.',
    )
  return Z
}
import * as UU from 'react'
import * as BU from 'react-dom'
var WU = 600,
  SJ = 300
var Uk = {
  ...w2,
  instantType: G0((Q) => Q.instantType),
  hasViewport: G0((Q) => Q.hasViewport),
}
class x9 extends M5 {
  constructor(Q) {
    super(
      { ...Bk(), ...Q },
      {
        popupRef: UU.createRef(),
        onOpenChange: void 0,
        onOpenChangeComplete: void 0,
        triggerElements: new o1(),
        closeDelayRef: { current: SJ },
      },
      Uk,
    )
  }
  setOpen = (Q, Z) => {
    let J = Z.reason,
      z = J === c.triggerHover,
      q = Q && J === c.triggerFocus,
      $ = !Q && (J === c.triggerPress || J === c.escapeKey)
    if (
      ((Z.preventUnmountOnClose = () => {
        this.set('preventUnmountingOnClose', !0)
      }),
      this.context.onOpenChange?.(Q, Z),
      Z.isCanceled)
    )
      return
    let X = () => {
      let K = { open: Q }
      if (q) K.instantType = 'focus'
      else if ($) K.instantType = 'dismiss'
      else if (J === c.triggerHover) K.instantType = void 0
      let G = Z.trigger?.id ?? null
      if (G || Q)
        ((K.activeTriggerId = G), (K.activeTriggerElement = Z.trigger ?? null))
      this.update(K)
    }
    if (z) BU.flushSync(X)
    else X()
  }
  static useStore(Q, Z) {
    let J = R0(() => {
        return new x9(Z)
      }).current,
      z = Q ?? J,
      q = Z2({ popupStore: z, onOpenChange: z.setOpen })
    return ((z.state.floatingRootContext = q), z)
  }
}
function Bk() {
  return { ...O2(), instantType: void 0, hasViewport: !1 }
}
import { jsx as _k } from 'react/jsx-runtime'
function _U(Q) {
  let {
      open: Z,
      defaultOpen: J = !1,
      onOpenChange: z,
      onOpenChangeComplete: q,
      actionsRef: $,
      handle: X,
      triggerId: K,
      defaultTriggerId: G = null,
      children: Y,
    } = Q,
    W = x9.useStore(X?.store, {
      open: J,
      openProp: Z,
      activeTriggerId: G,
      triggerIdProp: K,
    })
  ;(x5(() => {
    if (Z === void 0 && W.state.open === !1 && J === !0)
      W.update({ open: !0, activeTriggerId: G })
  }),
    W.useControlledProp('openProp', Z),
    W.useControlledProp('triggerIdProp', K),
    W.useContextCallback('onOpenChange', z),
    W.useContextCallback('onOpenChangeComplete', q))
  let U = W.useState('open'),
    B = W.useState('activeTriggerId'),
    H = W.useState('payload')
  V2(W)
  let { forceUnmount: N } = A2(U, W)
  u(() => {
    if (U) {
      if (B == null) W.set('payload', void 0)
    }
  }, [W, B, U])
  let _ = n8.useCallback(() => {
    W.setOpen(!1, Hk(W, c.imperativeAction))
  }, [W])
  n8.useImperativeHandle($, () => ({ unmount: N, close: _ }), [N, _])
  let L = W.useState('floatingRootContext'),
    F = A5(L),
    { getReferenceProps: k, getTriggerProps: V, getFloatingProps: M } = O1([F]),
    j = n8.useMemo(() => k(), [k]),
    A = n8.useMemo(() => V(), [V]),
    w = n8.useMemo(() => M(), [M])
  return (
    W.useSyncedValues({
      activeTriggerProps: j,
      inactiveTriggerProps: A,
      popupProps: w,
    }),
    _k(EJ.Provider, {
      value: W,
      children: typeof Y === 'function' ? Y({ payload: H }) : Y,
    })
  )
}
function Hk(Q, Z) {
  let J = $0(Z)
  return (
    (J.preventUnmountOnClose = () => {
      Q.set('preventUnmountingOnClose', !0)
    }),
    J
  )
}
import * as LU from 'react'
import * as IJ from 'react'
var CJ = IJ.createContext(void 0)
CJ.displayName = 'PreviewCardPortalContext'
function HU() {
  let Q = IJ.useContext(CJ)
  if (Q === void 0) throw Error('Base UI: <PreviewCard.Portal> is missing.')
  return Q
}
import { jsx as NU } from 'react/jsx-runtime'
var r3 = LU.forwardRef(function (Z, J) {
  let { keepMounted: z = !1, ...q } = Z
  if (!(_5().useState('mounted') || z)) return null
  return NU(CJ.Provider, { value: z, children: NU(g7, { ref: J, ...q }) })
})
r3.displayName = 'PreviewCardPortal'
import * as xJ from 'react'
var a3 = xJ.forwardRef(function (Z, J) {
  let {
      render: z,
      className: q,
      delay: $,
      closeDelay: X,
      id: K,
      payload: G,
      handle: Y,
      ...W
    } = Z,
    U = _5(!0),
    B = Y?.store ?? U
  if (!B)
    throw Error(
      'Base UI: <PreviewCard.Trigger> must be either used within a <PreviewCard.Root> component or provided with a handle.',
    )
  let H = L0(K),
    N = B.useState('isTriggerActive', H),
    _ = B.useState('isOpenedByTrigger', H),
    L = B.useState('floatingRootContext'),
    F = xJ.useRef(null),
    k = $ ?? WU,
    V = X ?? SJ,
    { registerTrigger: M, isMountedByThisTrigger: j } = j2(H, F, B, {
      payload: G,
    })
  u(() => {
    if (j) B.context.closeDelayRef.current = V
  }, [B, j, V])
  let A = J2(L, {
      mouseOnly: !0,
      move: !1,
      handleClose: z2(),
      delay: () => ({ open: k, close: V }),
      triggerElementRef: F,
      isActiveTrigger: N,
    }),
    w = k6(L, { delay: k }),
    O = { open: _ },
    S = B.useState('triggerProps', j)
  return f('a', Z, {
    state: O,
    ref: [J, M, F],
    props: [A, w.reference, S, { id: H }, W],
    stateAttributesMapping: b5,
  })
})
a3.displayName = 'PreviewCardTrigger'
import * as c7 from 'react'
import * as hJ from 'react'
var bJ = hJ.createContext(void 0)
bJ.displayName = 'PreviewCardPositionerContext'
function h9() {
  let Q = hJ.useContext(bJ)
  if (Q === void 0)
    throw Error(
      'Base UI: <PreviewCard.Popup> and <PreviewCard.Arrow> must be used within the <PreviewCard.Positioner> component',
    )
  return Q
}
import { jsx as Nk } from 'react/jsx-runtime'
var s3 = c7.forwardRef(function (Z, J) {
  let {
      render: z,
      className: q,
      anchor: $,
      positionMethod: X = 'absolute',
      side: K = 'bottom',
      align: G = 'center',
      sideOffset: Y = 0,
      alignOffset: W = 0,
      collisionBoundary: U = 'clipping-ancestors',
      collisionPadding: B = 5,
      arrowPadding: H = 5,
      sticky: N = !1,
      disableAnchorTracking: _ = !1,
      collisionAvoidance: L = B8,
      ...F
    } = Z,
    k = _5(),
    V = HU(),
    M = k.useState('open'),
    j = k.useState('mounted'),
    A = k.useState('floatingRootContext'),
    w = k.useState('instantType'),
    O = k.useState('transitionStatus'),
    S = k.useState('hasViewport'),
    x = D2({
      anchor: $,
      floatingRootContext: A,
      positionMethod: X,
      mounted: j,
      side: K,
      sideOffset: Y,
      align: G,
      alignOffset: W,
      arrowPadding: H,
      collisionBoundary: U,
      collisionPadding: B,
      sticky: N,
      disableAnchorTracking: _,
      keepMounted: V,
      collisionAvoidance: L,
      adaptiveOrigin: S ? q9 : void 0,
    }),
    h = c7.useMemo(() => {
      let R = {}
      if (!M) R.pointerEvents = 'none'
      return {
        role: 'presentation',
        hidden: !j,
        style: { ...x.positionerStyles, ...R },
      }
    }, [M, j, x.positionerStyles]),
    I = {
      open: M,
      side: x.side,
      align: x.align,
      anchorHidden: x.anchorHidden,
      instant: w,
    },
    y = c7.useMemo(
      () => ({
        side: x.side,
        align: x.align,
        arrowRef: x.arrowRef,
        arrowUncentered: x.arrowUncentered,
        arrowStyles: x.arrowStyles,
      }),
      [x.side, x.align, x.arrowRef, x.arrowUncentered, x.arrowStyles],
    ),
    T = f('div', Z, {
      state: I,
      props: [h, T1(O), F],
      ref: [J, k.useStateSetter('positionerElement')],
      stateAttributesMapping: v0,
    })
  return Nk(bJ.Provider, { value: y, children: T })
})
s3.displayName = 'PreviewCardPositioner'
import * as FU from 'react'
var Lk = { ...v0, ...i0 },
  n3 = FU.forwardRef(function (Z, J) {
    let { className: z, render: q, ...$ } = Z,
      X = _5(),
      { side: K, align: G } = h9(),
      Y = X.useState('open'),
      W = X.useState('instantType'),
      U = X.useState('transitionStatus'),
      B = X.useState('popupProps'),
      H = X.useState('floatingRootContext')
    a0({
      open: Y,
      ref: X.context.popupRef,
      onComplete() {
        if (Y) X.context.onOpenChangeComplete?.(!0)
      },
    })
    let N = m(() => X.context.closeDelayRef.current)
    return (
      n2(H, { closeDelay: N }),
      f('div', Z, {
        state: { open: Y, side: K, align: G, instant: W, transitionStatus: U },
        ref: [J, X.context.popupRef, X.useStateSetter('popupElement')],
        props: [B, T1(U), $],
        stateAttributesMapping: Lk,
      })
    )
  })
n3.displayName = 'PreviewCardPopup'
import * as kU from 'react'
var o3 = kU.forwardRef(function (Z, J) {
  let { render: z, className: q, ...$ } = Z,
    X = _5(),
    {
      arrowRef: K,
      side: G,
      align: Y,
      arrowUncentered: W,
      arrowStyles: U,
    } = h9(),
    H = { open: X.useState('open'), side: G, align: Y, uncentered: W }
  return f('div', Z, {
    state: H,
    ref: [K, J],
    props: [{ style: U, 'aria-hidden': !0 }, $],
    stateAttributesMapping: v0,
  })
})
o3.displayName = 'PreviewCardArrow'
import * as MU from 'react'
var Fk = { ...v0, ...i0 },
  t3 = MU.forwardRef(function (Z, J) {
    let { render: z, className: q, ...$ } = Z,
      X = _5(),
      K = X.useState('open'),
      G = X.useState('mounted'),
      Y = X.useState('transitionStatus')
    return f('div', Z, {
      state: { open: K, transitionStatus: Y },
      ref: [J],
      props: [
        {
          role: 'presentation',
          hidden: !G,
          style: {
            pointerEvents: 'none',
            userSelect: 'none',
            WebkitUserSelect: 'none',
          },
        },
        $,
      ],
      stateAttributesMapping: Fk,
    })
  })
t3.displayName = 'PreviewCardBackdrop'
import * as VU from 'react'
var jU = (function (Q) {
  return (
    (Q.popupWidth = '--popup-width'),
    (Q.popupHeight = '--popup-height'),
    Q
  )
})({})
var kk = {
    activationDirection: (Q) => (Q ? { 'data-activation-direction': Q } : null),
  },
  e3 = VU.forwardRef(function (Z, J) {
    let { render: z, className: q, children: $, ...X } = Z,
      K = _5(),
      G = h9(),
      Y = K.useState('instantType'),
      { children: W, state: U } = O9({
        store: K,
        side: G.side,
        cssVars: jU,
        children: $,
      }),
      B = {
        activationDirection: U.activationDirection,
        transitioning: U.transitioning,
        instant: Y,
      }
    return f('div', Z, {
      state: B,
      ref: J,
      props: [X, { children: W }],
      stateAttributesMapping: kk,
    })
  })
e3.displayName = 'PreviewCardViewport'
class RJ {
  constructor() {
    this.store = new x9()
  }
  open(Q) {
    let Z = Q ? this.store.context.triggerElements.getById(Q) : void 0
    if (Q && !Z)
      throw Error(
        `Base UI: PreviewCardHandle.open: No trigger found with id "${Q}".`,
      )
    this.store.setOpen(!0, $0(c.imperativeAction, void 0, Z))
  }
  close() {
    this.store.setOpen(!1, $0(c.imperativeAction, void 0, void 0))
  }
  get isOpen() {
    return this.store.state.open
  }
}
function AU() {
  return new RJ()
}
import { jsxDEV as d7 } from 'react/jsx-dev-runtime'
function i60({ ...Q }) {
  return d7(
    o8.Root,
    { 'data-slot': 'hover-card', ...Q },
    void 0,
    !1,
    void 0,
    this,
  )
}
function l60({ ...Q }) {
  return d7(
    o8.Trigger,
    { 'data-slot': 'hover-card-trigger', ...Q },
    void 0,
    !1,
    void 0,
    this,
  )
}
function r60({
  className: Q,
  side: Z = 'bottom',
  sideOffset: J = 4,
  align: z = 'center',
  alignOffset: q = 4,
  ...$
}) {
  return d7(
    o8.Portal,
    {
      'data-slot': 'hover-card-portal',
      children: d7(
        o8.Positioner,
        {
          align: z,
          alignOffset: q,
          side: Z,
          sideOffset: J,
          className: 'isolate z-50',
          children: d7(
            o8.Popup,
            {
              'data-slot': 'hover-card-content',
              className: z0(
                'data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 ring-foreground/10 bg-popover text-popover-foreground w-64 rounded-lg p-2.5 text-sm shadow-md ring-1 duration-100 data-[side=inline-start]:slide-in-from-right-2 data-[side=inline-end]:slide-in-from-left-2 z-50 origin-(--transform-origin) outline-hidden',
                Q,
              ),
              ...$,
            },
            void 0,
            !1,
            void 0,
            this,
          ),
        },
        void 0,
        !1,
        void 0,
        this,
      ),
    },
    void 0,
    !1,
    void 0,
    this,
  )
}
export {
  gq as toggleVariants,
  KF as tabsListVariants,
  z0 as cn,
  gB as buttonVariants,
  pB as badgeVariants,
  Le as TooltipTrigger,
  He as TooltipProvider,
  Fe as TooltipContent,
  Ne as Tooltip,
  um as ToggleGroupItem,
  pm as ToggleGroup,
  Am as Toggle,
  JO as Textarea,
  Gd as TabsTrigger,
  Kd as TabsList,
  Yd as TabsContent,
  Xd as Tabs,
  Fd as TableRow,
  Hd as TableHeader,
  kd as TableHead,
  Ld as TableFooter,
  Md as TableCell,
  jd as TableCaption,
  Nd as TableBody,
  _d as Table,
  tO as Switch,
  Ed as Spinner,
  Qm as Slider,
  wd as Skeleton,
  $p as Separator,
  vv as SelectValue,
  fv as SelectTrigger,
  uv as SelectSeparator,
  IL as SelectScrollUpButton,
  CL as SelectScrollDownButton,
  mv as SelectLabel,
  pv as SelectItem,
  Rv as SelectGroup,
  gv as SelectContent,
  bv as Select,
  ZF as ScrollBar,
  bu as ScrollArea,
  TT as RadioGroupItem,
  DT as RadioGroup,
  ki as ProgressValue,
  BF as ProgressTrack,
  Fi as ProgressLabel,
  _F as ProgressIndicator,
  Li as Progress,
  Mo as PopoverTrigger,
  Ao as PopoverTitle,
  Vo as PopoverHeader,
  Oo as PopoverDescription,
  jo as PopoverContent,
  ko as Popover,
  XO as Label,
  Oi as KbdGroup,
  Ai as Kbd,
  tA as Input,
  l60 as HoverCardTrigger,
  r60 as HoverCardContent,
  i60 as HoverCard,
  Ii as EmptyTitle,
  Si as EmptyMedia,
  Ei as EmptyHeader,
  Ci as EmptyDescription,
  xi as EmptyContent,
  Pi as Empty,
  n20 as DropdownMenuTrigger,
  Z80 as DropdownMenuSubTrigger,
  J80 as DropdownMenuSubContent,
  Q80 as DropdownMenuSub,
  K80 as DropdownMenuShortcut,
  X80 as DropdownMenuSeparator,
  $80 as DropdownMenuRadioItem,
  q80 as DropdownMenuRadioGroup,
  s20 as DropdownMenuPortal,
  t20 as DropdownMenuLabel,
  e20 as DropdownMenuItem,
  o20 as DropdownMenuGroup,
  Wk as DropdownMenuContent,
  z80 as DropdownMenuCheckboxItem,
  a20 as DropdownMenu,
  Rr as DialogTrigger,
  pr as DialogTitle,
  wF as DialogPortal,
  yF as DialogOverlay,
  gr as DialogHeader,
  mr as DialogFooter,
  ur as DialogDescription,
  fr as DialogContent,
  vr as DialogClose,
  br as Dialog,
  Iy as Checkbox,
  am as CardTitle,
  rm as CardHeader,
  tm as CardFooter,
  sm as CardDescription,
  om as CardContent,
  nm as CardAction,
  lm as Card,
  p6 as Button,
  IM as Badge,
  gi as AlertTitle,
  La as AlertDialogTrigger,
  Va as AlertDialogTitle,
  TF as AlertDialogPortal,
  PF as AlertDialogOverlay,
  ja as AlertDialogMedia,
  ka as AlertDialogHeader,
  Ma as AlertDialogFooter,
  Aa as AlertDialogDescription,
  Fa as AlertDialogContent,
  wa as AlertDialogCancel,
  Oa as AlertDialogAction,
  Na as AlertDialog,
  mi as AlertDescription,
  pi as AlertAction,
  fi as Alert,
}
