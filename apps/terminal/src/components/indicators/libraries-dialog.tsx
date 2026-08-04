// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useEffect, useMemo, useState } from 'react'
import { Plus, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@pairlens/ui/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@pairlens/ui/components/ui/dialog'
import { ScrollArea } from '@pairlens/ui/components/ui/scroll-area'
import { Spinner } from '@pairlens/ui/components/ui/spinner'

import type { CuratedLibrary, RuntimePackage } from '@/lib/python/libraries'
import {
  CURATED_LIBRARIES,
  curatedImportSnippet,
  fetchRuntimePackages,
} from '@/lib/python/libraries'

type LibrariesDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Insert a snippet at the editor cursor. Optional — hide the insert
   * affordance when absent. */
  onInsert?: (snippet: string) => void
}

/** Load state of the lockfile-backed runtime list. */
type RuntimeList =
  | { state: 'loading' }
  | { state: 'error' }
  | { state: 'ready'; packages: Array<RuntimePackage> }

function matchesCurated(library: CuratedLibrary, q: string): boolean {
  return (
    library.dist.toLowerCase().includes(q) ||
    (library.module?.toLowerCase().includes(q) ?? false) ||
    library.blurb.toLowerCase().includes(q)
  )
}

function matchesRuntime(pkg: RuntimePackage, q: string): boolean {
  return (
    pkg.name.toLowerCase().includes(q) ||
    pkg.imports.some((name) => name.toLowerCase().includes(q))
  )
}

/**
 * The browsable library catalog: a curated shelf of trading-relevant picks,
 * then every package built into the Python runtime — read from the same
 * lockfile the worker installs from, so the list is what installs, always.
 */
export function LibrariesDialog({
  open,
  onOpenChange,
  onInsert,
}: LibrariesDialogProps) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [runtime, setRuntime] = useState<RuntimeList>({ state: 'loading' })

  // The lockfile is fetched once per session (the module caches it); this
  // effect just mirrors that promise into render state when the dialog opens.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setRuntime((prev) => (prev.state === 'ready' ? prev : { state: 'loading' }))
    fetchRuntimePackages().then(
      (packages) => {
        if (!cancelled) setRuntime({ state: 'ready', packages })
      },
      () => {
        if (!cancelled) setRuntime({ state: 'error' })
      },
    )
    return () => {
      cancelled = true
    }
  }, [open])

  const q = query.trim().toLowerCase()
  const curated = useMemo(
    () =>
      q
        ? CURATED_LIBRARIES.filter((l) => matchesCurated(l, q))
        : CURATED_LIBRARIES,
    [q],
  )
  const runtimePackages = runtime.state === 'ready' ? runtime.packages : []
  const filtered = useMemo(
    () =>
      q ? runtimePackages.filter((p) => matchesRuntime(p, q)) : runtimePackages,
    [q, runtimePackages],
  )
  /** dist → shipped version, to stamp curated runtime rows. */
  const versions = useMemo(() => {
    const map = new Map<string, string>()
    for (const pkg of runtimePackages) map.set(pkg.name, pkg.version)
    return map
  }, [runtimePackages])

  const handleOpenChange = (next: boolean) => {
    if (next) setQuery('')
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-3xl h-[min(680px,calc(100vh-4rem))] p-0 gap-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-4 pt-4 pb-3">
          <DialogTitle className="text-base">
            {t('indicatorsPage.librariesTitle')}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {t('indicatorsPage.librariesDescription')}
          </DialogDescription>
        </DialogHeader>

        <div className="px-4 pb-3">
          <div className="flex items-center gap-2 rounded-md border px-2.5 py-1.5 focus-within:border-ring">
            <Search className="text-muted-foreground size-4 shrink-0" />
            <input
              type="search"
              value={query}
              autoFocus
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('indicatorsPage.librariesSearchPlaceholder')}
              aria-label={t('indicatorsPage.librariesSearchPlaceholder')}
              className="placeholder:text-muted-foreground flex-1 bg-transparent text-sm outline-none [&::-webkit-search-cancel-button]:appearance-none"
            />
            <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
              {curated.length + filtered.length}
            </span>
          </div>
        </div>

        <ScrollArea className="min-h-0 flex-1 border-t">
          {curated.length > 0 && (
            <section>
              <SectionHeading>
                {t('indicatorsPage.librariesCurated')}
              </SectionHeading>
              <ul>
                {curated.map((library) => (
                  <CuratedRow
                    key={library.dist}
                    library={library}
                    version={versions.get(library.dist)}
                    onInsert={onInsert}
                  />
                ))}
              </ul>
            </section>
          )}

          <section>
            <SectionHeading>
              {t('indicatorsPage.librariesRuntime')}
            </SectionHeading>
            {runtime.state === 'loading' && (
              <div className="text-muted-foreground flex items-center gap-2 px-4 py-6 text-sm">
                <Spinner className="size-3.5" />
                {t('indicatorsPage.librariesLoading')}
              </div>
            )}
            {runtime.state === 'error' && (
              <p className="text-muted-foreground px-4 py-6 text-sm">
                {t('indicatorsPage.librariesError')}
              </p>
            )}
            {runtime.state === 'ready' && filtered.length === 0 && (
              <p className="text-muted-foreground px-4 py-6 text-sm">
                {t('indicatorsPage.librariesEmpty', { query: query.trim() })}
              </p>
            )}
            {runtime.state === 'ready' && filtered.length > 0 && (
              <ul>
                {filtered.map((pkg) => (
                  <RuntimeRow key={pkg.name} pkg={pkg} onInsert={onInsert} />
                ))}
              </ul>
            )}
          </section>

          <p className="text-muted-foreground border-t px-4 py-3 text-xs leading-relaxed">
            {t('indicatorsPage.librariesPypiNote')}
          </p>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="bg-background/95 text-muted-foreground sticky top-0 z-10 px-4 py-1.5 text-[11px] font-medium tracking-wider uppercase backdrop-blur-sm">
      {children}
    </h3>
  )
}

function SourceBadge({ source }: { source: CuratedLibrary['source'] }) {
  const { t } = useTranslation()
  const label =
    source === 'preloaded'
      ? t('indicatorsPage.librariesPreloadedBadge')
      : source === 'runtime'
        ? t('indicatorsPage.librariesRuntimeBadge')
        : t('indicatorsPage.librariesPypiBadge')
  return (
    <Badge
      variant={source === 'preloaded' ? 'default' : 'secondary'}
      className="shrink-0 text-[10px]"
    >
      {label}
    </Badge>
  )
}

function InsertButton({
  snippet,
  onInsert,
}: {
  snippet: string
  onInsert: (snippet: string) => void
}) {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      // An import is a whole statement, not an expression fragment like the
      // SDK reference snippets — it lands on its own line.
      onClick={() => onInsert(`${snippet}\n`)}
      title={snippet}
      className="text-muted-foreground hover:text-foreground hover:bg-muted ml-auto inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-xs transition-colors"
    >
      <Plus className="size-3" />
      {t('indicatorsPage.librariesInsert')}
    </button>
  )
}

function CuratedRow({
  library,
  version,
  onInsert,
}: {
  library: CuratedLibrary
  version?: string
  onInsert?: (snippet: string) => void
}) {
  return (
    <li className="hover:bg-muted/40 border-b px-4 py-2.5 transition-colors last:border-b-0">
      <div className="flex items-baseline gap-2">
        <code className="text-foreground text-sm font-medium">
          {library.dist}
        </code>
        {version && (
          <code className="text-muted-foreground text-xs">{version}</code>
        )}
        {library.module && (
          <code className="text-muted-foreground truncate text-xs">
            import {library.module}
          </code>
        )}
        <SourceBadge source={library.source} />
        {onInsert && (
          <InsertButton
            snippet={curatedImportSnippet(library)}
            onInsert={onInsert}
          />
        )}
      </div>
      <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
        {library.blurb}
      </p>
    </li>
  )
}

function RuntimeRow({
  pkg,
  onInsert,
}: {
  pkg: RuntimePackage
  onInsert?: (snippet: string) => void
}) {
  // What `import x` should say — the first importable module, which for the
  // overwhelming majority of packages is the only one.
  const module = pkg.imports[0] ?? pkg.name
  return (
    <li className="hover:bg-muted/40 border-b px-4 py-2 transition-colors last:border-b-0">
      <div className="flex items-baseline gap-2">
        <code className="text-foreground text-sm">{pkg.name}</code>
        <code className="text-muted-foreground text-xs">{pkg.version}</code>
        {module !== pkg.name && (
          <code className="text-muted-foreground truncate text-xs">
            import {module}
          </code>
        )}
        {onInsert && (
          <InsertButton snippet={`import ${module}`} onInsert={onInsert} />
        )}
      </div>
    </li>
  )
}
