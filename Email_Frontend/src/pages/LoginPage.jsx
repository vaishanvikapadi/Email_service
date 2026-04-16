import { useState } from 'react'
import { useAuth } from '../context/AuthContext'

export default function LoginPage() {
  const { login, error } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)

  function handleSubmit(e) {
    e.preventDefault()
    login(username, password)
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">✉</div>
        <h1 className="login-title">Email Automation</h1>
        <p className="login-subtitle">Sign in with your sales account</p>

        <form className="login-form" onSubmit={handleSubmit} noValidate>
          <div className="login-field">
            <label className="login-label" htmlFor="username">Username</label>
            <input
              id="username"
              className="login-input"
              type="text"
              placeholder="Enter your username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoFocus
            />
          </div>

          <div className="login-field">
            <label className="login-label" htmlFor="password">Password</label>
            <div className="login-pass-wrap">
              <input
                id="password"
                className="login-input"
                type={showPass ? 'text' : 'password'}
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
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

          {error && <p className="login-error">{error}</p>}

          <button
            className="login-btn"
            type="submit"
            disabled={!username || !password}
          >
            Sign In
          </button>
        </form>
      </div>
    </div>
  )
}
