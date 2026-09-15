import type { Editor } from '@trevixal/core'
import { type ReactElement, type ReactNode, createContext, useContext } from 'react'

const EditorContext = createContext<Editor | null>(null)

export interface EditorProviderProps {
  readonly editor: Editor | null
  readonly children?: ReactNode
}

/** Makes an editor available to descendants via {@link useCurrentEditor}. */
export function EditorProvider({ editor, children }: EditorProviderProps): ReactElement {
  return <EditorContext.Provider value={editor}>{children}</EditorContext.Provider>
}

export function useCurrentEditor(): Editor | null {
  return useContext(EditorContext)
}
