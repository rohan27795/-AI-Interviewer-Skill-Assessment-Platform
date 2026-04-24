'use client'

export const dynamic = 'force-dynamic'

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import axios from 'axios'
import { getApiUrl } from '@/lib/api'
import toast from 'react-hot-toast'
import { Loader2 } from 'lucide-react'

import { Suspense } from 'react'

function AuthCallbackContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const role = searchParams.get('role') || 'candidate'

  useEffect(() => {
    const handleCallback = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession()
        if (error) throw error
        if (!session) {
          router.push('/auth/login')
          return
        }

        const API_URL = getApiUrl()
        // Exchange Supabase token for HireAI custom JWT
        const res = await axios.post(`${API_URL}/api/v1/auth/social-login`, {
          access_token: session.access_token,
          role: role
        })

        // Store HireAI token and user
        localStorage.setItem('hireai_token', res.data.access_token)
        localStorage.setItem('hireai_user', JSON.stringify(res.data.user))

        toast.success('Successfully logged in!')
        
        // Redirect based on the actual user role returned by the server
        const dbRole = res.data.user?.role || 'candidate'
        if (dbRole === 'recruiter' || dbRole === 'admin') {
          router.push('/recruiter/jobs')
        } else {
          router.push('/candidate/dashboard')
        }
      } catch (err: any) {
        console.error('Auth callback error:', err)
        toast.error('Social authentication failed. Please try again.')
        router.push('/auth/login')
      }
    }

    handleCallback()
  }, [router, role])

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm text-center space-y-4">
        <div className="flex justify-center">
            <Loader2 className="w-10 h-10 text-brand-600 animate-spin" />
        </div>
        <h1 className="text-xl font-bold text-surface-900 tracking-tight">Completing authentication...</h1>
        <p className="text-surface-500 text-sm">Please wait while we sync your profile and prepare your dashboard.</p>
      </div>
    </div>
  )
}

export default function AuthCallback() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader2 className="w-10 h-10 text-brand-600 animate-spin" /></div>}>
      <AuthCallbackContent />
    </Suspense>
  )
}
