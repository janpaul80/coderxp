import React from 'react'
import { Link } from 'react-router-dom'

// ─── Column-layout footer (HeftCoder-style) ──────────────────
// No lightning bolt icon. Clean 4-column layout with brand +
// PRODUCT / RESOURCES / LEGAL columns, bottom bar with copyright
// and Twitter/X link.

const PRODUCT_LINKS = [
  { label: 'Features', href: '/#features' },
  { label: 'About Us', href: '/about' },
]

const RESOURCES_LINKS = [
  { label: 'Documentation', href: '/docs' },
  { label: 'API Reference', href: '/api' },
  { label: 'Community', href: '/community' },
]

const LEGAL_LINKS = [
  { label: 'Privacy Policy', href: '/privacy' },
  { label: 'Terms of Service', href: '/terms' },
  { label: 'Security', href: '/security' },
]

function TwitterIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  )
}

function FooterColumn({ title, links }: { title: string; links: { label: string; href: string }[] }) {
  return (
    <div>
      <h4 className="text-xs font-bold text-white/70 uppercase tracking-wider mb-4">
        {title}
      </h4>
      <ul className="space-y-2.5">
        {links.map((link) => (
          <li key={link.label}>
            <Link
              to={link.href}
              className="text-sm text-white/35 hover:text-white/65 transition-colors duration-150"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function FooterSection() {
  return (
    <footer
      className="border-t px-6 pt-14 pb-8"
      style={{
        backgroundColor: '#000000',
        borderColor: 'rgba(255,255,255,0.06)',
      }}
    >
      <div className="max-w-6xl mx-auto">
        {/* Top section — brand + columns */}
        <div className="grid grid-cols-1 md:grid-cols-[1.5fr_1fr_1fr_1fr] gap-10 md:gap-8 mb-12">
          {/* Brand */}
          <div>
            <Link to="/" className="inline-flex items-center group mb-3">
              <span className="font-extrabold text-white text-lg tracking-tight">
                CODER<sup className="text-[10px] font-bold text-white/50 ml-0.5 tracking-normal">XP</sup>
              </span>
            </Link>
            <p className="text-sm text-white/30 max-w-[260px] leading-relaxed">
              Autonomous AI development engine for shipping production-ready apps at the speed of thought.
            </p>
          </div>

          {/* Columns */}
          <FooterColumn title="Product" links={PRODUCT_LINKS} />
          <FooterColumn title="Resources" links={RESOURCES_LINKS} />
          <FooterColumn title="Legal" links={LEGAL_LINKS} />
        </div>

        {/* Bottom bar */}
        <div
          className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-3"
          style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}
        >
          <p className="text-xs text-white/25">
            &copy; {new Date().getFullYear()} CodedXP. Built for the VIBE era.
          </p>

          <div className="flex items-center gap-4">
            <a
              href="https://github.com/janpaul80"
              target="_blank"
              rel="noopener noreferrer"
              className="text-white/25 hover:text-white/55 transition-colors"
              aria-label="GitHub"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
              </svg>
            </a>
            <a
              href="https://twitter.com/codedxp"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-white/25 hover:text-white/55 transition-colors text-xs"
              aria-label="Twitter / X"
            >
              <TwitterIcon />
              <span>Twitter / X</span>
            </a>
          </div>
        </div>
      </div>
    </footer>
  )
}
