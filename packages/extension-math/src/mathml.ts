import { escapeHTML } from '@trevixal/core'

/**
 * Turns a LaTeX source string into MathML markup. The result is inserted as
 * trusted `innerHTML`, so a renderer is responsible for escaping every piece
 * of the source it echoes.
 */
export type MathRenderer = (latex: string, display: boolean) => string

export interface LatexToMathMLOptions {
  /** Display (block) math gets `display="block"` and limits above/below large operators. */
  readonly display?: boolean
}

const MATHML_NS = 'http://www.w3.org/1998/Math/MathML'

/** U+2061 FUNCTION APPLICATION, the invisible operator after `sin` in `sin x`. */
const FUNCTION_APPLICATION = '<mo>&#x2061;</mo>'

/** Class the stylesheet colors so an unknown command is visible rather than silently dropped. */
const UNKNOWN_CLASS = 'trevixal-math__unknown'

// ---- symbol tables ---------------------------------------------------------

const GREEK_LOWER: Record<string, string> = {
  alpha: 'α',
  beta: 'β',
  gamma: 'γ',
  delta: 'δ',
  epsilon: 'ϵ',
  varepsilon: 'ε',
  zeta: 'ζ',
  eta: 'η',
  theta: 'θ',
  vartheta: 'ϑ',
  iota: 'ι',
  kappa: 'κ',
  varkappa: 'ϰ',
  lambda: 'λ',
  mu: 'μ',
  nu: 'ν',
  xi: 'ξ',
  omicron: 'ο',
  pi: 'π',
  varpi: 'ϖ',
  rho: 'ρ',
  varrho: 'ϱ',
  sigma: 'σ',
  varsigma: 'ς',
  tau: 'τ',
  upsilon: 'υ',
  phi: 'ϕ',
  varphi: 'φ',
  chi: 'χ',
  psi: 'ψ',
  omega: 'ω',
}

/** Uppercase Greek is upright in TeX, so these carry `mathvariant="normal"`. */
const GREEK_UPPER: Record<string, string> = {
  Gamma: 'Γ',
  Delta: 'Δ',
  Theta: 'Θ',
  Lambda: 'Λ',
  Xi: 'Ξ',
  Pi: 'Π',
  Sigma: 'Σ',
  Upsilon: 'Υ',
  Phi: 'Φ',
  Psi: 'Ψ',
  Omega: 'Ω',
}

/** Symbols that behave as identifiers (rendered in `<mi>`). */
const MI_SYMBOLS: Record<string, string> = {
  infty: '∞',
  partial: '∂',
  nabla: '∇',
  hbar: 'ℏ',
  ell: 'ℓ',
  Re: 'ℜ',
  Im: 'ℑ',
  aleph: 'ℵ',
  beth: 'ℶ',
  wp: '℘',
  emptyset: '∅',
  varnothing: '∅',
  imath: 'ı',
  jmath: 'ȷ',
  ldots: '…',
  dots: '…',
  cdots: '⋯',
  vdots: '⋮',
  ddots: '⋱',
  degree: '°',
}

/** Operators and relations (rendered in `<mo>`). */
const MO_SYMBOLS: Record<string, string> = {
  times: '×',
  div: '÷',
  cdot: '⋅',
  pm: '±',
  mp: '∓',
  ast: '∗',
  star: '⋆',
  circ: '∘',
  bullet: '•',
  oplus: '⊕',
  ominus: '⊖',
  otimes: '⊗',
  oslash: '⊘',
  odot: '⊙',
  leq: '≤',
  le: '≤',
  leqslant: '⩽',
  geq: '≥',
  ge: '≥',
  geqslant: '⩾',
  neq: '≠',
  ne: '≠',
  ll: '≪',
  gg: '≫',
  approx: '≈',
  equiv: '≡',
  sim: '∼',
  simeq: '≃',
  cong: '≅',
  propto: '∝',
  prec: '≺',
  succ: '≻',
  preceq: '⪯',
  succeq: '⪰',
  doteq: '≐',
  asymp: '≍',
  to: '→',
  rightarrow: '→',
  leftarrow: '←',
  gets: '←',
  leftrightarrow: '↔',
  Rightarrow: '⇒',
  Leftarrow: '⇐',
  Leftrightarrow: '⇔',
  implies: '⟹',
  iff: '⟺',
  impliedby: '⟸',
  longrightarrow: '⟶',
  longleftarrow: '⟵',
  longleftrightarrow: '⟷',
  Longrightarrow: '⟹',
  Longleftarrow: '⟸',
  Longleftrightarrow: '⟺',
  mapsto: '↦',
  longmapsto: '⟼',
  hookrightarrow: '↪',
  hookleftarrow: '↩',
  uparrow: '↑',
  downarrow: '↓',
  updownarrow: '↕',
  Uparrow: '⇑',
  Downarrow: '⇓',
  Updownarrow: '⇕',
  nearrow: '↗',
  searrow: '↘',
  swarrow: '↙',
  nwarrow: '↖',
  in: '∈',
  notin: '∉',
  ni: '∋',
  owns: '∋',
  subset: '⊂',
  subseteq: '⊆',
  subsetneq: '⊊',
  supset: '⊃',
  supseteq: '⊇',
  supsetneq: '⊋',
  cup: '∪',
  cap: '∩',
  setminus: '∖',
  smallsetminus: '∖',
  sqcup: '⊔',
  sqcap: '⊓',
  uplus: '⊎',
  forall: '∀',
  exists: '∃',
  nexists: '∄',
  neg: '¬',
  lnot: '¬',
  land: '∧',
  wedge: '∧',
  lor: '∨',
  vee: '∨',
  perp: '⊥',
  parallel: '∥',
  nparallel: '∦',
  angle: '∠',
  measuredangle: '∡',
  prime: '′',
  top: '⊤',
  bot: '⊥',
  vdash: '⊢',
  dashv: '⊣',
  models: '⊨',
  therefore: '∴',
  because: '∵',
  langle: '⟨',
  rangle: '⟩',
  lfloor: '⌊',
  rfloor: '⌋',
  lceil: '⌈',
  rceil: '⌉',
  lbrace: '{',
  rbrace: '}',
  lbrack: '[',
  rbrack: ']',
  vert: '|',
  lvert: '|',
  rvert: '|',
  Vert: '‖',
  lVert: '‖',
  rVert: '‖',
  mid: '∣',
  nmid: '∤',
  colon: ':',
  backslash: '\\',
  surd: '√',
  triangle: '△',
  triangleleft: '◃',
  triangleright: '▹',
  diamond: '⋄',
  dagger: '†',
  ddagger: '‡',
  amalg: '⨿',
  wr: '≀',
  bowtie: '⋈',
  ltimes: '⋉',
  rtimes: '⋊',
  checkmark: '✓',
}

/**
 * Operators whose scripts become limits above and below in display mode
 * (`munderover`) and side scripts inline (`msubsup`).
 */
const LARGE_OPERATORS: Record<string, string> = {
  sum: '∑',
  prod: '∏',
  coprod: '∐',
  int: '∫',
  iint: '∬',
  iiint: '∭',
  oint: '∮',
  oiint: '∯',
  bigcup: '⋃',
  bigcap: '⋂',
  bigvee: '⋁',
  bigwedge: '⋀',
  bigoplus: '⨁',
  bigotimes: '⨂',
  bigodot: '⨀',
  biguplus: '⨄',
  bigsqcup: '⨆',
}

/** Named functions: `<mi>name</mi>` followed by U+2061. */
const FUNCTIONS = new Set([
  'sin',
  'cos',
  'tan',
  'cot',
  'sec',
  'csc',
  'arcsin',
  'arccos',
  'arctan',
  'arccot',
  'sinh',
  'cosh',
  'tanh',
  'coth',
  'log',
  'ln',
  'lg',
  'exp',
  'min',
  'max',
  'sup',
  'inf',
  'det',
  'dim',
  'ker',
  'deg',
  'gcd',
  'lcm',
  'hom',
  'arg',
  'Pr',
  'lim',
  'limsup',
  'liminf',
])

/**
 * Functions whose subscript is a limit: `\lim_{x \to 0}` always puts the
 * limit underneath; `\max_{i}` and friends do so in display mode, like TeX.
 */
const LIMIT_FUNCTIONS: Record<string, 'always' | 'display'> = {
  lim: 'always',
  limsup: 'always',
  liminf: 'always',
  min: 'display',
  max: 'display',
  sup: 'display',
  inf: 'display',
  det: 'display',
  gcd: 'display',
  Pr: 'display',
  arg: 'display',
}

/** Display text for the multi-word function names. */
const FUNCTION_LABELS: Record<string, string> = {
  limsup: 'lim sup',
  liminf: 'lim inf',
}

/** Horizontal spacing commands, keyed by command name, valued in em. */
const SPACES: Record<string, string> = {
  ',': '0.167em',
  thinspace: '0.167em',
  ':': '0.222em',
  medspace: '0.222em',
  ';': '0.278em',
  thickspace: '0.278em',
  '!': '-0.167em',
  negthinspace: '-0.167em',
  negmedspace: '-0.222em',
  negthickspace: '-0.278em',
  ' ': '0.333em',
  enspace: '0.5em',
  enskip: '0.5em',
  quad: '1em',
  qquad: '2em',
}

/** `\%`-style escapes of characters that are otherwise syntax. */
const ESCAPED: Record<string, string> = {
  '%': '%',
  '&': '&',
  $: '$',
  '#': '#',
  _: '_',
  '{': '{',
  '}': '}',
  '|': '‖',
}

interface AccentSpec {
  readonly mark: string
  /** Render below (`munder`) instead of above. */
  readonly under?: boolean
  /** A decoration, not an accent: kept at full size and spaced like a line. */
  readonly line?: boolean
  readonly stretchy?: boolean
}

const ACCENTS: Record<string, AccentSpec> = {
  vec: { mark: '→' },
  hat: { mark: '^' },
  widehat: { mark: '^', stretchy: true },
  bar: { mark: '¯' },
  dot: { mark: '˙' },
  ddot: { mark: '¨' },
  dddot: { mark: '⃛' },
  tilde: { mark: '~' },
  widetilde: { mark: '~', stretchy: true },
  breve: { mark: '˘' },
  check: { mark: 'ˇ' },
  acute: { mark: '´' },
  grave: { mark: '`' },
  mathring: { mark: '˚' },
  overline: { mark: '¯', line: true },
  underline: { mark: '‾', line: true, under: true },
  overrightarrow: { mark: '→', stretchy: true },
  overleftarrow: { mark: '←', stretchy: true },
  overleftrightarrow: { mark: '↔', stretchy: true },
  underrightarrow: { mark: '→', stretchy: true, under: true },
  underleftarrow: { mark: '←', stretchy: true, under: true },
  overbrace: { mark: '⏞', stretchy: true },
  underbrace: { mark: '⏟', stretchy: true, under: true },
}

/** Delimiters spelled as commands, for `\left` / `\right` and `\big` sizes. */
const DELIMITERS: Record<string, string> = {
  '{': '{',
  '}': '}',
  '|': '‖',
  lbrace: '{',
  rbrace: '}',
  lbrack: '[',
  rbrack: ']',
  langle: '⟨',
  rangle: '⟩',
  lfloor: '⌊',
  rfloor: '⌋',
  lceil: '⌈',
  rceil: '⌉',
  vert: '|',
  lvert: '|',
  rvert: '|',
  Vert: '‖',
  lVert: '‖',
  rVert: '‖',
  backslash: '\\',
  uparrow: '↑',
  downarrow: '↓',
  updownarrow: '↕',
  Uparrow: '⇑',
  Downarrow: '⇓',
  Updownarrow: '⇕',
}

/** Characters that may follow `\left` / `\right` directly. `<`/`>` mean angle brackets. */
const CHAR_DELIMITERS: Record<string, string> = {
  '(': '(',
  ')': ')',
  '[': '[',
  ']': ']',
  '|': '|',
  '/': '/',
  '<': '⟨',
  '>': '⟩',
}

interface EnvironmentSpec {
  readonly open?: string
  readonly close?: string
  readonly columnalign?: string
}

const ENVIRONMENTS: Record<string, EnvironmentSpec> = {
  matrix: {},
  smallmatrix: {},
  pmatrix: { open: '(', close: ')' },
  bmatrix: { open: '[', close: ']' },
  Bmatrix: { open: '{', close: '}' },
  vmatrix: { open: '|', close: '|' },
  Vmatrix: { open: '‖', close: '‖' },
  cases: { open: '{', columnalign: 'left' },
  rcases: { close: '}', columnalign: 'left' },
  aligned: { columnalign: 'right left' },
  align: { columnalign: 'right left' },
  'align*': { columnalign: 'right left' },
  alignat: { columnalign: 'right left' },
  alignedat: { columnalign: 'right left' },
  split: { columnalign: 'right left' },
  eqnarray: { columnalign: 'right center left' },
  gather: { columnalign: 'center' },
  gathered: { columnalign: 'center' },
  array: {},
}

/** `\not` combined with a relation, where Unicode has a precomposed negation. */
const NEGATIONS: Record<string, string> = {
  '=': '≠',
  '∈': '∉',
  '∋': '∌',
  '≡': '≢',
  '∼': '≁',
  '≃': '≄',
  '≈': '≉',
  '≅': '≇',
  '<': '≮',
  '>': '≯',
  '≤': '≰',
  '≥': '≱',
  '⊂': '⊄',
  '⊃': '⊅',
  '⊆': '⊈',
  '⊇': '⊉',
  '∣': '∤',
  '∥': '∦',
  '∃': '∄',
  '⊢': '⊬',
  '⊨': '⊭',
}

/** ′ ″ ‴ ⁗ for one to four primes. */
const PRIMES = ['′', '″', '‴', '⁗']

// ---- alphabets ---------------------------------------------------------------

/** Letters whose double-struck form predates the Mathematical Alphanumeric block. */
const DOUBLE_STRUCK_SPECIAL: Record<string, string> = {
  C: 'ℂ',
  H: 'ℍ',
  N: 'ℕ',
  P: 'ℙ',
  Q: 'ℚ',
  R: 'ℝ',
  Z: 'ℤ',
}

const SCRIPT_SPECIAL: Record<string, string> = {
  B: 'ℬ',
  E: 'ℰ',
  F: 'ℱ',
  H: 'ℋ',
  I: 'ℐ',
  L: 'ℒ',
  M: 'ℳ',
  R: 'ℛ',
  e: 'ℯ',
  g: 'ℊ',
  o: 'ℴ',
}

function mapAlphabet(
  text: string,
  special: Record<string, string>,
  upperBase: number,
  lowerBase: number,
  digitBase: number | null,
): string {
  let out = ''
  for (const char of text) {
    const known = special[char]
    if (known) {
      out += known
      continue
    }
    const code = char.charCodeAt(0)
    if (code >= 65 && code <= 90) out += String.fromCodePoint(upperBase + code - 65)
    else if (code >= 97 && code <= 122) out += String.fromCodePoint(lowerBase + code - 97)
    else if (digitBase !== null && code >= 48 && code <= 57) {
      out += String.fromCodePoint(digitBase + code - 48)
    } else out += char
  }
  return out
}

/** `\mathbb`: A-Z, a-z, 0-9 to their double-struck code points. */
export function toDoubleStruck(text: string): string {
  return mapAlphabet(text, DOUBLE_STRUCK_SPECIAL, 0x1d538, 0x1d552, 0x1d7d8)
}

/** `\mathcal`: A-Z and a-z to their script code points. */
export function toScript(text: string): string {
  return mapAlphabet(text, SCRIPT_SPECIAL, 0x1d49c, 0x1d4b6, null)
}

// ---- parser ------------------------------------------------------------------

type MathVariant =
  | 'normal'
  | 'bold'
  | 'italic'
  | 'bold-italic'
  | 'double-struck'
  | 'script'
  | 'fraktur'
  | 'sans-serif'
  | 'monospace'

const FONT_COMMANDS: Record<string, MathVariant> = {
  mathrm: 'normal',
  mathbf: 'bold',
  boldsymbol: 'bold',
  bm: 'bold',
  mathit: 'italic',
  mathbb: 'double-struck',
  mathcal: 'script',
  mathscr: 'script',
  mathfrak: 'fraktur',
  mathsf: 'sans-serif',
  mathtt: 'monospace',
}

const TEXT_COMMANDS: Record<string, MathVariant | null> = {
  text: null,
  textrm: null,
  mbox: null,
  textnormal: null,
  textbf: 'bold',
  textit: 'italic',
  textsf: 'sans-serif',
  texttt: 'monospace',
}

/** Commands that only affect layout in TeX and have no MathML counterpart here. */
const IGNORED = new Set([
  'displaystyle',
  'textstyle',
  'scriptstyle',
  'scriptscriptstyle',
  'limits',
  'nolimits',
  'mathstrut',
  'strut',
  'nonumber',
  'notag',
  'allowbreak',
  'relax',
])

type Token =
  | { readonly kind: 'open'; readonly start: number; readonly end: number }
  | { readonly kind: 'close'; readonly start: number; readonly end: number }
  | { readonly kind: 'sup'; readonly start: number; readonly end: number }
  | { readonly kind: 'sub'; readonly start: number; readonly end: number }
  | { readonly kind: 'amp'; readonly start: number; readonly end: number }
  | { readonly kind: 'cmd'; readonly name: string; readonly start: number; readonly end: number }
  | { readonly kind: 'num'; readonly value: string; readonly start: number; readonly end: number }
  | { readonly kind: 'char'; readonly value: string; readonly start: number; readonly end: number }
  | { readonly kind: 'eof'; readonly start: number; readonly end: number }

/**
 * A rendered unit of the sequence. Scripts wrap `html`; `suffix` (function
 * application) trails whatever the scripts produced, so `\sin^2 x` becomes
 * `<msup><mi>sin</mi><mn>2</mn></msup><mo>⁡</mo><mi>x</mi>`.
 */
interface Item {
  readonly html: string
  readonly suffix?: string
  /** When scripts render as limits (munder/mover) rather than side scripts. */
  readonly limits?: 'always' | 'display'
}

/** Thrown inside the parser for input that cannot continue; caught at the top level. */
class MathSyntaxError extends Error {}

function merror(text: string): string {
  return `<merror><mtext>${escapeHTML(text)}</mtext></merror>`
}

/** One child stands alone; several are grouped; none yields `empty`. */
function group(items: readonly string[], empty = '<mrow></mrow>'): string {
  if (items.length === 0) return empty
  if (items.length === 1) return items[0] as string
  return `<mrow>${items.join('')}</mrow>`
}

/**
 * Table lookup by a name taken from the source. The tables are plain object
 * literals, so a bare index would also reach `Object.prototype`: `\constructor`
 * would find a function and splice its source into an attribute, and a page
 * that has polluted `Object.prototype` could plant markup there. Only own
 * keys count.
 */
function lookup<T>(table: Record<string, T>, key: string): T | undefined {
  return Object.hasOwn(table, key) ? table[key] : undefined
}

/** `escapeHTML` inverse for the entities it produces, so `\not<` can find `≮`. */
const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
}

const ENTITY = /&(?:amp|lt|gt|quot|#39);/g

const NUMBER = /^(?:\d+(?:\.\d+)?|\.\d+)/
const LETTERS = /^[A-Za-z]+/
const IS_LETTER = /^\p{L}$/u
const SAFE_LENGTH = /^-?(?:\d+\.?\d*|\.\d+)(?:em|ex|pt|px|cm|mm|in|rem)$/

class Parser {
  private pos = 0
  private readonly variants: MathVariant[] = []

  constructor(
    private readonly source: string,
    private readonly display: boolean,
  ) {}

  /**
   * Parse the whole source. Each top-level item is committed once complete,
   * so a construct that fails midway takes only itself and what follows into
   * the `<merror>`: `a + \frac{1}{2` renders `a +` and flags the fraction.
   */
  parseTop(): string {
    const items: string[] = []
    for (;;) {
      const token = this.peek()
      if (token.kind === 'eof') break
      if (token.kind === 'close') {
        // A stray closing brace is flagged in place; parsing carries on.
        this.pos = token.end
        items.push(merror('}'))
        continue
      }
      if (token.kind === 'amp') {
        this.pos = token.end
        continue
      }
      try {
        const html = this.parseItem()
        if (html) items.push(html)
      } catch (error) {
        if (!(error instanceof MathSyntaxError)) throw error
        items.push(merror(this.source.slice(token.start)))
        break
      }
    }
    return group(items, '')
  }

  // ---- scanning ----

  private peek(): Token {
    const source = this.source
    let i = this.pos
    for (;;) {
      while (i < source.length && /\s/.test(source[i] as string)) i++
      // `%` starts a TeX comment that runs to the end of the line.
      if (source[i] === '%') {
        while (i < source.length && source[i] !== '\n') i++
        continue
      }
      break
    }
    if (i >= source.length) return { kind: 'eof', start: i, end: i }
    const char = source[i] as string
    switch (char) {
      case '{':
        return { kind: 'open', start: i, end: i + 1 }
      case '}':
        return { kind: 'close', start: i, end: i + 1 }
      case '^':
        return { kind: 'sup', start: i, end: i + 1 }
      case '_':
        return { kind: 'sub', start: i, end: i + 1 }
      case '&':
        return { kind: 'amp', start: i, end: i + 1 }
      case '\\': {
        const rest = source.slice(i + 1)
        const letters = LETTERS.exec(rest)
        if (letters) {
          const name = letters[0]
          return { kind: 'cmd', name, start: i, end: i + 1 + name.length }
        }
        if (rest.length === 0) return { kind: 'cmd', name: '', start: i, end: i + 1 }
        // A control symbol: `\,` `\\` `\{` `\ `, exactly one character.
        return { kind: 'cmd', name: rest[0] as string, start: i, end: i + 2 }
      }
      default: {
        const number = NUMBER.exec(source.slice(i))
        if (number) {
          const value = number[0]
          return { kind: 'num', value, start: i, end: i + value.length }
        }
        const value = String.fromCodePoint(source.codePointAt(i) as number)
        return { kind: 'char', value, start: i, end: i + value.length }
      }
    }
  }

  private next(): Token {
    const token = this.peek()
    this.pos = token.end
    return token
  }

  private isPrime(token: Token): boolean {
    return token.kind === 'char' && token.value === "'"
  }

  /** Raw source between balanced braces, for `\text{…}` and environment names. */
  private readRawGroup(): string | null {
    const open = this.peek()
    if (open.kind !== 'open') return null
    const source = this.source
    let depth = 0
    for (let i = open.start; i < source.length; i++) {
      const char = source[i]
      if (char === '\\') {
        i++ // an escaped brace does not count
        continue
      }
      if (char === '{') depth++
      else if (char === '}') {
        depth--
        if (depth === 0) {
          this.pos = i + 1
          return source.slice(open.start + 1, i)
        }
      }
    }
    throw new MathSyntaxError('unclosed brace')
  }

  /** Raw source up to a closing `]`, for `\sqrt[n]` and `\\[2pt]`. */
  private readRawBracket(): string | null {
    const token = this.peek()
    if (token.kind !== 'char' || token.value !== '[') return null
    const close = this.source.indexOf(']', token.end)
    if (close === -1) return null
    this.pos = close + 1
    return this.source.slice(token.end, close)
  }

  // ---- sequences ----

  private parseSequence(stop: (token: Token) => boolean): string[] {
    const items: string[] = []
    for (;;) {
      const token = this.peek()
      if (token.kind === 'eof' || stop(token)) return items
      const html = this.parseItem()
      if (html) items.push(html)
    }
  }

  /** `{…}`: consumes both braces. */
  private parseGroup(): string {
    this.next() // {
    const items = this.parseSequence((token) => token.kind === 'close')
    if (this.peek().kind !== 'close') throw new MathSyntaxError('unclosed brace')
    this.next()
    return group(items)
  }

  /** An atom together with any `^`, `_` and prime scripts that follow it. */
  private parseItem(): string {
    const token = this.peek()
    let base: Item
    if (token.kind === 'sup' || token.kind === 'sub' || this.isPrime(token)) {
      // A script with nothing before it (`{}^2`, `^n` at the start) gets an empty base.
      base = { html: '<mrow></mrow>' }
    } else {
      const atom = this.parseAtom()
      if (atom === null) return ''
      base = atom
    }
    return this.attachScripts(base)
  }

  private attachScripts(base: Item): string {
    let sub: string | null = null
    let sup: string | null = null
    for (;;) {
      const token = this.peek()
      if (this.isPrime(token)) {
        let count = 0
        while (this.isPrime(this.peek())) {
          this.next()
          count++
        }
        const mark = PRIMES[count - 1] ?? '′'.repeat(count)
        const prime = `<mo>${mark}</mo>`
        sup = sup === null ? prime : `<mrow>${sup}${prime}</mrow>`
        continue
      }
      if (token.kind === 'sup') {
        this.next()
        const arg = this.parseArg()
        sup = sup === null ? arg : `<mrow>${sup}${arg}</mrow>`
        continue
      }
      if (token.kind === 'sub') {
        this.next()
        const arg = this.parseArg()
        sub = sub === null ? arg : `<mrow>${sub}${arg}</mrow>`
        continue
      }
      break
    }
    return this.scripted(base, sub, sup) + (base.suffix ?? '')
  }

  private scripted(base: Item, sub: string | null, sup: string | null): string {
    if (sub === null && sup === null) return base.html
    const limits = base.limits === 'always' || (base.limits === 'display' && this.display)
    if (sub !== null && sup !== null) {
      return limits
        ? `<munderover>${base.html}${sub}${sup}</munderover>`
        : `<msubsup>${base.html}${sub}${sup}</msubsup>`
    }
    if (sub !== null) {
      return limits ? `<munder>${base.html}${sub}</munder>` : `<msub>${base.html}${sub}</msub>`
    }
    return limits ? `<mover>${base.html}${sup}</mover>` : `<msup>${base.html}${sup}</msup>`
  }

  /**
   * One argument: a braced group, a command, or a single character. TeX
   * takes one token, so `x^12` is `x^1` followed by `2`.
   */
  private parseArg(): string {
    const token = this.peek()
    switch (token.kind) {
      case 'open':
        return this.parseGroup()
      case 'cmd': {
        const item = this.parseAtom()
        return item === null ? '<mrow></mrow>' : item.html + (item.suffix ?? '')
      }
      case 'num': {
        const first = token.value[0] as string
        this.pos = token.start + 1
        return first === '.' ? '<mo>.</mo>' : this.number(first)
      }
      case 'char':
        this.pos = token.end
        return this.renderChar(token.value)
      default:
        throw new MathSyntaxError('missing argument')
    }
  }

  private parseAtom(): Item | null {
    const token = this.peek()
    switch (token.kind) {
      case 'open':
        return { html: this.parseGroup() }
      case 'num':
        this.pos = token.end
        return { html: this.number(token.value) }
      case 'char':
        this.pos = token.end
        return { html: this.renderChar(token.value) }
      case 'cmd':
        this.pos = token.end
        return this.parseCommand(token.name)
      case 'amp':
        // Outside an environment a column separator means nothing.
        this.pos = token.end
        return null
      default:
        throw new MathSyntaxError(`unexpected ${token.kind}`)
    }
  }

  // ---- leaves ----

  private variant(): MathVariant | undefined {
    return this.variants[this.variants.length - 1]
  }

  private identifier(text: string, fallback?: MathVariant): string {
    const variant = this.variant() ?? fallback
    const escaped = escapeHTML(text)
    if (variant === undefined) return `<mi>${escaped}</mi>`
    if (variant === 'double-struck') return `<mi>${escapeHTML(toDoubleStruck(text))}</mi>`
    if (variant === 'script') return `<mi>${escapeHTML(toScript(text))}</mi>`
    return `<mi mathvariant="${variant}">${escaped}</mi>`
  }

  private number(value: string): string {
    const variant = this.variant()
    if (variant === 'double-struck') return `<mn>${toDoubleStruck(value)}</mn>`
    if (variant === 'bold' || variant === 'bold-italic')
      return `<mn mathvariant="bold">${value}</mn>`
    return `<mn>${value}</mn>`
  }

  private renderChar(value: string): string {
    // A hyphen in math is a minus sign; the ASCII hyphen renders too short.
    if (value === '-') return '<mo>−</mo>'
    if (value === "'") return '<mo>′</mo>'
    if (value === '~') return '<mspace width="0.333em"/>'
    if (IS_LETTER.test(value)) return this.identifier(value)
    return `<mo>${escapeHTML(value)}</mo>`
  }

  // ---- commands ----

  private parseCommand(name: string): Item | null {
    if (name === '\\') return { html: '<mspace linebreak="newline"/>' }
    const space = lookup(SPACES, name)
    if (space !== undefined) return { html: `<mspace width="${space}"/>` }
    const escaped = lookup(ESCAPED, name)
    if (escaped !== undefined) return { html: `<mo>${escapeHTML(escaped)}</mo>` }
    if (IGNORED.has(name)) return null

    switch (name) {
      case 'frac':
      case 'dfrac':
      case 'tfrac':
      case 'cfrac': {
        const numerator = this.parseArg()
        const denominator = this.parseArg()
        return { html: `<mfrac>${numerator}${denominator}</mfrac>` }
      }
      case 'binom':
      case 'dbinom':
      case 'tbinom': {
        const top = this.parseArg()
        const bottom = this.parseArg()
        return {
          html: `<mrow><mo>(</mo><mfrac linethickness="0">${top}${bottom}</mfrac><mo>)</mo></mrow>`,
        }
      }
      case 'sqrt':
        return { html: this.parseSqrt() }
      case 'operatorname': {
        const label = this.readRawGroup() ?? this.readSingleChar()
        return { html: `<mi>${escapeHTML(label.trim())}</mi>`, suffix: FUNCTION_APPLICATION }
      }
      case 'left':
        return { html: this.parseLeftRight() }
      case 'begin':
        return { html: this.parseEnvironment() }
      case 'not':
        return { html: this.parseNot() }
      case 'overset':
      case 'stackrel': {
        const over = this.parseArg()
        const base = this.parseArg()
        return { html: `<mover>${base}${over}</mover>` }
      }
      case 'underset': {
        const under = this.parseArg()
        const base = this.parseArg()
        return { html: `<munder>${base}${under}</munder>` }
      }
      case 'phantom':
      case 'hphantom':
      case 'vphantom':
        return { html: `<mphantom>${this.parseArg()}</mphantom>` }
      case 'hspace': {
        const raw = (this.readRawGroup() ?? '').trim()
        return SAFE_LENGTH.test(raw) ? { html: `<mspace width="${raw}"/>` } : null
      }
      default:
        break
    }

    if (/^[bB]igg?[lrm]?$/.test(name)) {
      const delimiter = this.parseDelimiter()
      return { html: delimiter === null ? '' : `<mo stretchy="true">${escapeHTML(delimiter)}</mo>` }
    }

    const font = lookup(FONT_COMMANDS, name)
    if (font !== undefined) return { html: this.parseFont(font) }
    if (Object.hasOwn(TEXT_COMMANDS, name)) {
      return { html: this.parseText(TEXT_COMMANDS[name] ?? null) }
    }
    const accent = lookup(ACCENTS, name)
    if (accent !== undefined) return { html: this.parseAccent(accent) }

    const lower = lookup(GREEK_LOWER, name)
    if (lower !== undefined) return { html: this.identifier(lower) }
    const upper = lookup(GREEK_UPPER, name)
    if (upper !== undefined) return { html: this.identifier(upper, 'normal') }
    const symbol = lookup(MI_SYMBOLS, name)
    if (symbol !== undefined) return { html: `<mi>${symbol}</mi>` }
    const operator = lookup(LARGE_OPERATORS, name)
    if (operator !== undefined) return { html: `<mo>${operator}</mo>`, limits: 'display' }
    if (FUNCTIONS.has(name)) {
      const label = lookup(FUNCTION_LABELS, name) ?? name
      return {
        html: `<mi>${label}</mi>`,
        suffix: FUNCTION_APPLICATION,
        limits: lookup(LIMIT_FUNCTIONS, name),
      }
    }
    const mo = lookup(MO_SYMBOLS, name)
    if (mo !== undefined) return { html: `<mo>${escapeHTML(mo)}</mo>` }

    return { html: `<mtext class="${UNKNOWN_CLASS}">${escapeHTML(`\\${name}`)}</mtext>` }
  }

  private readSingleChar(): string {
    const token = this.next()
    switch (token.kind) {
      case 'char':
        return token.value
      case 'num':
        return token.value
      case 'cmd':
        return `\\${token.name}`
      case 'eof':
        throw new MathSyntaxError('missing argument')
      default:
        return this.source.slice(token.start, token.end)
    }
  }

  private parseSqrt(): string {
    const token = this.peek()
    if (token.kind === 'char' && token.value === '[') {
      this.next()
      const index = this.parseSequence((t) => t.kind === 'char' && t.value === ']')
      if (this.peek().kind === 'eof') throw new MathSyntaxError('unclosed root index')
      this.next() // ]
      const base = this.parseArg()
      return `<mroot>${base}${group(index)}</mroot>`
    }
    return `<msqrt>${this.parseArg()}</msqrt>`
  }

  private parseFont(variant: MathVariant): string {
    // `\mathrm{max}` reads better as one upright identifier than as m·a·x.
    if (variant === 'normal' && this.peek().kind === 'open') {
      const before = this.pos
      const raw = this.readRawGroup() ?? ''
      if (/^[A-Za-z]+$/.test(raw)) return `<mi mathvariant="normal">${raw}</mi>`
      this.pos = before
    }
    this.variants.push(variant)
    try {
      return this.parseArg()
    } finally {
      this.variants.pop()
    }
  }

  private parseText(variant: MathVariant | null): string {
    const raw = this.readRawGroup() ?? this.readSingleChar()
    const attrs = variant === null ? '' : ` mathvariant="${variant}"`
    return `<mtext${attrs}>${escapeHTML(raw)}</mtext>`
  }

  private parseAccent(spec: AccentSpec): string {
    const base = this.parseArg()
    const stretchy = spec.stretchy ? ' stretchy="true"' : ''
    const mark = `<mo${stretchy}>${escapeHTML(spec.mark)}</mo>`
    if (spec.under) {
      const attrs = spec.line ? ' accentunder="false"' : ' accentunder="true"'
      return `<munder${attrs}>${base}${mark}</munder>`
    }
    const attrs = spec.line ? ' accent="false"' : ' accent="true"'
    return `<mover${attrs}>${base}${mark}</mover>`
  }

  /** The delimiter after `\left`, `\right` or `\big`; null for the invisible `.`. */
  private parseDelimiter(): string | null {
    const token = this.next()
    if (token.kind === 'char') {
      if (token.value === '.') return null
      return lookup(CHAR_DELIMITERS, token.value) ?? token.value
    }
    if (token.kind === 'cmd') {
      const known = lookup(DELIMITERS, token.name) ?? lookup(MO_SYMBOLS, token.name)
      if (known !== undefined) return known
    }
    throw new MathSyntaxError('bad delimiter')
  }

  private parseLeftRight(): string {
    const open = this.parseDelimiter()
    const items = this.parseSequence((token) => token.kind === 'cmd' && token.name === 'right')
    if (this.peek().kind === 'eof') throw new MathSyntaxError('missing \\right')
    this.next() // \right
    const close = this.parseDelimiter()
    const fence = (delimiter: string | null): string =>
      delimiter === null ? '' : `<mo stretchy="true">${escapeHTML(delimiter)}</mo>`
    return `<mrow>${fence(open)}${items.join('')}${fence(close)}</mrow>`
  }

  private parseNot(): string {
    const item = this.parseAtom()
    if (item === null) return '<mo>¬</mo>'
    const match = /^<mo>(.*)<\/mo>$/.exec(item.html)
    if (match) {
      const inner = match[1] as string
      // The captured text is already escaped, so `\not<` arrives as `&lt;`;
      // decode it to find the table entry, and keep the escaped form otherwise.
      const plain = inner.replace(ENTITY, (entity) => ENTITIES[entity] as string)
      // `\not=` and friends have precomposed negations; anything else takes U+0338.
      return `<mo>${lookup(NEGATIONS, plain) ?? `${inner}̸`}</mo>`
    }
    return `<mrow><mo>¬</mo>${item.html}${item.suffix ?? ''}</mrow>`
  }

  private parseEnvironment(): string {
    const name = (this.readRawGroup() ?? '').trim()
    const spec = lookup(ENVIRONMENTS, name) ?? {}
    let columnalign = spec.columnalign
    if (name === 'array') {
      const columns = this.readRawGroup() ?? ''
      const aligns: string[] = []
      for (const char of columns) {
        if (char === 'l') aligns.push('left')
        else if (char === 'c') aligns.push('center')
        else if (char === 'r') aligns.push('right')
      }
      if (aligns.length > 0) columnalign = aligns.join(' ')
    }

    const isRowEnd = (token: Token): boolean => token.kind === 'cmd' && token.name === '\\'
    const isEnd = (token: Token): boolean => token.kind === 'cmd' && token.name === 'end'
    const rows: string[][] = []
    let cells: string[] = []
    for (;;) {
      cells.push(
        group(
          this.parseSequence((token) => token.kind === 'amp' || isRowEnd(token) || isEnd(token)),
          '',
        ),
      )
      const token = this.peek()
      if (token.kind === 'eof') throw new MathSyntaxError('missing \\end')
      if (token.kind === 'amp') {
        this.next()
        continue
      }
      if (isRowEnd(token)) {
        this.next()
        this.readRawBracket() // optional row spacing: \\[2pt]
        rows.push(cells)
        cells = []
        continue
      }
      // \end{name}: a mismatched name is tolerated rather than flagged.
      this.next()
      this.readRawGroup()
      // A trailing `\\` before \end leaves one empty cell; that is not a row.
      if (cells.length > 1 || (cells[0] ?? '') !== '') rows.push(cells)
      break
    }

    const attrs = columnalign ? ` columnalign="${columnalign}"` : ''
    const body = rows
      .map((row) => `<mtr>${row.map((cell) => `<mtd>${cell}</mtd>`).join('')}</mtr>`)
      .join('')
    const table = `<mtable${attrs}>${body}</mtable>`
    if (spec.open === undefined && spec.close === undefined) return table
    const open = spec.open === undefined ? '' : `<mo>${escapeHTML(spec.open)}</mo>`
    const close = spec.close === undefined ? '' : `<mo>${escapeHTML(spec.close)}</mo>`
    return `<mrow>${open}${table}${close}</mrow>`
  }
}

/**
 * Convert a LaTeX formula to MathML. Never throws: an unknown command becomes
 * a flagged `<mtext>`, and a construct that cannot be completed (an unclosed
 * brace, a `\left` without `\right`) renders what came before it and puts the
 * rest in an `<merror>`. All echoed source text is escaped.
 */
export function latexToMathML(latex: string, options: LatexToMathMLOptions = {}): string {
  const display = options.display === true
  const source = typeof latex === 'string' ? latex : String(latex ?? '')
  let body: string
  try {
    body = new Parser(source, display).parseTop()
  } catch {
    // The parser reports its own failures; this catches anything unforeseen.
    body = merror(source)
  }
  return `<math xmlns="${MATHML_NS}" display="${display ? 'block' : 'inline'}">${body}</math>`
}

/** The built-in renderer: {@link latexToMathML} in the `MathRenderer` shape. */
export const defaultMathRenderer: MathRenderer = (latex, display) =>
  latexToMathML(latex, { display })
