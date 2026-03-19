import React, { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useChatStore } from '@/store/chatStore'
import { useAppStore } from '@/store/appStore'
import { ChatMessage } from './ChatMessage'
import { PlanCard } from './PlanCard'
import { TypingDots } from '@/components/ui/Spinner'
import { Zap } from 'lucide-react'

// ─── Empty / Welcome state ────────────────────────────────────

const SUGGESTION_CHIPS = [
  { label: 'SaaS landing page', prompt: 'Build a SaaS landing page with pricing, features, and waitlist signup' },
  { label: 'Dashboard + auth', prompt: 'Create a dashboard with charts, authentication, and Supabase backend' },
  { label: 'Stripe billing app', prompt: 'Build a subscription app with Stripe billing and user accounts' },
  { label: 'Full-stack todo', prompt: 'Make a full-stack todo app with React frontend and Node.js API' },
  { label: 'Booking system', prompt: 'Build a booking system with calendar, payments, and email notifications' },
  { label: 'Admin panel', prompt: 'Create an admin panel with user management, analytics, and role-based access' },
]

function WelcomeState() {
  const setInputValue = useChatStore((s) => s.setInputValue)

  return (
    <div className="flex flex-col h-full px-6 pt-10 pb-4">
      {/* Top: logo + heading + description — centered in upper area */}
      <div className="flex flex-col items-center text-center flex-1 justify-center">
        {/* Logo mark */}
        <div className="relative mb-5">
          <div className="w-14 h-14 rounded-2xl bg-accent/15 border border-accent/25 flex items-center justify-center float">
            <Zap className="w-7 h-7 text-accent" />
          </div>
          <div className="absolute inset-0 rounded-2xl bg-accent/10 blur-xl" />
        </div>

        <h2 className="text-lg font-semibold text-text-primary mb-2">
          What do you want to build?
        </h2>
        <p className="text-sm text-text-secondary max-w-xs leading-relaxed">
          Describe your app and I'll plan, build, and deploy it for you — from idea to live product.
        </p>
      </div>

      {/* Bottom: suggestion chips — pinned near the chat input */}
      <div className="w-full overflow-x-auto scrollbar-none pb-1">
        <div className="flex gap-2 w-max">
          {SUGGESTION_CHIPS.map((chip, i) => (
            <button
              key={i}
              onClick={() => setInputValue(chip.prompt)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full whitespace-nowrap
                bg-base-elevated border border-white/[0.08]
                hover:border-accent/30 hover:bg-accent/[0.06]
                text-xs text-text-secondary hover:text-text-primary
                transition-all duration-150 shrink-0"
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Typing indicator ─────────────────────────────────────────

function AssistantTyping() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 4 }}
      className="flex items-start gap-3 px-4 py-2"
    >
      <div className="w-6 h-6 rounded-full bg-accent/20 border border-accent/20 flex items-center justify-center shrink-0 mt-0.5">
        <Zap className="w-3 h-3 text-accent" />
      </div>
      <div className="bg-base-elevated border border-white/[0.06] rounded-2xl rounded-tl-sm px-4 py-3">
        <TypingDots />
      </div>
    </motion.div>
  )
}

// ─── Chat thread ──────────────────────────────────────────────

export function ChatThread() {
  const messages = useChatStore((s) => s.messages)
  const isAssistantTyping = useChatStore((s) => s.isAssistantTyping)
  const activePlan = useAppStore((s) => s.activePlan)
  const appMode = useAppStore((s) => s.appMode)

  const bottomRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isAssistantTyping])

  const isEmpty = messages.length === 0

  return (
    <div className="flex flex-col h-full overflow-y-auto scrollbar-thin">
      {isEmpty ? (
        <WelcomeState />
      ) : (
        <div className="flex flex-col py-4 space-y-1">
          <AnimatePresence initial={false}>
            {messages.map((message) => (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
              >
                {message.type === 'plan' && message.metadata?.plan ? (
                  <div className="px-4 py-2">
                    <PlanCard
                      plan={message.metadata.plan}
                      isActive={appMode === 'awaiting_approval'}
                    />
                  </div>
                ) : (
                  <ChatMessage message={message} />
                )}
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Typing indicator */}
          <AnimatePresence>
            {isAssistantTyping && <AssistantTyping />}
          </AnimatePresence>

          <div ref={bottomRef} />
        </div>
      )}
    </div>
  )
}
