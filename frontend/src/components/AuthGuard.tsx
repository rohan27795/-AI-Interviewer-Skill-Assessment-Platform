/**
 * AuthGuard — Client-side route protection component.
 *
 * Wraps any page that requires authentication and/or a specific role.
 * - Redirects unauthenticated users to /auth/login
 * - Redirects wrong-role users to their correct dashboard
 * - Shows a loading spinner while auth state is being determined
 *
 * Usage:
 *   // Require any authentication
 *   <AuthGuard>{children}</AuthGuard>
 *
 *   // Require a specific role
 *   <AuthGuard requiredRole="recruiter">{children}</AuthGuard>
 *   <AuthGuard requiredRole="candidate">{children}</AuthGuard>
 */
'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'

interface AuthGuardProps {
  children: React.ReactNode
  requiredRole?: 'recruiter' | 'candidate' | 'admin'
}

export default function AuthGuard({ children, requiredRole }: AuthGuardProps) {
  const router = useRouter()
  const pathname = usePathname()
  const { isAuthenticated, isLoading, role, logout } = useAuth()
  const [mounted, setMounted] = useState(false)
  const [timedOut, setTimedOut] = useState(false)

  useEffect(() => {
    setMounted(true)
    const timer = setTimeout(() => {
      if (isLoading) setTimedOut(true)
    }, 8000)
    return () => clearTimeout(timer)
  }, [isLoading])

  useEffect(() => {
    if (isLoading) return

    if (!isAuthenticated) {
      // Not logged in — send to login with the required role pre-selected
      const loginRole = requiredRole ?? 'candidate'
      router.replace(`/auth/login?role=${loginRole}`)
      return
    }

    // Logged in but wrong role
    if (requiredRole && role !== requiredRole && role !== 'admin') {
      const target = role === 'recruiter' ? '/recruiter/jobs' : '/candidate/dashboard'
      if (pathname !== target) {
        router.replace(target)
      } else {
        // Prevent infinite loop if role is completely invalid/missing but we are on the target path
        logout()
      }
    }
  }, [isAuthenticated, isLoading, role, requiredRole, router, pathname, logout])

  // While checking auth state or hydrating, show a premium centered spinner
  if (!mounted || isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center" style={{ background: '#0a0c1e' }}>
        <div className="relative mb-8">
          <div className="w-16 h-16 rounded-2xl border-2 border-indigo-500/20 border-t-indigo-500 animate-spin" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-8 h-8 rounded-full bg-indigo-500/10 blur-xl animate-pulse" />
          </div>
        </div>
        
        <h2 className="text-white font-bold text-lg mb-2">
          {timedOut ? 'Taking longer than usual...' : 'Verifying your session'}
        </h2>
        <p className="text-slate-400 text-sm max-w-xs leading-relaxed animate-pulse">
          {timedOut 
            ? "We're having trouble connecting to the auth service. Please check your connection or try logging in again."
            : "Please wait while we securely sync your profile and preferences."}
        </p>

        {timedOut && (
          <div className="mt-8 flex gap-3">
            <button 
              onClick={() => window.location.reload()}
              className="px-6 py-2.5 bg-white/10 hover:bg-white/15 text-white text-sm font-bold rounded-xl transition-colors"
            >
              Retry
            </button>
            <button 
              onClick={() => logout()}
              className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl transition-all shadow-lg shadow-indigo-500/20"
            >
              Go to Login
            </button>
          </div>
        )}
      </div>
    )
  }

  // If not authenticated or wrong role, render nothing (redirect happening)
  if (!isAuthenticated) return null
  if (requiredRole && role !== requiredRole && role !== 'admin') return null

  return <>{children}</>
}
