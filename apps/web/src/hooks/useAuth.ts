import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { useAppStore } from '@/store/appStore'
import { useChatStore } from '@/store/chatStore'
import { authApi } from '@/lib/api'
import { connectSocket, disconnectSocket } from '@/lib/socket'

export function useAuth() {
  const navigate = useNavigate()
  const { user, token, isAuthenticated, isLoading, login, logout, setLoading } =
    useAuthStore()
  const resetToIdle = useAppStore((s) => s.resetToIdle)
  const setProjects = useChatStore((s) => s.setProjects)

  const handleLogin = useCallback(
    async (email: string, password: string) => {
      setLoading(true)
      try {
        const res = await authApi.login({ email, password })
        // Auth API returns { user, token } directly (not wrapped in ApiResponse)
        const { user: u, token: t } = res.data as unknown as { user: import('@/types').User; token: string }
        login(u, t)
        connectSocket(t)
        navigate('/workspace')
        return { success: true }
      } catch (err: unknown) {
        const errData = (err as { response?: { data?: { error?: string; message?: string } } })?.response?.data
        const message = errData?.error ?? errData?.message ?? 'Login failed. Please check your credentials.'
        return { success: false, error: message }
      } finally {
        setLoading(false)
      }
    },
    [login, navigate, setLoading]
  )

  const handleRegister = useCallback(
    async (name: string, email: string, password: string) => {
      setLoading(true)
      try {
        const res = await authApi.register({ name, email, password })
        // Auth API returns { user, token } directly (not wrapped in ApiResponse)
        const { user: u, token: t } = res.data as unknown as { user: import('@/types').User; token: string }
        login(u, t)
        connectSocket(t)
        navigate('/workspace')
        return { success: true }
      } catch (err: unknown) {
        const errData = (err as { response?: { data?: { error?: string; message?: string } } })?.response?.data
        const message = errData?.error ?? errData?.message ?? 'Registration failed. Please try again.'
        return { success: false, error: message }
      } finally {
        setLoading(false)
      }
    },
    [login, navigate, setLoading]
  )

  const handleLogout = useCallback(async () => {
    try {
      await authApi.logout()
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

  const refreshUser = useCallback(async () => {
    if (!token) return
    try {
      const res = await authApi.me()
      // /api/auth/me returns { user: User } directly (not wrapped in ApiResponse)
      const userData = (res.data as unknown as { user: import('@/types').User }).user ?? res.data
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
    logout: handleLogout,
    refreshUser,
  }
}
