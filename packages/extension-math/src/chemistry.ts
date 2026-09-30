/**
 * Chemistry as mhchem writes it, `\ce{2H2 + O2 -> 2H2O}`, turned into the
 * LaTeX the converter draws: element symbols upright, the counts after them
 * lowered, charges raised, and the reaction arrows. A useful part of mhchem,
 * not all of it: formulas, charges, states, hydrates and arrows.
 */

/** mhchem's arrows, as LaTeX's. */
const ARROWS: Readonly<Record<string, string>> = {
  '->': '\\rightarrow',
  '<-': '\\leftarrow',
  '<->': '\\leftrightarrow',
  '<=>': '\\rightleftharpoons',
}

/** An arrow with words over it: `->[heat]`. */
const LABELLED_ARROW = /^(->|<-|<->|<=>)\[([^\]]*)\]$/

/** Letters that mean something alone: a gas given off, a solid thrown down. */
const STANDALONE: Readonly<Record<string, string>> = {
  '+': '+',
  '^': '\\uparrow',
  v: '\\downarrow',
}

/** A state after a formula: aqueous, solid, liquid, gas. */
const STATE = /^\((?:aq|s|l|g)\)/
const ELEMENT = /^[A-Z][a-z]?/
const DIGITS = /^\d+/
/** `^{2+}`, `^2+`, `^-`, `^3`: a charge or a power, raised. */
const RAISED = /^\^(?:\{([^}]*)\}|(\d*[+-]|\d+))/
/** A leading count, or a fraction of one: the `2` of `2H2O`. */
const COEFFICIENT = /^(\d+(?:\/\d+)?)(?=[A-Z([])/

/** One formula, `Ca(OH)2` or `SO4^2-`, in LaTeX. */
function species(text: string): string {
  let out = ''
  let index = 0
  const coefficient = COEFFICIENT.exec(text)
  if (coefficient) {
    out += coefficient[1]
    index = (coefficient[1] as string).length
  }
  /** After a hydrate's dot, a count is how many, not a subscript. */
  let afterDot = false
  while (index < text.length) {
    const rest = text.slice(index)
    const state = STATE.exec(rest)
    const element = ELEMENT.exec(rest)
    const digits = DIGITS.exec(rest)
    const raised = RAISED.exec(rest)
    if (state) {
      out += `\\mathrm{${state[0]}}`
      index += state[0].length
    } else if (element) {
      out += `\\mathrm{${element[0]}}`
      index += element[0].length
    } else if (digits) {
      out += afterDot ? digits[0] : `_{${digits[0]}}`
      index += digits[0].length
    } else if (raised) {
      out += `^{${raised[1] ?? raised[2]}}`
      index += raised[0].length
    } else if (/^[+-]$/.test(rest)) {
      // A charge written straight after the formula: Na+, Cl-.
      out += `^{${rest}}`
      index += 1
    } else if (/^[*.·]/.test(rest)) {
      out += ' \\cdot '
      index += 1
      afterDot = true
      continue
    } else {
      const char = rest[0] as string
      out += /[{}\\]/.test(char) ? `\\${char}` : char
      index += 1
    }
    afterDot = false
  }
  return out
}

/** The LaTeX an mhchem formula or equation stands for. */
export function chemistryToLatex(source: string): string {
  return source
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => {
      const arrow = ARROWS[token] ?? STANDALONE[token]
      if (arrow) return arrow
      const labelled = LABELLED_ARROW.exec(token)
      if (labelled) {
        return `\\overset{\\text{${labelled[2]}}}{${ARROWS[labelled[1] as string]}}`
      }
      return species(token)
    })
    .join(' ')
}
