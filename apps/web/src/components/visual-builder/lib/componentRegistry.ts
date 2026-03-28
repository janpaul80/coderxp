/**
 * componentRegistry.ts — Visual Builder component palette registry
 *
 * Defines the components available for drag-and-drop insertion.
 * Includes built-in shadcn/ui components, HTML section presets,
 * and support for plugin/project-provided components.
 */

// ─── Types ────────────────────────────────────────────────────

export type ComponentCategory =
  | 'section'    // Full-page sections (Hero, Features, Pricing, etc.)
  | 'layout'     // Layout primitives (div, flex, grid, container)
  | 'ui'         // UI components (Button, Card, Input, Badge, etc.)
  | 'form'       // Form elements (Input, Select, Textarea, Checkbox)
  | 'data'       // Data display (Table, List, Stats)
  | 'navigation' // Nav elements (Link, Menu, Breadcrumb)
  | 'media'      // Media (Image, Icon, Avatar)
  | 'custom'     // Project/plugin-provided

export type ComponentSource = 'html' | 'shadcn' | 'custom' | 'plugin'

export interface PropSchema {
  name: string
  type: 'string' | 'number' | 'boolean' | 'select' | 'color' | 'className'
  label: string
  defaultValue?: unknown
  options?: Array<{ label: string; value: string }>
  placeholder?: string
}

export interface VBComponent {
  id: string
  name: string
  category: ComponentCategory
  source: ComponentSource
  /** Import path to add when inserting this component */
  importPath?: string
  /** Import specifier (e.g., 'Button', 'Card') */
  importSpecifier?: string
  /** Default JSX to insert when dropped */
  defaultJsx: string
  /** Default Tailwind classes */
  defaultClassName?: string
  /** Prop schema for the property editor */
  propSchema: PropSchema[]
  /** Icon name from lucide-react */
  icon: string
  /** Short description */
  description: string
}

// ─── Built-in section presets ────────────────────────────────

const SECTION_PRESETS: VBComponent[] = [
  {
    id: 'section/hero',
    name: 'Hero Section',
    category: 'section',
    source: 'html',
    defaultJsx: `<section className="py-20 px-6 text-center bg-gradient-to-b from-gray-50 to-white" data-vb-section="hero">
        <h1 className="text-5xl font-bold tracking-tight text-gray-900 mb-6">Your Headline Here</h1>
        <p className="text-xl text-gray-600 max-w-2xl mx-auto mb-8">A compelling subheadline that explains the value of your product or service.</p>
        <div className="flex justify-center gap-4">
          <button className="px-8 py-3 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 transition">Get Started</button>
          <button className="px-8 py-3 bg-white text-gray-700 border border-gray-300 rounded-lg font-semibold hover:bg-gray-50 transition">Learn More</button>
        </div>
      </section>`,
    propSchema: [],
    icon: 'Sparkles',
    description: 'Full-width hero section with headline, subheadline, and CTA buttons',
  },
  {
    id: 'section/features',
    name: 'Features Section',
    category: 'section',
    source: 'html',
    defaultJsx: `<section className="py-20 px-6 bg-white" data-vb-section="features">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">Features</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="p-6 rounded-xl border border-gray-200 hover:shadow-lg transition">
              <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center mb-4">
                <span className="text-indigo-600 text-xl font-bold">1</span>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Feature One</h3>
              <p className="text-gray-600">Description of the first key feature of your product.</p>
            </div>
            <div className="p-6 rounded-xl border border-gray-200 hover:shadow-lg transition">
              <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center mb-4">
                <span className="text-indigo-600 text-xl font-bold">2</span>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Feature Two</h3>
              <p className="text-gray-600">Description of the second key feature of your product.</p>
            </div>
            <div className="p-6 rounded-xl border border-gray-200 hover:shadow-lg transition">
              <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center mb-4">
                <span className="text-indigo-600 text-xl font-bold">3</span>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Feature Three</h3>
              <p className="text-gray-600">Description of the third key feature of your product.</p>
            </div>
          </div>
        </div>
      </section>`,
    propSchema: [],
    icon: 'LayoutGrid',
    description: 'Three-column feature grid with icons',
  },
  {
    id: 'section/pricing',
    name: 'Pricing Section',
    category: 'section',
    source: 'html',
    defaultJsx: `<section className="py-20 px-6 bg-gray-50" data-vb-section="pricing">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-4">Pricing</h2>
          <p className="text-center text-gray-600 mb-12">Choose the plan that's right for you</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="bg-white p-8 rounded-2xl border border-gray-200 text-center">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Starter</h3>
              <p className="text-4xl font-bold text-gray-900 mb-4">$9<span className="text-lg text-gray-500">/mo</span></p>
              <ul className="text-gray-600 space-y-2 mb-8 text-sm">
                <li>5 projects</li>
                <li>Basic analytics</li>
                <li>Email support</li>
              </ul>
              <button className="w-full py-2 border border-gray-300 rounded-lg font-medium hover:bg-gray-50 transition">Get Started</button>
            </div>
            <div className="bg-indigo-600 p-8 rounded-2xl text-center text-white shadow-xl scale-105">
              <h3 className="text-lg font-semibold mb-2">Pro</h3>
              <p className="text-4xl font-bold mb-4">$29<span className="text-lg opacity-70">/mo</span></p>
              <ul className="space-y-2 mb-8 text-sm opacity-90">
                <li>Unlimited projects</li>
                <li>Advanced analytics</li>
                <li>Priority support</li>
              </ul>
              <button className="w-full py-2 bg-white text-indigo-600 rounded-lg font-medium hover:bg-gray-100 transition">Get Started</button>
            </div>
            <div className="bg-white p-8 rounded-2xl border border-gray-200 text-center">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Enterprise</h3>
              <p className="text-4xl font-bold text-gray-900 mb-4">Custom</p>
              <ul className="text-gray-600 space-y-2 mb-8 text-sm">
                <li>Custom limits</li>
                <li>Dedicated support</li>
                <li>SLA guarantee</li>
              </ul>
              <button className="w-full py-2 border border-gray-300 rounded-lg font-medium hover:bg-gray-50 transition">Contact Sales</button>
            </div>
          </div>
        </div>
      </section>`,
    propSchema: [],
    icon: 'CreditCard',
    description: 'Three-tier pricing comparison',
  },
  {
    id: 'section/testimonials',
    name: 'Testimonials Section',
    category: 'section',
    source: 'html',
    defaultJsx: `<section className="py-20 px-6 bg-white" data-vb-section="testimonials">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">What People Say</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="p-6 bg-gray-50 rounded-xl">
              <p className="text-gray-700 mb-4 italic">"This product completely transformed our workflow. Highly recommended!"</p>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-200 rounded-full flex items-center justify-center font-bold text-indigo-700">A</div>
                <div>
                  <p className="font-semibold text-gray-900 text-sm">Alex Johnson</p>
                  <p className="text-gray-500 text-xs">CEO, TechCorp</p>
                </div>
              </div>
            </div>
            <div className="p-6 bg-gray-50 rounded-xl">
              <p className="text-gray-700 mb-4 italic">"Amazing quality and incredible support. A game changer for our team."</p>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-200 rounded-full flex items-center justify-center font-bold text-emerald-700">S</div>
                <div>
                  <p className="font-semibold text-gray-900 text-sm">Sarah Park</p>
                  <p className="text-gray-500 text-xs">VP Product, StartupCo</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>`,
    propSchema: [],
    icon: 'MessageSquareQuote',
    description: 'Two-column testimonial cards',
  },
  {
    id: 'section/cta',
    name: 'CTA Section',
    category: 'section',
    source: 'html',
    defaultJsx: `<section className="py-20 px-6 bg-indigo-600 text-white text-center" data-vb-section="cta">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl font-bold mb-4">Ready to Get Started?</h2>
          <p className="text-lg opacity-90 mb-8">Join thousands of users who are already building amazing things.</p>
          <button className="px-8 py-3 bg-white text-indigo-600 rounded-lg font-semibold hover:bg-gray-100 transition">Start Free Trial</button>
        </div>
      </section>`,
    propSchema: [],
    icon: 'Megaphone',
    description: 'Full-width call-to-action banner',
  },
  {
    id: 'section/footer',
    name: 'Footer',
    category: 'section',
    source: 'html',
    defaultJsx: `<footer className="py-12 px-6 bg-gray-900 text-gray-400" data-vb-section="footer">
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-8">
          <div>
            <h3 className="text-white font-bold text-lg mb-4">Company</h3>
            <p className="text-sm">Building the future, one product at a time.</p>
          </div>
          <div>
            <h4 className="text-white font-semibold mb-3 text-sm">Product</h4>
            <ul className="space-y-2 text-sm">
              <li><a href="#" className="hover:text-white transition">Features</a></li>
              <li><a href="#" className="hover:text-white transition">Pricing</a></li>
              <li><a href="#" className="hover:text-white transition">Docs</a></li>
            </ul>
          </div>
          <div>
            <h4 className="text-white font-semibold mb-3 text-sm">Company</h4>
            <ul className="space-y-2 text-sm">
              <li><a href="#" className="hover:text-white transition">About</a></li>
              <li><a href="#" className="hover:text-white transition">Blog</a></li>
              <li><a href="#" className="hover:text-white transition">Careers</a></li>
            </ul>
          </div>
          <div>
            <h4 className="text-white font-semibold mb-3 text-sm">Legal</h4>
            <ul className="space-y-2 text-sm">
              <li><a href="#" className="hover:text-white transition">Privacy</a></li>
              <li><a href="#" className="hover:text-white transition">Terms</a></li>
            </ul>
          </div>
        </div>
        <div className="max-w-6xl mx-auto mt-8 pt-8 border-t border-gray-800 text-sm text-center">
          © 2026 Company. All rights reserved.
        </div>
      </footer>`,
    propSchema: [],
    icon: 'PanelBottom',
    description: 'Multi-column footer with links',
  },
  {
    id: 'section/faq',
    name: 'FAQ Section',
    category: 'section',
    source: 'html',
    defaultJsx: `<section className="py-20 px-6 bg-white" data-vb-section="faq">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">Frequently Asked Questions</h2>
          <div className="space-y-4">
            <details className="p-4 border border-gray-200 rounded-lg group">
              <summary className="font-semibold text-gray-900 cursor-pointer">What is this product?</summary>
              <p className="mt-3 text-gray-600 text-sm">This is a brief answer to the first question.</p>
            </details>
            <details className="p-4 border border-gray-200 rounded-lg group">
              <summary className="font-semibold text-gray-900 cursor-pointer">How do I get started?</summary>
              <p className="mt-3 text-gray-600 text-sm">Sign up for a free account and follow the onboarding wizard.</p>
            </details>
            <details className="p-4 border border-gray-200 rounded-lg group">
              <summary className="font-semibold text-gray-900 cursor-pointer">Can I cancel anytime?</summary>
              <p className="mt-3 text-gray-600 text-sm">Yes, you can cancel your subscription at any time with no fees.</p>
            </details>
          </div>
        </div>
      </section>`,
    propSchema: [],
    icon: 'HelpCircle',
    description: 'Expandable FAQ accordion',
  },
  {
    id: 'section/contact',
    name: 'Contact Section',
    category: 'section',
    source: 'html',
    defaultJsx: `<section className="py-20 px-6 bg-gray-50" data-vb-section="contact">
        <div className="max-w-xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-8">Get In Touch</h2>
          <form className="space-y-4">
            <input type="text" placeholder="Your Name" className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none" />
            <input type="email" placeholder="Your Email" className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none" />
            <textarea placeholder="Your Message" rows="4" className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none resize-none"></textarea>
            <button type="submit" className="w-full py-3 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 transition">Send Message</button>
          </form>
        </div>
      </section>`,
    propSchema: [],
    icon: 'Mail',
    description: 'Contact form with name, email, and message',
  },
  {
    id: 'section/navbar',
    name: 'Navigation Bar',
    category: 'section',
    source: 'html',
    defaultJsx: `<nav className="flex items-center justify-between px-6 py-4 bg-white border-b border-gray-200" data-vb-section="nav">
        <a href="/" className="text-xl font-bold text-gray-900">Brand</a>
        <div className="flex items-center gap-6">
          <a href="#features" className="text-sm text-gray-600 hover:text-gray-900 transition">Features</a>
          <a href="#pricing" className="text-sm text-gray-600 hover:text-gray-900 transition">Pricing</a>
          <a href="#contact" className="text-sm text-gray-600 hover:text-gray-900 transition">Contact</a>
          <button className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg font-medium hover:bg-indigo-700 transition">Sign Up</button>
        </div>
      </nav>`,
    propSchema: [],
    icon: 'Menu',
    description: 'Horizontal navigation bar with links and CTA',
  },
]

// ─── Built-in shadcn/ui components ───────────────────────────

const SHADCN_COMPONENTS: VBComponent[] = [
  {
    id: 'shadcn/button',
    name: 'Button',
    category: 'ui',
    source: 'shadcn',
    importPath: '@/components/ui/button',
    importSpecifier: 'Button',
    defaultJsx: '<Button>Click me</Button>',
    propSchema: [
      { name: 'variant', type: 'select', label: 'Variant', defaultValue: 'default', options: [
        { label: 'Default', value: 'default' }, { label: 'Secondary', value: 'secondary' },
        { label: 'Outline', value: 'outline' }, { label: 'Ghost', value: 'ghost' },
        { label: 'Destructive', value: 'destructive' }, { label: 'Link', value: 'link' },
      ]},
      { name: 'size', type: 'select', label: 'Size', defaultValue: 'default', options: [
        { label: 'Small', value: 'sm' }, { label: 'Default', value: 'default' },
        { label: 'Large', value: 'lg' }, { label: 'Icon', value: 'icon' },
      ]},
      { name: 'disabled', type: 'boolean', label: 'Disabled', defaultValue: false },
    ],
    icon: 'MousePointerClick',
    description: 'Clickable button with variants',
  },
  {
    id: 'shadcn/card',
    name: 'Card',
    category: 'ui',
    source: 'shadcn',
    importPath: '@/components/ui/card',
    importSpecifier: 'Card',
    defaultJsx: `<Card className="p-6">
          <h3 className="font-semibold text-lg mb-2">Card Title</h3>
          <p className="text-gray-600 text-sm">Card content goes here.</p>
        </Card>`,
    propSchema: [],
    icon: 'Square',
    description: 'Container card with shadow and border',
  },
  {
    id: 'shadcn/input',
    name: 'Input',
    category: 'form',
    source: 'shadcn',
    importPath: '@/components/ui/input',
    importSpecifier: 'Input',
    defaultJsx: '<Input placeholder="Enter text..." />',
    propSchema: [
      { name: 'type', type: 'select', label: 'Type', defaultValue: 'text', options: [
        { label: 'Text', value: 'text' }, { label: 'Email', value: 'email' },
        { label: 'Password', value: 'password' }, { label: 'Number', value: 'number' },
      ]},
      { name: 'placeholder', type: 'string', label: 'Placeholder', defaultValue: 'Enter text...' },
      { name: 'disabled', type: 'boolean', label: 'Disabled', defaultValue: false },
    ],
    icon: 'TextCursorInput',
    description: 'Text input field',
  },
  {
    id: 'shadcn/badge',
    name: 'Badge',
    category: 'ui',
    source: 'shadcn',
    importPath: '@/components/ui/badge',
    importSpecifier: 'Badge',
    defaultJsx: '<Badge>Label</Badge>',
    propSchema: [
      { name: 'variant', type: 'select', label: 'Variant', defaultValue: 'default', options: [
        { label: 'Default', value: 'default' }, { label: 'Secondary', value: 'secondary' },
        { label: 'Outline', value: 'outline' }, { label: 'Destructive', value: 'destructive' },
      ]},
    ],
    icon: 'Tag',
    description: 'Small status badge',
  },
]

// ─── Layout primitives ───────────────────────────────────────

const LAYOUT_COMPONENTS: VBComponent[] = [
  {
    id: 'layout/container',
    name: 'Container',
    category: 'layout',
    source: 'html',
    defaultJsx: '<div className="max-w-6xl mx-auto px-6"></div>',
    propSchema: [
      { name: 'className', type: 'className', label: 'Classes', defaultValue: 'max-w-6xl mx-auto px-6' },
    ],
    icon: 'BoxSelect',
    description: 'Centered container with max-width',
  },
  {
    id: 'layout/flex-row',
    name: 'Flex Row',
    category: 'layout',
    source: 'html',
    defaultJsx: '<div className="flex items-center gap-4"></div>',
    propSchema: [
      { name: 'className', type: 'className', label: 'Classes', defaultValue: 'flex items-center gap-4' },
    ],
    icon: 'AlignHorizontalDistributeCenter',
    description: 'Horizontal flex container',
  },
  {
    id: 'layout/grid',
    name: 'Grid',
    category: 'layout',
    source: 'html',
    defaultJsx: '<div className="grid grid-cols-1 md:grid-cols-3 gap-6"></div>',
    propSchema: [
      { name: 'className', type: 'className', label: 'Classes', defaultValue: 'grid grid-cols-1 md:grid-cols-3 gap-6' },
    ],
    icon: 'Grid3x3',
    description: 'Responsive CSS grid',
  },
  {
    id: 'layout/section',
    name: 'Section',
    category: 'layout',
    source: 'html',
    defaultJsx: '<section className="py-16 px-6"></section>',
    propSchema: [
      { name: 'className', type: 'className', label: 'Classes', defaultValue: 'py-16 px-6' },
    ],
    icon: 'Rows3',
    description: 'Empty section wrapper',
  },
]

// ─── Registry ────────────────────────────────────────────────

const REGISTRY: VBComponent[] = [
  ...SECTION_PRESETS,
  ...SHADCN_COMPONENTS,
  ...LAYOUT_COMPONENTS,
]

/** Custom components added at runtime (from project scan or plugins) */
const customComponents: VBComponent[] = []

export function getComponentRegistry(): VBComponent[] {
  return [...REGISTRY, ...customComponents]
}

export function getComponentsByCategory(category: ComponentCategory): VBComponent[] {
  return getComponentRegistry().filter(c => c.category === category)
}

export function getComponentById(id: string): VBComponent | undefined {
  return getComponentRegistry().find(c => c.id === id)
}

export function registerCustomComponent(component: VBComponent): void {
  const existing = customComponents.findIndex(c => c.id === component.id)
  if (existing >= 0) {
    customComponents[existing] = component
  } else {
    customComponents.push(component)
  }
}

export function clearCustomComponents(): void {
  customComponents.length = 0
}

export function getCategories(): Array<{ id: ComponentCategory; label: string; icon: string }> {
  return [
    { id: 'section', label: 'Sections', icon: 'Rows3' },
    { id: 'layout', label: 'Layout', icon: 'LayoutGrid' },
    { id: 'ui', label: 'UI Components', icon: 'Component' },
    { id: 'form', label: 'Forms', icon: 'FormInput' },
    { id: 'navigation', label: 'Navigation', icon: 'Navigation' },
    { id: 'media', label: 'Media', icon: 'Image' },
    { id: 'data', label: 'Data Display', icon: 'Table' },
    { id: 'custom', label: 'Custom', icon: 'Puzzle' },
  ]
}
