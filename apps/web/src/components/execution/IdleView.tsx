import React from 'react'
import { motion } from 'framer-motion'
import { Zap, Layers, Shield, Plug, Eye, Wrench } from 'lucide-react'

const capabilities = [
  { icon: <Layers className="w-4 h-4" />, label: 'Full-stack apps' },
  { icon: <Shield className="w-4 h-4" />, label: 'Auth & billing' },
  { icon: <Plug className="w-4 h-4" />, label: 'API integrations' },
  { icon: <Eye className="w-4 h-4" />, label: 'Live preview' },
  { icon: <Wrench className="w-4 h-4" />, label: 'Auto-repair' },
  { icon: <Zap className="w-4 h-4" />, label: 'Instant deploy' },
]

export function IdleView() {
  return (
    <div className="flex flex-col items-center justify-center h-full px-8 relative overflow-hidden">
      {/* Background ambient glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-accent/[0.04] blur-3xl" />
        <div className="absolute top-1/3 left-1/3 w-[300px] h-[300px] rounded-full bg-info/[0.03] blur-3xl" />
      </div>

      {/* Dot grid */}
      <div className="absolute inset-0 bg-dots opacity-30 pointer-events-none" />

      {/* Content */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
        className="relative flex flex-col items-center text-center max-w-md"
      >
        {/* Logo mark */}
        <div className="relative mb-8">
          <motion.div
            animate={{ scale: [1, 1.04, 1] }}
            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
            className="w-20 h-20 rounded-3xl bg-accent/10 border border-accent/20 flex items-center justify-center"
            style={{ boxShadow: '0 0 60px rgba(124,106,247,0.15)' }}
          >
            <Zap className="w-10 h-10 text-accent" />
          </motion.div>
          {/* Orbit ring */}
          <div className="absolute inset-0 rounded-3xl border border-accent/10 scale-125 animate-pulse-slow" />
        </div>

        {/* Heading */}
        <h1 className="text-2xl font-bold gradient-text mb-3">
          CodedXP
        </h1>
        <p className="text-sm text-text-secondary leading-relaxed mb-10 max-w-xs">
          Your autonomous app builder. Describe what you want to build in the chat — I'll plan, code, and deploy it.
        </p>

        {/* Capabilities grid */}
        <div className="grid grid-cols-3 gap-3 w-full">
          {capabilities.map((cap, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.06, duration: 0.3 }}
              className="flex flex-col items-center gap-2 p-3 rounded-xl bg-base-elevated border border-white/[0.06] hover:border-accent/20 hover:bg-accent/[0.04] transition-all duration-200 group"
            >
              <span className="text-text-muted group-hover:text-accent transition-colors">
                {cap.icon}
              </span>
              <span className="text-2xs text-text-muted group-hover:text-text-secondary transition-colors font-medium text-center">
                {cap.label}
              </span>
            </motion.div>
          ))}
        </div>

        {/* Hint */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="mt-8 text-xs text-text-muted"
        >
          Start by describing your app in the chat →
        </motion.p>
      </motion.div>
    </div>
  )
}
