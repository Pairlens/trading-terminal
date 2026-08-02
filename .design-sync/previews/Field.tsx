// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import {
  Field,
  FieldLabel,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldSet,
  FieldLegend,
  FieldSeparator,
  FieldContent,
  FieldTitle,
  Input,
  Switch,
} from '@pairlens/ui'

export const LabeledInput = () => (
  <div style={{ padding: 16, maxWidth: 380 }}>
    <Field>
      <FieldLabel htmlFor="take-profit">Take-profit price</FieldLabel>
      <Input id="take-profit" inputMode="decimal" defaultValue="3,650.00" />
      <FieldDescription>
        Order fills automatically when BTC/USDT reaches this level on OKX.
      </FieldDescription>
    </Field>
  </div>
)

export const Invalid = () => (
  <div style={{ padding: 16, maxWidth: 380 }}>
    <Field data-invalid="true">
      <FieldLabel htmlFor="size">Order size (BTC)</FieldLabel>
      <Input id="size" aria-invalid defaultValue="12.5" />
      <FieldError>
        Exceeds your 5% max position guardrail for this account.
      </FieldError>
    </Field>
  </div>
)

export const FieldSetGroup = () => (
  <div style={{ padding: 16, maxWidth: 380 }}>
    <FieldSet>
      <FieldLegend>Risk guardrails</FieldLegend>
      <FieldDescription>
        Enforced at the infrastructure level before any order routes.
      </FieldDescription>
      <FieldGroup>
        <Field orientation="horizontal">
          <FieldContent>
            <FieldTitle>Daily drawdown stop</FieldTitle>
            <FieldDescription>
              Pause trading after a 5% account loss.
            </FieldDescription>
          </FieldContent>
          <Switch defaultChecked />
        </Field>
        <FieldSeparator />
        <Field orientation="horizontal">
          <FieldContent>
            <FieldTitle>Require co-pilot APPROVE</FieldTitle>
            <FieldDescription>
              Block orders the AI rates BLOCK.
            </FieldDescription>
          </FieldContent>
          <Switch />
        </Field>
      </FieldGroup>
    </FieldSet>
  </div>
)
