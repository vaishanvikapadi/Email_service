import { useState, useRef, useEffect } from 'react'
import ExcelUpload from './components/ExcelUpload'
import EmailEditor from './components/EmailEditor'
import LoginPage from './pages/LoginPage'
import { useAuth } from './context/AuthContext'
import './App.css'

/* Strip HTML tags to extract plain text for placeholder scanning */
function stripHtml(html) {
  return html.replace(/<[^>]*>/g, ' ')
}

function extractPlaceholders(text) {
  const regex = /\{([^}]+)\}/g
  const seen = new Set()
  let match
  while ((match = regex.exec(text)) !== null) {
    seen.add(match[1].trim())
  }
  return [...seen]
}

export default function App() {
  const { currentUser, logout } = useAuth()

  const [filePath, setFilePath]           = useState(null)
  const [headers, setHeaders]             = useState([])
  const [rows, setRows]                   = useState([])
  const [subject, setSubject]             = useState('')
  const [body, setBody]                   = useState('')
  const [senderEmail, setSenderEmail]     = useState('')
  const [senderPassword, setSenderPassword] = useState('')
  const [ccEmails, setCcEmails]           = useState('')
  const [attachments, setAttachments]     = useState([])
  const [sendStatus, setSendStatus]       = useState(null)
  const [sendResults, setSendResults]     = useState([])
  const [sendWarning, setSendWarning]     = useState(null)
  const [profileOpen, setProfileOpen]     = useState(false)

  const profileRef = useRef(null)
  const editorRef  = useRef(null)

  /* Auto-populate sender email when a user logs in */
  useEffect(() => {
    if (currentUser) {
      setSenderEmail(currentUser.email)
      setSenderPassword('')
    }
  }, [currentUser])

  /* Close profile dropdown on outside click */
  useEffect(() => {
    function handleClickOutside(e) {
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setProfileOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  /* Called by ExcelUpload after parsing */
  function handleUpload(uploadedFilePath, extractedHeaders, extractedRows) {
    setFilePath(uploadedFilePath)
    setHeaders(extractedHeaders)
    setRows(extractedRows)
    setSendStatus(null)

    // Auto-populate CC from Excel if a CC column exists
    const ccKey = extractedHeaders.find(h => h.toLowerCase() === 'cc')
    if (ccKey && extractedRows.length > 0) {
      const ccValues = [...new Set(
        extractedRows.map(r => r[ccKey]).filter(Boolean)
      )].join(', ')
      setCcEmails(ccValues)
    }

  }

  function handleInsertPlaceholder(name) {
    editorRef.current?.insertPlaceholder(name)
  }

  async function reloadFile(path) {
    try {
      const res = await fetch('http://localhost:8000/api/get-headers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ file_path: path }),
      })
      if (res.ok) {
        const data = await res.json()
        setHeaders(data.headers || [])
        setRows(data.rows || [])
      }
    } catch {
      // non-fatal — UI will just keep stale data
    }
  }

  async function handleSend() {
    if (!filePath || !senderEmail || rows.length === 0) return
    setSendStatus('sending')
    setSendResults([])
    setSendWarning(null)
    try {
      const formData = new FormData()
      formData.append('file_path',        filePath)
      formData.append('sender_email',     senderEmail)
      formData.append('sender_name',      currentUser.name)
      formData.append('sender_position',  currentUser.position)
      formData.append('sender_phone',     currentUser.phone)
      formData.append('smtp_password',    senderPassword)
      formData.append('cc_emails',        ccEmails)
      formData.append('selected_indices', rows.map((_, i) => i).join(','))
      formData.append('subject',          subject)
      formData.append('body',             body)
      attachments.forEach((file) => formData.append('attachments', file))

      const res = await fetch('http://localhost:8000/api/send-emails/', {
        method: 'POST',
        body: formData,
      })

      if (res.ok) {
        const data = await res.json()
        setSendResults(data.results || [])
        setSendWarning(data.warning || null)
        setSendStatus('success')
        await reloadFile(filePath)
      } else {
        setSendStatus('error')
      }
    } catch {
      setSendStatus('error')
    }
  }

  if (!currentUser) return <LoginPage />

  const combinedText = subject + ' ' + stripHtml(body)
  const placeholders = extractPlaceholders(combinedText)
  const validation   = placeholders.map((name) => ({ name, valid: headers.includes(name) }))
  const hasInvalid   = validation.some((v) => !v.valid)

  return (
    <div className="app-wrap">
      {/* ─── Top header ─── */}
      <header className="app-header">
        <span className="app-logo">✉</span>
        <span className="app-name">Email Automation</span>

        <div className="app-header-spacer" />

        {/* Profile button + dropdown */}
        <div className="profile-menu" ref={profileRef}>
          <button
            className="profile-trigger"
            onClick={() => setProfileOpen((o) => !o)}
            title="View profile"
            aria-expanded={profileOpen}
          >
            <span className="user-avatar">{currentUser.name.charAt(0).toUpperCase()}</span>
            <span className="user-trigger-name">{currentUser.name}</span>
            <span className="profile-chevron">{profileOpen ? '▲' : '▼'}</span>
          </button>

          {profileOpen && (
            <div className="profile-dropdown">
              <div className="profile-dropdown-avatar">
                {currentUser.name.charAt(0).toUpperCase()}
              </div>
              <p className="profile-dropdown-name">{currentUser.name}</p>
              <p className="profile-dropdown-position">{currentUser.position}</p>

              <div className="profile-dropdown-divider" />

              <div className="profile-detail-row">
                <span className="profile-detail-label">Email</span>
                <span className="profile-detail-value">{currentUser.email}</span>
              </div>
              <div className="profile-detail-row">
                <span className="profile-detail-label">Phone</span>
                <span className="profile-detail-value">{currentUser.phone}</span>
              </div>
              <div className="profile-detail-row">
                <span className="profile-detail-label">Username</span>
                <span className="profile-detail-value">{currentUser.username}</span>
              </div>

              <div className="profile-dropdown-divider" />

              <button className="profile-logout-btn" onClick={logout}>
                Sign out
              </button>
            </div>
          )}
        </div>
      </header>

      {/* ─── Page body ─── */}
      <div className="app-layout">
        <aside className="app-sidebar">
          <ExcelUpload
            onUpload={handleUpload}
            onInsertPlaceholder={handleInsertPlaceholder}
          />

          {validation.length > 0 && (
            <div className="validation-card">
              <h3 className="validation-heading">Placeholder Check</h3>
              <div className="validation-tags">
                {validation.map((v) => (
                  <span
                    key={v.name}
                    className={`vtag${v.valid ? ' vtag-ok' : ' vtag-bad'}`}
                    title={v.valid ? 'Matches Excel column' : 'No matching Excel column'}
                  >
                    {`{${v.name}}`}
                    <span className="vtag-icon">{v.valid ? '✓' : '✗'}</span>
                  </span>
                ))}
              </div>
              {hasInvalid && (
                <p className="validation-warn">
                  Red fields don't match any column in the Excel file.
                </p>
              )}
            </div>
          )}

          {sendResults.length > 0 && (
            <div className="validation-card" style={{ marginTop: '12px' }}>
              {sendWarning && (
                <div style={{
                  background: '#fffbeb', border: '1px solid #fcd34d',
                  borderRadius: '6px', padding: '8px 10px',
                  fontSize: '12px', color: '#92400e', marginBottom: '8px',
                }}>
                  ⚠ {sendWarning}
                </div>
              )}
              <h3 className="validation-heading">
                Send Results &nbsp;
                <span style={{ color: '#16a34a', fontWeight: 500 }}>
                  {sendResults.filter(r => r.status === 'sent').length} sent
                </span>
                {sendResults.some(r => r.status === 'skipped') && (
                  <span style={{ color: '#6b7280', fontWeight: 500, marginLeft: '8px' }}>
                    {sendResults.filter(r => r.status === 'skipped').length} skipped
                  </span>
                )}
                {sendResults.some(r => r.status === 'failed') && (
                  <span style={{ color: '#dc2626', fontWeight: 500, marginLeft: '8px' }}>
                    {sendResults.filter(r => r.status === 'failed').length} failed
                  </span>
                )}
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '6px' }}>
                {sendResults.map((r, i) => {
                  const colors = {
                    sent:    { bg: '#f0fdf4', border: '#bbf7d0', text: '#15803d', icon: '✓' },
                    failed:  { bg: '#fef2f2', border: '#fecaca', text: '#b91c1c', icon: '✗' },
                    skipped: { bg: '#f9fafb', border: '#e5e7eb', text: '#6b7280', icon: '–' },
                  }
                  const c = colors[r.status] || colors.skipped
                  return (
                    <div
                      key={i}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '8px',
                        padding: '6px 8px',
                        borderRadius: '6px',
                        background: c.bg,
                        border: `1px solid ${c.border}`,
                        fontSize: '12px',
                      }}
                    >
                      <span style={{ fontSize: '14px', lineHeight: 1, color: c.text }}>{c.icon}</span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{
                          fontWeight: 600,
                          color: c.text,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}>
                          {r.email}
                        </div>
                        {r.status === 'skipped' && (
                          <div style={{ color: '#6b7280', marginTop: '2px' }}>Already sent — skipped</div>
                        )}
                        {r.status === 'failed' && r.error && (
                          <div style={{ color: '#b91c1c', marginTop: '2px', wordBreak: 'break-word' }}>
                            {r.error}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </aside>

        <main className="app-main">
          <EmailEditor
            ref={editorRef}
            headers={headers}
            rows={rows}
            filePath={filePath}
            senderEmail={senderEmail}
            onSenderEmailChange={setSenderEmail}
            senderPassword={senderPassword}
            onSenderPasswordChange={setSenderPassword}
            ccEmails={ccEmails}
            onCcEmailsChange={setCcEmails}
            attachments={attachments}
            onAttachmentsChange={setAttachments}
            subject={subject}
            onSubjectChange={setSubject}
            onBodyChange={setBody}
            onSend={handleSend}
            sendStatus={sendStatus}
          />
        </main>
      </div>
    </div>
  )
}
