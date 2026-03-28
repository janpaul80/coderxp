/**
 * Security Audit Service — Sprint 19
 *
 * Comprehensive security analysis for generated workspaces.
 *
 * Capabilities:
 *   1. Secrets Detection — hardcoded API keys, passwords, tokens in generated code
 *   2. OWASP Top 10 Checks — XSS, injection, broken auth, sensitive data exposure
 *   3. Dependency Vulnerability Audit — run pnpm/npm audit and parse results
 *   4. Secure Defaults Enforcement — CSP headers, CORS config, rate limiting
 *   5. Compliance Hints — GDPR cookie consent, input validation
 *
 * Design principles:
 *   - Non-blocking: security issues emit warnings, never fail builds
 *   - Actionable: each finding includes a fix recommendation
 *   - Prioritized: findings are severity-ranked (critical, high, medium, low, info)
 *   - Machine-readable: output structured for both UI display and Fixer repair
 */

import { spawn } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'

// ─── Types ────────────────────────────────────────────────────

export type SecuritySeverity = 'critical' | 'high' | 'medium' | 'low' | 'info'

export interface SecurityFinding {
  /** Unique rule identifier */
  ruleId: string
  /** OWASP category or custom category */
  category: string
  /** Severity level */
  severity: SecuritySeverity
  /** Human-readable description */
  message: string
  /** File where the issue was found */
  filePath: string
  /** Line number (0 if unknown) */
  line: number
  /** Code snippet that triggered the finding */
  snippet: string
  /** Recommended fix */
  fix: string
}

export interface DependencyVulnerability {
  /** Package name */
  name: string
  /** Current version */
  version: string
  /** Vulnerability severity */
  severity: SecuritySeverity
  /** CVE or advisory ID */
  advisoryId: string
  /** Description */
  description: string
  /** Fixed version if available */
  fixedIn: string | null
}

export interface SecurityAuditReport {
  /** Code-level security findings */
  findings: SecurityFinding[]
  /** Dependency vulnerabilities */
  vulnerabilities: DependencyVulnerability[]
  /** Overall security score (0-100, higher = more secure) */
  securityScore: number
  /** Count by severity */
  counts: Record<SecuritySeverity, number>
  /** Files scanned */
  filesScanned: number
  /** Whether dependency audit was run */
  depAuditRun: boolean
  /** Repair context for Fixer agent */
  repairContext: string | null
  /** Timestamp */
  timestamp: Date
}

// ─── Secrets Detection ───────────────────────────────────────

const SECRET_PATTERNS: Array<{
  ruleId: string
  pattern: RegExp
  severity: SecuritySeverity
  message: string
  fix: string
}> = [
  {
    ruleId: 'SEC-001',
    pattern: /(?:api[_-]?key|apikey)\s*[:=]\s*['"][a-zA-Z0-9_\-]{20,}['"]/gi,
    severity: 'critical',
    message: 'Hardcoded API key detected',
    fix: 'Move to environment variable: import.meta.env.VITE_API_KEY',
  },
  {
    ruleId: 'SEC-002',
    pattern: /(?:password|passwd|pwd)\s*[:=]\s*['"][^'"]{4,}['"]/gi,
    severity: 'critical',
    message: 'Hardcoded password detected',
    fix: 'Never hardcode passwords. Use environment variables or a secrets manager.',
  },
  {
    ruleId: 'SEC-003',
    pattern: /(?:secret|token|auth)[_-]?(?:key|token)?\s*[:=]\s*['"][a-zA-Z0-9_\-]{16,}['"]/gi,
    severity: 'high',
    message: 'Potential hardcoded secret/token',
    fix: 'Move to environment variable. Never commit secrets to source code.',
  },
  {
    ruleId: 'SEC-004',
    pattern: /(?:sk-|pk_live_|sk_live_|ghp_|gho_|github_pat_|xoxb-|xoxp-|Bearer\s+)[a-zA-Z0-9_\-]{10,}/g,
    severity: 'critical',
    message: 'Known API token pattern detected (Stripe/GitHub/Slack/Bearer)',
    fix: 'Remove this token immediately. Rotate the credential and use environment variables.',
  },
  {
    ruleId: 'SEC-005',
    pattern: /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----/g,
    severity: 'critical',
    message: 'Private key embedded in source code',
    fix: 'Remove private key from source. Store in secure key management system.',
  },
  {
    ruleId: 'SEC-006',
    pattern: /(?:mongodb(?:\+srv)?|postgres(?:ql)?|mysql|redis):\/\/[^\s'"]+/gi,
    severity: 'high',
    message: 'Database connection string with potential credentials',
    fix: 'Move connection string to environment variable: DATABASE_URL',
  },
]

function scanForSecrets(content: string, filePath: string): SecurityFinding[] {
  const findings: SecurityFinding[] = []
  const lines = content.split('\n')

  for (const patternDef of SECRET_PATTERNS) {
    let match
    patternDef.pattern.lastIndex = 0 // Reset regex state
    while ((match = patternDef.pattern.exec(content))) {
      // Find line number
      const lineNum = content.slice(0, match.index).split('\n').length
      // Skip if it's in a comment
      const line = lines[lineNum - 1] ?? ''
      if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue
      // Skip if it's obviously a placeholder
      const snippet = match[0]
      if (snippet.includes('your_') || snippet.includes('REPLACE') ||
          snippet.includes('xxx') || snippet.includes('YOUR_')) continue

      findings.push({
        ruleId: patternDef.ruleId,
        category: 'Secrets',
        severity: patternDef.severity,
        message: patternDef.message,
        filePath,
        line: lineNum,
        snippet: snippet.slice(0, 80),
        fix: patternDef.fix,
      })
    }
  }

  return findings
}

// ─── OWASP Top 10 Checks ────────────────────────────────────

const OWASP_PATTERNS: Array<{
  ruleId: string
  category: string
  pattern: RegExp
  severity: SecuritySeverity
  message: string
  fix: string
  fileFilter?: RegExp
}> = [
  // A03: Injection
  {
    ruleId: 'OWASP-A03-001',
    category: 'Injection',
    pattern: /eval\s*\(/g,
    severity: 'critical',
    message: 'eval() usage — potential code injection',
    fix: 'Remove eval(). Use JSON.parse() for data, or Function constructor with validated input.',
  },
  {
    ruleId: 'OWASP-A03-002',
    category: 'Injection',
    pattern: /innerHTML\s*=/g,
    severity: 'high',
    message: 'Direct innerHTML assignment — XSS vulnerability',
    fix: 'Use textContent instead, or sanitize with DOMPurify before setting innerHTML.',
  },
  {
    ruleId: 'OWASP-A03-003',
    category: 'Injection',
    pattern: /dangerouslySetInnerHTML/g,
    severity: 'high',
    message: 'dangerouslySetInnerHTML — potential XSS',
    fix: 'Sanitize HTML with DOMPurify before using dangerouslySetInnerHTML.',
  },
  {
    ruleId: 'OWASP-A03-004',
    category: 'Injection',
    pattern: /document\.write\s*\(/g,
    severity: 'high',
    message: 'document.write() — injection risk and performance impact',
    fix: 'Use DOM manipulation methods instead (createElement, appendChild).',
  },
  {
    ruleId: 'OWASP-A03-005',
    category: 'Injection',
    pattern: /\$\{.*\}\s*(?:SELECT|INSERT|UPDATE|DELETE|DROP)/gi,
    severity: 'critical',
    message: 'Potential SQL injection via template literal',
    fix: 'Use parameterized queries or an ORM (Prisma, Drizzle). Never interpolate user input into SQL.',
  },

  // A02: Cryptographic Failures
  {
    ruleId: 'OWASP-A02-001',
    category: 'Cryptographic Failures',
    pattern: /(?:md5|sha1)\s*\(/gi,
    severity: 'medium',
    message: 'Weak hash function (MD5/SHA1) — not suitable for security',
    fix: 'Use bcrypt for passwords, SHA-256+ for integrity checks.',
  },
  {
    ruleId: 'OWASP-A02-002',
    category: 'Cryptographic Failures',
    pattern: /(?:localStorage|sessionStorage)\.setItem\s*\(\s*['"](?:token|jwt|auth|session|password)/gi,
    severity: 'medium',
    message: 'Sensitive data stored in localStorage/sessionStorage',
    fix: 'Use httpOnly cookies for auth tokens. localStorage is accessible to XSS attacks.',
  },

  // A05: Security Misconfiguration
  {
    ruleId: 'OWASP-A05-001',
    category: 'Security Misconfiguration',
    pattern: /cors\s*\(\s*\{?\s*origin\s*:\s*['"]?\*['"]?/gi,
    severity: 'medium',
    message: 'CORS allows all origins (*)',
    fix: 'Restrict CORS to specific allowed domains.',
  },
  {
    ruleId: 'OWASP-A05-002',
    category: 'Security Misconfiguration',
    pattern: /console\.(log|debug|trace)\s*\(/g,
    severity: 'low',
    message: 'Console logging in production code',
    fix: 'Remove console.log from production code or use a logging library with level control.',
  },

  // A07: Identification and Authentication Failures
  {
    ruleId: 'OWASP-A07-001',
    category: 'Authentication',
    pattern: /(?:jwt|token).*(?:verify|decode)\s*\([^)]*\{[^}]*algorithms?\s*:\s*\[\s*['"]none['"]/gi,
    severity: 'critical',
    message: 'JWT verification allows "none" algorithm',
    fix: 'Always specify a valid algorithm (HS256, RS256). Never allow "none".',
  },

  // A09: Security Logging and Monitoring Failures
  {
    ruleId: 'OWASP-A09-001',
    category: 'Logging',
    pattern: /catch\s*\([^)]*\)\s*\{\s*\}/g,
    severity: 'low',
    message: 'Empty catch block — errors silently swallowed',
    fix: 'Log errors in catch blocks. Silent failures hide security issues.',
  },

  // Input validation
  {
    ruleId: 'SEC-INPUT-001',
    category: 'Input Validation',
    pattern: /req\.(?:body|query|params)\.\w+/g,
    severity: 'info',
    message: 'Direct request input usage — ensure validation',
    fix: 'Validate all request inputs with zod, joi, or similar. Never trust user input.',
    fileFilter: /\.(ts|js)$/,
  },
]

function scanOwaspIssues(content: string, filePath: string): SecurityFinding[] {
  const findings: SecurityFinding[] = []
  const lines = content.split('\n')

  for (const check of OWASP_PATTERNS) {
    // Apply file filter if specified
    if (check.fileFilter && !check.fileFilter.test(filePath)) continue

    check.pattern.lastIndex = 0
    let match
    while ((match = check.pattern.exec(content))) {
      const lineNum = content.slice(0, match.index).split('\n').length
      const line = lines[lineNum - 1] ?? ''
      // Skip comments
      if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue

      findings.push({
        ruleId: check.ruleId,
        category: check.category,
        severity: check.severity,
        message: check.message,
        filePath,
        line: lineNum,
        snippet: match[0].slice(0, 80),
        fix: check.fix,
      })
    }
  }

  return findings
}

// ─── Dependency Audit ────────────────────────────────────────

/**
 * Run pnpm/npm audit and parse the results.
 * Non-blocking — returns empty array if audit fails.
 */
export function runDependencyAudit(workspacePath: string): Promise<DependencyVulnerability[]> {
  return new Promise((resolve) => {
    // Determine package manager
    const hasPnpmLock = fs.existsSync(path.join(workspacePath, 'pnpm-lock.yaml'))
    const cmd = hasPnpmLock ? 'pnpm' : 'npm'
    const args = cmd === 'pnpm'
      ? ['audit', '--json']
      : ['audit', '--json', '--production']

    let stdout = ''
    const child = spawn(cmd, args, {
      cwd: workspacePath,
      shell: true,
      env: { ...process.env, CI: 'true' },
    })

    child.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString()
    })

    // Timeout: 30 seconds
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL') } catch {}
      resolve([])
    }, 30_000)

    child.on('close', () => {
      clearTimeout(timer)
      resolve(parseAuditOutput(stdout, cmd))
    })

    child.on('error', () => {
      clearTimeout(timer)
      resolve([])
    })
  })
}

function parseAuditOutput(output: string, _cmd: string): DependencyVulnerability[] {
  const vulns: DependencyVulnerability[] = []

  try {
    const data = JSON.parse(output)

    // npm audit format
    if (data.vulnerabilities) {
      for (const [name, info] of Object.entries(data.vulnerabilities) as [string, any][]) {
        vulns.push({
          name,
          version: info.range ?? 'unknown',
          severity: mapNpmSeverity(info.severity),
          advisoryId: info.via?.[0]?.url ?? '',
          description: info.via?.[0]?.title ?? info.fixAvailable?.toString() ?? '',
          fixedIn: info.fixAvailable?.version ?? null,
        })
      }
    }

    // pnpm audit format
    if (data.advisories) {
      for (const [id, advisory] of Object.entries(data.advisories) as [string, any][]) {
        vulns.push({
          name: advisory.module_name ?? 'unknown',
          version: advisory.vulnerable_versions ?? 'unknown',
          severity: mapNpmSeverity(advisory.severity),
          advisoryId: id,
          description: advisory.title ?? '',
          fixedIn: advisory.patched_versions ?? null,
        })
      }
    }
  } catch {
    // Non-fatal — audit output may not be valid JSON
  }

  return vulns
}

function mapNpmSeverity(severity: string): SecuritySeverity {
  switch (severity?.toLowerCase()) {
    case 'critical': return 'critical'
    case 'high': return 'high'
    case 'moderate': return 'medium'
    case 'low': return 'low'
    default: return 'info'
  }
}

// ─── Secure Defaults Check ───────────────────────────────────

function checkSecureDefaults(workspacePath: string, fileTree: string[]): SecurityFinding[] {
  const findings: SecurityFinding[] = []

  // Check for .env in fileTree (should be .gitignored)
  const hasGitignore = fs.existsSync(path.join(workspacePath, '.gitignore'))
  if (hasGitignore) {
    const gitignore = fs.readFileSync(path.join(workspacePath, '.gitignore'), 'utf8')
    if (!gitignore.includes('.env')) {
      findings.push({
        ruleId: 'DEFAULTS-001',
        category: 'Secure Defaults',
        severity: 'high',
        message: '.env not in .gitignore — environment files may be committed',
        filePath: '.gitignore',
        line: 0,
        snippet: '',
        fix: 'Add .env, .env.local, .env.*.local to .gitignore',
      })
    }
  }

  // Check for CSP meta tag or helmet usage
  const indexHtml = fileTree.find(f => f === 'index.html' || f === 'public/index.html')
  if (indexHtml) {
    const htmlPath = path.join(workspacePath, indexHtml)
    if (fs.existsSync(htmlPath)) {
      const html = fs.readFileSync(htmlPath, 'utf8')
      if (!html.includes('Content-Security-Policy') && !html.includes('content-security-policy')) {
        findings.push({
          ruleId: 'DEFAULTS-002',
          category: 'Secure Defaults',
          severity: 'medium',
          message: 'No Content-Security-Policy header or meta tag',
          filePath: indexHtml,
          line: 0,
          snippet: '',
          fix: 'Add CSP meta tag: <meta http-equiv="Content-Security-Policy" content="default-src \'self\'; ...">',
        })
      }
    }
  }

  // Check for HTTPS enforcement hints
  const hasHttpRefs = fileTree.some(f => {
    if (!f.match(/\.(ts|tsx|js|jsx)$/)) return false
    const fullPath = path.join(workspacePath, f)
    if (!fs.existsSync(fullPath)) return false
    const content = fs.readFileSync(fullPath, 'utf8')
    return content.includes('http://') && !content.includes('http://localhost')
  })

  if (hasHttpRefs) {
    findings.push({
      ruleId: 'DEFAULTS-003',
      category: 'Secure Defaults',
      severity: 'medium',
      message: 'HTTP URLs found in source code (non-localhost)',
      filePath: '(multiple files)',
      line: 0,
      snippet: '',
      fix: 'Use HTTPS for all external URLs. Set up HSTS headers.',
    })
  }

  return findings
}

// ─── Score Calculation ───────────────────────────────────────

function calculateSecurityScore(findings: SecurityFinding[], vulns: DependencyVulnerability[]): number {
  let score = 100

  const severityPenalty: Record<SecuritySeverity, number> = {
    critical: 20,
    high: 10,
    medium: 5,
    low: 2,
    info: 0,
  }

  for (const f of findings) {
    score -= severityPenalty[f.severity]
  }

  for (const v of vulns) {
    score -= severityPenalty[v.severity]
  }

  return Math.max(0, Math.min(100, score))
}

// ─── Repair Context Generation ───────────────────────────────

function buildSecurityRepairContext(report: SecurityAuditReport): string | null {
  const criticalAndHigh = report.findings.filter(f =>
    f.severity === 'critical' || f.severity === 'high'
  )

  if (criticalAndHigh.length === 0) return null

  const lines = [
    'SECURITY ISSUES REQUIRING REPAIR:',
    `Total: ${report.counts.critical} critical, ${report.counts.high} high, ${report.counts.medium} medium`,
    '',
  ]

  for (const f of criticalAndHigh.slice(0, 10)) {
    lines.push(`[${f.severity.toUpperCase()}] ${f.ruleId}: ${f.message}`)
    lines.push(`  File: ${f.filePath}:${f.line}`)
    lines.push(`  Code: ${f.snippet}`)
    lines.push(`  Fix: ${f.fix}`)
    lines.push('')
  }

  lines.push('INSTRUCTIONS FOR REPAIR:')
  lines.push('- Fix critical issues first, then high severity')
  lines.push('- Move hardcoded secrets to environment variables (import.meta.env.VITE_*)')
  lines.push('- Replace innerHTML with textContent or DOMPurify')
  lines.push('- Use parameterized queries instead of string interpolation for SQL')
  lines.push('- Add input validation for all user-facing inputs')

  return lines.join('\n')
}

// ─── Main Orchestration ──────────────────────────────────────

/**
 * Full security audit pipeline:
 * 1. Scan all source files for secrets
 * 2. Run OWASP pattern checks
 * 3. Check secure defaults
 * 4. Run dependency audit
 * 5. Calculate score
 * 6. Build repair context
 */
export async function runSecurityAudit(
  workspacePath: string,
  fileTree: string[],
  onProgress?: (msg: string) => void
): Promise<SecurityAuditReport> {
  const allFindings: SecurityFinding[] = []
  let filesScanned = 0

  // Scan source files
  const sourceFiles = fileTree.filter(f => f.match(/\.(ts|tsx|js|jsx|json)$/))
  onProgress?.(`Scanning ${sourceFiles.length} source files for security issues...`)

  for (const relPath of sourceFiles) {
    const fullPath = path.join(workspacePath, relPath)
    if (!fs.existsSync(fullPath)) continue

    const content = fs.readFileSync(fullPath, 'utf8')
    filesScanned++

    // Secrets detection
    allFindings.push(...scanForSecrets(content, relPath))

    // OWASP checks (only for code files, not JSON)
    if (relPath.match(/\.(ts|tsx|js|jsx)$/)) {
      allFindings.push(...scanOwaspIssues(content, relPath))
    }
  }

  // Secure defaults check
  onProgress?.('Checking secure defaults...')
  allFindings.push(...checkSecureDefaults(workspacePath, fileTree))

  // Dependency audit
  onProgress?.('Running dependency vulnerability audit...')
  let depAuditRun = false
  let vulnerabilities: DependencyVulnerability[] = []
  if (fs.existsSync(path.join(workspacePath, 'node_modules'))) {
    vulnerabilities = await runDependencyAudit(workspacePath)
    depAuditRun = true
    onProgress?.(`Found ${vulnerabilities.length} dependency vulnerabilities`)
  }

  // Deduplicate findings (same rule + same file + same line)
  const deduped = deduplicateFindings(allFindings)

  // Count by severity
  const counts: Record<SecuritySeverity, number> = {
    critical: 0, high: 0, medium: 0, low: 0, info: 0,
  }
  for (const f of deduped) {
    counts[f.severity]++
  }

  // Calculate score
  const securityScore = calculateSecurityScore(deduped, vulnerabilities)
  onProgress?.(`Security score: ${securityScore}/100 (${counts.critical} critical, ${counts.high} high)`)

  const report: SecurityAuditReport = {
    findings: deduped,
    vulnerabilities,
    securityScore,
    counts,
    filesScanned,
    depAuditRun,
    repairContext: null,
    timestamp: new Date(),
  }

  report.repairContext = buildSecurityRepairContext(report)

  return report
}

function deduplicateFindings(findings: SecurityFinding[]): SecurityFinding[] {
  const seen = new Set<string>()
  return findings.filter(f => {
    const key = `${f.ruleId}:${f.filePath}:${f.line}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
