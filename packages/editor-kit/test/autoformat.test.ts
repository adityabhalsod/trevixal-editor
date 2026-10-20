import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { autocorrectLines, parseAutocorrectLines } from '../src/autocorrect'
import { mountFullEditor } from '../src/mount'
import type { FullEditor } from '../src/options'

let host: HTMLElement
let mounted: FullEditor | null = null

beforeEach(() => {
  window.localStorage.clear()
  document.body.replaceChildren()
  host = document.createElement('div')
  document.body.append(host)
})

afterEach(() => {
  mounted?.destroy()
  mounted = null
})

/** Type into the surface the way a keyboard does, a `beforeinput` per character. */
function type(text: string): void {
  const surface = host.querySelector<HTMLElement>('#editor .trevixal-content')
  for (const data of text) {
    surface?.dispatchEvent(
      new InputEvent('beforeinput', {
        inputType: 'insertText',
        data,
        bubbles: true,
        cancelable: true,
      }),
    )
  }
}

function blank(): FullEditor {
  return mountFullEditor({
    element: host,
    content: { type: 'doc', content: [{ type: 'paragraph' }] } as never,
  })
}

function menuItem(name: string): HTMLButtonElement {
  const button = host.querySelector<HTMLButtonElement>(`[data-trevixal-item="${name}"]`)
  if (!button) throw new Error(`no menu item ${name}`)
  return button
}

describe('the AutoCorrect list as the dialog edits it', () => {
  test('writes one entry a line, and reads them back whichever arrow was typed', () => {
    expect(autocorrectLines({ teh: 'the', adn: 'and' })).toBe('adn -> and\nteh -> the')
    expect(
      parseAutocorrectLines('Teh -> the\nbrb → be right back\nnope\n = x\nomw=on my way'),
    ).toEqual({
      teh: 'the',
      brb: 'be right back',
      omw: 'on my way',
    })
  })
})

describe('AutoFormat in the full editor', () => {
  test('curls quotes and corrects words from the start, and Tools turns each off', () => {
    mounted = blank()
    type('"teh" ')
    expect(mounted.editor.getText()).toBe('“the” ')
    expect(menuItem('smartTypography').getAttribute('aria-checked')).toBe('true')

    menuItem('smartTypography').click()
    menuItem('autocorrect').click()
    type('"teh" ')
    expect(mounted.editor.getText()).toBe('“the” "teh" ')
    expect(menuItem('smartTypography').getAttribute('aria-checked')).toBe('false')
    // Remembered, like every other preference.
    expect(window.localStorage.getItem('trevixal:preferences')).toContain('"smartTypography":false')
  })

  test('while Suggesting, changes the typing within its one suggestion', () => {
    mounted = blank()
    host.querySelector<HTMLElement>('.trevixal-trackchanges__toggle')?.click()
    type('"teh" ')
    const runs = () =>
      mounted?.editor.state.doc
        .child(0)
        .content.children.map((child) => [
          child.textContent,
          child.marks.map((mark) => mark.type.name),
        ])
    // No struck-out straight quote or misspelling left behind as a deletion.
    expect(runs()).toEqual([['“the” ', ['insertion']]])
    mounted.editor.commands.undo()
    expect(runs()).toEqual([['“teh” ', ['insertion']]])
  })

  test('takes an edited AutoCorrect list at once', async () => {
    mounted = blank()
    menuItem('autocorrectOptions').click()
    const words = document.querySelector<HTMLTextAreaElement>('.trevixal-dialog [name="words"]')
    if (!words) throw new Error('no AutoCorrect dialog')
    expect(words.value).toContain('teh -> the')
    words.value = 'brb -> be right back'
    words.form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await Promise.resolve()
    await Promise.resolve()
    type('brb teh ')
    expect(mounted.editor.getText()).toBe('be right back teh ')
  })
})
