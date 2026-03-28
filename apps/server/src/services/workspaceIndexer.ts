/**
 * Workspace Indexer — Sprint 8
 *
 * Scans a generated workspace after a successful build and extracts a
 * structured WorkspaceSnapshot. Used to make CoderXP repo-aware so that
 * planning, generation, repair, and continuation all know what already exists.
 *
 * Design principles:
 *   - Regex-based only — no AST, no new dependencies
 *   - Fast and deterministic — must not slow down the build pipeline
 *   - Non-throwing — all errors are caught and logged; returns partial snapshot
 *   - Compact output — high-signal fields only, no raw file content
 */

import fs from 'fs'
import path from 'path'

// ─── Types ────────────────────────────────────────────────────

export interface RouteEntry {
  path: string
  component: string
}

export interface ApiEndpointEntry {
  method: string
  path: string
  file: string
}

export interface WorkspaceSnapshot {
  capturedAt: string           // ISO timestamp
  fileTree: string[]           // all relative file paths
  components: string[]         // React component names found in TSX/TS files
  routes: RouteEntry[]         // parsed from src/App.tsx
  apiEndpoints: ApiEndpointEntry[]  // parsed from server/routes/*.ts
  prismaModels: string[]       // model names from prisma/schema.prisma
  dependencies: string[]       // top-level keys from package.json dependencies
  totalFiles: number
  totalBytes: number
  /** Deep repo intelligence — Sprint 19 */
  repoIntelligence?: RepoIntelligence
}

// ─── Repo Intelligence Types (Sprint 19) ─────────────────────

export interface NamingConventions {
  /** Detected variable naming: 'camelCase' | 'snake_case' | 'mixed' */
  variables: string
  /** Detected file naming: 'camelCase' | 'kebab-case' | 'PascalCase' | 'mixed' */
  files: string
  /** Detected component naming: 'PascalCase' | 'mixed' */
  components: string
  /** Detected folder naming: 'kebab-case' | 'camelCase' | 'mixed' */
  folders: string
  /** Detected CSS class naming: 'tailwind' | 'BEM' | 'camelCase' | 'mixed' */
  cssClasses: string
}

export interface ApiContract {
  method: string
  path: string
  file: string
  /** Request body shape (field names) */
  requestFields: string[]
  /** Response shape (field names) */
  responseFields: string[]
  /** Auth required? */
  authRequired: boolean
}

export interface StyleSystem {
  /** Primary styling approach: 'tailwind' | 'css-modules' | 'styled-components' | 'plain-css' | 'emotion' | 'mixed' */
  approach: string
  /** UI framework if detected: 'shadcn' | 'chakra' | 'mantine' | 'mui' | 'antd' | 'none' */
  uiFramework: string
  /** Whether a theme/design token system is used */
  hasTheme: boolean
  /** Color palette tokens if detected */
  colorTokens: string[]
  /** Common spacing patterns */
  spacingPattern: string
}

export interface ArchitectureFingerprint {
  /** Routing approach: 'react-router' | 'next-pages' | 'next-app' | 'tanstack-router' | 'none' */
  routing: string
  /** State management: 'zustand' | 'redux' | 'context' | 'jotai' | 'mobx' | 'none' */
  stateManagement: string
  /** Data fetching: 'tanstack-query' | 'swr' | 'fetch' | 'axios' | 'trpc' | 'mixed' */
  dataFetching: string
  /** Form handling: 'react-hook-form' | 'formik' | 'native' | 'none' */
  formHandling: string
  /** Folder structure pattern: 'feature-based' | 'type-based' | 'flat' */
  folderStructure: string
  /** Backend framework: 'express' | 'fastify' | 'hono' | 'none' */
  backendFramework: string
  /** ORM: 'prisma' | 'drizzle' | 'typeorm' | 'none' */
  orm: string
  /** Auth approach: 'supabase' | 'nextauth' | 'custom-jwt' | 'clerk' | 'none' */
  authApproach: string
}

export interface ComponentLibraryInfo {
  /** UI framework name */
  name: string
  /** Components actively used from the library */
  usedComponents: string[]
  /** Custom shared components (not from a library) */
  customSharedComponents: string[]
}

export interface RepoIntelligence {
  naming: NamingConventions
  apiContracts: ApiContract[]
  style: StyleSystem
  architecture: ArchitectureFingerprint
  componentLibrary: ComponentLibraryInfo
}

// ─── File tree walker ─────────────────────────────────────────

function walkDir(dir: string, base: string, results: string[]): void {
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }

  for (const entry of entries) {
    // Skip node_modules, .git, dist, build artifacts
    if (
      entry.name === 'node_modules' ||
      entry.name === '.git' ||
      entry.name === 'dist' ||
      entry.name === '.vite' ||
      entry.name === 'coverage'
    ) continue

    const fullPath = path.join(dir, entry.name)
    const relPath = path.relative(base, fullPath).replace(/\\/g, '/')

    if (entry.isDirectory()) {
      walkDir(fullPath, base, results)
    } else if (entry.isFile()) {
      results.push(relPath)
    }
  }
}

function getTotalBytes(workspacePath: string, fileTree: string[]): number {
  let total = 0
  for (const rel of fileTree) {
    try {
      const stat = fs.statSync(path.join(workspacePath, rel))
      total += stat.size
    } catch {
      // ignore
    }
  }
  return total
}

// ─── Component extractor ──────────────────────────────────────
// Finds React component names from TSX/TS files.
// Matches:
//   export default function ComponentName
//   export function ComponentName
//   export const ComponentName = (
//   export const ComponentName: React.FC

const COMPONENT_PATTERNS = [
  /export\s+default\s+function\s+([A-Z][A-Za-z0-9_]*)/g,
  /export\s+function\s+([A-Z][A-Za-z0-9_]*)/g,
  /export\s+const\s+([A-Z][A-Za-z0-9_]*)\s*[:=]/g,
]

function extractComponents(workspacePath: string, fileTree: string[]): string[] {
  const components = new Set<string>()

  const tsxFiles = fileTree.filter(f =>
    (f.endsWith('.tsx') || f.endsWith('.ts')) &&
    !f.includes('node_modules') &&
    !f.endsWith('.d.ts') &&
    !f.endsWith('.test.ts') &&
    !f.endsWith('.test.tsx')
  )

  for (const rel of tsxFiles) {
    let content: string
    try {
      content = fs.readFileSync(path.join(workspacePath, rel), 'utf-8')
    } catch {
      continue
    }

    for (const pattern of COMPONENT_PATTERNS) {
      pattern.lastIndex = 0
      let match: RegExpExecArray | null
      while ((match = pattern.exec(content)) !== null) {
        const name = match[1]
        // Filter out non-component names (hooks, utilities, types)
        if (
          name.length > 1 &&
          !name.startsWith('use') &&
          name !== 'Props' &&
          name !== 'State' &&
          name !== 'Type' &&
          name !== 'Interface'
        ) {
          components.add(name)
        }
      }
    }
  }

  return Array.from(components).sort()
}

// ─── Route extractor ─────────────────────────────────────────
// Parses src/App.tsx for React Router <Route> declarations.
// Matches patterns like:
//   <Route path="/login" element={<Login />} />
//   <Route path="/" element={<Home />} />

const ROUTE_PATTERN = /<Route\s[^>]*path=["']([^"']+)["'][^>]*element=\{<([A-Za-z0-9_]+)/g
const ROUTE_PATTERN_ALT = /<Route\s[^>]*element=\{<([A-Za-z0-9_]+)[^>]*path=["']([^"']+)["']/g

function extractRoutes(workspacePath: string): RouteEntry[] {
  const routes: RouteEntry[] = []
  const appTsxPath = path.join(workspacePath, 'src', 'App.tsx')

  let content: string
  try {
    content = fs.readFileSync(appTsxPath, 'utf-8')
  } catch {
    return routes
  }

  const seen = new Set<string>()

  // Pattern 1: path first, then element
  ROUTE_PATTERN.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = ROUTE_PATTERN.exec(content)) !== null) {
    const key = `${match[1]}:${match[2]}`
    if (!seen.has(key)) {
      seen.add(key)
      routes.push({ path: match[1], component: match[2] })
    }
  }

  // Pattern 2: element first, then path
  ROUTE_PATTERN_ALT.lastIndex = 0
  while ((match = ROUTE_PATTERN_ALT.exec(content)) !== null) {
    const key = `${match[2]}:${match[1]}`
    if (!seen.has(key)) {
      seen.add(key)
      routes.push({ path: match[2], component: match[1] })
    }
  }

  return routes.sort((a, b) => a.path.localeCompare(b.path))
}

// ─── API endpoint extractor ───────────────────────────────────
// Parses server/routes/*.ts for Express route declarations.
// Matches:
//   router.get('/path', ...)
//   router.post('/path', ...)
//   router.put('/path', ...)
//   router.delete('/path', ...)
//   app.get('/path', ...)

const ENDPOINT_PATTERN = /(?:router|app)\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/g

function extractApiEndpoints(workspacePath: string, fileTree: string[]): ApiEndpointEntry[] {
  const endpoints: ApiEndpointEntry[] = []

  const routeFiles = fileTree.filter(f =>
    f.startsWith('server/routes/') && (f.endsWith('.ts') || f.endsWith('.js'))
  )

  // Also check server/index.ts for inline routes
  if (fileTree.includes('server/index.ts')) {
    routeFiles.push('server/index.ts')
  }

  for (const rel of routeFiles) {
    let content: string
    try {
      content = fs.readFileSync(path.join(workspacePath, rel), 'utf-8')
    } catch {
      continue
    }

    const fileName = path.basename(rel, path.extname(rel))
    ENDPOINT_PATTERN.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = ENDPOINT_PATTERN.exec(content)) !== null) {
      endpoints.push({
        method: match[1].toUpperCase(),
        path: match[2],
        file: rel,
      })
    }

    // Deduplicate within file
    const _ = fileName // suppress unused warning
  }

  // Deduplicate across files
  const seen = new Set<string>()
  return endpoints.filter(e => {
    const key = `${e.method}:${e.path}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

// ─── Prisma model extractor ───────────────────────────────────
// Parses prisma/schema.prisma for model declarations.
// Matches: model ModelName {

const PRISMA_MODEL_PATTERN = /^model\s+([A-Z][A-Za-z0-9_]*)\s*\{/gm

function extractPrismaModels(workspacePath: string): string[] {
  const models: string[] = []
  const schemaPath = path.join(workspacePath, 'prisma', 'schema.prisma')

  let content: string
  try {
    content = fs.readFileSync(schemaPath, 'utf-8')
  } catch {
    return models
  }

  PRISMA_MODEL_PATTERN.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = PRISMA_MODEL_PATTERN.exec(content)) !== null) {
    models.push(match[1])
  }

  return models.sort()
}

// ─── Dependency extractor ─────────────────────────────────────
// Reads package.json and returns top-level dependency names.
// Combines dependencies + devDependencies, strips version strings.

function extractDependencies(workspacePath: string): string[] {
  const pkgPath = path.join(workspacePath, 'package.json')

  let pkg: Record<string, unknown>
  try {
    const raw = fs.readFileSync(pkgPath, 'utf-8')
    pkg = JSON.parse(raw) as Record<string, unknown>
  } catch {
    return []
  }

  const deps = Object.keys((pkg.dependencies as Record<string, string>) ?? {})
  const devDeps = Object.keys((pkg.devDependencies as Record<string, string>) ?? {})

  // Return only meaningful deps (filter out @types/*, eslint plugins, etc.)
  const all = Array.from(new Set([...deps, ...devDeps]))
  return all
    .filter(d =>
      !d.startsWith('@types/') &&
      !d.startsWith('eslint') &&
      !d.startsWith('prettier') &&
      d !== 'typescript'
    )
    .sort()
    .slice(0, 30) // cap at 30 to keep context compact
}

// ─── Naming Convention Analyzer (Sprint 19) ──────────────────

function analyzeNamingConventions(workspacePath: string, fileTree: string[]): NamingConventions {
  // File naming analysis
  const srcFiles = fileTree.filter(f => f.startsWith('src/') && f.match(/\.(ts|tsx|js|jsx)$/))
  const fileNames = srcFiles.map(f => path.basename(f, path.extname(f)))

  const fileNaming = detectNamingStyle(fileNames)

  // Folder naming analysis
  const folders = new Set<string>()
  for (const f of fileTree) {
    const parts = f.split('/')
    for (let i = 0; i < parts.length - 1; i++) {
      if (parts[i] !== 'src' && parts[i] !== 'server' && parts[i] !== 'prisma') {
        folders.add(parts[i])
      }
    }
  }
  const folderNaming = detectNamingStyle(Array.from(folders))

  // Variable naming — sample from first 10 source files
  let variableStyle = 'camelCase'
  const sampleFiles = srcFiles.slice(0, 10)
  let camelCount = 0
  let snakeCount = 0
  for (const rel of sampleFiles) {
    try {
      const content = fs.readFileSync(path.join(workspacePath, rel), 'utf8')
      const vars = content.match(/(?:const|let|var)\s+([a-z][a-zA-Z0-9_]*)/g) ?? []
      for (const v of vars) {
        const name = v.replace(/^(?:const|let|var)\s+/, '')
        if (name.includes('_') && !name.startsWith('_')) snakeCount++
        else camelCount++
      }
    } catch { /* skip */ }
  }
  if (snakeCount > camelCount * 2) variableStyle = 'snake_case'
  else if (snakeCount > 0 && camelCount > 0) variableStyle = 'mixed'

  // Component naming — always PascalCase in React
  const componentNaming = 'PascalCase'

  // CSS class naming
  let cssClasses = 'mixed'
  for (const rel of sampleFiles.slice(0, 5)) {
    try {
      const content = fs.readFileSync(path.join(workspacePath, rel), 'utf8')
      if (content.includes('className="') && content.match(/className="[^"]*\b(flex|grid|p-|m-|text-|bg-|rounded)/)) {
        cssClasses = 'tailwind'
        break
      }
      if (content.includes('styles.') || content.includes('module.css')) {
        cssClasses = 'css-modules'
        break
      }
      if (content.includes('styled.') || content.includes('styled(')) {
        cssClasses = 'styled-components'
        break
      }
    } catch { /* skip */ }
  }

  return {
    variables: variableStyle,
    files: fileNaming,
    components: componentNaming,
    folders: folderNaming,
    cssClasses,
  }
}

function detectNamingStyle(names: string[]): string {
  if (names.length === 0) return 'mixed'
  let pascal = 0, camel = 0, kebab = 0, snake = 0
  for (const n of names) {
    if (n.includes('-')) kebab++
    else if (n.includes('_')) snake++
    else if (n[0] === n[0].toUpperCase()) pascal++
    else camel++
  }
  const total = names.length
  if (pascal / total > 0.6) return 'PascalCase'
  if (camel / total > 0.6) return 'camelCase'
  if (kebab / total > 0.6) return 'kebab-case'
  if (snake / total > 0.6) return 'snake_case'
  return 'mixed'
}

// ─── API Contract Extractor (Sprint 19) ──────────────────────

function extractApiContracts(workspacePath: string, fileTree: string[]): ApiContract[] {
  const contracts: ApiContract[] = []
  const routeFiles = fileTree.filter(f =>
    (f.startsWith('server/routes/') || f.startsWith('server/') && f.includes('route')) &&
    f.match(/\.(ts|js)$/)
  )
  if (fileTree.includes('server/index.ts')) routeFiles.push('server/index.ts')

  const endpointPattern = /(?:router|app)\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/g
  const authMiddleware = /(?:auth|protect|verify|requireAuth|isAuthenticated)/i

  for (const rel of routeFiles) {
    let content: string
    try {
      content = fs.readFileSync(path.join(workspacePath, rel), 'utf8')
    } catch { continue }

    endpointPattern.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = endpointPattern.exec(content))) {
      const method = match[1].toUpperCase()
      const routePath = match[2]

      // Check for auth middleware in the surrounding lines (±5 lines)
      const lineIdx = content.slice(0, match.index).split('\n').length - 1
      const lines = content.split('\n')
      const contextLines = lines.slice(Math.max(0, lineIdx - 2), lineIdx + 8).join('\n')
      const hasAuth = authMiddleware.test(contextLines)

      // Extract request body fields (look for req.body.X or destructured { x } = req.body)
      const reqFields: string[] = []
      const bodyDestructure = contextLines.match(/(?:const|let)\s*\{([^}]+)\}\s*=\s*req\.body/)
      if (bodyDestructure) {
        reqFields.push(...bodyDestructure[1].split(',').map(s => s.trim().split(':')[0].trim()).filter(Boolean))
      }
      const bodyAccess = contextLines.match(/req\.body\.(\w+)/g)
      if (bodyAccess) {
        for (const ba of bodyAccess) {
          reqFields.push(ba.replace('req.body.', ''))
        }
      }

      // Extract response fields (look for res.json({ x, y }))
      const resFields: string[] = []
      const resJson = contextLines.match(/res\.json\s*\(\s*\{([^}]{1,200})\}/)
      if (resJson) {
        const fields = resJson[1].match(/\b([a-zA-Z_]\w*)\s*[,:]/g)
        if (fields) {
          resFields.push(...fields.map(f => f.replace(/[,:]/g, '').trim()).filter(Boolean))
        }
      }

      contracts.push({
        method,
        path: routePath,
        file: rel,
        requestFields: [...new Set(reqFields)].slice(0, 10),
        responseFields: [...new Set(resFields)].slice(0, 10),
        authRequired: hasAuth,
      })
    }
  }

  // Deduplicate
  const seen = new Set<string>()
  return contracts.filter(c => {
    const key = `${c.method}:${c.path}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }).slice(0, 30)
}

// ─── Style System Detector (Sprint 19) ───────────────────────

function detectStyleSystem(workspacePath: string, fileTree: string[], deps: string[]): StyleSystem {
  // Detect primary styling approach
  let approach = 'plain-css'
  if (deps.includes('tailwindcss') || fileTree.some(f => f.includes('tailwind.config'))) {
    approach = 'tailwind'
  } else if (deps.includes('styled-components')) {
    approach = 'styled-components'
  } else if (deps.includes('@emotion/react') || deps.includes('@emotion/styled')) {
    approach = 'emotion'
  } else if (fileTree.some(f => f.match(/\.module\.css$/))) {
    approach = 'css-modules'
  }

  // Detect UI framework
  let uiFramework = 'none'
  if (deps.includes('@chakra-ui/react')) uiFramework = 'chakra'
  else if (deps.includes('@mantine/core')) uiFramework = 'mantine'
  else if (deps.includes('@mui/material')) uiFramework = 'mui'
  else if (deps.includes('antd')) uiFramework = 'antd'
  else if (fileTree.some(f => f.includes('components/ui/') && f.endsWith('.tsx'))) uiFramework = 'shadcn'

  // Detect theme / design tokens
  let hasTheme = false
  const colorTokens: string[] = []
  const themeFiles = fileTree.filter(f => f.match(/theme|tokens|design.*system/i))
  if (themeFiles.length > 0) hasTheme = true

  // Check tailwind config for color tokens
  const tailwindConfig = fileTree.find(f => f.includes('tailwind.config'))
  if (tailwindConfig) {
    try {
      const content = fs.readFileSync(path.join(workspacePath, tailwindConfig), 'utf8')
      const colorMatches = content.match(/['"]([a-z]+)['"]:\s*['"]#[0-9a-fA-F]{3,8}['"]/g)
      if (colorMatches) {
        hasTheme = true
        for (const cm of colorMatches.slice(0, 8)) {
          const name = cm.match(/['"]([a-z]+)['"]/)?.[1]
          if (name) colorTokens.push(name)
        }
      }
    } catch { /* skip */ }
  }

  // Detect spacing pattern
  let spacingPattern = 'standard'
  if (approach === 'tailwind') spacingPattern = 'tailwind-spacing (p-4, m-2, gap-3, etc.)'
  else if (approach === 'css-modules') spacingPattern = 'css-variables'

  return {
    approach,
    uiFramework,
    hasTheme,
    colorTokens,
    spacingPattern,
  }
}

// ─── Architecture Fingerprinter (Sprint 19) ──────────────────

function fingerprintArchitecture(workspacePath: string, fileTree: string[], deps: string[]): ArchitectureFingerprint {
  // Routing
  let routing = 'none'
  if (deps.includes('react-router-dom') || deps.includes('react-router')) routing = 'react-router'
  else if (deps.includes('next')) routing = fileTree.some(f => f.startsWith('app/')) ? 'next-app' : 'next-pages'
  else if (deps.includes('@tanstack/react-router')) routing = 'tanstack-router'

  // State management
  let stateManagement = 'none'
  if (deps.includes('zustand')) stateManagement = 'zustand'
  else if (deps.includes('@reduxjs/toolkit') || deps.includes('redux')) stateManagement = 'redux'
  else if (deps.includes('jotai')) stateManagement = 'jotai'
  else if (deps.includes('mobx')) stateManagement = 'mobx'
  else {
    // Check for React Context usage
    const srcFiles = fileTree.filter(f => f.startsWith('src/') && f.match(/\.(ts|tsx)$/))
    for (const rel of srcFiles.slice(0, 15)) {
      try {
        const content = fs.readFileSync(path.join(workspacePath, rel), 'utf8')
        if (content.includes('createContext') || content.includes('useContext')) {
          stateManagement = 'context'
          break
        }
      } catch { /* skip */ }
    }
  }

  // Data fetching
  let dataFetching: string = 'fetch'
  if (deps.includes('@tanstack/react-query')) dataFetching = 'tanstack-query'
  else if (deps.includes('swr')) dataFetching = 'swr'
  else if (deps.includes('axios')) dataFetching = 'axios'
  else if (deps.includes('@trpc/client')) dataFetching = 'trpc'

  // Form handling
  let formHandling = 'native'
  if (deps.includes('react-hook-form')) formHandling = 'react-hook-form'
  else if (deps.includes('formik')) formHandling = 'formik'

  // Folder structure
  let folderStructure: string = 'type-based'
  const hasFeaturesDir = fileTree.some(f => f.includes('/features/'))
  const hasModulesDir = fileTree.some(f => f.includes('/modules/'))
  if (hasFeaturesDir || hasModulesDir) folderStructure = 'feature-based'
  const srcDirs = new Set(fileTree.filter(f => f.startsWith('src/')).map(f => f.split('/')[1]).filter(Boolean))
  if (srcDirs.size <= 3) folderStructure = 'flat'

  // Backend framework
  let backendFramework = 'none'
  if (deps.includes('express')) backendFramework = 'express'
  else if (deps.includes('fastify')) backendFramework = 'fastify'
  else if (deps.includes('hono')) backendFramework = 'hono'

  // ORM
  let orm = 'none'
  if (deps.includes('@prisma/client') || deps.includes('prisma')) orm = 'prisma'
  else if (deps.includes('drizzle-orm')) orm = 'drizzle'
  else if (deps.includes('typeorm')) orm = 'typeorm'

  // Auth approach
  let authApproach = 'none'
  if (deps.includes('@supabase/supabase-js')) authApproach = 'supabase'
  else if (deps.includes('next-auth') || deps.includes('@auth/core')) authApproach = 'nextauth'
  else if (deps.includes('@clerk/nextjs') || deps.includes('@clerk/react')) authApproach = 'clerk'
  else if (fileTree.some(f => f.match(/auth.*middleware|jwt.*verify|token.*verify/i))) authApproach = 'custom-jwt'

  return {
    routing,
    stateManagement,
    dataFetching,
    formHandling,
    folderStructure,
    backendFramework,
    orm,
    authApproach,
  }
}

// ─── Component Library Detector (Sprint 19) ──────────────────

function detectComponentLibrary(workspacePath: string, fileTree: string[], deps: string[]): ComponentLibraryInfo {
  let name = 'none'
  const usedComponents: string[] = []
  const customSharedComponents: string[] = []

  // Detect UI framework
  if (fileTree.some(f => f.includes('components/ui/') && f.endsWith('.tsx'))) {
    name = 'shadcn/ui'
    // Enumerate shadcn components
    const uiFiles = fileTree.filter(f => f.match(/^src\/components\/ui\/[^/]+\.tsx$/))
    for (const f of uiFiles) {
      const compName = path.basename(f, '.tsx')
      if (compName !== 'index') usedComponents.push(compName)
    }
  } else if (deps.includes('@chakra-ui/react')) {
    name = 'chakra-ui'
    // Scan imports for Chakra components
    scanLibraryImports(workspacePath, fileTree, '@chakra-ui/react', usedComponents)
  } else if (deps.includes('@mantine/core')) {
    name = 'mantine'
    scanLibraryImports(workspacePath, fileTree, '@mantine/core', usedComponents)
  } else if (deps.includes('@mui/material')) {
    name = 'mui'
    scanLibraryImports(workspacePath, fileTree, '@mui/material', usedComponents)
  } else if (deps.includes('antd')) {
    name = 'antd'
    scanLibraryImports(workspacePath, fileTree, 'antd', usedComponents)
  }

  // Detect custom shared components (in components/ but not in components/ui/)
  const sharedComponentFiles = fileTree.filter(f =>
    f.match(/^src\/components\/[^/]+\.tsx$/) && !f.includes('/ui/')
  )
  for (const f of sharedComponentFiles) {
    const compName = path.basename(f, '.tsx')
    if (compName !== 'index' && compName[0] === compName[0].toUpperCase()) {
      customSharedComponents.push(compName)
    }
  }

  return {
    name,
    usedComponents: [...new Set(usedComponents)].sort().slice(0, 25),
    customSharedComponents: customSharedComponents.sort().slice(0, 20),
  }
}

function scanLibraryImports(
  workspacePath: string,
  fileTree: string[],
  libraryName: string,
  results: string[]
): void {
  const srcFiles = fileTree.filter(f => f.startsWith('src/') && f.match(/\.(ts|tsx)$/)).slice(0, 20)
  const importPattern = new RegExp(`import\\s*\\{([^}]+)\\}\\s*from\\s*['"]${libraryName.replace('/', '\\/')}`, 'g')

  for (const rel of srcFiles) {
    try {
      const content = fs.readFileSync(path.join(workspacePath, rel), 'utf8')
      importPattern.lastIndex = 0
      let match: RegExpExecArray | null
      while ((match = importPattern.exec(content))) {
        const imports = match[1].split(',').map(s => s.trim().split(' as ')[0].trim()).filter(Boolean)
        results.push(...imports)
      }
    } catch { /* skip */ }
  }
}

// ─── Full Repo Intelligence Extractor ────────────────────────

function extractRepoIntelligence(
  workspacePath: string,
  fileTree: string[],
  deps: string[]
): RepoIntelligence {
  const naming = analyzeNamingConventions(workspacePath, fileTree)
  const apiContracts = extractApiContracts(workspacePath, fileTree)
  const style = detectStyleSystem(workspacePath, fileTree, deps)
  const architecture = fingerprintArchitecture(workspacePath, fileTree, deps)
  const componentLibrary = detectComponentLibrary(workspacePath, fileTree, deps)

  console.log(
    `[WorkspaceIndexer] Repo intelligence: ` +
    `naming=${naming.files}/${naming.variables}, ` +
    `style=${style.approach}/${style.uiFramework}, ` +
    `arch=${architecture.routing}/${architecture.stateManagement}, ` +
    `lib=${componentLibrary.name}, ` +
    `contracts=${apiContracts.length}`
  )

  return { naming, apiContracts, style, architecture, componentLibrary }
}

// ─── Main indexer ─────────────────────────────────────────────

/**
 * Scans a workspace directory and returns a structured WorkspaceSnapshot.
 * Fast, regex-based, non-throwing.
 * Errors are caught per-extractor — partial snapshots are returned on failure.
 */
export function indexWorkspace(workspacePath: string): WorkspaceSnapshot {
  const capturedAt = new Date().toISOString()

  // File tree
  const fileTree: string[] = []
  try {
    walkDir(workspacePath, workspacePath, fileTree)
  } catch (err) {
    console.warn('[WorkspaceIndexer] walkDir failed (non-fatal):', err)
  }

  const totalFiles = fileTree.length
  const totalBytes = getTotalBytes(workspacePath, fileTree)

  // Components
  let components: string[] = []
  try {
    components = extractComponents(workspacePath, fileTree)
  } catch (err) {
    console.warn('[WorkspaceIndexer] extractComponents failed (non-fatal):', err)
  }

  // Routes
  let routes: RouteEntry[] = []
  try {
    routes = extractRoutes(workspacePath)
  } catch (err) {
    console.warn('[WorkspaceIndexer] extractRoutes failed (non-fatal):', err)
  }

  // API endpoints
  let apiEndpoints: ApiEndpointEntry[] = []
  try {
    apiEndpoints = extractApiEndpoints(workspacePath, fileTree)
  } catch (err) {
    console.warn('[WorkspaceIndexer] extractApiEndpoints failed (non-fatal):', err)
  }

  // Prisma models
  let prismaModels: string[] = []
  try {
    prismaModels = extractPrismaModels(workspacePath)
  } catch (err) {
    console.warn('[WorkspaceIndexer] extractPrismaModels failed (non-fatal):', err)
  }

  // Dependencies
  let dependencies: string[] = []
  try {
    dependencies = extractDependencies(workspacePath)
  } catch (err) {
    console.warn('[WorkspaceIndexer] extractDependencies failed (non-fatal):', err)
  }

  // Deep repo intelligence (Sprint 19)
  let repoIntelligence: RepoIntelligence | undefined
  try {
    repoIntelligence = extractRepoIntelligence(workspacePath, fileTree, dependencies)
  } catch (err) {
    console.warn('[WorkspaceIndexer] extractRepoIntelligence failed (non-fatal):', err)
  }

  const snapshot: WorkspaceSnapshot = {
    capturedAt,
    fileTree,
    components,
    routes,
    apiEndpoints,
    prismaModels,
    dependencies,
    totalFiles,
    totalBytes,
    repoIntelligence,
  }

  console.log(
    `[WorkspaceIndexer] Indexed ${workspacePath}:` +
    ` ${totalFiles} files, ${components.length} components,` +
    ` ${routes.length} routes, ${apiEndpoints.length} endpoints,` +
    ` ${prismaModels.length} models` +
    (repoIntelligence ? `, intelligence: ${repoIntelligence.style.approach}/${repoIntelligence.architecture.stateManagement}` : '')
  )

  return snapshot
}
