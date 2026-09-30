# @trevixal/extension-forms

Forms and mail merge for the Trevixal editor: content controls (text,
checkbox, dropdown, date, signature) in the text, a fillable PDF of the
document, and one document per row of a CSV or JSON file.

```sh
npm install @trevixal/extension-forms
```

```ts
import {
  enableFormFields,
  formFieldNodes,
  insertFormField,
  mergeDocument,
  parseMergeRows,
  serializeToPDFForm,
} from '@trevixal/extension-forms'

const schema = new Schema({ nodes: { ...defaultNodes(), ...formFieldNodes() }, marks })
editor.exec(insertFormField({ kind: 'text', name: 'client', label: 'Client name', options: [] }))
enableFormFields(editor, { fill: (field) => askValue(field) })
const pdf = serializeToPDFForm(editor.state.doc)
const letters = parseMergeRows(csv).map((row) => mergeDocument(editor.state.doc, row))
```

The documentation is at <https://trevixal-editor.vercel.app/extensions/forms>.
