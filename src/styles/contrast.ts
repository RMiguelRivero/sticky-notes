// Pure helpers that prove the color tokens in tokens.css meet WCAG 2.2 AA contrast.
// They evaluate the same formulas the browser does, so the numbers match what users see.
// No DOM and no Node imports: the test and scripts/contrast.ts feed in the CSS text.

export type Oklch = { readonly l: number; readonly c: number; readonly h: number }

/** Gamma-encoded sRGB channels. 0..1 inside the gamut; values outside mean out of gamut. */
export type Rgb = { readonly r: number; readonly g: number; readonly b: number }

export type PairKind = 'text' | 'non-text'

export type ContrastPair = {
  readonly foreground: string
  readonly background: string
  readonly kind: PairKind
  readonly purpose: string
}

export type PairResult = ContrastPair & {
  readonly ratio: number
  readonly required: number
  readonly passes: boolean
}

export type GamutResult = {
  readonly name: string
  readonly color: Oklch
  readonly hex: string
  readonly inGamut: boolean
}

/** WCAG 2.2: 1.4.3 for text, 1.4.11 for UI components and graphics. */
export const REQUIRED_RATIO: { readonly [K in PairKind]: number } = {
  text: 4.5,
  'non-text': 3,
}

export const BASE_TOKEN = '--color-primary'

const NOTE_TOKENS = ['--note-yellow', '--note-pink', '--note-blue', '--note-orange'] as const
const MAIN_SURFACES = ['--color-bg', '--color-surface'] as const
const ALL_SURFACES = ['--color-bg', '--color-surface', '--color-surface-raised'] as const

function label(token: string): string {
  const name = token.replace(/^--(color|note)-/, '')
  return token.startsWith('--note-') ? `${name} notes` : name
}

export const CONTRAST_PAIRS: readonly ContrastPair[] = [
  ...ALL_SURFACES.flatMap((bg): ContrastPair[] => [
    {
      foreground: '--color-text',
      background: bg,
      kind: 'text',
      purpose: `Body text on ${label(bg)}`,
    },
    {
      foreground: '--color-text-muted',
      background: bg,
      kind: 'text',
      purpose: `Secondary text on ${label(bg)}`,
    },
  ]),
  ...NOTE_TOKENS.map(
    (note): ContrastPair => ({
      foreground: '--color-text',
      background: note,
      kind: 'text',
      purpose: `Note text on ${label(note)}`,
    }),
  ),
  ...(['--color-accent', '--color-accent-hover', '--color-accent-active'] as const).map(
    (accent): ContrastPair => ({
      foreground: '--color-text-on-accent',
      background: accent,
      kind: 'text',
      purpose: `Button label on ${label(accent)}`,
    }),
  ),
  ...MAIN_SURFACES.flatMap((bg): ContrastPair[] => [
    {
      foreground: '--color-border',
      background: bg,
      kind: 'non-text',
      purpose: `Control border on ${label(bg)}`,
    },
    {
      foreground: '--color-border-strong',
      background: bg,
      kind: 'non-text',
      purpose: `Strong border on ${label(bg)}`,
    },
    {
      foreground: '--color-accent',
      background: bg,
      kind: 'non-text',
      purpose: `Accent button on ${label(bg)}`,
    },
  ]),
  ...[...ALL_SURFACES, ...NOTE_TOKENS].map(
    (bg): ContrastPair => ({
      foreground: '--color-focus',
      background: bg,
      kind: 'non-text',
      purpose: `Focus ring on ${label(bg)}`,
    }),
  ),
  ...NOTE_TOKENS.map(
    (note): ContrastPair => ({
      foreground: '--color-border',
      background: note,
      kind: 'non-text',
      purpose: `Note border on ${label(note)}`,
    }),
  ),
  ...MAIN_SURFACES.flatMap((bg): ContrastPair[] => [
    {
      foreground: '--color-danger',
      background: bg,
      kind: 'non-text',
      purpose: `Trash zone on ${label(bg)}`,
    },
    {
      foreground: '--color-danger-active',
      background: bg,
      kind: 'non-text',
      purpose: `Trash zone armed on ${label(bg)}`,
    },
  ]),
]

/** Reads every `--name: value;` declaration, ignoring comments. Later declarations win. */
export function parseTokens(css: string): ReadonlyMap<string, string> {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const tokens = new Map<string, string>()
  for (const match of withoutComments.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    const [, name, value] = match
    if (name !== undefined && value !== undefined) {
      tokens.set(name, value.trim())
    }
  }
  return tokens
}

/** Names of the tokens that hold a color: the `--color-*` and `--note-*` families. */
export function colorTokenNames(tokens: ReadonlyMap<string, string>): readonly string[] {
  return [...tokens.keys()].filter((name) => /^--(color|note)-/.test(name))
}

const NUMBER = String.raw`-?\d*\.?\d+`
const NUMBER_ONLY = new RegExp(`^${NUMBER}$`)
const CALC = new RegExp(String.raw`^calc\(\s*([lch])\s*([+-])\s*(${NUMBER})\s*\)$`)
const VAR = /^var\(\s*(--[\w-]+)\s*\)$/
const RELATIVE = /^oklch\(\s*from\s+var\(\s*(--[\w-]+)\s*\)\s+(.+)\)$/
const LITERAL = /^oklch\(\s*([^()]+)\)$/

type Channel = keyof Oklch

function isChannel(value: string | undefined): value is Channel {
  return value === 'l' || value === 'c' || value === 'h'
}

/** Evaluates one channel: a number, a channel keyword (`h`), or `calc(h - 125)`. */
function evaluateChannel(expression: string, origin: Oklch | null): number {
  if (NUMBER_ONLY.test(expression)) {
    return Number(expression)
  }
  if (origin === null) {
    throw new Error(`Channel keyword "${expression}" is only allowed in a relative color`)
  }
  if (isChannel(expression)) {
    return origin[expression]
  }
  const calc = CALC.exec(expression)
  if (calc !== null) {
    const [, keyword, operator, amount] = calc
    if (isChannel(keyword)) {
      const offset = Number(amount)
      return operator === '+' ? origin[keyword] + offset : origin[keyword] - offset
    }
  }
  throw new Error(`Unsupported channel expression "${expression}"`)
}

function evaluateChannels(source: string, origin: Oklch | null): Oklch {
  const parts = source.match(/calc\([^)]*\)|\S+/g) ?? []
  const [l, c, h] = parts
  if (parts.length !== 3 || l === undefined || c === undefined || h === undefined) {
    throw new Error(`Expected three channels in "${source}"`)
  }
  return {
    l: evaluateChannel(l, origin),
    c: evaluateChannel(c, origin),
    // CSS wraps hues, so calc(h - 200) and calc(h + 160) are the same color.
    h: ((evaluateChannel(h, origin) % 360) + 360) % 360,
  }
}

/** Resolves a token to an oklch color, following var() references and relative colors. */
export function resolveToken(
  name: string,
  tokens: ReadonlyMap<string, string>,
  seen: ReadonlySet<string> = new Set(),
): Oklch {
  if (seen.has(name)) {
    throw new Error(`Circular reference through ${name}`)
  }
  const value = tokens.get(name)
  if (value === undefined) {
    throw new Error(`Unknown token ${name}`)
  }
  const visited = new Set([...seen, name])

  const reference = VAR.exec(value)
  if (reference?.[1] !== undefined) {
    return resolveToken(reference[1], tokens, visited)
  }
  const relative = RELATIVE.exec(value)
  if (relative?.[1] !== undefined && relative[2] !== undefined) {
    return evaluateChannels(relative[2], resolveToken(relative[1], tokens, visited))
  }
  const literal = LITERAL.exec(value)
  if (literal?.[1] !== undefined) {
    return evaluateChannels(literal[1], null)
  }
  throw new Error(`Unsupported value for ${name}: "${value}"`)
}

function encodeGamma(linear: number): number {
  const magnitude = Math.abs(linear)
  const encoded =
    magnitude <= 0.0031308 ? 12.92 * magnitude : 1.055 * magnitude ** (1 / 2.4) - 0.055
  return Math.sign(linear) * encoded
}

/** OKLCH → OKLab → linear sRGB → sRGB, using the matrices from Björn Ottosson's OKLab spec. */
export function oklchToSrgb({ l, c, h }: Oklch): Rgb {
  const radians = (h * Math.PI) / 180
  const a = c * Math.cos(radians)
  const b = c * Math.sin(radians)

  const lCone = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const mCone = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const sCone = (l - 0.0894841775 * a - 1.291485548 * b) ** 3

  return {
    r: encodeGamma(4.0767416621 * lCone - 3.3077115913 * mCone + 0.2309699292 * sCone),
    g: encodeGamma(-1.2684380046 * lCone + 2.6097574011 * mCone - 0.3413193965 * sCone),
    b: encodeGamma(-0.0041960863 * lCone - 0.7034186147 * mCone + 1.707614701 * sCone),
  }
}

/** Tolerance for floating-point noise, far below one 8-bit step (1/255 ≈ 0.004). */
const GAMUT_EPSILON = 1e-4

export function isInSrgbGamut({ r, g, b }: Rgb): boolean {
  return [r, g, b].every((channel) => channel >= -GAMUT_EPSILON && channel <= 1 + GAMUT_EPSILON)
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

export function toHex({ r, g, b }: Rgb): string {
  return `#${[r, g, b]
    .map((channel) =>
      Math.round(clamp01(channel) * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`
}

function linearize(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
}

/** WCAG 2.x relative luminance. Channels are clamped, as the browser clips them. */
export function relativeLuminance({ r, g, b }: Rgb): number {
  return (
    0.2126 * linearize(clamp01(r)) + 0.7152 * linearize(clamp01(g)) + 0.0722 * linearize(clamp01(b))
  )
}

/** WCAG 2.x contrast ratio, from 1 (same color) to 21 (black on white). Order does not matter. */
export function contrastRatio(first: Rgb, second: Rgb): number {
  const a = relativeLuminance(first)
  const b = relativeLuminance(second)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

export function checkPairs(
  tokens: ReadonlyMap<string, string>,
  pairs: readonly ContrastPair[] = CONTRAST_PAIRS,
): readonly PairResult[] {
  return pairs.map((pair) => {
    const ratio = contrastRatio(
      oklchToSrgb(resolveToken(pair.foreground, tokens)),
      oklchToSrgb(resolveToken(pair.background, tokens)),
    )
    const required = REQUIRED_RATIO[pair.kind]
    return { ...pair, ratio, required, passes: ratio >= required }
  })
}

export function checkGamut(tokens: ReadonlyMap<string, string>): readonly GamutResult[] {
  return colorTokenNames(tokens).map((name) => {
    const color = resolveToken(name, tokens)
    const rgb = oklchToSrgb(color)
    return { name, color, hex: toHex(rgb), inGamut: isInSrgbGamut(rgb) }
  })
}
