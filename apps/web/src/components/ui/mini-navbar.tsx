import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'

interface NavItem {
  label: string
  href: string
}

interface NavbarProps {
  items?: NavItem[]
  logo?: React.ReactNode
  className?: string
}

const DEFAULT_ITEMS: NavItem[] = [
  { label: 'Features', href: '#features' },
  { label: 'How it works', href: '#how-it-works' },
  { label: 'Pricing', href: '#pricing' },
]

export function Navbar({ items = DEFAULT_ITEMS, logo, className }: NavbarProps) {
  const [activeItem, setActiveItem] = useState<string | null>(null)

  return (
    <motion.nav
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className={cn(
        'fixed top-4 left-1/2 -translate-x-1/2 z-50',
        'flex items-center gap-1 px-3 py-2 rounded-full',
        'bg-white/[0.06] backdrop-blur-xl border border-white/[0.10]',
        'shadow-[0_4px_24px_rgba(0,0,0,0.4)]',
        className
      )}
    >
      {/* Logo */}
      {logo && (
        <>
          <div className="flex items-center px-2">{logo}</div>
          <div className="w-px h-4 bg-white/[0.12] mx-1" />
        </>
      )}

      {/* Nav items */}
      {items.map((item) => (
        <a
          key={item.label}
          href={item.href}
          onMouseEnter={() => setActiveItem(item.label)}
          onMouseLeave={() => setActiveItem(null)}
          className="relative px-3 py-1.5 text-xs font-medium text-white/60 hover:text-white/90 transition-colors rounded-full"
        >
          <AnimatePresence>
            {activeItem === item.label && (
              <motion.span
                layoutId="navbar-pill"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="absolute inset-0 rounded-full bg-white/[0.08]"
              />
            )}
          </AnimatePresence>
          <span className="relative z-10">{item.label}</span>
        </a>
      ))}
    </motion.nav>
  )
}
