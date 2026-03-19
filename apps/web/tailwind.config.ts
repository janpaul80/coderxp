import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // ── Base backgrounds ──────────────────────────────────
        base: {
          DEFAULT: '#080810',
          surface: '#0d0d1a',
          elevated: '#12121f',
          card: '#161625',
          hover: '#1a1a2e',
        },
        // ── Borders ───────────────────────────────────────────
        border: {
          DEFAULT: 'rgba(255,255,255,0.06)',
          strong: 'rgba(255,255,255,0.10)',
          focus: 'rgba(124,106,247,0.50)',
        },
        // ── Text ──────────────────────────────────────────────
        text: {
          primary: '#e8e8f0',
          secondary: '#9090b0',
          muted: '#505070',
          inverse: '#080810',
        },
        // ── Accent (purple-indigo) ─────────────────────────────
        accent: {
          DEFAULT: '#7c6af7',
          light: '#a89af9',
          dim: 'rgba(124,106,247,0.15)',
          glow: 'rgba(124,106,247,0.30)',
        },
        // ── Ice / frost ───────────────────────────────────────
        ice: {
          DEFAULT: 'rgba(180,200,255,0.05)',
          strong: 'rgba(180,200,255,0.10)',
        },
        // ── Semantic ──────────────────────────────────────────
        success: {
          DEFAULT: '#22c55e',
          dim: 'rgba(34,197,94,0.15)',
        },
        warning: {
          DEFAULT: '#f59e0b',
          dim: 'rgba(245,158,11,0.15)',
        },
        error: {
          DEFAULT: '#ef4444',
          dim: 'rgba(239,68,68,0.15)',
        },
        info: {
          DEFAULT: '#38bdf8',
          dim: 'rgba(56,189,248,0.15)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.875rem' }],
      },
      borderRadius: {
        '4xl': '2rem',
      },
      boxShadow: {
        'glow-accent': '0 0 20px rgba(124,106,247,0.25)',
        'glow-accent-lg': '0 0 40px rgba(124,106,247,0.20)',
        'glow-success': '0 0 20px rgba(34,197,94,0.20)',
        'glow-error': '0 0 20px rgba(239,68,68,0.20)',
        'card': '0 4px 24px rgba(0,0,0,0.40)',
        'card-lg': '0 8px 48px rgba(0,0,0,0.50)',
        'inner-border': 'inset 0 1px 0 rgba(255,255,255,0.06)',
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-accent': 'linear-gradient(135deg, #a89af9, #7c6af7, #5b8af7)',
        'gradient-surface': 'linear-gradient(180deg, #12121f 0%, #0d0d1a 100%)',
        'noise': "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.03'/%3E%3C/svg%3E\")",
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'slide-in-right': 'slideInRight 0.3s ease-out',
        'glow-pulse': 'glowPulse 2s ease-in-out infinite',
        'typing': 'typing 1.2s steps(3) infinite',
        'scan': 'scan 2s linear infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInRight: {
          '0%': { opacity: '0', transform: 'translateX(12px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        glowPulse: {
          '0%, 100%': { boxShadow: '0 0 20px rgba(124,106,247,0.20)' },
          '50%': { boxShadow: '0 0 40px rgba(124,106,247,0.40)' },
        },
        typing: {
          '0%': { content: '.' },
          '33%': { content: '..' },
          '66%': { content: '...' },
        },
        scan: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100vh)' },
        },
      },
      transitionTimingFunction: {
        'spring': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
        'smooth': 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
    },
  },
  plugins: [],
}

export default config
