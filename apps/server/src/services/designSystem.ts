/**
 * designSystem.ts — Premium dark-theme design system
 *
 * Provides:
 *  - Project type detection (saas / landing / ecommerce / dashboard / generic)
 *  - Design system prompts injected into every AI code-generation call
 *  - Premium Tailwind config (dark theme, custom palette)
 *  - Premium index.css (CSS variables, animations, glassmorphism)
 *
 * Design philosophy:
 *  - SaaS / dashboard  → Vercel-style  (minimal, monochrome, sharp)
 *  - Landing / marketing → Framer-style (bold gradients, glass, animated)
 *  - Both must feel elite, dark-theme, production-grade
 */

// ─── Project type ─────────────────────────────────────────────

export type ProjectType = 'saas' | 'landing' | 'ecommerce' | 'dashboard' | 'product' | 'portfolio' | 'generic'

/**
 * Infer project type from plan data.
 * Used to select the appropriate design style for AI prompts.
 */
export function detectProjectType(
  frontendScope: string[],
  summary: string,
  features: string[],
): ProjectType {
  const text = [...frontendScope, summary, ...features].join(' ').toLowerCase()

  // Product showcase / premium product marketing (Apple/Vercel-style)
  // Check FIRST — these are highly specific signals that should not fall to landing
  if (
    text.includes('credit card') ||
    text.includes('product showcase') ||
    text.includes('product page') ||
    text.includes('product website') ||
    text.includes('product marketing') ||
    text.includes('airpods') ||
    text.includes('iphone') ||
    text.includes('apple-style') ||
    text.includes('apple style') ||
    text.includes('3d product') ||
    text.includes('product 3d') ||
    text.includes('product hero') ||
    text.includes('premium product') ||
    text.includes('product launch') ||
    text.includes('product reveal') ||
    (text.includes('product') && text.includes('3d')) ||
    (text.includes('product') && text.includes('stunning')) ||
    (text.includes('product') && text.includes('premium') && !text.includes('saas'))
  ) {
    return 'product'
  }

  // Portfolio / personal site
  if (
    text.includes('portfolio') ||
    text.includes('personal site') ||
    text.includes('personal website') ||
    text.includes('resume site') ||
    text.includes('cv website') ||
    text.includes('my work') ||
    text.includes('case studies') ||
    (text.includes('about me') && text.includes('projects'))
  ) {
    return 'portfolio'
  }

  // Landing / marketing → Framer-style
  if (
    text.includes('landing page') ||
    text.includes('marketing site') ||
    text.includes('hero section') ||
    text.includes('testimonial') ||
    text.includes('pricing section') ||
    text.includes('startup') ||
    text.includes('product hunt') ||
    text.includes('waitlist') ||
    text.includes('coming soon') ||
    (text.includes('hero') && text.includes('footer') && text.includes('feature')) ||
    (text.includes('website') && !text.includes('saas') && !text.includes('dashboard') && !text.includes('ecommerce'))
  ) {
    return 'landing'
  }

  // E-commerce
  if (
    text.includes('ecommerce') ||
    text.includes('e-commerce') ||
    text.includes('online store') ||
    text.includes('product listing') ||
    text.includes('shopping cart') ||
    text.includes('checkout')
  ) {
    return 'ecommerce'
  }

  // Dashboard / analytics
  if (
    text.includes('dashboard') ||
    text.includes('analytics') ||
    text.includes('admin panel') ||
    text.includes('metrics') ||
    text.includes('data visualization') ||
    text.includes('reporting')
  ) {
    return 'dashboard'
  }

  // SaaS / platform → Vercel-style
  if (
    text.includes('saas') ||
    text.includes('platform') ||
    text.includes('subscription') ||
    text.includes('billing') ||
    text.includes('workspace') ||
    text.includes('multi-tenant')
  ) {
    return 'saas'
  }

  return 'generic'
}

// ─── Design system prompts ────────────────────────────────────

const BASE_DESIGN_RULES = `
DESIGN SYSTEM — MANDATORY RULES (every rule must be followed, no exceptions):
• Background: #09090b (zinc-950). Surface: #111113. Elevated: #18181b (zinc-900).
• Borders: #27272a (zinc-800). Subtle borders: #3f3f46 (zinc-700).
• Text primary: #fafafa (zinc-50). Secondary: #a1a1aa (zinc-400). Muted: #71717a (zinc-500).
• NEVER use bg-white, bg-gray-50, bg-gray-100, bg-slate-50, or any light background.
• ALL components use dark backgrounds. Light mode does not exist in this project.
• Primary button: bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white font-semibold rounded-lg px-6 py-2.5 transition-all duration-200
• Secondary button: border border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white rounded-lg px-6 py-2.5 transition-all duration-200
• Cards: bg-zinc-900 border border-zinc-800 rounded-xl p-6
• Inputs: bg-zinc-900 border border-zinc-700 text-white placeholder:text-zinc-500 rounded-lg px-4 py-2.5 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/20 w-full
• Labels: text-sm font-medium text-zinc-300 mb-1.5
• Error messages: text-red-400 text-sm
• Success messages: text-emerald-400 text-sm
• Font: Inter, system-ui, -apple-system, sans-serif. -webkit-font-smoothing: antialiased.
• Spacing: generous padding (p-6, p-8), breathing room between sections (py-24, py-32).
• NO placeholder content. NO lorem ipsum. NO "coming soon". NO empty sections.
• Every section must be FULLY implemented with real, relevant content for this specific project.
• Hover states on all interactive elements. Smooth transitions (transition-all duration-200).`

export function getDesignSystemPrompt(projectType: ProjectType): string {
  if (projectType === 'landing') {
    return BASE_DESIGN_RULES + `

LANDING PAGE STYLE — Framer-inspired, premium, animated:
• Hero: full-viewport (min-h-screen), centered content, gradient headline using:
  text-transparent bg-clip-text bg-gradient-to-r from-violet-400 via-purple-400 to-blue-400
  Font size: text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight
• Gradient orbs/glows: absolute positioned divs, rounded-full, blur-3xl, opacity-20, purple/blue
  Example: <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-violet-500/20 rounded-full blur-3xl" />
• Glassmorphism cards: bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6
• Feature icons: div with bg-gradient-to-br from-violet-500/20 to-blue-500/20 rounded-xl p-3 w-12 h-12
• Sticky nav: bg-zinc-950/80 backdrop-blur-md border-b border-zinc-800/50 sticky top-0 z-50
• Pricing "Popular" tier: ring-2 ring-violet-500 relative (add "Most Popular" badge)
• Testimonial avatars: gradient background with initials, rounded-full w-10 h-10
• Section spacing: py-24 md:py-32 for major sections
• Smooth scroll: scroll-smooth on html element
• ALL 7 sections required: Navigation, Hero, Features, Pricing, Testimonials, CTA, Footer`
  }

  if (projectType === 'saas') {
    return BASE_DESIGN_RULES + `

SAAS STYLE — Vercel-inspired, minimal, sharp:
• App shell: flex h-screen overflow-hidden bg-zinc-950
• Sidebar: w-64 bg-zinc-950 border-r border-zinc-800 flex flex-col
• Sidebar nav items: flex items-center gap-3 px-3 py-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors
• Active nav item: bg-zinc-800 text-white
• Main content: flex-1 overflow-auto bg-zinc-950
• Page header: border-b border-zinc-800 px-8 py-6
• Data tables: w-full border-collapse, th: text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-4 py-3 border-b border-zinc-800
• Table rows: border-b border-zinc-800/50 hover:bg-zinc-900/50 transition-colors
• Status badges: inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium
  Green: bg-emerald-500/10 text-emerald-400 border border-emerald-500/20
  Yellow: bg-amber-500/10 text-amber-400 border border-amber-500/20
  Red: bg-red-500/10 text-red-400 border border-red-500/20
• Metric cards: bg-zinc-900 border border-zinc-800 rounded-xl p-6, large number text-3xl font-bold text-white
• Empty states: centered, icon, heading, description, CTA button`
  }

  if (projectType === 'dashboard') {
    return BASE_DESIGN_RULES + `

DASHBOARD STYLE — Linear-inspired, dense, clean:
• Layout: sidebar + main content, full height
• Sidebar: narrow (w-56), icon + label navigation, collapsible sections
• Charts: use placeholder data (not empty), show realistic numbers
• Activity feed: timestamped entries, avatar/icon, description
• Quick actions: icon buttons in a toolbar
• Stat cards: icon, value, label, trend (↑ +12% text-emerald-400)
• Filters: pill-style filter buttons, active state with bg-zinc-700`
  }

  if (projectType === 'ecommerce') {
    return BASE_DESIGN_RULES + `

ECOMMERCE STYLE — Premium dark commerce:
• Product grid: responsive grid-cols-2 md:grid-cols-3 lg:grid-cols-4, gap-6
• Product cards: bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden hover:border-zinc-700 transition-all
• Product image area: bg-zinc-800 aspect-square flex items-center justify-center
• Price: text-white font-bold, original price: line-through text-zinc-500
• Discount badge: bg-red-500/20 text-red-400 border border-red-500/20 rounded-full px-2 py-0.5 text-xs
• Cart: slide-in drawer from right, bg-zinc-900 border-l border-zinc-800
• Checkout: multi-step with progress indicator`
  }

  if (projectType === 'product') {
    return BASE_DESIGN_RULES + `

PRODUCT SHOWCASE STYLE — Apple/Vercel-inspired, premium, 3D-feel:
• Full-viewport sections: each major section is min-h-screen with sticky scroll pacing
• Hero: centered product name in massive type (text-6xl md:text-8xl font-black tracking-tighter), gradient text
• 3D product mockup illusion: use CSS perspective transforms on the hero visual element:
  style={{ transform: 'perspective(1200px) rotateY(-12deg) rotateX(4deg)', transformStyle: 'preserve-3d' }}
  Wrap in a container with: style={{ perspective: '1200px' }}
  Add hover effect via onMouseEnter/onMouseLeave to interpolate rotation back to 0
• Depth layers: stack 3–4 absolutely positioned divs with different z-index, blur, and opacity to create depth
  Example: bg-violet-500/10 blur-3xl z-0 behind the product card, bg-blue-500/5 blur-2xl z-0 offset
• Sticky scroll sections: each feature section uses sticky top-0 with a full-viewport height container
• Large callout numbers: text-8xl font-black text-white/10 as decorative background numbers
• Feature alternating layout: odd sections → product visual left, text right; even → text left, visual right
• Specs/details grid: 2-col or 3-col grid of technical specs with label + value pairs
• Premium gradient mesh background: use multiple radial-gradient layers in the hero:
  background: 'radial-gradient(ellipse 100% 60% at 50% 0%, rgba(124,58,237,0.18) 0%, transparent 70%), radial-gradient(ellipse 60% 40% at 80% 30%, rgba(37,99,235,0.12) 0%, transparent 60%), #09090b'
• Floating elements: use CSS animation (animate-float class) on decorative elements
• Section transitions: each section fades in with Framer Motion whileInView
• CTA: full-width gradient button with glow shadow: boxShadow: '0 0 40px rgba(124,58,237,0.4)'
• NO generic card grids — every section must feel like a premium product reveal`
  }

  if (projectType === 'portfolio') {
    return BASE_DESIGN_RULES + `

PORTFOLIO STYLE — Minimal, personal, craft-focused:
• Hero: name in large type, role/title, short bio, social links (GitHub, LinkedIn, Twitter)
• Work grid: project cards with hover overlay showing tech stack + description
• About section: photo placeholder (gradient avatar), bio, skills grid
• Skills: tag-style badges with subtle gradient backgrounds
• Contact: simple form or email link with social icons
• Minimal nav: name/logo + anchor links only
• Subtle animations: fade-in on scroll, hover lift on project cards
• Color accent: single accent color (violet or blue) used sparingly`
  }

  // generic
  return BASE_DESIGN_RULES + `

GENERIC APP STYLE — Clean, dark, professional:
• Standard layout: header + main content + optional sidebar
• Clean card-based UI
• Consistent spacing and typography
• Professional, production-ready appearance`
}

// ─── Premium Tailwind config ──────────────────────────────────

export function getPremiumTailwindConfig(projectType: ProjectType): string {
  const accentColor = projectType === 'landing' || projectType === 'product' || projectType === 'generic'
    ? `violet`
    : `blue`

  return `/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#f5f3ff',
          100: '#ede9fe',
          200: '#ddd6fe',
          300: '#c4b5fd',
          400: '#a78bfa',
          500: '#8b5cf6',
          600: '#7c3aed',
          700: '#6d28d9',
          800: '#5b21b6',
          900: '#4c1d95',
          950: '#2e1065',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic': 'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
        'hero-gradient': 'linear-gradient(135deg, #0f0f23 0%, #09090b 50%, #0f0f23 100%)',
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-in-out',
        'slide-up': 'slideUp 0.4s ease-out',
        'slide-in-right': 'slideInRight 0.5s ease-out',
        'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'gradient': 'gradient 8s ease infinite',
        'float': 'float 6s ease-in-out infinite',
        'float-slow': 'float 9s ease-in-out infinite',
        'glow': 'glowPulse 4s ease-in-out infinite',
        'reveal': 'reveal 0.6s ease-out forwards',
        'tilt': 'tilt 10s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInRight: {
          '0%': { opacity: '0', transform: 'translateX(24px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        gradient: {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-14px)' },
        },
        glowPulse: {
          '0%, 100%': { opacity: '0.15', transform: 'scale(1)' },
          '50%': { opacity: '0.28', transform: 'scale(1.06)' },
        },
        reveal: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        tilt: {
          '0%, 100%': { transform: 'perspective(1200px) rotateY(-8deg) rotateX(3deg)' },
          '50%': { transform: 'perspective(1200px) rotateY(8deg) rotateX(-3deg)' },
        },
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [],
}
`
}

// ─── Premium index.css ────────────────────────────────────────

export function getPremiumIndexCss(projectType: ProjectType): string {
  const isLanding = projectType === 'landing'
  const isProduct = projectType === 'product'
  const isPremium = isLanding || isProduct || projectType === 'portfolio'

  return `@tailwind base;
@tailwind components;
@tailwind utilities;

/* ── CSS Variables ─────────────────────────────────────────── */
:root {
  --bg-base:     #09090b;
  --bg-surface:  #111113;
  --bg-elevated: #18181b;
  --border:      #27272a;
  --border-subtle: #3f3f46;
  --text-primary:   #fafafa;
  --text-secondary: #a1a1aa;
  --text-muted:     #71717a;
  --accent:      #7c3aed;
  --accent-blue: #2563eb;
}

/* ── Base ──────────────────────────────────────────────────── */
*, *::before, *::after {
  box-sizing: border-box;
}

html {
  ${isPremium ? 'scroll-behavior: smooth;' : ''}
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

body {
  margin: 0;
  background-color: var(--bg-base);
  color: var(--text-primary);
  font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  line-height: 1.6;
  min-height: 100vh;
}

#root {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

/* ── Typography ────────────────────────────────────────────── */
h1, h2, h3, h4, h5, h6 {
  font-weight: 700;
  letter-spacing: -0.025em;
  color: var(--text-primary);
  line-height: 1.2;
}

p {
  color: var(--text-secondary);
}

a {
  color: inherit;
  text-decoration: none;
}

/* ── Scrollbar ─────────────────────────────────────────────── */
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
::-webkit-scrollbar-track {
  background: var(--bg-base);
}
::-webkit-scrollbar-thumb {
  background: var(--border-subtle);
  border-radius: 3px;
}
::-webkit-scrollbar-thumb:hover {
  background: #52525b;
}

/* ── Focus ring ────────────────────────────────────────────── */
:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

/* ── Gradient text utility ─────────────────────────────────── */
.gradient-text {
  background: linear-gradient(135deg, #a78bfa, #818cf8, #60a5fa);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

/* ── Glass card utility ────────────────────────────────────── */
.glass-card {
  background: rgba(255, 255, 255, 0.04);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
}

${isPremium ? `
/* ── Premium animations ────────────────────────────────────── */
@keyframes float {
  0%, 100% { transform: translateY(0px); }
  50%       { transform: translateY(-14px); }
}

@keyframes glow-pulse {
  0%, 100% { opacity: 0.15; transform: scale(1); }
  50%       { opacity: 0.28; transform: scale(1.06); }
}

@keyframes gradient-shift {
  0%   { background-position: 0% 50%; }
  50%  { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}

@keyframes reveal-up {
  0%   { opacity: 0; transform: translateY(24px); }
  100% { opacity: 1; transform: translateY(0); }
}

@keyframes mesh-drift {
  0%, 100% { transform: translate(0, 0) scale(1); }
  33%       { transform: translate(30px, -20px) scale(1.05); }
  66%       { transform: translate(-20px, 15px) scale(0.97); }
}

.animate-float {
  animation: float 6s ease-in-out infinite;
}

.animate-float-slow {
  animation: float 9s ease-in-out infinite;
}

.animate-glow {
  animation: glow-pulse 4s ease-in-out infinite;
}

.animate-gradient {
  background-size: 200% 200%;
  animation: gradient-shift 8s ease infinite;
}

.animate-mesh {
  animation: mesh-drift 12s ease-in-out infinite;
}

/* ── Scroll reveal ─────────────────────────────────────────── */
.reveal {
  opacity: 0;
  transform: translateY(24px);
  transition: opacity 0.6s ease, transform 0.6s ease;
}

.reveal.revealed {
  opacity: 1;
  transform: translateY(0);
}

/* ── Hero gradient background ──────────────────────────────── */
.hero-bg {
  background: radial-gradient(ellipse 80% 50% at 50% -20%, rgba(124, 58, 237, 0.15), transparent),
              radial-gradient(ellipse 60% 40% at 80% 50%, rgba(37, 99, 235, 0.10), transparent),
              #09090b;
}

/* ── Product mesh gradient ─────────────────────────────────── */
.mesh-bg {
  background:
    radial-gradient(ellipse 100% 60% at 50% 0%, rgba(124, 58, 237, 0.18) 0%, transparent 70%),
    radial-gradient(ellipse 60% 40% at 80% 30%, rgba(37, 99, 235, 0.12) 0%, transparent 60%),
    radial-gradient(ellipse 50% 50% at 20% 70%, rgba(139, 92, 246, 0.08) 0%, transparent 60%),
    #09090b;
}
` : ''}

${isProduct ? `
/* ── 3D perspective card ───────────────────────────────────── */
.perspective-card {
  transform-style: preserve-3d;
  transition: transform 0.4s ease;
}

.perspective-card:hover {
  transform: perspective(1200px) rotateY(-6deg) rotateX(3deg) translateZ(8px);
}

/* ── Depth shadow ──────────────────────────────────────────── */
.depth-shadow {
  box-shadow:
    0 2px 4px rgba(0,0,0,0.4),
    0 8px 16px rgba(0,0,0,0.3),
    0 24px 48px rgba(0,0,0,0.2),
    0 0 80px rgba(124,58,237,0.08);
}

/* ── Glow button ───────────────────────────────────────────── */
.btn-glow {
  box-shadow: 0 0 40px rgba(124, 58, 237, 0.4), 0 4px 16px rgba(0,0,0,0.4);
  transition: box-shadow 0.3s ease, transform 0.2s ease;
}

.btn-glow:hover {
  box-shadow: 0 0 60px rgba(124, 58, 237, 0.6), 0 8px 24px rgba(0,0,0,0.5);
  transform: translateY(-2px);
}

/* ── Sticky section ────────────────────────────────────────── */
.sticky-section {
  position: sticky;
  top: 0;
  min-height: 100vh;
  display: flex;
  align-items: center;
}
` : ''}

/* ── Component utilities ───────────────────────────────────── */
.btn-primary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.625rem 1.5rem;
  background: linear-gradient(135deg, #7c3aed, #2563eb);
  color: white;
  font-weight: 600;
  font-size: 0.875rem;
  border-radius: 0.5rem;
  border: none;
  cursor: pointer;
  transition: all 0.2s ease;
  text-decoration: none;
}

.btn-primary:hover {
  background: linear-gradient(135deg, #6d28d9, #1d4ed8);
  transform: translateY(-1px);
  box-shadow: 0 8px 25px rgba(124, 58, 237, 0.3);
}

.btn-secondary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.625rem 1.5rem;
  background: transparent;
  color: #d4d4d8;
  font-weight: 500;
  font-size: 0.875rem;
  border-radius: 0.5rem;
  border: 1px solid #3f3f46;
  cursor: pointer;
  transition: all 0.2s ease;
  text-decoration: none;
}

.btn-secondary:hover {
  background: #18181b;
  color: white;
  border-color: #52525b;
}

.card {
  background: #18181b;
  border: 1px solid #27272a;
  border-radius: 0.75rem;
  padding: 1.5rem;
}

.input-field {
  width: 100%;
  background: #18181b;
  border: 1px solid #3f3f46;
  color: #fafafa;
  border-radius: 0.5rem;
  padding: 0.625rem 1rem;
  font-size: 0.875rem;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.input-field::placeholder {
  color: #71717a;
}

.input-field:focus {
  outline: none;
  border-color: #7c3aed;
  box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.1);
}
`
}
