/**
 * The files of a new Trevixal extension, laid out as the shipped extensions
 * are: a node type in `src/schema.ts`, its commands in `src/commands.ts`, a
 * menu entry in `src/menu.ts`, and tests for the four things the callout
 * tutorial says to test (round trip, hostile markup, the way out, the menu).
 * Pure: the file system is the caller's.
 */

/** A package name this cannot make an extension of. */
export class ExtensionNameError extends Error {
  override readonly name = 'ExtensionNameError'
}

/** What an extension is called, in each of the forms its files use. */
export interface ExtensionNames {
  /** As npm has it: `@acme/trevixal-extension-sticky-note`. */
  readonly packageName: string
  /** The directory it is made in by default: the name without its scope. */
  readonly directory: string
  /** In markup: `sticky-note`, for its class and data attribute. */
  readonly kebab: string
  /** The node type: `stickyNote`. */
  readonly camel: string
  /** In function names: `insertStickyNote`. */
  readonly pascal: string
  /** For the menu: `Sticky note`. */
  readonly title: string
}

/** npm's rule for a package name: lower case, an optional scope, at most 214 characters. */
const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/
const PACKAGE_NAME_MAX = 214
/** The prefixes a Trevixal extension's name usually carries, left off its node's. */
const PREFIXES = ['trevixal-extension-', 'trevixal-']

export function extensionNames(packageName: string): ExtensionNames {
  if (!PACKAGE_NAME.test(packageName) || packageName.length > PACKAGE_NAME_MAX) {
    throw new ExtensionNameError(`“${packageName}” is not a package name npm takes.`)
  }
  const directory = packageName.split('/').pop() as string
  const prefix = PREFIXES.find((each) => directory.startsWith(each)) ?? ''
  const kebab = directory
    .slice(prefix.length)
    .replace(/[._~]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  if (!/^[a-z][a-z0-9-]*$/.test(kebab)) {
    throw new ExtensionNameError(
      `“${packageName}” leaves no name for a node, which starts with a letter.`,
    )
  }
  const words = kebab.split('-')
  const capital = (word: string): string => word.charAt(0).toUpperCase() + word.slice(1)
  return {
    packageName,
    directory,
    kebab,
    camel: (words[0] ?? '') + words.slice(1).map(capital).join(''),
    pascal: words.map(capital).join(''),
    title: capital(words.join(' ')),
  }
}

const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`

function manifest(names: ExtensionNames, version: string): string {
  const trevixal = `^${version}`
  return json({
    name: names.packageName,
    version: '0.1.0',
    description: `A Trevixal editor extension: the ${names.title.toLowerCase()} block.`,
    keywords: ['trevixal', 'trevixal-extension', 'rich-text-editor'],
    type: 'module',
    sideEffects: false,
    main: './dist/index.cjs',
    module: './dist/index.js',
    types: './dist/index.d.ts',
    exports: {
      '.': {
        import: { types: './dist/index.d.ts', default: './dist/index.js' },
        require: { types: './dist/index.d.cts', default: './dist/index.cjs' },
      },
    },
    files: ['dist'],
    scripts: { build: 'tsup', test: 'vitest run', typecheck: 'tsc --noEmit' },
    peerDependencies: { '@trevixal/core': trevixal, '@trevixal/ui': trevixal },
    peerDependenciesMeta: { '@trevixal/ui': { optional: true } },
    devDependencies: {
      '@trevixal/core': trevixal,
      '@trevixal/ui': trevixal,
      'happy-dom': '^15.11.7',
      tsup: '^8.3.5',
      typescript: '^5.7.2',
      vitest: '^3.0.0',
    },
  })
}

const TSCONFIG = json({
  compilerOptions: {
    target: 'ES2022',
    module: 'ESNext',
    moduleResolution: 'Bundler',
    lib: ['ES2022', 'DOM', 'DOM.Iterable'],
    types: [],
    strict: true,
    noImplicitOverride: true,
    noFallthroughCasesInSwitch: true,
    noUnusedLocals: true,
    noUnusedParameters: true,
    forceConsistentCasingInFileNames: true,
    isolatedModules: true,
    verbatimModuleSyntax: true,
    skipLibCheck: true,
    declaration: true,
    noEmit: true,
  },
  include: ['src', 'test', 'tsup.config.ts', 'vitest.config.ts'],
})

const TSUP_CONFIG = `import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  // The editor is the host's: one copy of it, never a second bundled in here.
  external: ['@trevixal/core', '@trevixal/ui'],
})
`

const VITEST_CONFIG = `import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
})
`

const GITIGNORE = 'node_modules\ndist\n'

function schema({ kebab, camel, title }: ExtensionNames): string {
  return `import type { NodeSpec } from '@trevixal/core'

/** The longest label kept: a word or two. */
const LABEL_MAX = 80

/**
 * A ${title.toLowerCase()}'s label, from wherever it came: a document, a paste, a
 * page never seen. Only text is kept, and only so much of it.
 */
export function ${camel}Label(value: unknown): string {
  return typeof value === 'string' ? value.slice(0, LABEL_MAX) : ''
}

/**
 * The \`${camel}\` node, to merge into a schema's nodes: a box holding blocks
 * of its own (\`content: 'block+'\`), with a label.
 */
export function ${camel}Nodes(): Record<string, NodeSpec> {
  return {
    ${camel}: {
      group: 'block',
      content: 'block+',
      attrs: { label: { default: '' } },
      toHTML: (node) => {
        const label = ${camel}Label(node.attrs.label)
        return {
          tag: 'div',
          attrs: { class: '${kebab}', 'data-${kebab}': '', ...(label ? { 'data-label': label } : {}) },
        }
      },
      parseHTML: [
        {
          tag: 'div',
          attribute: 'data-${kebab}',
          getAttrs: (element) => ({ label: ${camel}Label(element.getAttribute('data-label')) }),
        },
      ],
    },
  }
}
`
}

function commands({ camel, pascal, title }: ExtensionNames): string {
  return `import { type Command, wrapIn } from '@trevixal/core'
import { ${camel}Label } from './schema'

/**
 * Put the selected blocks in a ${title.toLowerCase()}. Null where they cannot
 * go in one, which is also what disables a menu entry. Enter on an empty last
 * line leaves it, as it leaves a quote: the editor does that for every box.
 */
export function insert${pascal}(label = ''): Command {
  return wrapIn('${camel}', { label: ${camel}Label(label) })
}
`
}

function menu({ pascal, title }: ExtensionNames): string {
  return `import type { Menu } from '@trevixal/ui'
import { insert${pascal} } from './commands'

/**
 * The menus with an entry for the ${title.toLowerCase()} at the end of Insert:
 * pass \`with${pascal}Menu(defaultMenus())\` as \`createEditorUI\`'s \`menus\`.
 * An entry that runs something of its own is kept; one that does not is
 * dropped, so a menu never offers what nothing does.
 */
export function with${pascal}Menu(menus: readonly Menu[]): Menu[] {
  return menus.map((each) =>
    each.name === 'insert'
      ? {
          ...each,
          items: [
            ...each.items,
            {
              name: 'insert${pascal}',
              label: '${title}',
              icon: 'callout',
              run: (editor) => {
                editor.exec(insert${pascal}())
              },
            },
          ],
        }
      : each,
  )
}
`
}

const INDEX = `export * from './schema'
export * from './commands'
export * from './menu'
`

function test({ kebab, camel, pascal, title }: ExtensionNames): string {
  return `// @vitest-environment happy-dom
import {
  type Editor,
  Schema,
  TextSelection,
  createEditor,
  defaultMarks,
  defaultNodes,
  parseHTML,
  pos,
  serializeToHTML,
} from '@trevixal/core'
import { createEditorUI, defaultMenus } from '@trevixal/ui'
import { afterEach, describe, expect, it } from 'vitest'
import { ${camel}Nodes, insert${pascal}, with${pascal}Menu } from '../src'

const schema = new Schema({ nodes: { ...defaultNodes(), ...${camel}Nodes() }, marks: defaultMarks() })

function mount(html = '<p>Hello</p>'): Editor {
  const host = document.createElement('div')
  document.body.appendChild(host)
  return createEditor({ schema, element: host, doc: parseHTML(schema, html, document) })
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('the ${title.toLowerCase()}', () => {
  it('holds the selected blocks, and comes back from its HTML the same', () => {
    const editor = mount()
    expect(editor.exec(insert${pascal}('Note'))).toBe(true)
    const html = serializeToHTML(editor.state.doc)
    expect(html).toBe('<div class="${kebab}" data-${kebab}="" data-label="Note"><p>Hello</p></div>')
    expect(parseHTML(schema, html, document).toJSON()).toEqual(editor.state.doc.toJSON())
    editor.destroy()
  })

  it('keeps nothing of hostile markup but text', () => {
    const doc = parseHTML(
      schema,
      '<div data-${kebab} data-label="\\'><script>alert(1)</script>" onclick="steal()"><p>Hi</p></div>',
      document,
    )
    const html = serializeToHTML(doc)
    expect(html).not.toContain('<script')
    expect(html).not.toContain('onclick')
  })

  it('lets Enter on an empty last line leave it', () => {
    const editor = mount()
    editor.exec(insert${pascal}())
    editor.dispatch(editor.state.tr.setSelection(new TextSelection(pos([0, 0], 5))))
    const enter = (): void => {
      editor.view?.dom.dispatchEvent(
        new InputEvent('beforeinput', { inputType: 'insertParagraph', bubbles: true, cancelable: true }),
      )
    }
    enter()
    enter()
    expect(editor.state.doc.childCount).toBe(2)
    expect(editor.state.doc.child(1).type.name).toBe('paragraph')
    editor.destroy()
  })

  it('is on the Insert menu, and runs from there', () => {
    const editor = mount()
    const ui = createEditorUI(editor, { container: document.body, menus: with${pascal}Menu(defaultMenus()) })
    const entry = ui.menus
      .find((each) => each.name === 'insert')
      ?.items.find((item) => item.name === 'insert${pascal}')
    expect(entry?.label).toBe('${title}')
    entry?.run?.(editor)
    expect(editor.state.doc.child(0).type.name).toBe('${camel}')
    ui.destroy()
    editor.destroy()
  })
})
`
}

function readme({ packageName, camel, pascal, title }: ExtensionNames): string {
  return `# ${packageName}

A [Trevixal](https://trevixal-editor.vercel.app) editor extension: the
${title.toLowerCase()} block, a box holding blocks of its own, with a label.

\`\`\`sh
npm install ${packageName}
\`\`\`

\`\`\`ts
import { Schema, createEditor, defaultMarks, defaultNodes } from '@trevixal/core'
import { createEditorUI, defaultMenus } from '@trevixal/ui'
import { ${camel}Nodes, insert${pascal}, with${pascal}Menu } from '${packageName}'

const schema = new Schema({ nodes: { ...defaultNodes(), ...${camel}Nodes() }, marks: defaultMarks() })
const editor = createEditor({ schema, element })
createEditorUI(editor, { container, menus: with${pascal}Menu(defaultMenus()) })
editor.exec(insert${pascal}('Note'))
\`\`\`

| File | What it holds |
| --- | --- |
| \`src/schema.ts\` | The node type: its content, its attribute, its HTML in both directions |
| \`src/commands.ts\` | What the menu and the host run |
| \`src/menu.ts\` | The entry on the Insert menu |
| \`test/\` | The round trip, hostile markup, the way out with Enter, the menu entry |

\`npm test\` runs the tests, \`npm run typecheck\` the types, \`npm run build\`
writes \`dist/\`. See [Write a callout extension](https://trevixal-editor.vercel.app/extending/callout)
for why each part is as it is.
`
}

/** Every file of a new extension, by its path in the package. */
export function extensionFiles(
  packageName: string,
  trevixalVersion: string,
): ReadonlyMap<string, string> {
  const names = extensionNames(packageName)
  return new Map([
    ['package.json', manifest(names, trevixalVersion)],
    ['tsconfig.json', TSCONFIG],
    ['tsup.config.ts', TSUP_CONFIG],
    ['vitest.config.ts', VITEST_CONFIG],
    ['.gitignore', GITIGNORE],
    ['README.md', readme(names)],
    ['src/index.ts', INDEX],
    ['src/schema.ts', schema(names)],
    ['src/commands.ts', commands(names)],
    ['src/menu.ts', menu(names)],
    [`test/${names.kebab}.test.ts`, test(names)],
  ])
}
