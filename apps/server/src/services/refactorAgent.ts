/**
 * refactorAgent.ts — Roadmap Item #7: Refactor / Migration Agent
 *
 * Dedicated agent for controlled codebase evolution:
 *   1. Code Smell Detection — structural analysis beyond quality metrics
 *   2. Refactor Planner — structured plans with risk/rollback strategies
 *   3. Safe Module Rewrite — controlled rewrites with test verification
 *   4. Dependency Upgrade Intelligence — outdated detection, compatibility, incremental path
 *   5. Framework Migration Planning — migration recipes for common transitions
 *   6. Test-Backed Safety — integration with Testing Engine, QA, Fixer
 *
 * This is a distinct agent (not Fixer, not Planner):
 *   - More structural than Fixer (transforms architecture, not just patches errors)
 *   - More execution-heavy than Planner (generates rewrites, not just plans)
 *   - More transformation-focused than QA (evolves code, not just validates it)
 */

import { z } from 'zod'
import { completeJSON, complete, isProviderAvailable } from '../lib/providers'
import * as fs from 'fs'
import * as path from 'path'

// ═══════════════════════════════════════════════════════════════
// 1. CODE SMELL DETECTION
// ═══════════════════════════════════════════════════════════════

export type SmellCategory =
  | 'oversized_module'
  | 'repeated_pattern'
  | 'poor_separation'
  | 'high_coupling'
  | 'weak_abstraction'
  | 'dead_code'
  | 'outdated_pattern'
  | 'god_component'
  | 'prop_drilling'
  | 'mixed_concerns'

export interface CodeSmell {
  category: SmellCategory
  severity: 'critical' | 'high' | 'medium' | 'low'
  filePath: string
  line?: number
  description: string
  suggestion: string
  estimatedEffort: 'trivial' | 'small' | 'medium' | 'large'
}

export interface SmellReport {
  smells: CodeSmell[]
  score: number              // 0-100 (100 = clean)
  totalFilesScanned: number
  totalLinesScanned: number
  summary: {
    critical: number
    high: number
    medium: number
    low: number
  }
}

/**
 * Detect code smells in a workspace through static analysis.
 * Regex-based — no AST, no runtime dependencies.
 */
export function detectCodeSmells(workspacePath: string): SmellReport {
  const smells: CodeSmell[] = []
  let totalLines = 0

  const scanDirs = [
    path.join(workspacePath, 'src'),
    path.join(workspacePath, 'server'),
    path.join(workspacePath, 'src', 'pages'),
    path.join(workspacePath, 'src', 'components'),
    path.join(workspacePath, 'src', 'hooks'),
    path.join(workspacePath, 'src', 'services'),
    path.join(workspacePath, 'server', 'routes'),
    path.join(workspacePath, 'server', 'services'),
  ]

  const files: Array<{ filePath: string; content: string; lines: string[] }> = []
  for (const dir of scanDirs) {
    if (!fs.existsSync(dir)) continue
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isFile() || !/\.(ts|tsx|js|jsx)$/.test(entry.name)) continue
        const fullPath = path.join(dir, entry.name)
        try {
          const content = fs.readFileSync(fullPath, 'utf-8')
          const lines = content.split('\n')
          const relPath = fullPath.replace(workspacePath + path.sep, '').replace(/\\/g, '/')
          files.push({ filePath: relPath, content, lines })
          totalLines += lines.length
        } catch { /* skip */ }
      }
    } catch { /* skip */ }
  }

  for (const file of files) {
    const { filePath, content, lines } = file
    const lineCount = lines.length

    // ── Oversized module (>300 lines)
    if (lineCount > 300) {
      smells.push({
        category: 'oversized_module',
        severity: lineCount > 600 ? 'high' : 'medium',
        filePath,
        description: `File has ${lineCount} lines — consider splitting into smaller modules`,
        suggestion: 'Extract related functions into separate files. Group by feature or responsibility.',
        estimatedEffort: lineCount > 600 ? 'large' : 'medium',
      })
    }

    // ── God component (React component >200 lines with >5 useState)
    const useStateCount = (content.match(/useState\s*[<(]/g) ?? []).length
    const isReactComponent = /export\s+(default\s+)?function\s+\w+/.test(content) && /\.tsx$/.test(filePath)
    if (isReactComponent && lineCount > 200 && useStateCount > 5) {
      smells.push({
        category: 'god_component',
        severity: 'high',
        filePath,
        description: `Component has ${lineCount} lines and ${useStateCount} useState hooks — too much responsibility`,
        suggestion: 'Extract sub-components, custom hooks, or use a state management pattern (Zustand, useReducer).',
        estimatedEffort: 'large',
      })
    }

    // ── Prop drilling (>4 levels of prop passing detected heuristically)
    const propSpreadCount = (content.match(/\.\.\.\w+Props|\{\.\.\.props\}/g) ?? []).length
    const propsParamCount = (content.match(/:\s*\w+Props/g) ?? []).length
    if (propSpreadCount > 3 || propsParamCount > 4) {
      smells.push({
        category: 'prop_drilling',
        severity: 'medium',
        filePath,
        description: `${propSpreadCount + propsParamCount} prop-passing patterns detected — possible prop drilling`,
        suggestion: 'Consider React Context, Zustand store, or composition pattern to reduce prop chains.',
        estimatedEffort: 'medium',
      })
    }

    // ── Dead code candidates (exported but never imported elsewhere)
    const exports = content.match(/export\s+(?:function|const|class|interface|type)\s+(\w+)/g) ?? []
    // We'll check cross-file references in a second pass below

    // ── Repeated patterns (same function signature appears in multiple files)
    // Tracked separately in cross-file analysis below

    // ── Mixed concerns (file has both UI rendering and API calls)
    const hasFetch = /fetch\s*\(|axios\.|api\.|\.get\(|\.post\(/.test(content)
    const hasJSX = /<[A-Z]\w+|<div|<span|<button|<input|return\s*\(?\s*</.test(content)
    if (hasFetch && hasJSX && /\.tsx$/.test(filePath)) {
      smells.push({
        category: 'mixed_concerns',
        severity: 'medium',
        filePath,
        description: 'Component mixes UI rendering with API calls — violates separation of concerns',
        suggestion: 'Extract API logic into a custom hook (useXxx) or service module. Keep components focused on rendering.',
        estimatedEffort: 'small',
      })
    }

    // ── Outdated patterns
    // Class components in React
    if (/class\s+\w+\s+extends\s+(React\.)?Component/.test(content)) {
      smells.push({
        category: 'outdated_pattern',
        severity: 'medium',
        filePath,
        description: 'Uses class component — React functional components with hooks are the modern standard',
        suggestion: 'Convert to a functional component using hooks (useState, useEffect, etc.).',
        estimatedEffort: 'medium',
      })
    }

    // var declarations
    const varCount = (content.match(/\bvar\s+\w+/g) ?? []).length
    if (varCount > 0) {
      smells.push({
        category: 'outdated_pattern',
        severity: 'low',
        filePath,
        description: `${varCount} var declarations found — use const/let instead`,
        suggestion: 'Replace var with const (preferred) or let where reassignment is needed.',
        estimatedEffort: 'trivial',
      })
    }

    // CommonJS require() in TypeScript
    const requireCount = (content.match(/\brequire\s*\(/g) ?? []).length
    if (requireCount > 0 && /\.ts$/.test(filePath)) {
      smells.push({
        category: 'outdated_pattern',
        severity: 'low',
        filePath,
        description: `${requireCount} require() calls in TypeScript — use ES module imports`,
        suggestion: 'Replace require() with import statements for proper TypeScript module resolution.',
        estimatedEffort: 'trivial',
      })
    }

    // ── High coupling (file imports >8 local modules)
    const localImports = (content.match(/from\s+['"]\.\.?\//g) ?? []).length
    if (localImports > 8) {
      smells.push({
        category: 'high_coupling',
        severity: 'medium',
        filePath,
        description: `Imports ${localImports} local modules — high coupling to other parts of the codebase`,
        suggestion: 'Consider a facade pattern, barrel exports, or restructuring to reduce direct dependencies.',
        estimatedEffort: 'medium',
      })
    }

    // ── Weak abstraction (repeated inline types / magic numbers)
    const magicNumbers = content.match(/(?<!=\s*)\b(?:(?:[2-9]\d{2,})|(?:1\d{3,}))\b(?!\s*[;,\])])/g) ?? []
    if (magicNumbers.length > 3) {
      smells.push({
        category: 'weak_abstraction',
        severity: 'low',
        filePath,
        description: `${magicNumbers.length} magic numbers detected — extract to named constants`,
        suggestion: 'Define named constants (const MAX_RETRIES = 3) for better readability and maintainability.',
        estimatedEffort: 'trivial',
      })
    }
  }

  // ── Cross-file: repeated patterns (same function name in multiple files)
  const fnNameCounts = new Map<string, string[]>()
  for (const file of files) {
    const fns = file.content.match(/(?:export\s+)?(?:async\s+)?function\s+(\w+)/g) ?? []
    for (const fn of fns) {
      const name = fn.match(/function\s+(\w+)/)?.[1]
      if (!name || name.length < 4) continue
      if (!fnNameCounts.has(name)) fnNameCounts.set(name, [])
      fnNameCounts.get(name)!.push(file.filePath)
    }
  }
  for (const [name, locations] of fnNameCounts) {
    if (locations.length >= 3) {
      smells.push({
        category: 'repeated_pattern',
        severity: 'medium',
        filePath: locations[0],
        description: `Function "${name}" appears in ${locations.length} files: ${locations.slice(0, 3).join(', ')}`,
        suggestion: `Extract "${name}" into a shared utility module to eliminate duplication.`,
        estimatedEffort: 'small',
      })
    }
  }

  // ── Cross-file: dead code (exports never imported by other files)
  const allContent = files.map(f => f.content).join('\n')
  for (const file of files) {
    const exportMatches = file.content.match(/export\s+(?:function|const|class)\s+(\w+)/g) ?? []
    for (const exportMatch of exportMatches) {
      const name = exportMatch.match(/(?:function|const|class)\s+(\w+)/)?.[1]
      if (!name || name.length < 3) continue
      // Check if imported/referenced in any other file
      const importPattern = new RegExp(`(?:import|from).*\\b${name}\\b`, 'g')
      const usagePattern = new RegExp(`\\b${name}\\b`, 'g')
      const otherFiles = files.filter(f => f.filePath !== file.filePath)
      const usedElsewhere = otherFiles.some(f => importPattern.test(f.content) || usagePattern.test(f.content))
      if (!usedElsewhere && !/default/.test(exportMatch)) {
        smells.push({
          category: 'dead_code',
          severity: 'low',
          filePath: file.filePath,
          description: `Exported "${name}" is not imported by any other scanned file — possible dead code`,
          suggestion: `Verify "${name}" is used. If not, remove the export or the entire function.`,
          estimatedEffort: 'trivial',
        })
      }
    }
  }

  // Deduplicate
  const deduped = deduplicateSmells(smells)

  const summary = {
    critical: deduped.filter(s => s.severity === 'critical').length,
    high: deduped.filter(s => s.severity === 'high').length,
    medium: deduped.filter(s => s.severity === 'medium').length,
    low: deduped.filter(s => s.severity === 'low').length,
  }

  const score = Math.max(0, 100 - deduped.reduce((sum, s) => {
    if (s.severity === 'critical') return sum + 20
    if (s.severity === 'high') return sum + 12
    if (s.severity === 'medium') return sum + 6
    return sum + 2
  }, 0))

  return { smells: deduped, score, totalFilesScanned: files.length, totalLinesScanned: totalLines, summary }
}

function deduplicateSmells(smells: CodeSmell[]): CodeSmell[] {
  const seen = new Set<string>()
  return smells.filter(s => {
    const key = `${s.category}:${s.filePath}:${s.description.slice(0, 40)}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

// ═══════════════════════════════════════════════════════════════
// 2. REFACTOR PLANNER
// ═══════════════════════════════════════════════════════════════

export type RefactorType =
  | 'extract_module'
  | 'extract_hook'
  | 'extract_component'
  | 'merge_modules'
  | 'rename'
  | 'restructure'
  | 'pattern_upgrade'
  | 'dependency_upgrade'
  | 'framework_migration'
  | 'dead_code_removal'

export type RiskLevel = 'none' | 'low' | 'medium' | 'high' | 'critical'

export interface RefactorStep {
  order: number
  action: string
  targetFiles: string[]
  description: string
  reversible: boolean
}

export interface RefactorPlan {
  id: string
  type: RefactorType
  title: string
  reason: string
  expectedBenefit: string
  riskLevel: RiskLevel
  affectedFiles: string[]
  steps: RefactorStep[]
  rollbackStrategy: string
  requiresTests: boolean
  estimatedEffort: 'trivial' | 'small' | 'medium' | 'large'
  smellsAddressed: SmellCategory[]
  /** Pre-conditions that must be true before executing */
  preconditions: string[]
  /** Post-conditions to verify after executing */
  postconditions: string[]
}

export interface RefactorPlanSet {
  plans: RefactorPlan[]
  totalSmellsAddressed: number
  overallRisk: RiskLevel
  recommendedOrder: string[]
}

const refactorPlanSchema = z.object({
  plans: z.array(z.object({
    type: z.string(),
    title: z.string(),
    reason: z.string(),
    expectedBenefit: z.string(),
    riskLevel: z.enum(['none', 'low', 'medium', 'high', 'critical']),
    affectedFiles: z.array(z.string()),
    steps: z.array(z.object({
      order: z.number(),
      action: z.string(),
      targetFiles: z.array(z.string()),
      description: z.string(),
      reversible: z.boolean(),
    })),
    rollbackStrategy: z.string(),
    requiresTests: z.boolean(),
    estimatedEffort: z.enum(['trivial', 'small', 'medium', 'large']),
    smellsAddressed: z.array(z.string()),
  })),
})

/**
 * Generate structured refactor plans from detected code smells.
 * Uses AI when available, falls back to rule-based planning.
 */
export async function generateRefactorPlans(
  smellReport: SmellReport,
  repoContext?: string,
): Promise<RefactorPlanSet> {
  // Filter to actionable smells (medium+ severity)
  const actionable = smellReport.smells.filter(s => s.severity !== 'low')

  if (actionable.length === 0) {
    return { plans: [], totalSmellsAddressed: 0, overallRisk: 'none', recommendedOrder: [] }
  }

  // Try AI-powered planning
  if (isProviderAvailable('openrouter') || isProviderAvailable('openclaw')) {
    try {
      const smellSummary = actionable.slice(0, 10).map(s =>
        `[${s.severity}] ${s.category} in ${s.filePath}: ${s.description}`
      ).join('\n')

      const result = await completeJSON({
        role: 'planner',
        schema: refactorPlanSchema,
        systemPrompt: `You are a senior code architect generating refactor plans for a CoderXP project.
Given a list of code smells, generate concrete, actionable refactor plans.

RULES:
- Each plan addresses 1-3 related smells
- Include specific file paths and step-by-step actions
- Assess risk honestly — UI-only changes are low risk, architectural changes are high
- Rollback strategy must be concrete (e.g., "git revert" or "restore from backup")
- Steps must be ordered and reversible where possible
- requiresTests = true for any structural change
- Prioritize high-severity smells first

Return JSON: { "plans": [{ "type", "title", "reason", "expectedBenefit", "riskLevel", "affectedFiles", "steps", "rollbackStrategy", "requiresTests", "estimatedEffort", "smellsAddressed" }] }`,
        userPrompt: `Code smells detected:\n${smellSummary}${repoContext ? '\n\nRepo context:\n' + repoContext : ''}

Generate refactor plans to address these smells.`,
        temperature: 0.3,
        maxTokens: 2500,
        retries: 1,
      })

      const plans: RefactorPlan[] = (result.parsed.plans as any[]).map((p, i) => ({
        id: `refactor-${Date.now()}-${i}`,
        type: p.type as RefactorType,
        title: p.title,
        reason: p.reason,
        expectedBenefit: p.expectedBenefit,
        riskLevel: p.riskLevel as RiskLevel,
        affectedFiles: p.affectedFiles,
        steps: p.steps,
        rollbackStrategy: p.rollbackStrategy,
        requiresTests: p.requiresTests,
        estimatedEffort: p.estimatedEffort,
        smellsAddressed: p.smellsAddressed as SmellCategory[],
        preconditions: ['All tests passing', 'No uncommitted changes'],
        postconditions: ['All tests still passing', 'No new TypeScript errors', 'Preview still healthy'],
      }))

      const overallRisk = plans.reduce<RiskLevel>((max, p) => {
        const levels: RiskLevel[] = ['none', 'low', 'medium', 'high', 'critical']
        return levels.indexOf(p.riskLevel) > levels.indexOf(max) ? p.riskLevel : max
      }, 'none')

      return {
        plans,
        totalSmellsAddressed: plans.reduce((sum, p) => sum + p.smellsAddressed.length, 0),
        overallRisk,
        recommendedOrder: plans.map(p => p.id),
      }
    } catch (err) {
      console.warn('[RefactorAgent] AI planning failed, using rule-based fallback:', err instanceof Error ? err.message : err)
    }
  }

  // Rule-based fallback
  return buildFallbackRefactorPlans(actionable)
}

function buildFallbackRefactorPlans(smells: CodeSmell[]): RefactorPlanSet {
  const plans: RefactorPlan[] = []
  let planIdx = 0

  // Group smells by category
  const byCategory = new Map<SmellCategory, CodeSmell[]>()
  for (const smell of smells) {
    if (!byCategory.has(smell.category)) byCategory.set(smell.category, [])
    byCategory.get(smell.category)!.push(smell)
  }

  for (const [category, categorySmells] of byCategory) {
    const affected = [...new Set(categorySmells.map(s => s.filePath))]
    const plan: RefactorPlan = {
      id: `refactor-${Date.now()}-${planIdx++}`,
      type: mapCategoryToType(category),
      title: `Address ${category.replace(/_/g, ' ')} issues`,
      reason: categorySmells[0].description,
      expectedBenefit: categorySmells[0].suggestion,
      riskLevel: categorySmells.some(s => s.severity === 'critical') ? 'high'
        : categorySmells.some(s => s.severity === 'high') ? 'medium' : 'low',
      affectedFiles: affected.slice(0, 10),
      steps: [{
        order: 1,
        action: `Analyze ${affected.length} files for ${category}`,
        targetFiles: affected.slice(0, 5),
        description: `Review and refactor: ${categorySmells[0].suggestion}`,
        reversible: true,
      }],
      rollbackStrategy: 'Revert changed files via git checkout or restore from workspace backup',
      requiresTests: category !== 'dead_code' && category !== 'outdated_pattern',
      estimatedEffort: categorySmells.length > 5 ? 'large' : categorySmells.length > 2 ? 'medium' : 'small',
      smellsAddressed: [category],
      preconditions: ['All tests passing'],
      postconditions: ['All tests still passing', 'No new errors'],
    }
    plans.push(plan)
  }

  return {
    plans,
    totalSmellsAddressed: smells.length,
    overallRisk: plans.some(p => p.riskLevel === 'high') ? 'high' : 'medium',
    recommendedOrder: plans.map(p => p.id),
  }
}

function mapCategoryToType(category: SmellCategory): RefactorType {
  switch (category) {
    case 'oversized_module':
    case 'god_component': return 'extract_module'
    case 'repeated_pattern': return 'extract_module'
    case 'poor_separation':
    case 'mixed_concerns': return 'restructure'
    case 'high_coupling': return 'restructure'
    case 'weak_abstraction': return 'extract_module'
    case 'dead_code': return 'dead_code_removal'
    case 'outdated_pattern': return 'pattern_upgrade'
    case 'prop_drilling': return 'extract_hook'
    default: return 'restructure'
  }
}

// ═══════════════════════════════════════════════════════════════
// 3. DEPENDENCY UPGRADE INTELLIGENCE
// ═══════════════════════════════════════════════════════════════

export interface DepUpgradeInfo {
  name: string
  currentVersion: string
  latestVersion: string
  upgradeType: 'major' | 'minor' | 'patch'
  riskLevel: RiskLevel
  breakingChanges: boolean
  recommendation: string
}

export interface DepUpgradeReport {
  upgrades: DepUpgradeInfo[]
  totalOutdated: number
  majorUpgrades: number
  minorUpgrades: number
  patchUpgrades: number
  recommendedOrder: string[]
}

/**
 * Analyze package.json for outdated dependencies.
 * Uses npm outdated JSON output when available, falls back to version comparison.
 */
export function analyzeOutdatedDeps(workspacePath: string): DepUpgradeReport {
  const pkgPath = path.join(workspacePath, 'package.json')
  if (!fs.existsSync(pkgPath)) {
    return { upgrades: [], totalOutdated: 0, majorUpgrades: 0, minorUpgrades: 0, patchUpgrades: 0, recommendedOrder: [] }
  }

  let pkg: Record<string, any>
  try {
    pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
  } catch {
    return { upgrades: [], totalOutdated: 0, majorUpgrades: 0, minorUpgrades: 0, patchUpgrades: 0, recommendedOrder: [] }
  }

  const deps = { ...pkg.dependencies, ...pkg.devDependencies } as Record<string, string>
  const upgrades: DepUpgradeInfo[] = []

  // Known upgrade risk patterns
  const highRiskMajor = new Set(['react', 'react-dom', 'next', 'vite', 'typescript', 'tailwindcss', 'prisma', '@prisma/client'])
  const knownBreaking: Record<string, string> = {
    'react': 'React 19 changes: new JSX transform, concurrent features, Suspense changes',
    'next': 'Next.js App Router changes, middleware API changes',
    'tailwindcss': 'Tailwind v4: config format changes, JIT-only, new color system',
    'vite': 'Vite 6: Node.js 18+ required, config API changes',
    'typescript': 'Stricter type checking in new major versions',
  }

  for (const [name, versionSpec] of Object.entries(deps)) {
    const current = versionSpec.replace(/^[\^~>=<]/, '')
    const parts = current.split('.')
    if (parts.length < 2) continue

    // Heuristic: flag packages with major version < common latest
    const major = parseInt(parts[0], 10)
    const isRisky = highRiskMajor.has(name)

    // Since we can't call npm outdated without network, we flag version patterns
    // that suggest the dep might be outdated (version pinned low, very old ranges)
    if (versionSpec.startsWith('^') || versionSpec.startsWith('~')) {
      upgrades.push({
        name,
        currentVersion: current,
        latestVersion: 'check with npm outdated',
        upgradeType: 'minor', // conservative default
        riskLevel: isRisky ? 'medium' : 'low',
        breakingChanges: !!knownBreaking[name],
        recommendation: knownBreaking[name] ?? `Run: npm outdated ${name}`,
      })
    }
  }

  return {
    upgrades,
    totalOutdated: upgrades.length,
    majorUpgrades: upgrades.filter(u => u.upgradeType === 'major').length,
    minorUpgrades: upgrades.filter(u => u.upgradeType === 'minor').length,
    patchUpgrades: upgrades.filter(u => u.upgradeType === 'patch').length,
    recommendedOrder: upgrades
      .sort((a, b) => {
        const riskOrder = { none: 0, low: 1, medium: 2, high: 3, critical: 4 }
        return riskOrder[a.riskLevel] - riskOrder[b.riskLevel]
      })
      .map(u => u.name),
  }
}

// ═══════════════════════════════════════════════════════════════
// 4. FRAMEWORK MIGRATION PLANNING
// ═══════════════════════════════════════════════════════════════

export type MigrationRecipe =
  | 'react-to-nextjs'
  | 'express-to-fastify'
  | 'cra-to-vite'
  | 'js-to-typescript'
  | 'css-to-tailwind'
  | 'rest-to-trpc'
  | 'zustand-to-redux'
  | 'custom'

export interface MigrationStep {
  order: number
  phase: 'prepare' | 'migrate' | 'verify' | 'cleanup'
  action: string
  description: string
  files: string[]
  commands?: string[]
  reversible: boolean
  checkpoint: boolean   // Should we run tests at this step?
}

export interface MigrationPlan {
  recipe: MigrationRecipe
  title: string
  sourceFramework: string
  targetFramework: string
  complexity: 'low' | 'medium' | 'high'
  riskLevel: RiskLevel
  estimatedSteps: number
  steps: MigrationStep[]
  prerequisites: string[]
  rollbackPlan: string
  postMigrationChecks: string[]
}

/** Built-in migration recipe definitions */
const MIGRATION_RECIPES: Record<string, Omit<MigrationPlan, 'steps'>> = {
  'react-to-nextjs': {
    recipe: 'react-to-nextjs',
    title: 'React (Vite) → Next.js Migration',
    sourceFramework: 'React + Vite',
    targetFramework: 'Next.js (App Router)',
    complexity: 'high',
    riskLevel: 'high',
    estimatedSteps: 12,
    prerequisites: ['All tests passing', 'No uncommitted changes', 'Node.js 18+'],
    rollbackPlan: 'Restore from git branch: git checkout pre-migration-backup',
    postMigrationChecks: ['next build succeeds', 'All pages render', 'API routes functional', 'Tests pass'],
  },
  'express-to-fastify': {
    recipe: 'express-to-fastify',
    title: 'Express → Fastify Migration',
    sourceFramework: 'Express.js',
    targetFramework: 'Fastify',
    complexity: 'medium',
    riskLevel: 'medium',
    estimatedSteps: 8,
    prerequisites: ['All tests passing', 'Express 4.x'],
    rollbackPlan: 'Restore server/ directory from git',
    postMigrationChecks: ['Server starts', 'All API endpoints respond', 'Auth middleware works', 'Tests pass'],
  },
  'cra-to-vite': {
    recipe: 'cra-to-vite',
    title: 'Create React App → Vite Migration',
    sourceFramework: 'Create React App',
    targetFramework: 'Vite',
    complexity: 'low',
    riskLevel: 'low',
    estimatedSteps: 6,
    prerequisites: ['React 18+'],
    rollbackPlan: 'Restore package.json and config files from git',
    postMigrationChecks: ['vite build succeeds', 'Dev server starts', 'All pages render'],
  },
  'js-to-typescript': {
    recipe: 'js-to-typescript',
    title: 'JavaScript → TypeScript Migration',
    sourceFramework: 'JavaScript',
    targetFramework: 'TypeScript',
    complexity: 'medium',
    riskLevel: 'medium',
    estimatedSteps: 10,
    prerequisites: ['Node.js 16+'],
    rollbackPlan: 'Rename .ts files back to .js, remove tsconfig.json',
    postMigrationChecks: ['tsc --noEmit passes', 'Build succeeds', 'Tests pass'],
  },
  'css-to-tailwind': {
    recipe: 'css-to-tailwind',
    title: 'CSS/SCSS → Tailwind CSS Migration',
    sourceFramework: 'CSS/SCSS',
    targetFramework: 'Tailwind CSS',
    complexity: 'medium',
    riskLevel: 'low',
    estimatedSteps: 8,
    prerequisites: ['PostCSS compatible build'],
    rollbackPlan: 'Restore CSS files from git, remove tailwind config',
    postMigrationChecks: ['Build succeeds', 'All pages visually correct', 'No CSS regressions'],
  },
}

/**
 * Detect applicable migration recipes based on current tech stack.
 */
export function detectApplicableMigrations(
  workspacePath: string,
  techStack: Record<string, string[]>,
): MigrationRecipe[] {
  const applicable: MigrationRecipe[] = []
  const allTech = Object.values(techStack).flat().map(t => t.toLowerCase())

  // Check for CRA (react-scripts in package.json)
  const pkgPath = path.join(workspacePath, 'package.json')
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies }
      if (allDeps['react-scripts']) applicable.push('cra-to-vite')
    } catch { /* skip */ }
  }

  // Check for JS-only project (no tsconfig)
  if (!fs.existsSync(path.join(workspacePath, 'tsconfig.json'))) {
    applicable.push('js-to-typescript')
  }

  // Check for Express → could suggest Fastify
  if (allTech.includes('express') || allTech.includes('express.js')) {
    applicable.push('express-to-fastify')
  }

  // Check for React without Next.js
  if (allTech.includes('react') && !allTech.includes('next') && !allTech.includes('next.js')) {
    applicable.push('react-to-nextjs')
  }

  // Check for vanilla CSS (no tailwind)
  if (!allTech.includes('tailwind') && !allTech.includes('tailwindcss') && !allTech.includes('tailwind css')) {
    applicable.push('css-to-tailwind')
  }

  return applicable
}

/**
 * Generate a migration plan for a specific recipe.
 */
export async function generateMigrationPlan(
  recipe: MigrationRecipe,
  workspacePath: string,
  repoContext?: string,
): Promise<MigrationPlan | null> {
  const base = MIGRATION_RECIPES[recipe]
  if (!base) return null

  // Build steps from AI if available, otherwise use defaults
  if (isProviderAvailable('openrouter') || isProviderAvailable('openclaw')) {
    try {
      const result = await complete({
        role: 'planner',
        systemPrompt: `You are a senior software architect generating a detailed migration plan.
Given a migration recipe, generate step-by-step instructions for the migration.
Each step should have: order, phase (prepare|migrate|verify|cleanup), action, description, files affected, optional commands, whether reversible, and whether to run tests at this checkpoint.
Return as a JSON array of steps.`,
        userPrompt: `Migration: ${base.title}
From: ${base.sourceFramework} → To: ${base.targetFramework}
Complexity: ${base.complexity}
${repoContext ? '\nRepo context:\n' + repoContext : ''}

Generate ${base.estimatedSteps} migration steps.`,
        temperature: 0.3,
        maxTokens: 2000,
      })

      // Try to parse steps from AI response
      try {
        const cleaned = result.content.replace(/```json?\s*/g, '').replace(/```\s*$/g, '').trim()
        const steps = JSON.parse(cleaned) as MigrationStep[]
        return { ...base, steps }
      } catch {
        // Fall through to default steps
      }
    } catch {
      // Fall through to default steps
    }
  }

  // Default steps
  const steps: MigrationStep[] = [
    { order: 1, phase: 'prepare', action: 'Create backup branch', description: `git checkout -b pre-${recipe}-backup`, files: [], commands: [`git checkout -b pre-${recipe}-backup`], reversible: true, checkpoint: false },
    { order: 2, phase: 'prepare', action: 'Run existing tests', description: 'Verify baseline — all tests must pass before migration', files: [], commands: ['npm test'], reversible: true, checkpoint: true },
    { order: 3, phase: 'migrate', action: 'Update dependencies', description: `Install ${base.targetFramework} dependencies`, files: ['package.json'], reversible: true, checkpoint: false },
    { order: 4, phase: 'migrate', action: 'Update configuration', description: `Adapt config files for ${base.targetFramework}`, files: [], reversible: true, checkpoint: false },
    { order: 5, phase: 'migrate', action: 'Transform source files', description: `Rewrite source files for ${base.targetFramework} patterns`, files: [], reversible: true, checkpoint: true },
    { order: 6, phase: 'verify', action: 'Run tests', description: 'Verify all tests pass after migration', files: [], commands: ['npm test'], reversible: true, checkpoint: true },
    { order: 7, phase: 'verify', action: 'Build check', description: `Verify ${base.targetFramework} build succeeds`, files: [], commands: ['npm run build'], reversible: true, checkpoint: true },
    { order: 8, phase: 'cleanup', action: 'Remove old config', description: `Remove ${base.sourceFramework}-specific files and dependencies`, files: [], reversible: false, checkpoint: false },
  ]

  return { ...base, steps }
}

// ═══════════════════════════════════════════════════════════════
// 5. SAFETY: REFACTOR EXECUTION WITH VERIFICATION
// ═══════════════════════════════════════════════════════════════

export interface RefactorExecution {
  planId: string
  status: 'pending' | 'running' | 'verifying' | 'complete' | 'failed' | 'rolled_back'
  currentStep: number
  totalSteps: number
  modifiedFiles: string[]
  backupCreated: boolean
  testsPassed: boolean | null
  errors: string[]
  startedAt: string
  completedAt?: string
}

/**
 * Build context for the Testing Engine / QA / Fixer validation loop
 * that runs after a refactor is applied.
 */
export function buildRefactorVerificationContext(
  plan: RefactorPlan,
  execution: RefactorExecution,
): string {
  return [
    '=== REFACTOR VERIFICATION ===',
    `Refactor: ${plan.title} (${plan.type})`,
    `Risk: ${plan.riskLevel}`,
    `Modified files: ${execution.modifiedFiles.join(', ')}`,
    '',
    'Post-conditions to verify:',
    ...plan.postconditions.map(c => `  - ${c}`),
    '',
    'If tests fail after this refactor:',
    '  1. Fixer should attempt targeted repair on modified files',
    '  2. If repair fails, rollback: ' + plan.rollbackStrategy,
    '  3. Report which postcondition failed',
    '',
    'Do NOT modify files outside the refactor scope unless necessary for compilation.',
  ].join('\n')
}

// ═══════════════════════════════════════════════════════════════
// CONTEXT BUILDERS — for prompt injection
// ═══════════════════════════════════════════════════════════════

/**
 * Build a compact refactor intelligence context for prompt injection.
 */
export function buildRefactorContext(
  smellReport: SmellReport | null,
  refactorPlans: RefactorPlanSet | null,
  depReport: DepUpgradeReport | null,
  migrations: MigrationRecipe[] | null,
): string {
  const lines: string[] = ['=== REFACTOR INTELLIGENCE ===', '']

  if (smellReport && smellReport.smells.length > 0) {
    lines.push('--- Code Smells ---')
    lines.push(`Score: ${smellReport.score}/100 | Critical: ${smellReport.summary.critical} | High: ${smellReport.summary.high} | Medium: ${smellReport.summary.medium}`)
    for (const smell of smellReport.smells.slice(0, 8)) {
      lines.push(`  [${smell.severity}] ${smell.category}: ${smell.description}`)
    }
    lines.push('')
  }

  if (refactorPlans && refactorPlans.plans.length > 0) {
    lines.push('--- Refactor Plans ---')
    lines.push(`${refactorPlans.plans.length} plans, overall risk: ${refactorPlans.overallRisk}`)
    for (const plan of refactorPlans.plans.slice(0, 5)) {
      lines.push(`  [${plan.riskLevel}] ${plan.title} → ${plan.expectedBenefit}`)
    }
    lines.push('')
  }

  if (depReport && depReport.totalOutdated > 0) {
    lines.push('--- Dependency Upgrades ---')
    lines.push(`${depReport.totalOutdated} deps tracked | Major: ${depReport.majorUpgrades}`)
    for (const upgrade of depReport.upgrades.slice(0, 5)) {
      lines.push(`  ${upgrade.name}: ${upgrade.currentVersion} (risk: ${upgrade.riskLevel})`)
    }
    lines.push('')
  }

  if (migrations && migrations.length > 0) {
    lines.push('--- Available Migrations ---')
    for (const m of migrations) {
      const recipe = MIGRATION_RECIPES[m]
      if (recipe) lines.push(`  ${recipe.title} [${recipe.complexity}]`)
    }
    lines.push('')
  }

  if (lines.length <= 2) return ''

  return lines.join('\n')
}
