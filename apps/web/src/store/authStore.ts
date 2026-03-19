import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'
import type { User } from '@/types'

interface AuthStore {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  isLoading: boolean

  setUser: (user: User | null) => void
  setToken: (token: string | null) => void
  setLoading: (loading: boolean) => void
  login: (user: User, token: string) => void
  logout: () => void
}

export const useAuthStore = create<AuthStore>()(
  devtools(
    persist(
      (set) => ({
        user: null,
        token: null,
        isAuthenticated: false,
        isLoading: false,

        setUser: (user) =>
          set({ user, isAuthenticated: !!user }, false, 'setUser'),

        setToken: (token) =>
          set({ token }, false, 'setToken'),

        setLoading: (loading) =>
          set({ isLoading: loading }, false, 'setLoading'),

        login: (user, token) =>
          set(
            { user, token, isAuthenticated: true, isLoading: false },
            false,
            'login'
          ),

        logout: () =>
          set(
            { user: null, token: null, isAuthenticated: false },
            false,
            'logout'
          ),
      }),
      {
        name: 'codedxp-auth',
        partialize: (state) => ({
          token: state.token,
          user: state.user,
          isAuthenticated: state.isAuthenticated,
        }),
      }
    ),
    { name: 'CodedXP/AuthStore' }
  )
)
