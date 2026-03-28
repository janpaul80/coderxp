import React from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'

interface PartnerLogo {
  name: string
  logo: React.ReactNode
}

interface HeroSection9Props {
  badge?: string
  title?: string
  subtitle?: string
  primaryCtaLabel?: string
  primaryCtaHref?: string
  secondaryCtaLabel?: string
  secondaryCtaHref?: string
  previewImageSrc?: string
  previewImageAlt?: string
  partners?: PartnerLogo[]
  className?: string
}

const DEFAULT_PARTNERS: PartnerLogo[] = [
  {
    name: 'React',
    logo: (
      <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current" aria-label="React">
        <path d="M12 9.861A2.139 2.139 0 1 0 12 14.139 2.139 2.139 0 1 0 12 9.861zM6.008 16.255l-.472-.12C2.018 15.246 0 13.737 0 11.996s2.018-3.25 5.536-4.139l.472-.12.133.468a23.53 23.53 0 0 0 1.363 3.578l.101.213-.101.213a23.307 23.307 0 0 0-1.363 3.578l-.133.468zM5.317 8.95c-2.674.751-4.315 1.9-4.315 3.046 0 1.145 1.641 2.294 4.315 3.046a24.95 24.95 0 0 1 1.182-3.046A24.752 24.752 0 0 1 5.317 8.95zM17.992 16.255l-.133-.468a23.357 23.357 0 0 0-1.364-3.578l-.101-.213.101-.213a23.42 23.42 0 0 0 1.364-3.578l.133-.468.473.12c3.517.889 5.535 2.398 5.535 4.139s-2.018 3.25-5.535 4.139l-.473.12zm-.491-4.259c.48 1.039.877 2.06 1.182 3.046 2.675-.752 4.315-1.901 4.315-3.046 0-1.146-1.641-2.294-4.315-3.046a24.788 24.788 0 0 1-1.182 3.046zM5.31 8.945l-.133-.468C4.188 5.283 4.488 2.952 6 2.092c1.518-.865 3.957.28 6.007 2.85l.301.38-.38.301A23.573 23.573 0 0 0 9.394 8.28l-.193.149-.25-.032a23.466 23.466 0 0 0-3.641-.452zm1.57-5.498c-.505 0-.973.116-1.395.346-1.012.577-1.208 2.508-.698 5.096.943.065 1.885.171 2.816.315a24.793 24.793 0 0 1 2.213-2.758c-1.167-1.51-2.385-2.999-2.936-2.999zm9.112 5.498a23.4 23.4 0 0 0-3.64.452l-.25.032-.193-.149a23.498 23.498 0 0 0-2.534-2.657l-.381-.301.302-.38C10.043 2.372 12.481 1.227 14 2.092c1.512.86 1.812 3.191.82 6.385l-.133.468zM14.7 3.493c-.551 0-1.769 1.489-2.936 2.999a24.641 24.641 0 0 1 2.213 2.758c.931-.144 1.873-.25 2.816-.315.51-2.588.314-4.519-.698-5.096a1.9 1.9 0 0 0-.395-.346zM5.31 15.087l.133-.468a23.558 23.558 0 0 0 .452-3.641l.032-.25.149-.193a23.498 23.498 0 0 0 2.657-2.534l.301-.381.38.302c2.57 2.05 3.715 4.488 2.85 6.007-.86 1.512-3.191 1.812-6.385.82l-.569-.662zm3.504-5.087a24.641 24.641 0 0 1-2.758 2.213c.144.931.25 1.873.315 2.816 2.588.51 4.519.314 5.096-.698.577-1.012-.28-2.936-2.653-4.331zm6.18 5.087l-.468-.133c-3.194-.992-5.525-2.291-6.385-3.803-.865-1.519.28-3.957 2.85-6.007l.38-.302.301.381a23.573 23.573 0 0 0 2.657 2.534l.149.193.032.25a23.4 23.4 0 0 0 .452 3.641l.133.468-.101.778zm-2.653-8.331c-2.373 1.395-3.23 3.319-2.653 4.331.577 1.012 2.508 1.208 5.096.698.065-.943.171-1.885.315-2.816a24.793 24.793 0 0 1-2.758-2.213z" />
      </svg>
    ),
  },
  {
    name: 'TypeScript',
    logo: (
      <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current" aria-label="TypeScript">
        <path d="M1.125 0C.502 0 0 .502 0 1.125v21.75C0 23.498.502 24 1.125 24h21.75c.623 0 1.125-.502 1.125-1.125V1.125C24 .502 23.498 0 22.875 0zm17.363 9.75c.612 0 1.154.037 1.627.111a6.38 6.38 0 0 1 1.306.34v2.458a3.95 3.95 0 0 0-.643-.361 5.093 5.093 0 0 0-.717-.26 5.453 5.453 0 0 0-1.426-.2c-.3 0-.573.028-.819.086a2.1 2.1 0 0 0-.623.242c-.17.104-.3.229-.393.374a.888.888 0 0 0-.14.49c0 .196.053.373.156.529.104.156.252.304.443.444s.423.276.696.41c.273.135.582.274.926.416.47.197.892.407 1.266.628.374.222.695.473.963.753.268.279.472.598.614.957.142.359.214.776.214 1.253 0 .657-.125 1.21-.373 1.656a3.033 3.033 0 0 1-1.012 1.085 4.38 4.38 0 0 1-1.487.596c-.566.12-1.163.18-1.79.18a9.916 9.916 0 0 1-1.84-.164 5.544 5.544 0 0 1-1.512-.493v-2.63a5.033 5.033 0 0 0 3.237 1.2c.333 0 .624-.03.872-.09.249-.06.456-.144.623-.25.166-.108.29-.234.373-.38a1.023 1.023 0 0 0-.074-1.089 2.12 2.12 0 0 0-.537-.5 5.597 5.597 0 0 0-.807-.444 27.72 27.72 0 0 0-1.007-.436c-.918-.383-1.602-.852-2.053-1.405-.45-.553-.676-1.222-.676-2.005 0-.614.123-1.141.369-1.582.246-.441.58-.804 1.004-1.089a4.494 4.494 0 0 1 1.47-.629 7.536 7.536 0 0 1 1.77-.201zm-15.113.188h9.563v2.166H9.506v9.646H6.789v-9.646H3.375z" />
      </svg>
    ),
  },
  {
    name: 'Node.js',
    logo: (
      <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current" aria-label="Node.js">
        <path d="M11.998 24c-.321 0-.641-.084-.922-.247l-2.936-1.737c-.438-.245-.224-.332-.08-.383.585-.203.703-.25 1.328-.604.065-.037.151-.023.218.017l2.256 1.339c.082.045.198.045.275 0l8.795-5.076c.082-.047.134-.141.134-.238V6.921c0-.099-.053-.19-.137-.242l-8.791-5.072c-.081-.047-.189-.047-.271 0L3.075 6.68c-.084.053-.139.146-.139.241v10.15c0 .097.055.189.139.235l2.409 1.392c1.307.654 2.108-.116 2.108-.891V7.787c0-.142.114-.253.256-.253h1.115c.139 0 .255.112.255.253v10.021c0 1.745-.95 2.745-2.604 2.745-.508 0-.909 0-2.026-.551L2.28 18.675c-.57-.329-.922-.943-.922-1.604V6.921c0-.661.352-1.275.922-1.603l8.795-5.082c.557-.315 1.296-.315 1.848 0l8.794 5.082c.57.329.924.943.924 1.603v10.15c0 .661-.354 1.275-.924 1.604l-8.794 5.076c-.282.164-.6.247-.925.247zm2.718-6.975c-3.855 0-4.663-1.77-4.663-3.254 0-.142.114-.253.256-.253h1.138c.127 0 .233.092.252.217.172 1.161.684 1.747 3.017 1.747 1.857 0 2.648-.42 2.648-1.406 0-.568-.225-.99-3.11-1.273-2.413-.238-3.904-.771-3.904-2.703 0-1.781 1.5-2.842 4.015-2.842 2.825 0 4.223.981 4.399 3.088a.255.255 0 0 1-.065.196.255.255 0 0 1-.189.083h-1.143a.253.253 0 0 1-.248-.199c-.276-1.224-.944-1.616-2.754-1.616-2.029 0-2.265.707-2.265 1.237 0 .642.279.829 3.015 1.191 2.707.358 3.996.866 3.996 2.774 0 1.923-1.603 3.027-4.395 3.027z" />
      </svg>
    ),
  },
  {
    name: 'PostgreSQL',
    logo: (
      <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current" aria-label="PostgreSQL">
        <path d="M17.128 0a10.134 10.134 0 0 0-2.755.403l-.063.02A10.922 10.922 0 0 0 12.6.258C11.422.238 10.41.524 9.594 1 8.79.721 7.122.24 5.364.336 4.14.403 2.804.775 1.814 1.82.827 2.865.305 4.482.415 6.682c.03.607.203 1.597.49 2.879.284 1.271.657 2.68 1.061 3.943.405 1.265.832 2.35 1.324 3.024.243.337.516.608.817.756.303.148.637.155.942.07.444-.12.853-.454 1.228-.87.273-.302.524-.662.757-1.053.11.468.23.92.358 1.343.313 1.04.679 1.898 1.156 2.405.24.253.527.44.862.44.332 0 .61-.16.849-.367.12-.104.234-.234.343-.38.106.426.23.793.381 1.064.34.608.817.977 1.413.977.307 0 .6-.1.878-.274.133-.083.265-.19.395-.32.13.13.262.237.395.32.278.174.57.274.878.274.596 0 1.073-.369 1.413-.977.151-.271.275-.638.381-1.064.109.146.223.276.343.38.239.207.517.367.849.367.335 0 .622-.187.862-.44.477-.507.843-1.365 1.156-2.405.128-.423.248-.875.358-1.343.233.391.484.751.757 1.053.375.416.784.75 1.228.87.305.085.64.078.942-.07.301-.148.574-.42.817-.756.492-.674.919-1.759 1.324-3.024.404-1.263.777-2.672 1.061-3.943.287-1.282.46-2.272.49-2.879.11-2.2-.412-3.817-1.399-4.862C21.197.775 19.86.403 18.636.336c-.372-.02-.733-.02-1.08.007A10.708 10.708 0 0 0 17.128 0zm.36 1.032c.296-.02.6-.024.908-.007 1.082.06 2.152.37 2.93 1.197.775.824 1.24 2.217 1.14 4.238-.027.533-.198 1.51-.479 2.774-.28 1.253-.648 2.646-1.046 3.884-.398 1.24-.812 2.24-1.179 2.73-.183.251-.35.41-.498.482-.147.072-.277.07-.44.024-.328-.09-.687-.35-1.026-.735-.338-.386-.659-.914-.932-1.567a18.04 18.04 0 0 1-.61-2.016c.39-.94.753-1.956 1.031-2.941.14-.496.258-.982.335-1.449.077-.467.116-.911.086-1.314-.029-.404-.148-.772-.365-1.046-.216-.274-.527-.443-.886-.508a2.64 2.64 0 0 0-.617-.014 2.84 2.84 0 0 0-.616.014c-.36.065-.67.234-.887.508-.217.274-.336.642-.365 1.046-.03.403.009.847.086 1.314.077.467.195.953.335 1.449.278.985.64 2.001 1.031 2.941a18.04 18.04 0 0 1-.61 2.016c-.273.653-.594 1.181-.932 1.567-.339.385-.698.645-1.026.735-.163.046-.293.048-.44-.024-.148-.072-.315-.231-.498-.482-.367-.49-.781-1.49-1.179-2.73-.398-1.238-.766-2.631-1.046-3.884-.281-1.264-.452-2.241-.479-2.774-.1-2.021.365-3.414 1.14-4.238.778-.827 1.848-1.137 2.93-1.197.308-.017.612-.013.908.007z" />
      </svg>
    ),
  },
  {
    name: 'Tailwind CSS',
    logo: (
      <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current" aria-label="Tailwind CSS">
        <path d="M12.001 4.8c-3.2 0-5.2 1.6-6 4.8 1.2-1.6 2.6-2.2 4.2-1.8.913.228 1.565.89 2.288 1.624C13.666 10.618 15.027 12 18.001 12c3.2 0 5.2-1.6 6-4.8-1.2 1.6-2.6 2.2-4.2 1.8-.913-.228-1.565-.89-2.288-1.624C16.337 6.182 14.976 4.8 12.001 4.8zm-6 7.2c-3.2 0-5.2 1.6-6 4.8 1.2-1.6 2.6-2.2 4.2-1.8.913.228 1.565.89 2.288 1.624 1.177 1.194 2.538 2.576 5.512 2.576 3.2 0 5.2-1.6 6-4.8-1.2 1.6-2.6 2.2-4.2 1.8-.913-.228-1.565-.89-2.288-1.624C10.337 13.382 8.976 12 6.001 12z" />
      </svg>
    ),
  },
]

export function HeroSection9({
  badge = 'Now in Early Access',
  title = 'Build full-stack apps with AI',
  subtitle = 'CodedXP turns your idea into a production-ready app — React, TypeScript, Node.js, Postgres — in minutes.',
  primaryCtaLabel = 'Start building free',
  primaryCtaHref = '/auth?mode=register',
  secondaryCtaLabel = 'See how it works',
  secondaryCtaHref = '#how-it-works',
  previewImageSrc,
  previewImageAlt = 'CodedXP app preview',
  partners = DEFAULT_PARTNERS,
  className,
}: HeroSection9Props) {
  return (
    <section
      className={cn(
        'relative min-h-screen flex flex-col items-center justify-center overflow-hidden bg-black px-6 pt-24 pb-20',
        className
      )}
    >
      {/* Radial glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 80% 50% at 50% -10%, rgba(124,106,247,0.15) 0%, transparent 70%)',
        }}
      />

      <div className="relative z-10 w-full max-w-5xl mx-auto flex flex-col items-center text-center">
        {/* Badge */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-6"
        >
          <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-medium border border-white/[0.10] bg-white/[0.04] text-white/60">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            {badge}
          </span>
        </motion.div>

        {/* Title */}
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.08 }}
          className="text-5xl sm:text-6xl md:text-7xl font-bold text-white leading-[1.05] tracking-tight mb-6"
        >
          {title}
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.16 }}
          className="text-base sm:text-lg text-white/45 max-w-xl mb-10 leading-relaxed"
        >
          {subtitle}
        </motion.p>

        {/* CTAs */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.24 }}
          className="flex flex-col sm:flex-row items-center gap-3 mb-16"
        >
          <Link to={primaryCtaHref}>
            <Button
              size="lg"
              className="rounded-full bg-white text-black hover:bg-white/90 font-semibold px-8"
            >
              {primaryCtaLabel}
            </Button>
          </Link>
          <a href={secondaryCtaHref}>
            <Button
              variant="outline"
              size="lg"
              className="rounded-full border-white/[0.15] text-white/70 hover:text-white hover:border-white/30 bg-transparent px-8"
            >
              {secondaryCtaLabel}
            </Button>
          </a>
        </motion.div>

        {/* 3D perspective preview image */}
        {previewImageSrc && (
          <motion.div
            initial={{ opacity: 0, y: 40, rotateX: 12 }}
            animate={{ opacity: 1, y: 0, rotateX: 6 }}
            transition={{ duration: 0.9, delay: 0.35, ease: 'easeOut' }}
            style={{ perspective: '1200px', transformStyle: 'preserve-3d' }}
            className="w-full max-w-4xl mb-16"
          >
            <div
              className="relative rounded-2xl overflow-hidden border border-white/[0.08]"
              style={{
                boxShadow: '0 40px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04)',
                transform: 'rotateX(6deg)',
              }}
            >
              <img
                src={previewImageSrc}
                alt={previewImageAlt}
                className="w-full h-auto block"
              />
              {/* Reflection overlay */}
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background:
                    'linear-gradient(180deg, rgba(255,255,255,0.03) 0%, transparent 40%)',
                }}
              />
            </div>
          </motion.div>
        )}

        {/* Partner logos */}
        {partners.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.7, delay: 0.5 }}
            className="flex flex-col items-center gap-4"
          >
            <p className="text-xs text-white/25 tracking-widest uppercase font-medium">
              Built with
            </p>
            <div className="flex items-center gap-6 flex-wrap justify-center">
              {partners.map((p) => (
                <div
                  key={p.name}
                  className="flex items-center gap-2 text-white/30 hover:text-white/60 transition-colors"
                  title={p.name}
                >
                  {p.logo}
                  <span className="text-xs font-medium">{p.name}</span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </div>
    </section>
  )
}
