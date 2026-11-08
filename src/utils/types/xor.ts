type KeysOfUnion<U> = U extends unknown ? keyof U : never

type OneOf<U, All = U> = U extends unknown
  ? U & { readonly [K in Exclude<KeysOfUnion<All>, keyof U>]?: never }
  : never

export type XOR<
  T1,
  T2,
  T3 = never,
  T4 = never,
  T5 = never,
  T6 = never,
  T7 = never,
  T8 = never,
  T9 = never,
  T10 = never,
> = OneOf<T1 | T2 | T3 | T4 | T5 | T6 | T7 | T8 | T9 | T10>
