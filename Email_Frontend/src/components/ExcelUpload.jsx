import { useState } from 'react'

export default function ExcelUpload({ onUpload }) {
  const [filePath, setFilePath] = useState('')
  const [fileName, setFileName] = useState('')
  const [headers, setHeaders] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const displayHeaders = headers.includes('sender') ? headers : [...headers, 'sender']

  async function handleSubmit() {
    const trimmedPath = filePath.trim()

    if (!trimmedPath) {
      setError('Please enter a file path')
      return
    }

    if (!/\.(xlsx|xls|csv)$/i.test(trimmedPath)) {
      setError('Please enter a valid Excel/CSV file path (.xlsx, .xls, .csv)')
      return
    }

    setError('')
    setLoading(true)

    try {
      const response = await fetch('http://localhost:8000/api/get-headers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ file_path: trimmedPath }),
      })

      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.detail || 'Request failed')
      }

      const data = await response.json()

      console.log('Headers:', data.headers)
      console.log('Row count:', data.row_count)

      setFileName(trimmedPath.split(/[\\/]/).pop())
      setHeaders(data.headers || [])

      // send to parent
      onUpload?.(trimmedPath, data.headers, data.rows || [])

    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function onKeyDown(e) {
    if (e.key === 'Enter') handleSubmit()
  }

  return (
    <div className="upload-card">
      <p className="card-title">Recipients</p>

      <div className="upload-zone" style={{ cursor: 'default' }}>
        {fileName ? (
          <div>✅ File loaded: {fileName}</div>
        ) : (
          <div>Enter the path to your Excel/CSV file below</div>
        )}
      </div>

      <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
        <input
          type="text"
          placeholder="e.g. C:\data\recipients.xlsx"
          value={filePath}
          onChange={(e) => setFilePath(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={loading}
          style={{ flex: 1, padding: '6px 10px', borderRadius: '4px', border: '1px solid #ccc' }}
        />
        <button onClick={handleSubmit} disabled={loading}>
          {loading ? 'Loading...' : 'Load'}
        </button>
      </div>

      {error && <p style={{ color: 'red' }}>❌ {error}</p>}

      {headers.length > 0 && (
        <div style={{ marginTop: '12px' }}>
          <p style={{ margin: '0 0 6px', fontWeight: 600, fontSize: '13px' }}>
            Columns found ({displayHeaders.length}):
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {displayHeaders.map((col) => (
              <span
                key={col}
                style={{
                  background: '#e8f0fe',
                  color: '#1a56db',
                  borderRadius: '4px',
                  padding: '2px 10px',
                  fontSize: '13px',
                  fontFamily: 'monospace',
                }}
              >
                {col}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}