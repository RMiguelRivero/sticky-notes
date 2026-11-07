import { describe, expect, it } from 'vitest'
import {
  CONTRAST_PAIRS,
  checkGamut,
  checkPairs,
  contrastRatio,
  isInSrgbGamut,
  oklchToSrgb,
  parseTokens,
  type Rgb,
  resolveToken,
  toHex,
} from './contrast.ts'
import tokensCss from './tokens.css?raw'

const tokens = parseTokens(tokensCss)

const WHITE: Rgb = { r: 1, g: 1, b: 1 }
const BLACK: Rgb = { r: 0, g: 0, b: 0 }

function gray(byte: number): Rgb {
  return { r: byte / 255, g: byte / 255, b: byte / 255 }
}

function expectRgb(actual: Rgb, expected: Rgb): void {
  expect(actual.r).toBeCloseTo(expected.r, 3)
  expect(actual.g).toBeCloseTo(expected.g, 3)
  expect(actual.b).toBeCloseTo(expected.b, 3)
}

describe('contrastRatio', () => {
  it('is 21:1 for white on black, in either order', () => {
    expect(contrastRatio(WHITE, BLACK)).toBeCloseTo(21, 10)
    expect(contrastRatio(BLACK, WHITE)).toBeCloseTo(21, 10)
  })

  it('is 1:1 for a color on itself', () => {
    expect(contrastRatio(gray(0x80), gray(0x80))).toBe(1)
  })

  it('matches the well-known gray values around the 4.5:1 text threshold', () => {
    expect(contrastRatio(gray(0x76), WHITE)).toBeCloseTo(4.54, 2)
    expect(contrastRatio(gray(0x77), WHITE)).toBeCloseTo(4.48, 2)
  })
})

describe('oklchToSrgb', () => {
  it('converts white and black', () => {
    expectRgb(oklchToSrgb({ l: 1, c: 0, h: 0 }), WHITE)
    expectRgb(oklchToSrgb({ l: 0, c: 0, h: 0 }), BLACK)
  })

  it('converts the sRGB primaries from their published oklch values', () => {
    expectRgb(oklchToSrgb({ l: 0.627955, c: 0.257683, h: 29.2339 }), { r: 1, g: 0, b: 0 })
    expectRgb(oklchToSrgb({ l: 0.86644, c: 0.294827, h: 142.4953 }), { r: 0, g: 1, b: 0 })
    expectRgb(oklchToSrgb({ l: 0.452014, c: 0.313214, h: 264.052 }), { r: 0, g: 0, b: 1 })
  })

  it('formats the result as hex', () => {
    expect(toHex(oklchToSrgb({ l: 0.627955, c: 0.257683, h: 29.2339 }))).toBe('#ff0000')
  })
})

describe('isInSrgbGamut', () => {
  it('accepts colors inside sRGB and rejects a chroma sRGB cannot show', () => {
    expect(isInSrgbGamut(oklchToSrgb({ l: 0.55, c: 0.13, h: 150 }))).toBe(true)
    expect(isInSrgbGamut(oklchToSrgb({ l: 0.7, c: 0.3, h: 150 }))).toBe(false)
  })
})

describe('resolveToken', () => {
  const sample = parseTokens(`
    /* --ignored: oklch(0 0 0); */
    --color-primary: oklch(0.5 0.1 150);
    --color-alias: var(--color-primary);
    --color-dark: oklch(from var(--color-alias) calc(l - 0.2) c h);
    --color-red: oklch(from var(--color-primary) 0.6 0.15 calc(h - 125));
    --color-wrap: oklch(from var(--color-primary) l c calc(h + 300));
    --color-loop: var(--color-loop);
    --color-bad: oklch(from var(--color-primary) calc(l * 2) c h);
  `)

  it('ignores comments', () => {
    expect(sample.has('--ignored')).toBe(false)
  })

  it('follows var() references and evaluates relative channels', () => {
    expect(resolveToken('--color-alias', sample)).toEqual({ l: 0.5, c: 0.1, h: 150 })
    const dark = resolveToken('--color-dark', sample)
    expect(dark.l).toBeCloseTo(0.3, 10)
    expect(dark.c).toBe(0.1)
    expect(dark.h).toBe(150)
  })

  it('offsets and wraps the hue', () => {
    expect(resolveToken('--color-red', sample).h).toBe(25)
    expect(resolveToken('--color-wrap', sample).h).toBe(90)
  })

  it('rejects circular references, unknown tokens and unsupported formulas', () => {
    expect(() => resolveToken('--color-loop', sample)).toThrow(/Circular/)
    expect(() => resolveToken('--color-missing', sample)).toThrow(/Unknown/)
    expect(() => resolveToken('--color-bad', sample)).toThrow(/Unsupported/)
  })
})

describe('tokens.css', () => {
  it('defines every token the contrast pairs use', () => {
    for (const pair of CONTRAST_PAIRS) {
      expect(tokens.has(pair.foreground), pair.foreground).toBe(true)
      expect(tokens.has(pair.background), pair.background).toBe(true)
    }
  })

  it('keeps every color token inside the sRGB gamut', () => {
    const outOfGamut = checkGamut(tokens)
      .filter((result) => !result.inGamut)
      .map((result) => result.name)
    expect(outOfGamut).toEqual([])
  })

  it.each(checkPairs(tokens))(
    '$purpose reaches $required:1 ($foreground on $background)',
    (result) => {
      expect(result.ratio).toBeGreaterThanOrEqual(result.required)
    },
  )
})
