// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { createFileRoute } from '@tanstack/react-router'

import { AccountsPage } from '@/components/accounts/accounts-page'

export const Route = createFileRoute('/_terminal/accounts')({
  component: AccountsPage,
})
