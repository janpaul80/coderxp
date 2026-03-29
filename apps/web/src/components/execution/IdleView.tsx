import { motion } from 'framer-motion'

export function IdleView() {
  return (
    <div className="flex flex-col items-center justify-center h-full relative overflow-hidden bg-transparent">
      {/* Content */}
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1] }}
        className="relative flex flex-col items-center"
      >
        {/* Logo */}
        <motion.div
          animate={{ opacity: [0.85, 1, 0.85] }}
          transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
          className="mb-6"
        >
          <img
            src="/logo-white.png"
            alt="CoderXP"
            className="w-[200px] md:w-[260px] h-auto select-none opacity-80"
            draggable={false}
          />
        </motion.div>
      </motion.div>
    </div>
  )
}
