/**
 * AuthCallbackPage — handles Supabase OAuth redirect
 *
 * Supabase redirects here after Google/GitHub OAuth with the session
 * embedded in the URL hash. We exchange it for a backend JWT and
 * redirect to /workspace.
 */
import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { connectSocket } from '@/lib/socket'
import api from '@/lib/api'
import type { User } from '@/types'

export function AuthCallbackPage() {
  const navigate = useNavigate()
  const handled = useRef(false)

  useEffect(() => {
    if (handled.current) return
    handled.current = true

    async function handleCallback() {
      try {
        // Supabase automatically parses the hash/query params and sets the session
        const { data, error } = await supabase.auth.getSession()
        if (error || !data.session) {
          console.error('[AuthCallback] No session after OAuth redirect:', error?.message)
          navigate('/auth?error=oauth_failed')
          return
        }

        // Exchange Supabase access token for backend JWT
        const res = await api.post<{ user: User; token: string }>(
          '/api/auth/supabase',
          {},
          { headers: { Authorization: `Bearer ${data.session.access_token}` } }
        )

        const { user, token } = res.data
        useAuthStore.getState().login(user, token)
        connectSocket(token)
        navigate('/workspace', { replace: true })
      } catch (err) {
        console.error('[AuthCallback] Exchange failed:', err)
        navigate('/auth?error=exchange_failed')
      }
    }

    handleCallback()
  }, [navigate])

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0c0c0c]">
      <div className="flex flex-col items-center gap-4">
        <svg className="animate-spin w-8 h-8 text-purple-500" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
        </svg>
        <p className="text-white/50 text-sm">Completing sign in…</p>
      </div>
    </div>
  )
}
