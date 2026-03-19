import React, { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from './Button'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  description?: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  children: React.ReactNode
  className?: string
  hideClose?: boolean
}

const sizeMap = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-2xl',
}

export function Modal({
  isOpen,
  onClose,
  title,
  description,
  size = 'md',
  children,
  className,
  hideClose = false,
}: ModalProps) {
  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    if (isOpen) document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            key="modal"
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            className={cn(
              'fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none'
            )}
          >
            <div
              className={cn(
                'w-full pointer-events-auto',
                'bg-base-card border border-white/[0.08] rounded-2xl',
                'shadow-card-lg',
                sizeMap[size],
                className
              )}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              {(title || !hideClose) && (
                <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-white/[0.06]">
                  <div>
                    {title && (
                      <h2 className="text-base font-semibold text-text-primary">
                        {title}
                      </h2>
                    )}
                    {description && (
                      <p className="mt-1 text-sm text-text-secondary">
                        {description}
                      </p>
                    )}
                  </div>
                  {!hideClose && (
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={onClose}
                      className="ml-4 shrink-0"
                      aria-label="Close"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              )}

              {/* Body */}
              <div className="px-6 py-5">{children}</div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
