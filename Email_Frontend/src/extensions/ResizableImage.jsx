import { useCallback, useRef } from 'react'
import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react'

/* ─── React component rendered for each image node ─────────────── */
function ResizableImageView({ node, updateAttributes, selected }) {
  const { src, alt, width } = node.attrs
  const imgRef = useRef(null)

  const onDragHandleMouseDown = useCallback((e) => {
    e.preventDefault()
    const startX      = e.clientX
    const startWidth  = imgRef.current ? imgRef.current.offsetWidth : (width || 300)

    function onMouseMove(moveEvent) {
      const newWidth = Math.max(80, Math.round(startWidth + (moveEvent.clientX - startX)))
      updateAttributes({ width: newWidth })
    }

    function onMouseUp() {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }, [width, updateAttributes])

  return (
    <NodeViewWrapper>
      <div
        className={`img-resize-wrap${selected ? ' img-selected' : ''}`}
        style={{ display: 'inline-block', position: 'relative', maxWidth: '100%' }}
      >
        <img
          ref={imgRef}
          src={src}
          alt={alt || ''}
          draggable={false}
          style={{
            display:  'block',
            width:    width ? `${width}px` : 'auto',
            maxWidth: '100%',
            height:   'auto',
          }}
        />
        {/* Bottom-right drag handle */}
        <div
          className="img-resize-handle"
          onMouseDown={onDragHandleMouseDown}
          title="Drag to resize"
        />
      </div>
    </NodeViewWrapper>
  )
}

/* ─── TipTap Node extension ─────────────────────────────────────── */
export const ResizableImage = Node.create({
  name: 'image',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      src:   { default: null },
      alt:   { default: null },
      title: { default: null },
      width: { default: null },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'img[src]',
        getAttrs(el) {
          const style = el.getAttribute('style') || ''
          const match = style.match(/width\s*:\s*([\d.]+)px/)
          return {
            src:   el.getAttribute('src'),
            alt:   el.getAttribute('alt'),
            title: el.getAttribute('title'),
            width: match ? parseInt(match[1], 10) : null,
          }
        },
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    const { width, src, alt, title } = HTMLAttributes
    const style = width
      ? `width:${width}px;max-width:100%;height:auto;`
      : 'max-width:100%;height:auto;'
    return ['img', mergeAttributes({ src, alt, title, style })]
  },

  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageView)
  },

  addCommands() {
    return {
      setImage: (attrs) => ({ commands }) =>
        commands.insertContent({ type: this.name, attrs }),
    }
  },
})
