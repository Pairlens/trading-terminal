// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
  InputOTPSeparator,
  Label,
} from '@pairlens/ui'

export const SignInCode = () => (
  <div style={{ padding: 16, display: 'grid', gap: 8 }}>
    <Label>Enter the 6-digit code sent to your email</Label>
    <InputOTP maxLength={6} value="482913">
      <InputOTPGroup>
        <InputOTPSlot index={0} />
        <InputOTPSlot index={1} />
        <InputOTPSlot index={2} />
      </InputOTPGroup>
      <InputOTPSeparator />
      <InputOTPGroup>
        <InputOTPSlot index={3} />
        <InputOTPSlot index={4} />
        <InputOTPSlot index={5} />
      </InputOTPGroup>
    </InputOTP>
  </div>
)

export const Partial = () => (
  <div style={{ padding: 16, display: 'grid', gap: 8 }}>
    <Label>Confirm withdrawal — 2FA</Label>
    <InputOTP maxLength={6} value="491">
      <InputOTPGroup>
        <InputOTPSlot index={0} />
        <InputOTPSlot index={1} />
        <InputOTPSlot index={2} />
        <InputOTPSlot index={3} />
        <InputOTPSlot index={4} />
        <InputOTPSlot index={5} />
      </InputOTPGroup>
    </InputOTP>
  </div>
)
