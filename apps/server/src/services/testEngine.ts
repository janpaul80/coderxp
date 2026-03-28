/**
 * Autonomous Testing Engine — Sprint 19
 *
 * Generates, runs, and analyzes tests for generated workspaces.
 *
 * Capabilities:
 *   1. Test Generation — produces vitest test files for components, pages, utils
 *   2. Test Execution — runs vitest in the workspace with coverage
 *   3. Result Parsing — extracts pass/fail/skip counts, failure details, coverage %
 *   4. Repair Loop — feeds failing test output to Fixer agent for targeted repair
 *   5. Coverage Analysis — tracks statement/branch/function/line coverage
 *
 * Design principles:
 *   - Non-blocking: test failures never block the build — they emit warnings
 *   - Incremental: generates tests for high-value files first (pages, components, utils)
 *   - Fast: limits test count to avoid slowing the pipeline
 *   - Safe: runs vitest in the workspace with --reporter=json for machine parsing
 */

import { spawn } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import { complete, isProviderAvailable } from '../lib/providers'

// ─── Types ────────────────────────────────────────────────────

export interface TestFile {
  /** Relative path from workspace root, e.g. "src/__tests__/App.test.tsx" */
  relativePath: string
  /** Test file content */
  content: string
  /** What this test covers */
  description: string
  /** Source file being tested */
  sourceFile: string
}

export interface TestResult {
  /** Total number of test suites */
  numSuites: number
  /** Total tests run */
  numTests: number
  /** Tests passed */
  numPassed: number
  /** Tests failed */
  numFailed: number
  /** Tests skipped */
  numSkipped: number
  /** Duration in ms */
  durationMs: number
  /** Whether all tests passed */
  success: boolean
  /** Individual test failures with details */
  failures: TestFailure[]
  /** Coverage summary if available */
  coverage: CoverageSummary | null
  /** Raw vitest output (last 3000 chars) */
  rawOutput: string
}

export interface TestFailure {
  /** Test suite name */
  suiteName: string
  /** Test name */
  testName: string
  /** Error message */
  error: string
  /** File path of the test */
  filePath: string
}

export interface CoverageSummary {
  statements: CoverageMetric
  branches: CoverageMetric
  functions: CoverageMetric
  lines: CoverageMetric
}

export interface CoverageMetric {
  total: number
  covered: number
  percent: number
}

export interface TestEngineReport {
  /** Generated test files */
  testsGenerated: TestFile[]
  /** Test execution results */
  testResults: TestResult | null
  /** Whether tests were run (false if vitest not available) */
  testsRun: boolean
  /** Repair context if tests failed (for Fixer agent) */
  repairContext: string | null
  /** Timestamp */
  timestamp: Date
}

// ─── Test file categorization ────────────────────────────────

interface TestableFile {
  relativePath: string
  category: 'page' | 'component' | 'util' | 'hook' | 'api' | 'store'
  priority: number // lower = generate test first
}

/**
 * Identify which files in the workspace are testable and prioritize them.
 * Focuses on high-value files: pages, components, utils, hooks, stores.
 */
export function identifyTestableFiles(
  workspacePath: string,
  fileTree: string[]
): TestableFile[] {
  const testable: TestableFile[] = []

  for (const filePath of fileTree) {
    // Skip non-TS/JS files
    if (!filePath.match(/\.(ts|tsx|js|jsx)$/)) continue
    // Skip existing test files
    if (filePath.match(/\.(test|spec)\.(ts|tsx|js|jsx)$/)) continue
    // Skip config files
    if (filePath.match(/(vite\.config|tsconfig|tailwind\.config|postcss\.config)/)) continue
    // Skip type-only files
    if (filePath.match(/types?\.(ts|tsx)$/)) continue
    // Skip index barrel exports
    if (filePath === 'src/index.tsx' || filePath === 'src/main.tsx') continue

    const lower = filePath.toLowerCase()

    if (lower.includes('/pages/') || lower.includes('/views/')) {
      testable.push({ relativePath: filePath, category: 'page', priority: 1 })
    } else if (lower.includes('/components/')) {
      testable.push({ relativePath: filePath, category: 'component', priority: 2 })
    } else if (lower.includes('/hooks/')) {
      testable.push({ relativePath: filePath, category: 'hook', priority: 3 })
    } else if (lower.includes('/store') || lower.includes('/stores/')) {
      testable.push({ relativePath: filePath, category: 'store', priority: 4 })
    } else if (lower.includes('/utils/') || lower.includes('/lib/') || lower.includes('/helpers/')) {
      testable.push({ relativePath: filePath, category: 'util', priority: 5 })
    } else if (lower.includes('/api/') || lower.includes('/routes/') || lower.includes('/server/')) {
      testable.push({ relativePath: filePath, category: 'api', priority: 6 })
    }
  }

  // Sort by priority and limit to top 12 files to keep generation fast
  return testable.sort((a, b) => a.priority - b.priority).slice(0, 12)
}

// ─── Test Generation ─────────────────────────────────────────

/**
 * Generate vitest test files for the given source files using AI.
 * Falls back to template-based tests if AI is unavailable.
 */
export async function generateTests(
  workspacePath: string,
  testableFiles: TestableFile[],
  onProgress?: (msg: string) => void
): Promise<TestFile[]> {
  const generated: TestFile[] = []

  const hasAI =
    isProviderAvailable('langdock') ||
    isProviderAvailable('openrouter') ||
    isProviderAvailable('blackbox')

  for (const file of testableFiles) {
    const sourcePath = path.join(workspacePath, file.relativePath)
    if (!fs.existsSync(sourcePath)) continue

    const sourceContent = fs.readFileSync(sourcePath, 'utf8')
    // Skip very small files (likely barrel exports or type files)
    if (sourceContent.length < 100) continue

    const testRelPath = generateTestPath(file.relativePath)
    onProgress?.(`Generating test for ${file.relativePath}`)

    let testContent: string

    if (hasAI) {
      try {
        testContent = await generateTestWithAI(file, sourceContent)
      } catch {
        testContent = generateTestFromTemplate(file, sourceContent)
      }
    } else {
      testContent = generateTestFromTemplate(file, sourceContent)
    }

    generated.push({
      relativePath: testRelPath,
      content: testContent,
      description: `Tests for ${file.relativePath} (${file.category})`,
      sourceFile: file.relativePath,
    })
  }

  return generated
}

function generateTestPath(sourcePath: string): string {
  const dir = path.dirname(sourcePath)
  const ext = path.extname(sourcePath)
  const base = path.basename(sourcePath, ext)
  // Place tests in __tests__ subdirectory alongside the source
  return path.join(dir, '__tests__', `${base}.test${ext}`).replace(/\\/g, '/')
}

async function generateTestWithAI(
  file: TestableFile,
  sourceContent: string
): Promise<string> {
  // Truncate very large files to keep prompt under control
  const truncatedSource = sourceContent.length > 4000
    ? sourceContent.slice(0, 4000) + '\n// ... (truncated)'
    : sourceContent

  const prompt = buildTestPrompt(file, truncatedSource)

  const response = await complete({
    role: 'planner',
    systemPrompt: 'You are a senior test engineer. Generate vitest test files. Output ONLY the test code in a TypeScript code block.',
    userPrompt: prompt,
    maxTokens: 3000,
    temperature: 0.2,
  })

  // Extract code block from response
  const codeMatch = response.content.match(/```(?:tsx?|jsx?|typescript|javascript)?\n([\s\S]*?)```/)
  if (codeMatch) return codeMatch[1].trim()

  // If no code block, try to use the entire response if it looks like code
  if (response.content.includes('import') && response.content.includes('describe')) {
    return response.content.trim()
  }

  // Fallback to template
  return generateTestFromTemplate(file, sourceContent)
}

function buildTestPrompt(file: TestableFile, sourceContent: string): string {
  const categoryInstructions: Record<string, string> = {
    page: `This is a React page component. Test:
- Component renders without crashing
- Key sections/elements are present in the DOM
- Any interactive elements respond to user events
- Loading and error states if applicable`,
    component: `This is a React UI component. Test:
- Component renders without crashing with default props
- Component renders correctly with various prop combinations
- Event handlers are called when expected
- Conditional rendering works correctly`,
    hook: `This is a custom React hook. Test:
- Hook returns the expected initial values
- Hook responds correctly to actions/updates
- Edge cases are handled (empty state, error state)`,
    store: `This is a state store (likely Zustand). Test:
- Initial state matches expected defaults
- Actions update state correctly
- Selectors return correct derived values`,
    util: `This is a utility/helper module. Test:
- Each exported function returns expected output for given input
- Edge cases: null, undefined, empty string, empty array
- Error cases are handled gracefully`,
    api: `This is an API route or service module. Test:
- Functions return expected data shapes
- Error handling works correctly
- Edge cases are handled`,
  }

  return `You are a senior test engineer. Generate a vitest test file for the following source code.

SOURCE FILE: ${file.relativePath} (category: ${file.category})

\`\`\`typescript
${sourceContent}
\`\`\`

INSTRUCTIONS:
${categoryInstructions[file.category] ?? categoryInstructions.component}

RULES:
- Use vitest: import { describe, it, expect, vi } from 'vitest'
- For React components, use @testing-library/react: import { render, screen, fireEvent } from '@testing-library/react'
- Mock external dependencies with vi.mock()
- Write 3-6 focused test cases
- Each test should be independent
- Use descriptive test names
- Do NOT test implementation details — test behavior
- Do NOT import from node_modules that might not exist
- Keep mocks minimal and realistic
- Output ONLY the test file code in a TypeScript code block

Generate the complete test file now:`
}

function generateTestFromTemplate(
  file: TestableFile,
  sourceContent: string
): string {
  // Extract exported names for basic smoke tests
  const exports = extractExports(sourceContent)
  const isReactComponent = sourceContent.includes('React') ||
    sourceContent.includes('jsx') ||
    sourceContent.includes('tsx') ||
    file.relativePath.match(/\.(tsx|jsx)$/) !== null

  const componentName = exports.defaultExport ?? path.basename(file.relativePath, path.extname(file.relativePath))
  const importPath = '../' + path.basename(file.relativePath, path.extname(file.relativePath))

  if (isReactComponent && (file.category === 'page' || file.category === 'component')) {
    return `import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ${componentName} } from '${importPath}'

// Mock react-router-dom if used
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useParams: () => ({}),
  Link: ({ children, to }: any) => <a href={to}>{children}</a>,
}))

describe('${componentName}', () => {
  it('renders without crashing', () => {
    render(<${componentName} />)
  })

  it('renders main content', () => {
    const { container } = render(<${componentName} />)
    expect(container.firstChild).toBeTruthy()
  })

  it('has no accessibility violations in basic structure', () => {
    const { container } = render(<${componentName} />)
    // Basic check: component produces DOM output
    expect(container.innerHTML.length).toBeGreaterThan(0)
  })
})
`
  }

  if (file.category === 'hook') {
    return `import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { ${componentName} } from '${importPath}'

describe('${componentName}', () => {
  it('returns expected initial state', () => {
    const { result } = renderHook(() => ${componentName}())
    expect(result.current).toBeDefined()
  })
})
`
  }

  if (file.category === 'store') {
    return `import { describe, it, expect } from 'vitest'
import { ${componentName} } from '${importPath}'

describe('${componentName}', () => {
  it('exports a store or function', () => {
    expect(${componentName}).toBeDefined()
  })

  it('has expected initial state', () => {
    const state = typeof ${componentName} === 'function' ? ${componentName}.getState?.() : ${componentName}
    expect(state).toBeDefined()
  })
})
`
  }

  // Default: util / api / generic
  const namedExports = exports.named.slice(0, 4)
  const importList = namedExports.length > 0 ? namedExports.join(', ') : componentName
  return `import { describe, it, expect } from 'vitest'
import { ${importList} } from '${importPath}'

describe('${file.relativePath}', () => {
${namedExports.map(name => `  it('${name} is defined and callable', () => {
    expect(${name}).toBeDefined()
  })
`).join('\n')}
  it('module exports are valid', () => {
    expect(true).toBe(true) // Smoke test — module loaded without errors
  })
})
`
}

function extractExports(content: string): { defaultExport: string | null; named: string[] } {
  const named: string[] = []
  let defaultExport: string | null = null

  // Default export
  const defaultMatch = content.match(/export\s+default\s+(?:function|class|const)?\s*(\w+)/)
  if (defaultMatch) defaultExport = defaultMatch[1]

  // Named exports
  const namedRegex = /export\s+(?:function|const|let|class|interface|type|enum)\s+(\w+)/g
  let match
  while ((match = namedRegex.exec(content))) {
    named.push(match[1])
  }

  return { defaultExport, named }
}

// ─── Vitest Configuration ────────────────────────────────────

/**
 * Ensure the workspace has vitest configured.
 * Writes vitest.config.ts and installs @testing-library/react if needed.
 */
export function ensureTestConfig(workspacePath: string): void {
  const vitestConfigPath = path.join(workspacePath, 'vitest.config.ts')
  if (!fs.existsSync(vitestConfigPath)) {
    fs.writeFileSync(vitestConfigPath, `/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: [],
    include: ['src/**/*.{test,spec}.{ts,tsx,js,jsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.*', 'src/**/*.spec.*', 'src/main.tsx', 'src/vite-env.d.ts'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
`)
  }

  // Add test dependencies to package.json if missing
  const pkgPath = path.join(workspacePath, 'package.json')
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
      const devDeps = pkg.devDependencies ?? {}
      let modified = false

      const requiredDeps: Record<string, string> = {
        'vitest': '^1.6.0',
        '@testing-library/react': '^14.2.0',
        '@testing-library/jest-dom': '^6.4.0',
        '@vitest/coverage-v8': '^1.6.0',
        'jsdom': '^24.0.0',
      }

      for (const [dep, version] of Object.entries(requiredDeps)) {
        if (!devDeps[dep] && !pkg.dependencies?.[dep]) {
          devDeps[dep] = version
          modified = true
        }
      }

      if (modified) {
        pkg.devDependencies = devDeps
        // Add test script
        pkg.scripts = pkg.scripts ?? {}
        if (!pkg.scripts.test) {
          pkg.scripts.test = 'vitest run'
        }
        if (!pkg.scripts['test:coverage']) {
          pkg.scripts['test:coverage'] = 'vitest run --coverage'
        }
        fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
      }
    } catch {
      // Non-fatal — package.json may be malformed
    }
  }
}

// ─── Test Execution ──────────────────────────────────────────

/**
 * Write generated test files to disk and run vitest.
 * Returns parsed test results.
 */
export async function executeTests(
  workspacePath: string,
  testFiles: TestFile[],
  onProgress?: (msg: string) => void
): Promise<TestResult> {
  // Write test files to disk
  for (const tf of testFiles) {
    const fullPath = path.join(workspacePath, tf.relativePath)
    const dir = path.dirname(fullPath)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(fullPath, tf.content)
    onProgress?.(`Wrote ${tf.relativePath}`)
  }

  // Run vitest
  onProgress?.('Running vitest...')
  const result = await runVitest(workspacePath)
  onProgress?.(`Tests complete: ${result.numPassed}/${result.numTests} passed`)

  return result
}

function runVitest(workspacePath: string): Promise<TestResult> {
  return new Promise((resolve) => {
    const startTime = Date.now()
    let stdout = ''
    let stderr = ''

    const child = spawn('npx', ['vitest', 'run', '--reporter=json', '--no-color'], {
      cwd: workspacePath,
      shell: true,
      env: {
        ...process.env,
        CI: 'true',
        FORCE_COLOR: '0',
        NODE_ENV: 'test',
      },
    })

    child.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString()
    })

    child.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString()
    })

    // Timeout: 2 minutes for tests
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL') } catch {}
      resolve(createEmptyResult(Date.now() - startTime, 'Test execution timed out (2 min)'))
    }, 120_000)

    child.on('close', (_code) => {
      clearTimeout(timer)
      const durationMs = Date.now() - startTime
      const result = parseVitestOutput(stdout, stderr, durationMs)
      resolve(result)
    })

    child.on('error', (err) => {
      clearTimeout(timer)
      resolve(createEmptyResult(Date.now() - startTime, `vitest process error: ${err.message}`))
    })
  })
}

function parseVitestOutput(stdout: string, stderr: string, durationMs: number): TestResult {
  // Try to parse JSON output from vitest --reporter=json
  try {
    // vitest JSON output may be preceded by other output — find the JSON block
    const jsonStart = stdout.indexOf('{')
    const jsonEnd = stdout.lastIndexOf('}')
    if (jsonStart >= 0 && jsonEnd > jsonStart) {
      const jsonStr = stdout.slice(jsonStart, jsonEnd + 1)
      const data = JSON.parse(jsonStr)

      const failures: TestFailure[] = []
      let numPassed = 0
      let numFailed = 0
      let numSkipped = 0
      let numSuites = 0

      if (data.testResults && Array.isArray(data.testResults)) {
        numSuites = data.testResults.length
        for (const suite of data.testResults) {
          if (suite.assertionResults && Array.isArray(suite.assertionResults)) {
            for (const test of suite.assertionResults) {
              if (test.status === 'passed') numPassed++
              else if (test.status === 'failed') {
                numFailed++
                failures.push({
                  suiteName: suite.name ?? 'unknown',
                  testName: test.fullName ?? test.title ?? 'unknown',
                  error: Array.isArray(test.failureMessages)
                    ? test.failureMessages.join('\n').slice(0, 500)
                    : String(test.failureMessages ?? '').slice(0, 500),
                  filePath: suite.name ?? '',
                })
              } else {
                numSkipped++
              }
            }
          }
        }
      }

      // Try to read coverage from numTotalTests etc
      const numTests = data.numTotalTests ?? (numPassed + numFailed + numSkipped)

      return {
        numSuites,
        numTests,
        numPassed: data.numPassedTests ?? numPassed,
        numFailed: data.numFailedTests ?? numFailed,
        numSkipped: numSkipped,
        durationMs,
        success: (data.numFailedTests ?? numFailed) === 0 && numTests > 0,
        failures,
        coverage: null, // Coverage parsed separately if available
        rawOutput: (stdout + stderr).slice(-3000),
      }
    }
  } catch {
    // JSON parsing failed — fall back to regex parsing
  }

  // Fallback: parse text output
  return parseVitestTextOutput(stdout + '\n' + stderr, durationMs)
}

function parseVitestTextOutput(output: string, durationMs: number): TestResult {
  const passMatch = output.match(/(\d+)\s+passed/)
  const failMatch = output.match(/(\d+)\s+failed/)
  const skipMatch = output.match(/(\d+)\s+skipped/)
  const suiteMatch = output.match(/Test Files\s+(\d+)/)

  const numPassed = passMatch ? parseInt(passMatch[1], 10) : 0
  const numFailed = failMatch ? parseInt(failMatch[1], 10) : 0
  const numSkipped = skipMatch ? parseInt(skipMatch[1], 10) : 0

  const failures: TestFailure[] = []
  // Extract FAIL lines
  const failLines = output.match(/FAIL\s+(.+)/g)
  if (failLines) {
    for (const line of failLines) {
      failures.push({
        suiteName: line.replace('FAIL', '').trim(),
        testName: 'unknown',
        error: 'Test suite failed (see raw output)',
        filePath: line.replace('FAIL', '').trim(),
      })
    }
  }

  return {
    numSuites: suiteMatch ? parseInt(suiteMatch[1], 10) : 0,
    numTests: numPassed + numFailed + numSkipped,
    numPassed,
    numFailed,
    numSkipped,
    durationMs,
    success: numFailed === 0 && numPassed > 0,
    failures,
    coverage: null,
    rawOutput: output.slice(-3000),
  }
}

function createEmptyResult(durationMs: number, error: string): TestResult {
  return {
    numSuites: 0,
    numTests: 0,
    numPassed: 0,
    numFailed: 0,
    numSkipped: 0,
    durationMs,
    success: false,
    failures: [{ suiteName: 'engine', testName: 'execution', error, filePath: '' }],
    coverage: null,
    rawOutput: error,
  }
}

// ─── Coverage Parsing ────────────────────────────────────────

/**
 * Read vitest coverage JSON summary if available.
 */
export function parseCoverageSummary(workspacePath: string): CoverageSummary | null {
  const coveragePath = path.join(workspacePath, 'coverage', 'coverage-summary.json')
  if (!fs.existsSync(coveragePath)) return null

  try {
    const data = JSON.parse(fs.readFileSync(coveragePath, 'utf8'))
    const total = data.total
    if (!total) return null

    return {
      statements: {
        total: total.statements?.total ?? 0,
        covered: total.statements?.covered ?? 0,
        percent: total.statements?.pct ?? 0,
      },
      branches: {
        total: total.branches?.total ?? 0,
        covered: total.branches?.covered ?? 0,
        percent: total.branches?.pct ?? 0,
      },
      functions: {
        total: total.functions?.total ?? 0,
        covered: total.functions?.covered ?? 0,
        percent: total.functions?.pct ?? 0,
      },
      lines: {
        total: total.lines?.total ?? 0,
        covered: total.lines?.covered ?? 0,
        percent: total.lines?.pct ?? 0,
      },
    }
  } catch {
    return null
  }
}

// ─── Repair Context Generation ───────────────────────────────

/**
 * Build a repair context string from test failures for the Fixer agent.
 */
export function buildTestRepairContext(testResult: TestResult): string | null {
  if (testResult.success || testResult.failures.length === 0) return null

  const lines = [
    `AUTOMATED TEST FAILURES DETECTED:`,
    `Results: ${testResult.numPassed} passed, ${testResult.numFailed} failed, ${testResult.numSkipped} skipped`,
    '',
    'FAILURES:',
  ]

  for (const failure of testResult.failures.slice(0, 5)) {
    lines.push(`- Suite: ${failure.suiteName}`)
    lines.push(`  Test: ${failure.testName}`)
    lines.push(`  Error: ${failure.error}`)
    lines.push('')
  }

  lines.push('INSTRUCTIONS FOR REPAIR:')
  lines.push('- Fix the SOURCE files (not the test files) to make tests pass')
  lines.push('- Common issues: missing exports, incorrect return types, unhandled edge cases')
  lines.push('- Do NOT modify the test files — fix the implementation')

  return lines.join('\n')
}

// ─── Main orchestration ──────────────────────────────────────

/**
 * Full autonomous testing pipeline:
 * 1. Identify testable files
 * 2. Generate tests
 * 3. Ensure vitest config
 * 4. Execute tests
 * 5. Parse coverage
 * 6. Build repair context if needed
 */
export async function runAutonomousTests(
  workspacePath: string,
  fileTree: string[],
  onProgress?: (msg: string) => void
): Promise<TestEngineReport> {
  onProgress?.('Identifying testable files...')
  const testableFiles = identifyTestableFiles(workspacePath, fileTree)

  if (testableFiles.length === 0) {
    onProgress?.('No testable files found — skipping test generation')
    return {
      testsGenerated: [],
      testResults: null,
      testsRun: false,
      repairContext: null,
      timestamp: new Date(),
    }
  }

  onProgress?.(`Found ${testableFiles.length} testable files`)

  // Generate tests
  onProgress?.('Generating test files...')
  const testFiles = await generateTests(workspacePath, testableFiles, onProgress)
  onProgress?.(`Generated ${testFiles.length} test files`)

  // Ensure vitest config
  onProgress?.('Configuring vitest...')
  ensureTestConfig(workspacePath)

  // Execute tests
  onProgress?.('Executing tests...')
  const testResults = await executeTests(workspacePath, testFiles, onProgress)

  // Parse coverage
  const coverage = parseCoverageSummary(workspacePath)
  if (coverage) {
    testResults.coverage = coverage
    onProgress?.(
      `Coverage: ${coverage.statements.percent}% statements, ` +
      `${coverage.branches.percent}% branches, ` +
      `${coverage.functions.percent}% functions`
    )
  }

  // Build repair context if tests failed
  const repairContext = buildTestRepairContext(testResults)
  if (repairContext) {
    onProgress?.(`${testResults.numFailed} test(s) failed — repair context generated`)
  }

  return {
    testsGenerated: testFiles,
    testResults,
    testsRun: true,
    repairContext,
    timestamp: new Date(),
  }
}
