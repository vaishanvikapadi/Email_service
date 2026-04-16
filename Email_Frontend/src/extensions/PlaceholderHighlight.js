import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

export const PLACEHOLDER_KEY = new PluginKey('placeholderHighlight')

function buildDecorations(doc, headers) {
  const decorations = []
  const regex = /\{([^}]+)\}/g

  doc.descendants((node, pos) => {
    if (!node.isText) return
    const text = node.text
    let match
    regex.lastIndex = 0
    while ((match = regex.exec(text)) !== null) {
      const start = pos + match.index
      const end = start + match[0].length
      const name = match[1].trim()
      const valid = headers.includes(name)
      decorations.push(
        Decoration.inline(start, end, {
          class: valid ? 'ph-valid' : 'ph-invalid',
        })
      )
    }
  })

  return DecorationSet.create(doc, decorations)
}

export const PlaceholderHighlight = Extension.create({
  name: 'placeholderHighlight',

  addStorage() {
    return { headers: [] }
  },

  addProseMirrorPlugins() {
    const ext = this

    return [
      new Plugin({
        key: PLACEHOLDER_KEY,
        state: {
          init(_, { doc }) {
            return buildDecorations(doc, ext.storage.headers)
          },
          apply(tr, oldSet) {
            if (tr.docChanged || tr.getMeta(PLACEHOLDER_KEY)) {
              return buildDecorations(tr.doc, ext.storage.headers)
            }
            return oldSet.map(tr.mapping, tr.doc)
          },
        },
        props: {
          decorations(state) {
            return PLACEHOLDER_KEY.getState(state)
          },
        },
      }),
    ]
  },
})

/** Call this whenever the headers array changes to re-color placeholders. */
export function refreshPlaceholders(editor, headers) {
  if (!editor) return
  editor.storage.placeholderHighlight.headers = headers
  editor.view.dispatch(editor.state.tr.setMeta(PLACEHOLDER_KEY, true))
}
