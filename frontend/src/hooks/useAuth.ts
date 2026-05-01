/**
 * useAuth — Central authentication hook for HireAI.
 *
 * The single source of truth for:
 *   - Current user data (id, email, role, profile)
 *   - Authentication state (isAuthenticated)
 *   - Auth token for API calls
 *   - Logout function
 *
 * Usage:
 *   const { user, token, role, isAuthenticated, logout } = useAuth()
 */
'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'

export interface AuthUser {
  id: string
  email: string
  role: 'recruiter' | 'candidate' | 'admin'
  profile?: {
    full_name?: string
    avatar_url?: string
    company_name?: string
    headline?: string
    skills?: string[]
    resume_url?: string
    experience_years?: number
    parsed_data?: Record<string, unknown>
  }
  created_at?: string
}

export interface UseAuthReturn {
  user: AuthUser | null
  token: string | null
  role: 'recruiter' | 'candidate' | 'admin' | null
  isAuthenticated: boolean
  isLoading: boolean
  logout: () => void
  getInitials: () => string
  updateUser: (newData: Partial<AuthUser>) => void
}

export function useAuth(): UseAuthReturn {
  const router = useRouter()
  const [user, setUser] = useState<AuthUser | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const loadUser = useCallback(() => {
    const storedToken = localStorage.getItem('hireai_token')
    const storedUser = localStorage.getItem('hireai_user')

    if (storedToken && storedUser) {
      try {
        const parsedUser: AuthUser = JSON.parse(storedUser)
        setToken(storedToken)
        setUser(parsedUser)
      } catch {
        localStorage.removeItem('hireai_token')
        localStorage.removeItem('hireai_user')
      }
    }
    setIsLoading(false)
  }, [])

  useEffect(() => {
    loadUser()
    window.addEventListener('hireai_user_updated', loadUser)
    return () => window.removeEventListener('hireai_user_updated', loadUser)
  }, [loadUser])

  const logout = useCallback(() => {
    localStorage.removeItem('hireai_token')
    localStorage.removeItem('hireai_user')
    setUser(null)
    setToken(null)
    router.push('/auth/login')
  }, [router])

  const getInitials = useCallback((): string => {
    if (!user?.profile?.full_name) return 'U'
    const parts = user.profile.full_name.trim().split(' ')
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
  }, [user])

  const updateUser = useCallback((newData: Partial<AuthUser>) => {
    const storedUser = localStorage.getItem('hireai_user')
    if (storedUser) {
      const parsedUser = JSON.parse(storedUser)
      const updatedUser = { ...parsedUser, ...newData }
      if (newData.profile) {
        updatedUser.profile = { ...parsedUser.profile, ...newData.profile }
      }
      localStorage.setItem('hireai_user', JSON.stringify(updatedUser))
      window.dispatchEvent(new Event('hireai_user_updated'))
      setUser(updatedUser)
    }
  }, [])

  return {
    user,
    token,
    role: user?.role ?? null,
    isAuthenticated: !!token && !!user,
    isLoading,
    logout,
    getInitials,
    updateUser,
  }
}
