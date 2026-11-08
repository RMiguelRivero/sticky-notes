import { describe, expect, expectTypeOf, it } from 'vitest'
import { assertNever } from './assertNever.ts'

// The parameter is `never`, so a real call site can't pass a value without a cast.
// Reflect.apply reaches the runtime branch the same way a bad value from outside would.
function callWith(value: unknown): void {
  Reflect.apply(assertNever, undefined, [value])
}

describe('assertNever', () => {
  it('throws and includes a string value in the message', () => {
    expect(() => callWith('mystery')).toThrow('Unexpected value: "mystery"')
  })

  it('serializes an object value in the message', () => {
    expect(() => callWith({ type: 'unknown' })).toThrow('Unexpected value: {"type":"unknown"}')
  })

  it('is typed to accept only never and to never return', () => {
    expectTypeOf(assertNever).toEqualTypeOf<(value: never) => never>()
  })
})
