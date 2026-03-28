import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { useAppStore } from '@/store/appStore'
import { useChatStore } from '@/store/chatStore'
import { connectSocket, disconnectSocket } from '@/lib/socket'
import { supabase } from '@/lib/supabase'
import api from '@/lib/api'
import type { User } from '@/types'

// ─── Supabase → backend exchange ─────────────────────────────
// After Supabase auth, call the backend to get a backend JWT + Prisma user.
// The backend verifies the Supabase token, upserts the user, creates a Session.

async function exchangeSupabaseToken(
  supabaseAccessToken: string
): Promise<{ user: User; token: string }> {
  const res = await api.post<{ user: User; token: string }>(
    '/api/auth/supabase',
    {},
    { headers: { Authorization: `Bearer ${supabaseAccessToken}` } }
  )
  return res.data
}

// ─── Hook ─────────────────────────────────────────────────────

export function useAuth() {
  const navigate = useNavigate()
  const { user, token, isAuthenticated, isLoading, login, logout, setLoading } =
    useAuthStore()
  const resetToIdle = useAppStore((s) => s.resetToIdle)
  const setProjects = useChatStore((s) => s.setProjects)

  // ── Email / Password login ────────────────────────────────
  const handleLogin = useCallback(
    async (email: string, password: string) => {
      setLoading(true)
      try {
        // 1. Authenticate with Supabase
        const { data, error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw new Error(error.message)
        if (!data.session) throw new Error('No session returned from Supabase')

        // 2. Exchange Supabase token for backend JWT
        const { user: u, token: t } = await exchangeSupabaseToken(data.session.access_token)

        // 3. Store backend JWT + connect socket
        login(u, t)
        connectSocket(t)
        navigate('/workspace')
        return { success: true }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Login failed. Please check your credentials.'
        return { success: false, error: message }
      } finally {
        setLoading(false)
      }
    },
    [login, navigate, setLoading]
  )

  // ── Email / Password register ─────────────────────────────
  const handleRegister = useCallback(
    async (name: string, email: string, password: string) => {
      setLoading(true)
      try {
        // 1. Create account in Supabase (sends confirmation email if enabled)
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: name } },
        })
        if (error) throw new Error(error.message)

        // If email confirmation is required, Supabase returns a user but no session
        if (!data.session) {
          // Account created — user must confirm email before logging in
          return {
            success: true,
            requiresConfirmation: true,
            message: 'Account created! Please check your email to confirm your account.',
          }
        }

        // 2. Exchange Supabase token for backend JWT
        const { user: u, token: t } = await exchangeSupabaseToken(data.session.access_token)

        // 3. Store backend JWT + connect socket
        login(u, t)
        connectSocket(t)
        navigate('/workspace')
        return { success: true }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Registration failed. Please try again.'
        return { success: false, error: message }
      } finally {
        setLoading(false)
      }
    },
    [login, navigate, setLoading]
  )

  // ── Google OAuth ──────────────────────────────────────────
  const loginWithGoogle = useCallback(async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
    if (error) console.error('[Auth] Google OAuth error:', error.message)
  }, [])

  // ── GitHub OAuth ──────────────────────────────────────────
  const loginWithGithub = useCallback(async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
    if (error) console.error('[Auth] GitHub OAuth error:', error.message)
  }, [])

  // ── Logout ────────────────────────────────────────────────
  const handleLogout = useCallback(async () => {
    try {
      await supabase.auth.signOut()
    } catch {
      // ignore
    } finally {
      disconnectSocket()
      logout()
      resetToIdle()
      setProjects([])
      navigate('/auth')
    }
  }, [logout, navigate, resetToIdle, setProjects])

  // ── Refresh user ──────────────────────────────────────────
  const refreshUser = useCallback(async () => {
    if (!token) return
    try {
      const res = await api.get<{ user: User }>('/api/auth/me')
      const userData = (res.data as unknown as { user: User }).user ?? res.data
      useAuthStore.getState().setUser(userData)
    } catch {
      handleLogout()
    }
  }, [token, handleLogout])

  return {
    user,
    token,
    isAuthenticated,
    isLoading,
    login: handleLogin,
    register: handleRegister,
    loginWithGoogle,
    loginWithGithub,
    logout: handleLogout,
    refreshUser,
  }
}
