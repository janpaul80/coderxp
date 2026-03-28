/**
 * codeQualityMetrics.ts — Code Quality Scoring Service (Sprint 17)
 * 
 * Calculates 8 core code quality metrics for TypeScript/React projects:
 * 1. Cyclomatic Complexity (McCabe)
 * 2. Maintainability Index
 * 3. Cognitive Complexity
 * 4. Code Duplication %
 * 5. Function Length (avg/max lines)
 * 6. Comment Ratio
 * 7. Security Hotspots
 * 8. Overall Quality Score (0-100)
 */

import * as fs from 'fs'
import * as path from 'path'

export interface CodeQualityMetrics {
  overallScore: number // 0-100, higher is better
  cyclomaticComplexity: { avg: number; max: number; functions: number }
  maintainabilityIndex: number // 0-171, higher is better
  cognitiveComplexity: { avg: number; max: number }
  duplicationPercent: number
  avgFunctionLength: number
  maxFunctionLength: number
  commentRatio: number // 0-1, higher is better
  securityHotspots: number
  warnings: string[]
}

export interface CodeQualityReport {
  projectId: string
  jobId: string
  score: number
  metrics: CodeQualityMetrics
  filesAnalyzed: number
  timestamp: Date
  baselineScore?: number // Previous build score for trend analysis
}

export interface QualityThresholds {
  overallScore: number // < 70 triggers warning
  cyclomaticMax: number // > 12 triggers warning
  duplication: number // > 15% triggers warning
  securityHotspots: number // > 3 triggers warning
}

export const DEFAULT_THRESHOLDS: QualityThresholds = {
  overallScore: 70,
  cyclomaticMax: 12,
  duplication: 15,
  securityHotspots: 3,
}

export function calculateQualityMetrics(
  workspacePath: string,
  filePaths: string[],
  thresholds: QualityThresholds = DEFAULT_THRESHOLDS
): CodeQualityReport {
  const metrics: CodeQualityMetrics = {
    overallScore: 85,
    cyclomaticComplexity: { avg: 0, max: 0, functions: 0 },
    maintainabilityIndex: 0,
    cognitiveComplexity: { avg: 0, max: 0 },
    duplicationPercent: 0,
    avgFunctionLength: 0,
    maxFunctionLength: 0,
    commentRatio: 0,
    securityHotspots: 0,
    warnings: [],
  }

  let totalFunctions = 0
  let totalLines = 0
  let totalComments = 0
  let totalCyclomatic = 0
  let securityIssues = 0
  const duplicateBlocks: string[] = []

  for (const relativePath of filePaths) {
    const filePath = path.join(workspacePath, relativePath)
    if (!fs.existsSync(filePath)) continue

    const content = fs.readFileSync(filePath, 'utf8')
    const lines = content.split('\n')
    
    // Skip non-TS/JS files
    if (!relativePath.match(/\.(ts|tsx|js|jsx)$/)) continue

    // Parse functions and complexity
    const functions = parseFunctions(content)
    const fileCyclomatic = calculateCyclomatic(content)
    const cognitive = calculateCognitiveComplexity(content)
    
    totalFunctions += functions.length
    totalCyclomatic += fileCyclomatic
    metrics.cyclomaticComplexity.max = Math.max(metrics.cyclomaticComplexity.max, fileCyclomatic)
    metrics.cognitiveComplexity.max = Math.max(metrics.cognitiveComplexity.max, cognitive)

    // Line counts and comments
    let commentLines = 0
    for (const line of lines) {
      totalLines++
      if (line.trim().startsWith('//') || line.includes('/*')) commentLines++
    }
    totalComments += commentLines

    // Function length analysis
    const avgFuncLength = functions.reduce((sum, f) => sum + f.lines.length, 0) / functions.length || 0
    metrics.avgFunctionLength += avgFuncLength * functions.length
    metrics.maxFunctionLength = Math.max(metrics.maxFunctionLength, Math.max(...functions.map(f => f.lines.length)))

    // Security hotspots (basic regex scan)
    securityIssues += scanSecurityHotspots(content)
  }

  // Calculate averages
  metrics.cyclomaticComplexity.avg = totalCyclomatic / Math.max(totalFunctions, 1)
  metrics.cognitiveComplexity.avg = totalCyclomatic / Math.max(totalFunctions, 1) // Proxy
  metrics.avgFunctionLength /= Math.max(totalFunctions, 1)
  metrics.commentRatio = totalComments / Math.max(totalLines, 1)
  metrics.securityHotspots = securityIssues

  // Duplication analysis (simple token-based)
  metrics.duplicationPercent = calculateDuplication(filePaths.map(p => path.join(workspacePath, p)))

  // Maintainability Index (Halstead-based approximation)
  metrics.maintainabilityIndex = calculateMaintainabilityIndex(totalLines, totalFunctions, totalCyclomatic)

  // Overall score (weighted)
  metrics.overallScore = Math.round(
    0.3 * (100 - metrics.cyclomaticComplexity.avg * 5) +
    0.25 * metrics.maintainabilityIndex +
    0.2 * (100 - metrics.duplicationPercent) +
    0.15 * (metrics.commentRatio * 100) +
    0.1 * (100 - metrics.securityHotspots * 5)
  )

  // Threshold warnings
  const report: CodeQualityReport = {
    projectId: '',
    jobId: '',
    score: metrics.overallScore,
    metrics,
    filesAnalyzed: filePaths.length,
    timestamp: new Date(),
  }

  checkThresholds(report, thresholds)

  return report
}

function parseFunctions(content: string): { lines: string[]; complexity: number }[] {
  // Simple regex for function/method detection
  const funcRegex = /(?:function|const|let)\s+(\w+)\s*\(|(?:async\s+)?(?:function|const|let)\s+(\w+)\s*=\s*\(|\w+\s*:\s*(?:async\s+)?\([^\)]*\)\s*=>/g
  const functions: { lines: string[]; complexity: number }[] = []
  let match
  while ((match = funcRegex.exec(content))) {
    functions.push({ lines: [], complexity: 1 })
  }
  return functions
}

function calculateCyclomatic(content: string): number {
  const complexityTokens = ['if', 'else', 'for', 'while', 'do', 'switch', 'case', '&&', '||', 'catch']
  return complexityTokens.reduce((count, token) => count + (content.match(new RegExp(token, 'g'))?.length || 0), 1)
}

function calculateCognitiveComplexity(content: string): number {
  // Simplified cognitive complexity (nested control flow)
  const cognitiveTokens = ['if', 'else', 'for', 'while', '&&', '||']
  return cognitiveTokens.reduce((count, token) => count + (content.match(new RegExp(token, 'g'))?.length || 0), 0)
}

function calculateMaintainabilityIndex(lines: number, functions: number, cyclomatic: number): number {
  // Simplified Halstead MI approximation
  const volume = lines * Math.log2(lines) 
  const difficulty = cyclomatic / Math.max(functions, 1)
  const mi = 171 - 5.2 * Math.log(volume) - 0.23 * difficulty - 16.2 * Math.log(functions)
  return Math.max(0, Math.min(171, mi))
}

function calculateDuplication(filePaths: string[]): number {
  // Simple token-based duplication detection
  const tokens = new Map<string, number>()
  let totalTokenCount = 0
  for (const filePath of filePaths) {
    const content = fs.readFileSync(filePath, 'utf8')
    const fileTokens = content.match(/[\w_][\w\d_]*|[^\w\s]/g) || []
    totalTokenCount += fileTokens.length
    for (const token of fileTokens) {
      tokens.set(token, (tokens.get(token) || 0) + 1)
    }
  }
  // Duplication = tokens appearing 3+ times as percentage
  const duplicateTokenCount = Array.from(tokens.values()).filter(count => count >= 3).reduce((a, b) => a + b, 0)
  return (duplicateTokenCount / Math.max(totalTokenCount, 1)) * 100
}

function scanSecurityHotspots(content: string): number {
  const hotspots = [
    /eval\s*\(/g,
    /document\.(write|writeln)\(/g,
    /innerHTML\s*=?\s*/g,
    /dangerouslySetInnerHTML/g,
    /process\.(env|argv)/g,
    /console\.(log|debug)/g
  ]
  return hotspots.reduce((count, regex) => count + (content.match(regex)?.length || 0), 0)
}

function checkThresholds(report: CodeQualityReport, thresholds: QualityThresholds): string[] {
  const warnings: string[] = []
  if (report.metrics.overallScore < thresholds.overallScore) {
    warnings.push(`Overall score ${report.metrics.overallScore} below threshold ${thresholds.overallScore}`)
  }
  if (report.metrics.cyclomaticComplexity.max > thresholds.cyclomaticMax) {
    warnings.push(`Max cyclomatic complexity ${report.metrics.cyclomaticComplexity.max} exceeds ${thresholds.cyclomaticMax}`)
  }
  if (report.metrics.duplicationPercent > thresholds.duplication) {
    warnings.push(`Duplication ${report.metrics.duplicationPercent.toFixed(1)}% exceeds ${thresholds.duplication}%`)
  }
  if (report.metrics.securityHotspots > thresholds.securityHotspots) {
    warnings.push(`Security hotspots ${report.metrics.securityHotspots} exceeds ${thresholds.securityHotspots}`)
  }
  report.metrics.warnings = warnings
  return warnings
}

// Export for integration with builderQueue.ts
export function shouldTriggerRepair(metrics: CodeQualityMetrics): boolean {
  return metrics.overallScore < 70 || 
         metrics.cyclomaticComplexity.max > 15 ||
         metrics.duplicationPercent > 20 ||
         metrics.securityHotspots > 5
}

export function generateRepairContext(report: CodeQualityReport): string {
  const issues = report.metrics.warnings.join('\n')
  return `CODE QUALITY ISSUES DETECTED:\n${issues}\n\nTARGETED METRICS:\n` +
         `Overall: ${report.metrics.overallScore}/100\n` +
         `Cyclomatic Max: ${report.metrics.cyclomaticComplexity.max}\n` +
         `Duplication: ${report.metrics.duplicationPercent.toFixed(1)}%\n` +
         `Security Hotspots: ${report.metrics.securityHotspots}`
}

