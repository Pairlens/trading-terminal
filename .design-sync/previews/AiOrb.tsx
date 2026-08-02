// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { AiOrb } from '@pairlens/ui'

const wrap: React.CSSProperties = {
  padding: 24,
  display: 'flex',
  alignItems: 'center',
  gap: 20,
}

export const Idle = () => (
  <div style={wrap}>
    <AiOrb size="128px" state="idle" />
    <div>
      <div style={{ fontSize: 15, fontWeight: 600 }}>AI Co-pilot</div>
      <div style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>
        Idle · watching BTC/USDT
      </div>
    </div>
  </div>
)

export const Thinking = () => (
  <div style={wrap}>
    <AiOrb size="128px" state="thinking" />
    <div>
      <div style={{ fontSize: 15, fontWeight: 600 }}>Analyzing signal</div>
      <div style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>
        Breakout on 4h · assessing risk
      </div>
    </div>
  </div>
)

export const Sizes = () => (
  <div style={{ ...wrap, gap: 28 }}>
    <AiOrb size="28px" />
    <AiOrb size="56px" />
    <AiOrb size="96px" state="thinking" />
  </div>
)
