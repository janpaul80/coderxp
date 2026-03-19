import React, { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthPage } from '@/pages/AuthPage'
import { WorkspacePage } from '@/pages/WorkspacePage'
import { useAuthStore } from '@/store/authStore'

// Lazy-load public pages (not on the critical workspace path)
const LandingPage = lazy(() => import('@/pages/LandingPage'))
const AboutPage = lazy(() => import('@/pages/AboutPage'))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
})

// ─── Auth guard ───────────────────────────────────────────────

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  if (!isAuthenticated) return <Navigate to="/auth" replace />
  return <>{children}</>
}

// Auth page redirects to /workspace if already logged in
function PublicAuthRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  if (isAuthenticated) return <Navigate to="/workspace" replace />
  return <>{children}</>
}

// ─── App ──────────────────────────────────────────────────────

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Suspense fallback={null}>
          <Routes>
            {/* Public landing page */}
            <Route path="/" element={<LandingPage />} />

            {/* About page */}
            <Route path="/about" element={<AboutPage />} />

            {/* Auth — redirects to /workspace if already logged in */}
            <Route
              path="/auth"
              element={
                <PublicAuthRoute>
                  <AuthPage />
                </PublicAuthRoute>
              }
            />

            {/* Protected workspace */}
            <Route
              path="/workspace"
              element={
                <ProtectedRoute>
                  <WorkspacePage />
                </ProtectedRoute>
              }
            />

            {/* Catch-all → landing */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
