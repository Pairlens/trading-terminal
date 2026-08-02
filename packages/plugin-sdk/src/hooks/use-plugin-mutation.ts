// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useMutation } from '@tanstack/react-query'
import type {
  UseMutationOptions,
  UseMutationResult,
} from '@tanstack/react-query'

export function usePluginMutation<
  TData = unknown,
  TError = Error,
  TVariables = void,
  TContext = unknown,
>(
  options: UseMutationOptions<TData, TError, TVariables, TContext>,
): UseMutationResult<TData, TError, TVariables, TContext> {
  return useMutation(options)
}
