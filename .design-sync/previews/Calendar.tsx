// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { Calendar } from '@pairlens/ui'

export const BacktestDay = () => (
  <div style={{ padding: 16 }}>
    <Calendar
      mode="single"
      defaultMonth={new Date(2024, 4, 1)}
      selected={new Date(2024, 4, 14)}
    />
  </div>
)

export const BacktestRange = () => (
  <div style={{ padding: 16 }}>
    <Calendar
      mode="range"
      defaultMonth={new Date(2024, 4, 1)}
      selected={{
        from: new Date(2024, 4, 6),
        to: new Date(2024, 4, 17),
      }}
    />
  </div>
)
