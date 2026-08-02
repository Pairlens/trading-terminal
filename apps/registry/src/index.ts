// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { CATEGORIES } from './catalog'
import { fullCatalog, initCommunityCatalog } from './community'
import { isAuthenticated } from './auth'
import { allowRequest } from './rate-limit'
import { initSignatures, withSignature } from './signing'
import type {
  RegistryCategoriesResponse,
  RegistryEntitlementTiersResponse,
  RegistryFeaturedResponse,
  RegistryHealthResponse,
  RegistryListResponse,
  RegistryPluginDetailResponse,
  RegistryVersionsResponse,
} from '@pairlens/shared/registry-types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

function json<T>(data: T, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  })
}

function notFound(message = 'Not found'): Response {
  return json({ error: message }, 404)
}

function unauthorized(message = 'Authentication required'): Response {
  return json({ error: message }, 401)
}

function tooManyRequests(): Response {
  return json({ error: 'Rate limit exceeded' }, 429)
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const { pathname } = url

  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  // ── Public endpoints (no auth required) ─────────────────────────

  // GET /health
  if (pathname === '/health') {
    const body: RegistryHealthResponse = { status: 'ok', version: '0.1.0' }
    return json(body)
  }

  // GET /api/plugins/featured
  if (pathname === '/api/plugins/featured') {
    const plugins = fullCatalog()
      .filter((entry) => entry.featured === true)
      .map(withSignature)
    const body: RegistryFeaturedResponse = { plugins }
    return json(body)
  }

  // GET /api/categories
  if (pathname === '/api/categories') {
    const body: RegistryCategoriesResponse = { categories: CATEGORIES }
    return json(body)
  }

  // GET /api/entitlement-tiers
  if (pathname === '/api/entitlement-tiers') {
    const body: RegistryEntitlementTiersResponse = {
      tiers: [
        { id: 'free', label: 'Free', order: 0 },
        { id: 'pro', label: 'Pro', order: 1 },
        { id: 'max', label: 'Max', order: 2 },
      ],
    }
    return json(body)
  }

  // GET /api/plugins/:id/versions
  const versionsMatch = pathname.match(/^\/api\/plugins\/([^/]+)\/versions$/)
  if (versionsMatch) {
    const id = versionsMatch[1]
    const plugin = fullCatalog().find((entry) => entry.manifest.id === id)
    if (!plugin) return notFound(`Plugin "${id}" not found`)
    const body: RegistryVersionsResponse = {
      pluginId: plugin.manifest.id,
      versions: plugin.versions ?? [
        {
          version: plugin.manifest.version,
          publishedAt: plugin.updatedAt ?? new Date().toISOString(),
        },
      ],
    }
    return json(body)
  }

  // GET /api/plugins/:id
  const pluginDetailMatch = pathname.match(/^\/api\/plugins\/([^/]+)$/)
  if (pluginDetailMatch) {
    const id = pluginDetailMatch[1]
    const plugin = fullCatalog().find((entry) => entry.manifest.id === id)
    if (!plugin) {
      return notFound(`Plugin "${id}" not found`)
    }
    const body: RegistryPluginDetailResponse = { plugin: withSignature(plugin) }
    return json(body)
  }

  // GET /api/plugins?category=<slug>
  if (pathname === '/api/plugins') {
    const category = url.searchParams.get('category')
    const catalog = fullCatalog()
    const plugins = (
      category
        ? catalog.filter((entry) => entry.category === category)
        : catalog
    ).map(withSignature)
    const body: RegistryListResponse = { plugins, categories: CATEGORIES }
    return json(body)
  }

  // ── Auth-gated endpoints (login required to download) ───────────

  // GET /api/plugins/:id/module — requires auth
  const moduleMatch = pathname.match(/^\/api\/plugins\/([^/]+)\/module$/)
  if (moduleMatch) {
    if (!allowRequest(req)) return tooManyRequests()
    if (!(await isAuthenticated(req))) return unauthorized()
    const id = moduleMatch[1]
    const plugin = fullCatalog().find((entry) => entry.manifest.id === id)
    if (!plugin) return notFound(`Plugin "${id}" not found`)
    if (!plugin.moduleUrl) {
      return notFound(
        `Plugin "${id}" has no downloadable module (bundled only)`,
      )
    }
    // If moduleUrl is a local path, resolve and serve it
    if (plugin.moduleUrl.startsWith('/static/')) {
      const filePath = new URL(`..${plugin.moduleUrl}`, import.meta.url)
      try {
        const file = Bun.file(filePath)
        if (await file.exists()) {
          return new Response(file, {
            headers: {
              'Content-Type': 'application/javascript',
              'Cache-Control': 'public, max-age=31536000, immutable',
              ...CORS_HEADERS,
            },
          })
        }
      } catch {
        // Fall through to 404
      }
      return notFound(`Module for "${id}" not found`)
    }
    return Response.redirect(plugin.moduleUrl, 302)
  }

  // GET /static/modules/:filename — requires auth. Community bundles live in
  // the community/ subfolder; the capture group forbids any other separator,
  // so path traversal cannot escape static/modules/.
  const staticMatch = pathname.match(
    /^\/static\/modules\/((?:community\/)?[^/]+\.js)$/,
  )
  if (staticMatch) {
    if (!allowRequest(req)) return tooManyRequests()
    if (!(await isAuthenticated(req))) return unauthorized()
    const filename = staticMatch[1]
    const filePath = new URL(`../static/modules/${filename}`, import.meta.url)
    try {
      const file = Bun.file(filePath)
      if (await file.exists()) {
        return new Response(file, {
          headers: {
            'Content-Type': 'application/javascript',
            'Cache-Control': 'public, max-age=31536000, immutable',
            ...CORS_HEADERS,
          },
        })
      }
    } catch {
      // Fall through to 404
    }
    return notFound(`Module "${filename}" not found`)
  }

  return notFound()
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const PORT = Number(process.env.PORT ?? process.env.REGISTRY_PORT ?? 3005)

// Bind the server FIRST so /health is live immediately — the health check must
// never be gated behind startup work. Artifact signing then runs in the
// background: withSignature() serves entries unsigned until it completes, and
// any signing failure is logged rather than taking the whole process down
// (previously a stall in initSignatures() left the port unbound and failed the
// deploy healthcheck with zero output).
Bun.serve({
  port: PORT,
  fetch: handleRequest,
})

console.info(`[registry] listening on http://localhost:${PORT}`)

// Community plugins are validated + built from source first, then signing
// covers the freshly-built bytes (community entries are absent from the
// catalog, and everything is served unsigned, until each step completes).
void initCommunityCatalog()
  .catch((err) => {
    console.error(
      '[registry] initCommunityCatalog failed:',
      err instanceof Error ? err.message : err,
    )
  })
  .then(() => initSignatures())
  .catch((err) => {
    console.error(
      '[registry] initSignatures failed:',
      err instanceof Error ? err.message : err,
    )
  })
