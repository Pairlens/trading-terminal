// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

type GridPickerProps = {
  onSelect: (cols: number, rows: number) => void
}

const MAX_COLS = 4
const MAX_ROWS = 4

export function GridPicker({ onSelect }: GridPickerProps) {
  const { t } = useTranslation()
  const [hovered, setHovered] = useState<{ col: number; row: number } | null>(
    null,
  )

  return (
    <div className="flex flex-col items-center gap-2 p-2">
      <p className="text-[10px] text-muted-foreground">
        {t('layout.gridPickerHint')}
      </p>
      <div
        className="grid gap-[3px]"
        style={{
          gridTemplateColumns: `repeat(${MAX_COLS}, 24px)`,
          gridTemplateRows: `repeat(${MAX_ROWS}, 24px)`,
        }}
        onMouseLeave={() => setHovered(null)}
      >
        {Array.from({ length: MAX_ROWS }, (_, row) =>
          Array.from({ length: MAX_COLS }, (_cell, col) => {
            const isHighlighted =
              hovered !== null && col < hovered.col && row < hovered.row
            return (
              <button
                key={`${col}-${row}`}
                type="button"
                className={`size-6 rounded-sm border transition-colors ${
                  isHighlighted
                    ? 'border-primary bg-primary/20'
                    : 'border-muted-foreground/20 bg-muted/40 hover:border-muted-foreground/40'
                }`}
                onMouseEnter={() => setHovered({ col: col + 1, row: row + 1 })}
                onClick={() => onSelect(col + 1, row + 1)}
              />
            )
          }),
        )}
      </div>
      {hovered && (
        <p className="text-xs font-medium text-foreground">
          {hovered.col} &times; {hovered.row}
        </p>
      )}
    </div>
  )
}
