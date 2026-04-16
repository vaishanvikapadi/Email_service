import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import { ResizableImage } from '../extensions/ResizableImage'
import { PlaceholderHighlight, refreshPlaceholders } from '../extensions/PlaceholderHighlight'

/* ─── Toolbar button ─────────────────────────────────────────── */
function TBtn({ onClick, active, title, children }) {
  return (
    <button
      type="button"
      className={`tbtn${active ? ' tbtn-active' : ''}`}
      onClick={onClick}
      title={title}
    >
      {children}
    </button>
  )
}

/* ─── Main component ─────────────────────────────────────────── */
const EmailEditor = forwardRef(function EmailEditor(
  {
    headers, rows,
    subject, onSubjectChange, onBodyChange, onSend, filePath,
    senderEmail, onSenderEmailChange,
    senderPassword, onSenderPasswordChange,
    ccEmails, onCcEmailsChange,
    attachments, onAttachmentsChange,
    sendStatus,
  },
  ref
) {
  const [showPass, setShowPass] = useState(false)
  const attachInputRef = useRef(null)
  const imageInputRef  = useRef(null)

  function handleImageInsert(e) {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      editor?.chain().focus().setImage({ src: reader.result, alt: file.name }).run()
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  function handleAttachFiles(e) {
    const newFiles = Array.from(e.target.files)
    onAttachmentsChange((prev) => {
      const existingNames = new Set(prev.map((f) => f.name))
      return [...prev, ...newFiles.filter((f) => !existingNames.has(f.name))]
    })
    // reset so same file can be re-added after removal
    e.target.value = ''
  }

  function removeAttachment(name) {
    onAttachmentsChange((prev) => prev.filter((f) => f.name !== name))
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ underline: false }),
      Underline,
      ResizableImage,
      PlaceholderHighlight,
    ],
    content: '',
    editorProps: {
      attributes: { class: 'prose-editor' },
    },
    onUpdate({ editor }) {
      onBodyChange(editor.getHTML())
    },
  })

  useEffect(() => {
    refreshPlaceholders(editor, headers)
  }, [headers, editor])

  useImperativeHandle(ref, () => ({
    insertPlaceholder(name) {
      editor?.chain().focus().insertContent(`{${name}}`).run()
    },
    setGreeting(text) {
      if (!editor) return
      const current = editor.getHTML()
      const isEmpty = !current || current === '<p></p>'
      const newContent = isEmpty
        ? `<p>${text}</p><p></p>`
        : `<p>${text}</p>${current}`
      editor.commands.setContent(newContent, true)
    },
  }))

  const a = (name, attrs) => editor?.isActive(name, attrs) ?? false

  const isSending = sendStatus === 'sending'
  const isSent    = sendStatus === 'success'
  const isError   = sendStatus === 'error'

  return (
    <div className="compose-window">
      {/* ── Window header ── */}
      <div className="compose-titlebar">
        <span className="compose-title-text">New Message</span>
      </div>

      {/* ── From field (locked — from logged-in profile) ── */}
      <div className="compose-field">
        <span className="compose-label">From</span>
        <input
          className="compose-subject-input profile-locked"
          type="email"
          value={senderEmail}
          onChange={(e) => onSenderEmailChange(e.target.value)}
          readOnly
          title="Set from your profile"
        />
        <span className="profile-tag">Profile</span>
      </div>

      {/* ── Email / SMTP password ── */}
      <div className="compose-field">
        <span className="compose-label">Email PW</span>
        <div className="login-pass-wrap" style={{ flex: 1 }}>
          <input
            className="compose-subject-input"
            type={showPass ? 'text' : 'password'}
            placeholder="App password / SMTP password"
            value={senderPassword}
            onChange={(e) => onSenderPasswordChange(e.target.value)}
            autoComplete="current-password"
          />
          <button
            type="button"
            className="login-eye"
            onClick={() => setShowPass((p) => !p)}
            tabIndex={-1}
            aria-label={showPass ? 'Hide password' : 'Show password'}
          >
            {showPass ? '🙈' : '👁️'}
          </button>
        </div>
      </div>

      {/* ── To field ── */}
      <div className="compose-field to-field">
        <span className="compose-label">To</span>
        {rows.length > 0 ? (
          <span className="compose-placeholder-text" style={{ color: '#16a34a', fontWeight: 500 }}>
            {rows.length} recipient{rows.length !== 1 ? 's' : ''} loaded from Excel
          </span>
        ) : (
          <span className="compose-placeholder-text">
            Upload an Excel file to set recipients
          </span>
        )}
      </div>

      {/* ── Subject field ── */}
      <div className="compose-field">
        <span className="compose-label">Subject</span>
        <input
          className="compose-subject-input"
          type="text"
          placeholder="Email subject…"
          value={subject}
          onChange={(e) => onSubjectChange(e.target.value)}
        />
      </div>

      {/* ── Toolbar ── */}
      <div className="compose-toolbar" role="toolbar" aria-label="Formatting">
        <TBtn onClick={() => editor?.chain().focus().toggleBold().run()} active={a('bold')} title="Bold (Ctrl+B)">
          <b>B</b>
        </TBtn>
        <TBtn onClick={() => editor?.chain().focus().toggleItalic().run()} active={a('italic')} title="Italic (Ctrl+I)">
          <i>I</i>
        </TBtn>
        <TBtn onClick={() => editor?.chain().focus().toggleUnderline().run()} active={a('underline')} title="Underline (Ctrl+U)">
          <u>U</u>
        </TBtn>
        <TBtn onClick={() => editor?.chain().focus().toggleStrike().run()} active={a('strike')} title="Strikethrough">
          <s>S</s>
        </TBtn>

        <span className="toolbar-sep" />

        <TBtn onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()} active={a('heading', { level: 1 })} title="Heading 1">
          H1
        </TBtn>
        <TBtn onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} active={a('heading', { level: 2 })} title="Heading 2">
          H2
        </TBtn>
        <TBtn onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()} active={a('heading', { level: 3 })} title="Heading 3">
          H3
        </TBtn>

        <span className="toolbar-sep" />

        <TBtn onClick={() => editor?.chain().focus().toggleBulletList().run()} active={a('bulletList')} title="Bullet list">
          ☰
        </TBtn>
        <TBtn onClick={() => editor?.chain().focus().toggleOrderedList().run()} active={a('orderedList')} title="Numbered list">
          1.
        </TBtn>

        <span className="toolbar-sep" />

        <TBtn onClick={() => editor?.chain().focus().toggleBlockquote().run()} active={a('blockquote')} title="Quote">
          ❝
        </TBtn>
        <TBtn onClick={() => editor?.chain().focus().toggleCode().run()} active={a('code')} title="Inline code">
          {'</>'}
        </TBtn>

        <span className="toolbar-sep" />

        <TBtn onClick={() => editor?.chain().focus().undo().run()} title="Undo">↩</TBtn>
        <TBtn onClick={() => editor?.chain().focus().redo().run()} title="Redo">↪</TBtn>

        <span className="toolbar-sep" />

        {/* Hidden image file input */}
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleImageInsert}
        />
        <TBtn onClick={() => imageInputRef.current?.click()} title="Insert image">
          🖼
        </TBtn>
      </div>

      {/* ── Editor body ── */}
      <div className="compose-body">
        <EditorContent editor={editor} />
      </div>

      {/* ── Attachment chips ── */}
      {attachments.length > 0 && (
        <div className="attachment-list">
          {attachments.map((file) => (
            <span key={file.name} className="attachment-chip">
              <span className="attachment-icon">📎</span>
              <span className="attachment-name" title={file.name}>{file.name}</span>
              <span className="attachment-size">({formatBytes(file.size)})</span>
              <button
                type="button"
                className="attachment-remove"
                onClick={() => removeAttachment(file.name)}
                aria-label={`Remove ${file.name}`}
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}

      {/* ── Footer / Send ── */}
      <div className="compose-footer">
        {/* Hidden file input */}
        <input
          ref={attachInputRef}
          type="file"
          multiple
          style={{ display: 'none' }}
          onChange={handleAttachFiles}
        />

        <button
          type="button"
          className="attach-btn"
          onClick={() => attachInputRef.current?.click()}
          title="Attach files"
        >
          📎 Attach
        </button>

        <button
          className={`send-btn${isSending ? ' sending' : ''}${isSent ? ' sent' : ''}${isError ? ' error' : ''}`}
          type="button"
          onClick={onSend}
          disabled={!filePath || !senderEmail || !senderPassword || rows.length === 0 || isSending}
        >
          {isSending ? 'Sending…' : isSent ? '✓ Sent!' : isError ? '✗ Error — retry' : '✉ Send Emails'}
        </button>
        {!filePath && (
          <span className="send-hint">Upload a recipient file first</span>
        )}
        {filePath && !senderPassword && (
          <span className="send-hint">Enter your email password to continue</span>
        )}
      </div>
    </div>
  )
})

export default EmailEditor
