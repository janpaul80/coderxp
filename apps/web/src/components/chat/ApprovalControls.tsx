import React, { useState } from 'react'
import { CheckCircle2, XCircle, Edit3, WifiOff } from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import { useChatStore } from '@/store/chatStore'
import { useSocket } from '@/hooks/useSocket'
import { plansApi } from '@/lib/api'
import { generateId } from '@/lib/utils'
import { getSocket } from '@/lib/socket'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Input'
import type { Plan } from '@/types'

interface ApprovalControlsProps {
  plan: Plan
}

export function ApprovalControls({ plan }: ApprovalControlsProps) {
  const [isModifying, setIsModifying] = useState(false)
  const [modifyText, setModifyText] = useState('')
  const [isLoading, setIsLoading] = useState<'approve' | 'reject' | 'modify' | null>(null)
  const [connectionError, setConnectionError] = useState(false)

  const setActivePlan = useAppStore((s) => s.setActivePlan)
  const resetToIdle = useAppStore((s) => s.resetToIdle)
  const activeProjectId = useChatStore((s) => s.activeProjectId)
  const addMessage = useChatStore((s) => s.addMessage)
  const activeChatId = useChatStore((s) => s.activeChatId)

  const { approvePlan, rejectPlan, modifyPlan } = useSocket()

  // ── Approve ───────────────────────────────────────────────
  // CRITICAL: Always require a real backend connection.
  // Never fall back to mock engine — fake builds are worse than showing an error.

  const handleApprove = async () => {
    // Guard: require live socket connection to the backend
    if (!getSocket().connected) {
      setConnectionError(true)
      addMessage({
        id: generateId(),
        chatId: activeChatId ?? '',
        role: 'assistant',
        type: 'text',
        content: 'Cannot start build: not connected to the backend server. Please check that the server is running and refresh the page.',
        createdAt: new Date().toISOString(),
      })
      return
    }
    setConnectionError(false)
    setIsLoading('approve')
    try {
      addMessage({
        id: generateId(),
        chatId: activeChatId ?? '',
        role: 'user',
        type: 'approval_response',
        content: 'Plan approved — starting build.',
        metadata: { approvalStatus: 'approved' },
        createdAt: new Date().toISOString(),
      })
      setActivePlan({ ...plan, status: 'approved' })

      // Call REST to persist status, then emit socket event to queue the build
      await plansApi.approve(plan.id)
      approvePlan(plan.id, activeProjectId ?? '')
    } catch (err) {
      console.error('Approve failed:', err)
      addMessage({
        id: generateId(),
        chatId: activeChatId ?? '',
        role: 'assistant',
        type: 'text',
        content: `Build failed to start: ${err instanceof Error ? err.message : 'Unknown error'}. Please try again.`,
        createdAt: new Date().toISOString(),
      })
    } finally {
      setIsLoading(null)
    }
  }

  // ── Reject ────────────────────────────────────────────────

  const handleReject = async () => {
    if (!getSocket().connected) {
      setConnectionError(true)
      return
    }
    setConnectionError(false)
    setIsLoading('reject')
    try {
      addMessage({
        id: generateId(),
        chatId: activeChatId ?? '',
        role: 'user',
        type: 'approval_response',
        content: "Plan rejected. Let me know what you'd like to change.",
        metadata: { approvalStatus: 'rejected' },
        createdAt: new Date().toISOString(),
      })

      await plansApi.reject(plan.id)
      rejectPlan(plan.id)
      resetToIdle()
    } catch (err) {
      console.error('Reject failed:', err)
    } finally {
      setIsLoading(null)
    }
  }

  // ── Modify ────────────────────────────────────────────────

  const handleModify = async () => {
    if (!modifyText.trim()) return
    if (!getSocket().connected) {
      setConnectionError(true)
      return
    }
    setConnectionError(false)
    setIsLoading('modify')
    try {
      addMessage({
        id: generateId(),
        chatId: activeChatId ?? '',
        role: 'user',
        type: 'approval_response',
        content: `Modification requested: ${modifyText}`,
        metadata: { approvalStatus: 'modified' },
        createdAt: new Date().toISOString(),
      })

      await plansApi.modify(plan.id, modifyText)
      modifyPlan(plan.id, modifyText)

      setIsModifying(false)
      setModifyText('')
    } catch (err) {
      console.error('Modify failed:', err)
    } finally {
      setIsLoading(null)
    }
  }

  return (
    <div className="space-y-3">
      {/* ── Modify input ──────────────────────────────────── */}
      {isModifying && (
        <div className="space-y-2">
          <Textarea
            value={modifyText}
            onChange={(e) => setModifyText(e.target.value)}
            placeholder="Describe what you'd like to change in the plan..."
            rows={3}
            className="text-xs"
          />
          <div className="flex gap-2">
            <Button
              variant="accent"
              size="sm"
              onClick={handleModify}
              isLoading={isLoading === 'modify'}
              disabled={!modifyText.trim()}
              fullWidth
            >
              Submit Changes
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setIsModifying(false); setModifyText('') }}
              disabled={isLoading !== null}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* ── Action buttons ────────────────────────────────── */}
      {!isModifying && (
        <div className="flex gap-2">
          {/* Approve */}
          <Button
            variant="success"
            size="sm"
            fullWidth
            onClick={handleApprove}
            isLoading={isLoading === 'approve'}
            disabled={isLoading !== null}
            leftIcon={<CheckCircle2 className="w-3.5 h-3.5" />}
          >
            Approve & Build
          </Button>

          {/* Modify */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsModifying(true)}
            disabled={isLoading !== null}
            leftIcon={<Edit3 className="w-3.5 h-3.5" />}
          >
            Modify
          </Button>

          {/* Reject */}
          <Button
            variant="danger"
            size="sm"
            onClick={handleReject}
            isLoading={isLoading === 'reject'}
            disabled={isLoading !== null}
            leftIcon={<XCircle className="w-3.5 h-3.5" />}
          >
            Reject
          </Button>
        </div>
      )}

      {/* ── Connection error ─────────────────────────────── */}
      {connectionError && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20">
          <WifiOff className="w-3.5 h-3.5 text-red-400 shrink-0" />
          <p className="text-2xs text-red-300">
            Not connected to the server. Please check that the backend is running and refresh the page.
          </p>
        </div>
      )}

      {/* ── Info text ─────────────────────────────────────── */}
      <p className="text-2xs text-text-muted text-center">
        Approving will begin the autonomous build process. You can monitor progress in real-time.
      </p>
    </div>
  )
}
