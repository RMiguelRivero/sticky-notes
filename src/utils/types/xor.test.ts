import { expectTypeOf, test } from 'vitest'
import type { XOR } from './xor.ts'

type ByRect = { readonly rect: { readonly x: number } }
type ByPoint = { readonly point: { readonly y: number } }
type Either = XOR<ByRect, ByPoint>

test('XOR accepts each side alone', () => {
  expectTypeOf<{ rect: { x: number } }>().toExtend<Either>()
  expectTypeOf<{ point: { y: number } }>().toExtend<Either>()
})

test('XOR rejects both sides at once and neither side', () => {
  expectTypeOf<{ rect: { x: number }; point: { y: number } }>().not.toExtend<Either>()
  expectTypeOf<Record<never, never>>().not.toExtend<Either>()
})

test('XOR keeps keys the two sides share', () => {
  type A = { readonly id: string; readonly a: number }
  type B = { readonly id: string; readonly b: number }
  expectTypeOf<{ id: string; a: number }>().toExtend<XOR<A, B>>()
  expectTypeOf<{ id: string; a: number; b: number }>().not.toExtend<XOR<A, B>>()
})

test('XOR works with ten members', () => {
  type M1 = { readonly kind: 1; readonly k1: number }
  type M2 = { readonly kind: 2; readonly k2: number }
  type M3 = { readonly kind: 3; readonly k3: number }
  type M4 = { readonly kind: 4; readonly k4: number }
  type M5 = { readonly kind: 5; readonly k5: number }
  type M6 = { readonly kind: 6; readonly k6: number }
  type M7 = { readonly kind: 7; readonly k7: number }
  type M8 = { readonly kind: 8; readonly k8: number }
  type M9 = { readonly kind: 9; readonly k9: number }
  type M10 = { readonly kind: 10; readonly k10: number }
  type Ten = XOR<M1, M2, M3, M4, M5, M6, M7, M8, M9, M10>
  expectTypeOf<{ kind: 1; k1: number }>().toExtend<Ten>()
  expectTypeOf<{ kind: 10; k10: number }>().toExtend<Ten>()
  expectTypeOf<{ kind: 1; k1: number; k5: number }>().not.toExtend<Ten>()
  expectTypeOf<{ kind: 10; k10: number; k2: number }>().not.toExtend<Ten>()
})
