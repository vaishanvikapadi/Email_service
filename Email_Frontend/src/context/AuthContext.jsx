import { createContext, useContext, useState } from 'react'
import USERS from '../data/users'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null)
  const [error, setError] = useState('')

  function login(username, password) {
    const found = USERS.find(
      (u) =>
        u.username.toLowerCase() === username.trim().toLowerCase() &&
        u.password === password.trim()
    )
    if (found) {
      setCurrentUser(found)
      setError('')
      return true
    }
    setError('Invalid username or password')
    return false
  }

  function logout() {
    setCurrentUser(null)
    setError('')
  }

  return (
    <AuthContext.Provider value={{ currentUser, login, logout, error }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
