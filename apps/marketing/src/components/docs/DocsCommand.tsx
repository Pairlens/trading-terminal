// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useEffect, useMemo, useState } from 'react'
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@pairlens/ui/components/ui/command'
import type { ReactNode } from 'react'
import { SITE } from '@/lib/site'
import { track } from '@/scripts/analytics-events'

type Page = {
  title: string
  href: string
  group: string
  description: string
}
type Section = { label: string; items: Array<Page> }

/**
 * Ranking for the palette.
 *
 * cmdk's default scorer is a fuzzy subsequence match, which is fine over a
 * dozen short titles and useless once every item also carries a sentence of
 * description: "order book" ranked Introduction above The order book, because
 * those letters appear in that order somewhere in its blurb. This scores
 * explicitly instead — the title decides the top of the list, the description
 * only decides whether an item is in the list at all.
 *
 * Returning 0 hides the item, which is what makes a two-word query narrow
 * rather than widen the results.
 */
function score(value: string, search: string, keywords?: Array<string>) {
  const q = search.trim().toLowerCase()
  if (!q) return 1
  const title = value.toLowerCase()
  const rest = (keywords ?? []).join(' ').toLowerCase()

  if (title === q) return 1
  if (title.startsWith(q)) return 0.9
  if (title.includes(q)) return 0.8

  const words = q.split(/\s+/)
  if (words.every((w) => title.includes(w))) return 0.7
  if (rest.includes(q)) return 0.5
  if (words.every((w) => `${title} ${rest}`.includes(w))) return 0.35
  return 0
}

function navigateTo(href: string) {
  import('astro:transitions/client')
    .then((m) => m.navigate(href))
    .catch(() => window.location.assign(href))
}

/* Inline icons — the marketing app renders SVGs inline (no lucide dep here).
   Paths are lucide's file-text / clipboard / sparkles for familiarity. */
function DocIcon(props: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="M10 9H8" />
      <path d="M16 13H8" />
      <path d="M16 17H8" />
    </svg>
  )
}

function ClipboardIcon(props: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <rect width="8" height="4" x="8" y="2" rx="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    </svg>
  )
}

function SparkleIcon(props: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M9.94 15.5A2 2 0 0 0 8.5 14.06l-6.14-1.58a.5.5 0 0 1 0-.96L8.5 9.94A2 2 0 0 0 9.94 8.5l1.58-6.14a.5.5 0 0 1 .96 0L14.06 8.5A2 2 0 0 0 15.5 9.94l6.14 1.58a.5.5 0 0 1 0 .96L15.5 14.06a2 2 0 0 0-1.44 1.44l-1.58 6.14a.5.5 0 0 1-.96 0Z" />
    </svg>
  )
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded border border-border/70 bg-muted/40 px-1 font-sans text-[10px] font-medium leading-none text-muted-foreground/80">
      {children}
    </kbd>
  )
}

const itemClass =
  'gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] text-foreground/90 data-selected:bg-primary/10 data-selected:text-foreground [&_svg]:text-muted-foreground/70 data-selected:[&_svg]:text-primary'

export function DocsCommand({ pages }: { pages: Array<Page> }) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => {
          // Only the opening half is a search; the same chord closes it.
          if (!o) track('docs_search_opened', { trigger: 'hotkey' })
          return !o
        })
      }
    }
    const onOpen = () => {
      track('docs_search_opened', { trigger: 'button' })
      setOpen(true)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pairlens:open-command', onOpen)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pairlens:open-command', onOpen)
    }
  }, [])

  const select = (fn: () => void) => {
    setOpen(false)
    fn()
  }

  // Group pages by their doc section, preserving first-seen order, so the
  // section becomes the group heading instead of a ragged right-aligned label.
  const sections = useMemo<Array<Section>>(() => {
    const order: Array<Section> = []
    const byLabel = new Map<string, Section>()
    for (const p of pages) {
      let s = byLabel.get(p.group)
      if (!s) {
        s = { label: p.group, items: [] }
        byLabel.set(p.group, s)
        order.push(s)
      }
      s.items.push(p)
    }
    return order
  }, [pages])

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Search docs"
      description="Search docs, guides, and commands"
      className="overflow-hidden border-border/70 sm:max-w-[580px]"
    >
      <Command
        filter={score}
        className="bg-transparent [&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.08em] [&_[cmdk-group-heading]]:text-muted-foreground/50"
      >
        <CommandInput placeholder="Search the docs…" />
        <CommandList className="max-h-[400px] scroll-py-2 px-1 pb-2">
          <CommandEmpty className="py-10 text-center text-sm text-muted-foreground">
            No matches. Try <span className="text-foreground">“plugin”</span> or{' '}
            <span className="text-foreground">“order”</span>.
          </CommandEmpty>

          {sections.map((section) => (
            <CommandGroup key={section.label} heading={section.label}>
              {section.items.map((p) => (
                <CommandItem
                  key={p.href}
                  // Titles are unique across the corpus, so the value can be
                  // the title alone and `score` gets to weigh it against the
                  // section and description separately.
                  value={p.title}
                  keywords={[section.label, p.description]}
                  onSelect={() =>
                    select(() => {
                      track('docs_search_selected', {
                        kind: 'page',
                        target: p.href,
                      })
                      navigateTo(p.href)
                    })
                  }
                  className={itemClass}
                >
                  <DocIcon className="size-[17px] shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{p.title}</span>
                    <span className="block truncate text-[11.5px] text-muted-foreground/60">
                      {p.description}
                    </span>
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          ))}

          <CommandGroup heading="Actions">
            <CommandItem
              value="copy install command git clone"
              onSelect={() =>
                select(() => {
                  track('docs_search_selected', {
                    kind: 'action',
                    target: 'copy-install-command',
                  })
                  navigator.clipboard
                    ?.writeText(
                      'git clone https://github.com/Pairlens/trading-terminal',
                    )
                    .catch(() => {})
                })
              }
              className={itemClass}
            >
              <ClipboardIcon className="size-[17px]" />
              <span>Copy install command</span>
            </CommandItem>
            <CommandItem
              value="ask the ai assistant"
              onSelect={() =>
                select(() => {
                  track('docs_search_selected', {
                    kind: 'action',
                    target: 'ask-the-assistant',
                  })
                  track('terminal_launched', { surface: 'docs-command' })
                  window.location.assign(SITE.launchUrl)
                })
              }
              className={itemClass}
            >
              <SparkleIcon className="size-[17px]" />
              <span>Ask the AI assistant…</span>
            </CommandItem>
          </CommandGroup>
        </CommandList>

        {/* Keyboard-hint footer */}
        <div className="-mx-1 -mb-1 mt-1 flex items-center justify-between gap-4 border-t border-border/60 px-3 py-2.5 text-[11px] text-muted-foreground/60">
          <div className="flex items-center gap-3.5">
            <span className="flex items-center gap-1.5">
              <span className="flex gap-1">
                <Kbd>↑</Kbd>
                <Kbd>↓</Kbd>
              </span>
              navigate
            </span>
            <span className="flex items-center gap-1.5">
              <Kbd>↵</Kbd>
              open
            </span>
          </div>
          <span className="flex items-center gap-1.5">
            <Kbd>esc</Kbd>
            close
          </span>
        </div>
      </Command>
    </CommandDialog>
  )
}
