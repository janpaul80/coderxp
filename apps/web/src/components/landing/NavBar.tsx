import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuthStore } from '@/store/authStore'

export function NavBar() {
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 24)
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        scrolled
          ? 'bg-black/80 backdrop-blur-2xl'
          : 'bg-transparent'
      }`}
    >
      <nav className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link to="/" className="flex items-center group">
          <span className="font-extrabold text-white text-xl tracking-tight">
            CODER<sup className="text-[11px] font-bold text-white/60 ml-0.5 tracking-normal">XP</sup>
          </span>
        </Link>

        {/* Desktop nav links */}
        <div className="hidden md:flex items-center gap-1">
          {[
            { label: 'Showcase', href: '#showcase' },
            { label: 'How It Works', href: '#how-it-works' },
            { label: 'Features', href: '#features' },
          ].map((item) => (
            <a
              key={item.label}
              href={item.href}
              onClick={(e) => {
                e.preventDefault()
                const id = item.href.replace('#', '')
                document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
              }}
              className="px-3 py-2 rounded-lg text-sm text-white/50 hover:text-white/90 transition-all duration-150 cursor-pointer"
            >
              {item.label}
            </a>
          ))}
        </div>

        {/* Desktop CTA */}
        <div className="hidden md:flex items-center gap-3">
          {isAuthenticated ? (
            <Link
              to="/workspace"
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white text-black text-sm font-semibold hover:bg-white/90 transition-all duration-200"
            >
              Open Workspace
            </Link>
          ) : (
            <>
              <Link
                to="/auth"
                className="px-3 py-2 text-sm text-white/50 hover:text-white/90 transition-colors"
              >
                Sign In
              </Link>
              <Link
                to="/auth?mode=register"
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white text-black text-sm font-semibold hover:bg-white/90 transition-all duration-200"
              >
                Get Started
              </Link>
            </>
          )}
        </div>

        {/* Mobile menu button */}
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="md:hidden p-2 rounded-lg text-white/50 hover:text-white hover:bg-white/[0.04] transition-all"
          aria-label="Toggle menu"
        >
          {mobileOpen ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="4" x2="20" y1="12" y2="12" />
              <line x1="4" x2="20" y1="6" y2="6" />
              <line x1="4" x2="20" y1="18" y2="18" />
            </svg>
          )}
        </button>
      </nav>

      {/* Mobile menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
            className="md:hidden bg-black/95 backdrop-blur-2xl border-b border-white/[0.06] px-6 pb-4"
          >
            <div className="flex flex-col gap-1 pt-2">
              {[
                { label: 'Showcase', href: '#showcase' },
                { label: 'How It Works', href: '#how-it-works' },
                { label: 'Features', href: '#features' },
              ].map((item) => (
                <a
                  key={item.label}
                  href={item.href}
                  onClick={(e) => {
                    e.preventDefault()
                    setMobileOpen(false)
                    const id = item.href.replace('#', '')
                    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
                  }}
                  className="px-3 py-2.5 rounded-lg text-sm text-white/60 hover:text-white hover:bg-white/[0.04] transition-all cursor-pointer"
                >
                  {item.label}
                </a>
              ))}
              <div className="border-t border-white/[0.06] my-2" />
              {isAuthenticated ? (
                <Link
                  to="/workspace"
                  onClick={() => setMobileOpen(false)}
                  className="px-3 py-2.5 rounded-lg text-sm font-semibold text-black bg-white text-center"
                >
                  Open Workspace
                </Link>
              ) : (
                <>
                  <Link
                    to="/auth"
                    onClick={() => setMobileOpen(false)}
                    className="px-3 py-2.5 rounded-lg text-sm text-white/60 hover:text-white hover:bg-white/[0.04] transition-all"
                  >
                    Sign In
                  </Link>
                  <Link
                    to="/auth?mode=register"
                    onClick={() => setMobileOpen(false)}
                    className="px-3 py-2.5 rounded-lg text-sm font-semibold text-black bg-white text-center"
                  >
                    Get Started
                  </Link>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}
