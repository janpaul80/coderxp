import React, { useEffect, useRef } from 'react'
import { AppLayout } from '@/components/layout/AppLayout'
import { useSocket } from '@/hooks/useSocket'
import { useAuth } from '@/hooks/useAuth'
import { useRehydrateState } from '@/hooks/useRehydrateState'
import { useChatStore } from '@/store/chatStore'
import { projectsApi } from '@/lib/api'

const PENDING_PROMPT_KEY = 'codedxp_pending_prompt'

export function WorkspacePage() {
  const { user } = useAuth()
  // useSocket handles connection lifecycle via its own useEffect
  useSocket()
  // Restore appMode / panel state on page refresh (best-effort, non-blocking)
  useRehydrateState()

  const setProjects = useChatStore((s) => s.setProjects)
  const setInputValue = useChatStore((s) => s.setInputValue)
  const promptRestoredRef = useRef(false)

  // Restore pending prompt from sessionStorage (set by landing page hero chatbox)
  // Runs once on mount — clears the key after reading so it doesn't re-populate on refresh
  useEffect(() => {
    if (promptRestoredRef.current) return
    promptRestoredRef.current = true
    const pending = sessionStorage.getItem(PENDING_PROMPT_KEY)
    if (pending) {
      setInputValue(pending)
      sessionStorage.removeItem(PENDING_PROMPT_KEY)
    }
  }, [setInputValue])

  // Load projects on mount
  useEffect(() => {
    const loadProjects = async () => {
      try {
        const res = await projectsApi.list()
        // Projects API returns Project[] directly (not wrapped in ApiResponse/PaginatedResponse)
        const projects = res.data as unknown as import('@/types').Project[]
        setProjects(Array.isArray(projects) ? projects : [])
      } catch {
        // Projects will be empty on first load — that's fine
      }
    }
    loadProjects()
  }, [setProjects])

  return <AppLayout />
}
