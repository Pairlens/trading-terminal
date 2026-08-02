// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { Kbd, KbdGroup } from '@pairlens/ui'

const col: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  padding: 16,
  fontSize: 13,
  color: 'var(--muted-foreground)',
}

const line: React.CSSProperties = {
  display: 'flex',
  gap: 10,
  alignItems: 'center',
}

export const Shortcuts = () => (
  <div style={col}>
    <div style={line}>
      <KbdGroup>
        <Kbd>⌘</Kbd>
        <Kbd>K</Kbd>
      </KbdGroup>
      <span>Open command palette</span>
    </div>
    <div style={line}>
      <KbdGroup>
        <Kbd>⌘</Kbd>
        <Kbd>B</Kbd>
      </KbdGroup>
      <span>Quick buy at market</span>
    </div>
    <div style={line}>
      <Kbd>Esc</Kbd>
      <span>Cancel order ticket</span>
    </div>
  </div>
)

export const Combos = () => (
  <div style={{ ...col, flexDirection: 'row', flexWrap: 'wrap' }}>
    <KbdGroup>
      <Kbd>⌘</Kbd>
      <Kbd>⇧</Kbd>
      <Kbd>P</Kbd>
    </KbdGroup>
    <KbdGroup>
      <Kbd>⌥</Kbd>
      <Kbd>Enter</Kbd>
    </KbdGroup>
    <KbdGroup>
      <Kbd>Ctrl</Kbd>
      <Kbd>Z</Kbd>
    </KbdGroup>
  </div>
)

export const Inline = () => (
  <div style={{ ...col, fontSize: 14 }}>
    <span>
      Press <Kbd>/</Kbd> to search pairs, then <Kbd>Enter</Kbd> to load the
      chart.
    </span>
    <span>
      Toggle the AI co-pilot with{' '}
      <KbdGroup>
        <Kbd>⌘</Kbd>
        <Kbd>J</Kbd>
      </KbdGroup>
      .
    </span>
  </div>
)
