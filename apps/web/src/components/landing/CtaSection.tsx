import React from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'

export function CtaSection() {
  return (
    <section
      className="py-28 px-6 relative overflow-hidden"
      style={{ backgroundColor: '#000000' }}
    >
      {/* Mesh gradient background */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `
            radial-gradient(ellipse 80% 60% at 50% 100%, rgba(124,106,247,0.12) 0%, transparent 70%),
            radial-gradient(ellipse 50% 40% at 20% 80%, rgba(59,130,246,0.08) 0%, transparent 60%),
            radial-gradient(ellipse 50% 40% at 80% 80%, rgba(16,185,129,0.06) 0%, transparent 60%)
          `,
        }}
      />

      {/* Subtle grid overlay */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.015]"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)`,
          backgroundSize: '60px 60px',
        }}
      />

      <div className="max-w-4xl mx-auto relative z-10 text-center">
        {/* Badge */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.5 }}
        >
          <span className="inline-block px-3 py-1 rounded-full text-xs font-medium border border-white/[0.08] bg-white/[0.03] text-white/40 mb-8">
            Start building today
          </span>
        </motion.div>

        {/* Headline */}
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.6, delay: 0.05 }}
          className="text-4xl sm:text-5xl md:text-6xl font-black text-white tracking-tight leading-[1.05] mb-6"
        >
          Your next app is
          <br />
          <span
            className="bg-clip-text text-transparent"
            style={{
              backgroundImage: 'linear-gradient(135deg, #7c6af7 0%, #3b82f6 50%, #10b981 100%)',
            }}
          >
            one prompt away
          </span>
        </motion.h2>

        {/* Sub-copy */}
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.55, delay: 0.12 }}
          className="text-lg text-white/40 max-w-xl mx-auto leading-relaxed mb-10"
        >
          No credit card. No setup. No waiting.
          <br />
          Describe what you want to build and watch CoderXP ship it.
        </motion.p>

        {/* CTA buttons */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.55, delay: 0.2 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-3"
        >
          <Link
            to="/auth?mode=register"
            className="group relative inline-flex items-center gap-2 px-7 py-3.5 rounded-xl text-sm font-bold text-black transition-all duration-200 hover:scale-[1.03] hover:shadow-[0_0_40px_rgba(124,106,247,0.3)]"
            style={{ background: '#ffffff' }}
          >
            Get started free
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="transition-transform duration-200 group-hover:translate-x-0.5"
            >
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </Link>

          <Link
            to="/auth"
            className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl text-sm font-semibold text-white/60 hover:text-white/90 transition-all duration-200"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.09)',
            }}
          >
            Sign in
          </Link>
        </motion.div>

        {/* Social proof strip */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.35 }}
          className="mt-12 flex flex-wrap items-center justify-center gap-6 text-xs text-white/25"
        >
          {[
            'No credit card required',
            '·',
            'Full-stack apps in minutes',
            '·',
            'Live preview included',
          ].map((item, i) => (
            <span key={i}>{item}</span>
          ))}
        </motion.div>
      </div>
    </section>
  )
}
