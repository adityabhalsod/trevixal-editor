/**
 * Language definitions for {@link createHighlighter}. Each is a small set of
 * rules rather than a grammar: enough to colour code correctly in an editor,
 * without pulling a parser into the bundle.
 *
 * Rules are tried in order at each position, so the specific ones (comments,
 * strings) must precede the general ones (identifiers).
 */
export interface LanguageRule {
  /** Must be sticky (`y`); matched at the current position only. */
  readonly pattern: RegExp
  readonly className: string
  /**
   * When set, the match only counts as this token if the captured text is a
   * keyword of the language, otherwise it falls through to `otherwise`.
   */
  readonly keywords?: ReadonlySet<string>
  readonly otherwise?: string
  /**
   * The class only applies when the text right after the match matches this
   * (also sticky). Kept out of `pattern` rather than written as a trailing
   * lookahead so that the scanner still learns how long the lexeme was when
   * the condition fails. A lookahead hides that, and the scanner then
   * re-tries every rule at every offset inside the same word, which is
   * quadratic on a long one.
   */
  readonly followedBy?: RegExp
}

export interface LanguageDefinition {
  readonly name: string
  /**
   * How the language is written for a human: "SQL", not "Sql". Title-casing
   * the id gets acronyms and camel-cased names wrong, so each definition
   * carries its own. Falls back to the id when omitted.
   */
  readonly displayName?: string
  /** Extra names that select this definition (`js`, `ts`, `py`…). */
  readonly aliases?: readonly string[]
  readonly rules: readonly LanguageRule[]
}

const words = (list: string): ReadonlySet<string> => new Set(list.split(' '))

// Shared building blocks. Every pattern is sticky and anchored by the scanner.
const LINE_COMMENT = (prefix: string): LanguageRule => ({
  pattern: new RegExp(`${prefix}[^\\n]*`, 'y'),
  className: 'tvx-tok-comment',
})

const BLOCK_COMMENT: LanguageRule = {
  pattern: /\/\*[\s\S]*?(?:\*\/|$)/y,
  className: 'tvx-tok-comment',
}

/** Quoted strings, tolerating an unterminated one at end of input. */
const STRING = (quotes: string): LanguageRule => ({
  pattern: new RegExp(`([${quotes}])(?:\\\\[\\s\\S]|(?!\\1)[^\\\\])*(?:\\1|$)`, 'y'),
  className: 'tvx-tok-string',
})

const NUMBER: LanguageRule = {
  pattern: /(?:0[xXbBoO][0-9a-fA-F_]+|\d[\d_]*(?:\.[\d_]+)?(?:[eE][+-]?\d+)?)n?/y,
  className: 'tvx-tok-number',
}

const IDENT = (keywords: ReadonlySet<string>, builtins?: ReadonlySet<string>): LanguageRule[] => [
  { pattern: /[A-Za-z_$][\w$]*/y, className: 'tvx-tok-keyword', keywords },
  ...(builtins
    ? [{ pattern: /[A-Za-z_$][\w$]*/y, className: 'tvx-tok-builtin', keywords: builtins }]
    : []),
]

const FUNCTION_CALL: LanguageRule = {
  // An identifier immediately followed by `(` reads as a call.
  pattern: /[A-Za-z_$][\w$]*/y,
  followedBy: /\s*\(/y,
  className: 'tvx-tok-function',
}

const OPERATOR = (chars: string): LanguageRule => ({
  pattern: new RegExp(`[${chars}]+`, 'y'),
  className: 'tvx-tok-operator',
})

// --------------------------------------------------------------- JavaScript
const JS_KEYWORDS = words(
  'const let var function return if else for while do break continue class extends new ' +
    'import export from default async await try catch finally throw typeof instanceof in of ' +
    'this super switch case delete void yield static get set',
)
const JS_BUILTINS = words(
  'true false null undefined NaN Infinity console Math JSON Object Array String Number ' +
    'Boolean Promise Map Set Symbol Date RegExp Error window document globalThis',
)

const javascript: LanguageDefinition = {
  name: 'javascript',
  displayName: 'JavaScript',
  aliases: ['js', 'jsx', 'mjs', 'cjs'],
  rules: [
    LINE_COMMENT('//'),
    BLOCK_COMMENT,
    STRING('"\'`'),
    NUMBER,
    FUNCTION_CALL,
    ...IDENT(JS_KEYWORDS, JS_BUILTINS),
    OPERATOR('+\\-*/%=<>!&|^~?:'),
  ],
}

// --------------------------------------------------------------- TypeScript
const TS_KEYWORDS = words(
  'const let var function return if else for while do break continue class extends new ' +
    'import export from default async await try catch finally throw typeof instanceof in of ' +
    'this super switch case delete void yield static get set interface type enum namespace ' +
    'implements readonly public private protected abstract declare satisfies as is keyof infer',
)
const TS_BUILTINS = words(
  'true false null undefined NaN Infinity string number boolean object unknown never any void ' +
    'console Math JSON Object Array String Number Boolean Promise Map Set Symbol Date Record Partial',
)

const typescript: LanguageDefinition = {
  name: 'typescript',
  displayName: 'TypeScript',
  aliases: ['ts', 'tsx'],
  rules: [
    LINE_COMMENT('//'),
    BLOCK_COMMENT,
    STRING('"\'`'),
    NUMBER,
    FUNCTION_CALL,
    ...IDENT(TS_KEYWORDS, TS_BUILTINS),
    OPERATOR('+\\-*/%=<>!&|^~?:'),
  ],
}

// ------------------------------------------------------------------- Python
const PY_KEYWORDS = words(
  'def class return if elif else for while break continue import from as pass raise try ' +
    'except finally with lambda yield global nonlocal assert del async await in is not and or',
)
const PY_BUILTINS = words(
  'True False None self cls print len range str int float bool list dict set tuple type ' +
    'isinstance enumerate zip map filter sum min max open super property staticmethod',
)

const python: LanguageDefinition = {
  name: 'python',
  displayName: 'Python',
  aliases: ['py'],
  rules: [
    LINE_COMMENT('#'),
    // Triple-quoted strings must be tried before the single-quoted rule.
    { pattern: /("""|''')[\s\S]*?(?:\1|$)/y, className: 'tvx-tok-string' },
    STRING('"\''),
    NUMBER,
    { pattern: /@[A-Za-z_][\w.]*/y, className: 'tvx-tok-function' },
    FUNCTION_CALL,
    ...IDENT(PY_KEYWORDS, PY_BUILTINS),
    OPERATOR('+\\-*/%=<>!&|^~'),
  ],
}

// --------------------------------------------------------------------- HTML
const html: LanguageDefinition = {
  name: 'html',
  displayName: 'HTML',
  aliases: ['xml', 'svg', 'vue'],
  rules: [
    { pattern: /<!--[\s\S]*?(?:-->|$)/y, className: 'tvx-tok-comment' },
    { pattern: /<!DOCTYPE[^>]*>?/iy, className: 'tvx-tok-comment' },
    // The tag name, including the closing slash and bracket.
    { pattern: /<\/?[A-Za-z][\w:-]*/y, className: 'tvx-tok-tag' },
    { pattern: /\/?>/y, className: 'tvx-tok-tag' },
    { pattern: /[A-Za-z_:][\w:.-]*/y, followedBy: /=/y, className: 'tvx-tok-attribute' },
    STRING('"\''),
    { pattern: /&[a-zA-Z#][\w]*;?/y, className: 'tvx-tok-builtin' },
  ],
}

// ---------------------------------------------------------------------- CSS
const css: LanguageDefinition = {
  name: 'css',
  displayName: 'CSS',
  aliases: ['scss', 'less'],
  rules: [
    BLOCK_COMMENT,
    STRING('"\''),
    { pattern: /@[a-z-]+/iy, className: 'tvx-tok-keyword' },
    { pattern: /#[0-9a-fA-F]{3,8}\b/y, className: 'tvx-tok-number' },
    { pattern: /-?\d[\d.]*(?:px|em|rem|%|vh|vw|s|ms|deg|fr|ch|pt)?/y, className: 'tvx-tok-number' },
    { pattern: /[.#][A-Za-z_-][\w-]*/y, className: 'tvx-tok-selector' },
    { pattern: /::?[a-z-]+/iy, className: 'tvx-tok-selector' },
    { pattern: /[a-zA-Z-]+/y, followedBy: /\s*:/y, className: 'tvx-tok-attribute' },
    { pattern: /[A-Za-z_-][\w-]*/y, followedBy: /\s*\(/y, className: 'tvx-tok-function' },
  ],
}

// ---------------------------------------------------------------------- SQL
const SQL_KEYWORDS = words(
  'select from where insert into values update set delete create table alter drop add ' +
    'primary key foreign references index view join inner left right outer full on group by ' +
    'order having limit offset union all distinct as and or not null is like between exists ' +
    'case when then else end begin commit rollback transaction with returning default unique',
)
const SQL_BUILTINS = words(
  'int integer bigint smallint varchar text char boolean date timestamp decimal numeric ' +
    'float double serial uuid json jsonb count sum avg min max coalesce now cast',
)

const sql: LanguageDefinition = {
  name: 'sql',
  displayName: 'SQL',
  rules: [
    LINE_COMMENT('--'),
    BLOCK_COMMENT,
    STRING('"\'`'),
    NUMBER,
    // SQL keywords are conventionally written in either case.
    {
      pattern: /[A-Za-z_][\w]*/y,
      className: 'tvx-tok-keyword',
      keywords: SQL_KEYWORDS,
    },
    { pattern: /[A-Za-z_][\w]*/y, className: 'tvx-tok-builtin', keywords: SQL_BUILTINS },
    OPERATOR('+\\-*/%=<>!'),
  ],
}

// --------------------------------------------------------------------- JSON
const json: LanguageDefinition = {
  name: 'json',
  displayName: 'JSON',
  rules: [
    // `(?:"|$)`, exactly like the shared STRING() builder above: a string that
    // never closes must still match, ending at end of input. Without that
    // fallback the scan runs to the end and *fails*, the scanner steps one
    // character, and the identical scan repeats from every `"` in the
    // document, quadratic on a truncated paste full of `\"`.
    // A string followed by a colon is a key, not a value.
    {
      pattern: /"(?:\\[\s\S]|[^\\"])*(?:"|$)/y,
      followedBy: /\s*:/y,
      className: 'tvx-tok-attribute',
    },
    { pattern: /"(?:\\[\s\S]|[^\\"])*(?:"|$)/y, className: 'tvx-tok-string' },
    NUMBER,
    { pattern: /\b(?:true|false|null)\b/y, className: 'tvx-tok-builtin' },
  ],
}

// -------------------------------------------------------------------- Shell
const SH_KEYWORDS = words(
  'if then else elif fi for while do done case esac function return in select until ' +
    'break continue local export readonly declare source alias unset trap exit',
)
const SH_BUILTINS = words(
  'echo cd ls cp mv rm mkdir rmdir touch cat grep sed awk find sort uniq head tail wc ' +
    'chmod chown curl wget git npm pnpm yarn node python docker kubectl make sudo',
)

const shell: LanguageDefinition = {
  name: 'shell',
  displayName: 'Shell',
  aliases: ['bash', 'sh', 'zsh'],
  rules: [
    LINE_COMMENT('#'),
    STRING('"\''),
    { pattern: /\$\{[^}]*\}?|\$[A-Za-z_]\w*|\$[\d@*?#!$]/y, className: 'tvx-tok-variable' },
    { pattern: /(?:^|(?<=\s))--?[A-Za-z][\w-]*/y, className: 'tvx-tok-attribute' },
    NUMBER,
    ...IDENT(SH_KEYWORDS, SH_BUILTINS),
    OPERATOR('|&;<>='),
  ],
}

// ---------------------------------------------------------------------- Go
const GO_KEYWORDS = words(
  'package import func return if else for range switch case default break continue ' +
    'go defer chan select type struct interface map var const fallthrough goto',
)
const GO_BUILTINS = words(
  'true false nil iota string int int8 int16 int32 int64 uint uint8 uint16 uint32 uint64 ' +
    'byte rune float32 float64 bool error make new len cap append copy delete panic recover print',
)

const go: LanguageDefinition = {
  name: 'go',
  displayName: 'Go',
  aliases: ['golang'],
  rules: [
    LINE_COMMENT('//'),
    BLOCK_COMMENT,
    STRING('"\'`'),
    NUMBER,
    FUNCTION_CALL,
    ...IDENT(GO_KEYWORDS, GO_BUILTINS),
    OPERATOR('+\\-*/%=<>!&|^~:'),
  ],
}

// -------------------------------------------------------------------- Rust
const RS_KEYWORDS = words(
  'fn let mut const static struct enum trait impl for while loop if else match return ' +
    'break continue use mod pub crate self super where as dyn ref move async await unsafe type',
)
const RS_BUILTINS = words(
  'true false None Some Ok Err String str i8 i16 i32 i64 u8 u16 u32 u64 usize isize f32 f64 ' +
    'bool char Vec Box Option Result HashMap println format vec panic',
)

const rust: LanguageDefinition = {
  name: 'rust',
  displayName: 'Rust',
  aliases: ['rs'],
  rules: [
    LINE_COMMENT('//'),
    BLOCK_COMMENT,
    STRING('"\''),
    NUMBER,
    // The body stops at a nested `[` on purpose: letting it run to the next
    // `]` anywhere in the file means re-scanning the rest of the block from
    // every `#[` in it, which is quadratic on a run of them.
    { pattern: /#!?\[[^[\]]*\]/y, className: 'tvx-tok-comment' },
    { pattern: /'[a-z_]\w*(?!')/y, className: 'tvx-tok-variable' },
    { pattern: /[A-Za-z_]\w*!/y, followedBy: /\s*[([{]/y, className: 'tvx-tok-function' },
    FUNCTION_CALL,
    ...IDENT(RS_KEYWORDS, RS_BUILTINS),
    OPERATOR('+\\-*/%=<>!&|^~:'),
  ],
}

// -------------------------------------------------------------------- Java
const JAVA_KEYWORDS = words(
  'public private protected class interface extends implements static final abstract ' +
    'void return if else for while do switch case break continue new try catch finally ' +
    'throw throws import package this super synchronized volatile transient native enum record',
)
const JAVA_BUILTINS = words(
  'true false null int long short byte char float double boolean String System Object ' +
    'List Map Set ArrayList HashMap Integer Double Boolean Exception Override',
)

const java: LanguageDefinition = {
  name: 'java',
  displayName: 'Java',
  rules: [
    LINE_COMMENT('//'),
    BLOCK_COMMENT,
    STRING('"\''),
    NUMBER,
    { pattern: /@[A-Za-z_]\w*/y, className: 'tvx-tok-function' },
    FUNCTION_CALL,
    ...IDENT(JAVA_KEYWORDS, JAVA_BUILTINS),
    OPERATOR('+\\-*/%=<>!&|^~?:'),
  ],
}

// ---------------------------------------------------------------- Markdown
const markdown: LanguageDefinition = {
  name: 'markdown',
  displayName: 'Markdown',
  aliases: ['md'],
  rules: [
    { pattern: /^#{1,6} [^\n]*/my, className: 'tvx-tok-keyword' },
    { pattern: /```[\s\S]*?(?:```|$)/y, className: 'tvx-tok-string' },
    { pattern: /`[^`\n]+`/y, className: 'tvx-tok-string' },
    { pattern: /\*\*[^*\n]+\*\*|__[^_\n]+__/y, className: 'tvx-tok-builtin' },
    { pattern: /\*[^*\n]+\*|_[^_\n]+_/y, className: 'tvx-tok-variable' },
    // Neither half may contain its own *unbalanced* opening bracket: allowing
    // that turns a run of `[` or `(` into a full re-scan of the line per
    // character. The target still admits one nested pair, because
    // `](https://en.wikipedia.org/wiki/Foo_(bar))` is ordinary Markdown and a
    // flat `[^()\n]*` drops it. The form stays linear: `[^()\n]*` cannot match
    // `(`, so no character can be claimed by two halves of the alternation.
    {
      pattern: /!?\[[^[\]\n]*\]\([^()\n]*(?:\([^()\n]*\)[^()\n]*)*\)/y,
      className: 'tvx-tok-function',
    },
    // `[ \t]*`, not `\s*`: indentation is horizontal, so a marker must not
    // reach back across the blank lines above it, and `\s*` on a run of
    // newlines scans to the end of the block from every one of them.
    { pattern: /^[ \t]*(?:[-*+]|\d+\.) /my, className: 'tvx-tok-operator' },
    { pattern: /^[ \t]*> [^\n]*/my, className: 'tvx-tok-comment' },
  ],
}

/** Every bundled language, in the order a picker should show them. */
export const BUNDLED_LANGUAGES: readonly LanguageDefinition[] = [
  javascript,
  typescript,
  python,
  html,
  css,
  json,
  sql,
  shell,
  go,
  rust,
  java,
  markdown,
]

const BY_NAME = new Map<string, LanguageDefinition>()
for (const language of BUNDLED_LANGUAGES) {
  BY_NAME.set(language.name, language)
  for (const alias of language.aliases ?? []) BY_NAME.set(alias, language)
}

/** Resolve a language by name or alias, case-insensitively. */
export function findLanguage(name: string | null | undefined): LanguageDefinition | null {
  if (!name) return null
  return BY_NAME.get(name.trim().toLowerCase()) ?? null
}

/** How a language should be written for a human, falling back to its id. */
export function languageDisplayName(language: LanguageDefinition): string {
  return language.displayName ?? language.name
}
