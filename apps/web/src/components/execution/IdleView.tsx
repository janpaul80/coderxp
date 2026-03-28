import { motion } from 'framer-motion'

export function IdleView() {
  return (
    <div className="flex flex-col items-center justify-center h-full relative overflow-hidden">
      {/* Ambient background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-accent/[0.03] blur-[120px]" />
        <div className="absolute top-[40%] left-[40%] w-[300px] h-[300px] rounded-full bg-white/[0.01] blur-[80px]" />
      </div>

      {/* Content */}
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.7, ease: [0.4, 0, 0.2, 1] }}
        className="relative flex flex-col items-center"
      >
        {/* Logo */}
        <motion.div
          animate={{ opacity: [0.7, 1, 0.7] }}
          transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
          className="mb-6"
        >
          <img
            src="/logo-white.png"
            alt="CoderXP"
            className="h-14 w-auto select-none"
            draggable={false}
          />
        </motion.div>

        {/* Tagline */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          className="text-sm text-white/30 font-light tracking-wide"
        >
          Describe what you want to build
        </motion.p>
      </motion.div>
    </div>
  )
}
