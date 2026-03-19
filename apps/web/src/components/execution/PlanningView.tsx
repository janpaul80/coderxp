import React from 'react'
import { motion } from 'framer-motion'
import { Brain, Search, Layers, Code2, Zap } from 'lucide-react'
import { useAppStore } from '@/store/appStore'

const thinkingSteps = [
  { icon: <Search className="w-3.5 h-3.5" />, label: 'Analyzing your request' },
  { icon: <Brain className="w-3.5 h-3.5" />, label: 'Understanding requirements' },
  { icon: <Layers className="w-3.5 h-3.5" />, label: 'Designing architecture' },
  { icon: <Code2 className="w-3.5 h-3.5" />, label: 'Structuring build plan' },
]

function ThinkingStep({
  icon,
  label,
  index,
}: {
  icon: React.ReactNode
  label: string
  index: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.4, duration: 0.4 }}
      className="flex items-center gap-3"
    >
      <motion.div
        animate={{ scale: [1, 1.1, 1] }}
        transition={{ delay: index * 0.4, duration: 0.6, repeat: Infinity, repeatDelay: 2 }}
        className="w-7 h-7 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center text-accent shrink-0"
      >
        {icon}
      </motion.div>
      <div className="flex-1">
        <p className="text-xs text-text-secondary">{label}</p>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: '100%' }}
          transition={{ delay: index * 0.4 + 0.2, duration: 1.5, ease: 'easeOut' }}
          className="h-0.5 bg-gradient-to-r from-accent/40 to-transparent rounded-full mt-1"
        />
      </div>
      <motion.div
        initial={{ opacity: 0, scale: 0 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: index * 0.4 + 1.7, duration: 0.2 }}
        className="w-4 h-4 rounded-full bg-success/20 border border-success/30 flex items-center justify-center shrink-0"
      >
        <div className="w-1.5 h-1.5 rounded-full bg-success" />
      </motion.div>
    </motion.div>
  )
}

export function PlanningView() {
  const appMode = useAppStore((s) => s.appMode)
  const isAwaiting = appMode === 'awaiting_approval'

  return (
    <div className="flex flex-col items-center justify-center h-full px-8 relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full bg-accent/[0.05] blur-3xl" />
      </div>
      <div className="absolute inset-0 bg-grid opacity-20 pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative w-full max-w-sm"
      >
        {/* Header */}
        <div className="flex flex-col items-center mb-10">
          <div className="relative mb-4">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
              className="w-16 h-16 rounded-2xl border border-accent/20 flex items-center justify-center"
              style={{ background: 'conic-gradient(from 0deg, rgba(124,106,247,0.15), rgba(124,106,247,0.05), rgba(124,106,247,0.15))' }}
            >
              <Zap className="w-8 h-8 text-accent" />
            </motion.div>
            <motion.div
              animate={{ scale: [1, 1.3, 1], opacity: [0.3, 0.6, 0.3] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="absolute inset-0 rounded-2xl bg-accent/10 blur-lg"
            />
          </div>

          <h2 className="text-base font-semibold text-text-primary mb-1">
            {isAwaiting ? 'Plan Ready for Review' : 'Analyzing Your Request'}
          </h2>
          <p className="text-xs text-text-secondary text-center">
            {isAwaiting
              ? 'Review the build plan in the chat and approve to begin'
              : 'Understanding your requirements and designing the architecture...'}
          </p>
        </div>

        {/* Thinking steps */}
        {!isAwaiting && (
          <div className="space-y-4">
            {thinkingSteps.map((step, i) => (
              <ThinkingStep key={i} {...step} index={i} />
            ))}
          </div>
        )}

        {/* Awaiting approval state */}
        {isAwaiting && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center gap-4 p-6 rounded-2xl bg-accent/[0.06] border border-accent/20"
          >
            <div className="w-12 h-12 rounded-xl bg-accent/15 border border-accent/25 flex items-center justify-center">
              <Layers className="w-6 h-6 text-accent" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-text-primary mb-1">
                Build plan created
              </p>
              <p className="text-xs text-text-secondary">
                Review the plan in the chat panel and click{' '}
                <span className="text-success font-medium">Approve & Build</span>{' '}
                to start
              </p>
            </div>
            {/* Pulsing indicator */}
            <div className="flex items-center gap-2">
              <span className="relative flex">
                <span className="w-2 h-2 rounded-full bg-accent animate-ping absolute" />
                <span className="w-2 h-2 rounded-full bg-accent" />
              </span>
              <span className="text-xs text-text-muted">Waiting for approval</span>
            </div>
          </motion.div>
        )}
      </motion.div>
    </div>
  )
}
