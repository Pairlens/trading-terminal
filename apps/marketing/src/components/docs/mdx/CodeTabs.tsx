// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useEffect, useRef, useState } from 'react'

type Tab = { label: string; code: string }

export function CodeTabs({ tabs }: { tabs: Array<Tab> }) {
  const [active, setActive] = useState(0)
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const current = tabs[active] ?? tabs[0]

  useEffect(() => () => clearTimeout(timer.current), [])

  const copy = () => {
    // Prompts are decoration — copy the commands, not the `$`.
    navigator.clipboard
      ?.writeText(current.code.replace(/^\$ ?/gm, ''))
      .catch(() => {})
    setCopied(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopied(false), 1300)
  }

  return (
    <div className="pl-mock mt-[22px] overflow-hidden rounded-[14px] border border-border bg-[var(--pl-inset)]">
      <div
        className="flex items-center gap-1 border-b px-2.5 py-2"
        style={{
          borderColor: 'color-mix(in oklch, var(--border) 70%, transparent)',
        }}
      >
        {tabs.map((t, i) => (
          <button
            key={t.label}
            type="button"
            onClick={() => setActive(i)}
            aria-pressed={i === active}
            className={`rounded-lg px-[11px] py-[5px] font-mono text-[11.5px] font-semibold transition-colors ${
              i === active
                ? 'bg-foreground/9 text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
        <span className="flex-1" />
        <button
          type="button"
          onClick={copy}
          aria-label={`Copy the ${current.label} snippet`}
          className="grid size-[26px] place-items-center rounded-[7px] text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground"
        >
          {copied ? (
            <svg
              className="size-[13px]"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ color: 'var(--pl-green)' }}
              aria-hidden="true"
            >
              <path d="M20 6 9 17l-5-5" />
            </svg>
          ) : (
            <svg
              className="size-[13px]"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect width="13" height="13" x="9" y="9" rx="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          )}
        </button>
      </div>
      <pre className="overflow-x-auto font-mono">
        <code>
          {current.code.split('\n').map((line, i) => (
            <div key={i}>
              {line.startsWith('$') ? (
                <>
                  <span className="text-muted-foreground/60">{'$ '}</span>
                  <span className="text-foreground/85">
                    {line.slice(1).trimStart()}
                  </span>
                </>
              ) : line.startsWith('#') ? (
                <span className="text-muted-foreground/60">{line}</span>
              ) : (
                <span className="text-foreground/85">{line || ' '}</span>
              )}
            </div>
          ))}
        </code>
      </pre>
    </div>
  )
}
