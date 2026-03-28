/**
 * previewErrorParser.ts — Sprint 15
 *
 * Parses Vite/npm error output to extract structured error info:
 *   - Affected file path
 *   - Error type (syntax, import, module-not-found, type-error, config)
 *   - Error message
 *   - Line/column if available
 *
 * Used by builderQueue to drive preview error auto-recovery.
 */

// ─── Types ────────────────────────────────────────────────────

export type PreviewErrorType =
  | 'syntax'
  | 'import-resolution'
  | 'module-not-found'
  | 'type-error'
  | 'jsx-error'
  | 'config-error'
  | 'dependency-error'
  | 'unknown'

export interface ParsedPreviewError {
  file: string           // relative path, e.g. "src/pages/Dashboard.tsx"
  errorType: PreviewErrorType
  message: string        // human-readable error description
  line?: number
  column?: number
  raw: string            // original error text that was parsed
}

// ─── Main parser ──────────────────────────────────────────────

/**
 * Parses collected log/stderr lines from a failed preview attempt.
 * Returns structured errors with affected file paths.
 *
 * Handles common Vite error patterns:
 *   - "Failed to resolve import "X" from "src/Y.tsx""
 *   - "SyntaxError: ... (line:col)"
 *   - "[plugin:vite:react-babel] ... /path/to/file.tsx: ..."
 *   - "error TS1234: ..."
 *   - "Module "X" has no exported member "Y""
 *   - "Cannot find module 'X'"
 *   - "X is not defined"
 */
export function parsePreviewErrors(logLines: string[]): ParsedPreviewError[] {
  const errors: ParsedPreviewError[] = []
  const seen = new Set<string>() // dedupe by file+message

  for (let i = 0; i < logLines.length; i++) {
    const line = logLines[i]
    const parsed = parseSingleLine(line, logLines, i)
    if (parsed) {
      for (const err of parsed) {
        const key = `${err.file}::${err.message.slice(0, 80)}`
        if (!seen.has(key)) {
          seen.add(key)
          errors.push(err)
        }
      }
    }
  }

  return errors
}

// ─── Individual pattern matchers ──────────────────────────────

function parseSingleLine(
  line: string,
  allLines: string[],
  index: number
): ParsedPreviewError[] | null {
  return (
    parseViteImportResolution(line) ??
    parseViteBabelPlugin(line) ??
    parseSyntaxError(line, allLines, index) ??
    parseTypeScriptError(line) ??
    parseModuleNotFound(line) ??
    parseCannotFindModule(line) ??
    parseNotDefined(line, allLines, index) ??
    parseViteInternalError(line) ??
    null
  )
}

/**
 * Pattern: Failed to resolve import "X" from "src/Y.tsx"
 * Also: [vite] Internal server error: Failed to resolve import ...
 */
function parseViteImportResolution(line: string): ParsedPreviewError[] | null {
  const match = line.match(
    /Failed to resolve import ["']([^"']+)["'] from ["']([^"']+)["']/
  )
  if (!match) return null

  const [, importPath, fromFile] = match
  return [{
    file: normalizeFilePath(fromFile),
    errorType: 'import-resolution',
    message: `Failed to resolve import "${importPath}" from "${fromFile}"`,
    raw: line,
  }]
}

/**
 * Pattern: [plugin:vite:react-babel] /abs/path/src/file.tsx: Unexpected token (12:5)
 * Also: [plugin:vite:esbuild] ...
 */
function parseViteBabelPlugin(line: string): ParsedPreviewError[] | null {
  const match = line.match(
    /\[plugin:vite:[^\]]+\]\s+(?:[A-Za-z]:)?[/\\].*?[/\\](src[/\\][^\s:]+)(?::?\s+(.+))?/
  )
  if (!match) return null

  const [, filePath, errorMsg] = match
  const locMatch = errorMsg?.match(/\((\d+):(\d+)\)/)

  return [{
    file: normalizeFilePath(filePath),
    errorType: errorMsg?.toLowerCase().includes('unexpected token') ? 'syntax' : 'jsx-error',
    message: errorMsg?.trim() ?? 'Vite plugin error',
    line: locMatch ? parseInt(locMatch[1], 10) : undefined,
    column: locMatch ? parseInt(locMatch[2], 10) : undefined,
    raw: line,
  }]
}

/**
 * Pattern: SyntaxError: /abs/path/src/file.tsx: Unexpected token (12:5)
 * Also: SyntaxError: Unexpected token ... at file.tsx:12:5
 */
function parseSyntaxError(
  line: string,
  allLines: string[],
  index: number
): ParsedPreviewError[] | null {
  // Pattern 1: SyntaxError with file path
  const match1 = line.match(
    /SyntaxError:\s+(?:[A-Za-z]:)?[/\\].*?[/\\](src[/\\][^\s:]+):\s+(.+)/
  )
  if (match1) {
    const [, filePath, msg] = match1
    const locMatch = msg.match(/\((\d+):(\d+)\)/)
    return [{
      file: normalizeFilePath(filePath),
      errorType: 'syntax',
      message: `SyntaxError: ${msg}`,
      line: locMatch ? parseInt(locMatch[1], 10) : undefined,
      column: locMatch ? parseInt(locMatch[2], 10) : undefined,
      raw: line,
    }]
  }

  // Pattern 2: Generic SyntaxError — look at surrounding lines for file context
  if (line.includes('SyntaxError:')) {
    const fileFromContext = findFileInContext(allLines, index)
    if (fileFromContext) {
      return [{
        file: fileFromContext,
        errorType: 'syntax',
        message: line.trim(),
        raw: line,
      }]
    }
  }

  return null
}

/**
 * Pattern: error TS1234: Message
 * Also: src/file.tsx(12,5): error TS1234: Message
 */
function parseTypeScriptError(line: string): ParsedPreviewError[] | null {
  const match = line.match(
    /(src[/\\][^\s(]+)\((\d+),(\d+)\):\s+error\s+TS\d+:\s+(.+)/
  )
  if (match) {
    const [, filePath, lineNum, col, msg] = match
    return [{
      file: normalizeFilePath(filePath),
      errorType: 'type-error',
      message: msg.trim(),
      line: parseInt(lineNum, 10),
      column: parseInt(col, 10),
      raw: line,
    }]
  }

  // Looser pattern: error TS... without file path
  const looseMatch = line.match(/error\s+TS(\d+):\s+(.+)/)
  if (looseMatch) {
    return [{
      file: 'unknown',
      errorType: 'type-error',
      message: looseMatch[2].trim(),
      raw: line,
    }]
  }

  return null
}

/**
 * Pattern: Module '"react-router-dom"' has no exported member 'X'
 * Also: Module not found: Error: Can't resolve 'X' in '/path/to/src'
 */
function parseModuleNotFound(line: string): ParsedPreviewError[] | null {
  const match = line.match(
    /Module not found.*?(?:Can't resolve|Cannot find)\s+['"]([^'"]+)['"]\s+in\s+['"]([^'"]+)['"]/
  )
  if (match) {
    const [, moduleName, dir] = match
    const srcMatch = dir.match(/(src[/\\].*)/)
    return [{
      file: srcMatch ? normalizeFilePath(srcMatch[1]) : 'unknown',
      errorType: 'module-not-found',
      message: `Cannot find module "${moduleName}"`,
      raw: line,
    }]
  }

  // Pattern: Module '"X"' has no exported member 'Y'
  const exportMatch = line.match(
    /Module\s+['"](.*?)['"]\s+has no exported member\s+['"](\w+)['"]/
  )
  if (exportMatch) {
    return [{
      file: normalizeFilePath(exportMatch[1]),
      errorType: 'import-resolution',
      message: `Module "${exportMatch[1]}" has no exported member "${exportMatch[2]}"`,
      raw: line,
    }]
  }

  return null
}

/**
 * Pattern: Cannot find module 'X' or its corresponding type declarations
 */
function parseCannotFindModule(line: string): ParsedPreviewError[] | null {
  const match = line.match(
    /Cannot find module\s+['"]([^'"]+)['"]/
  )
  if (!match) return null

  const moduleName = match[1]
  // If it's a relative import, it's a code issue; if it's a package, it's a dependency issue
  const isRelative = moduleName.startsWith('.') || moduleName.startsWith('/')
  return [{
    file: isRelative ? normalizeFilePath(moduleName) : 'package.json',
    errorType: isRelative ? 'import-resolution' : 'dependency-error',
    message: `Cannot find module "${moduleName}"`,
    raw: line,
  }]
}

/**
 * Pattern: X is not defined (ReferenceError in Vite output)
 */
function parseNotDefined(
  line: string,
  allLines: string[],
  index: number
): ParsedPreviewError[] | null {
  const match = line.match(/(\w+)\s+is not defined/)
  if (!match) return null
  // Only match if it looks like a Vite/runtime error context
  if (!line.includes('ReferenceError') && !line.includes('is not defined')) return null

  const fileFromContext = findFileInContext(allLines, index)
  return [{
    file: fileFromContext ?? 'unknown',
    errorType: 'syntax',
    message: `${match[1]} is not defined`,
    raw: line,
  }]
}

/**
 * Pattern: [vite] Internal server error: <message>
 * Catches generic Vite internal errors not matched by other patterns
 */
function parseViteInternalError(line: string): ParsedPreviewError[] | null {
  const match = line.match(/\[vite\]\s+Internal server error:\s+(.+)/)
  if (!match) return null

  // Try to extract file from the error message
  const fileMatch = match[1].match(/(src[/\\][^\s,;:]+\.\w+)/)
  return [{
    file: fileMatch ? normalizeFilePath(fileMatch[1]) : 'unknown',
    errorType: 'unknown',
    message: match[1].trim(),
    raw: line,
  }]
}

// ─── Helpers ──────────────────────────────────────────────────

/**
 * Normalize file path: convert backslashes to forward slashes,
 * strip leading ./ or absolute path prefix up to src/
 */
function normalizeFilePath(filePath: string): string {
  let normalized = filePath.replace(/\\/g, '/')

  // Strip absolute path prefix, keep from src/ onwards
  const srcIdx = normalized.indexOf('src/')
  if (srcIdx > 0) {
    normalized = normalized.slice(srcIdx)
  }

  // Strip leading ./
  if (normalized.startsWith('./')) {
    normalized = normalized.slice(2)
  }

  return normalized
}

/**
 * Look at surrounding lines (±5) for a file path reference.
 * Used when the error line itself doesn't contain a file path.
 */
function findFileInContext(allLines: string[], index: number): string | null {
  const start = Math.max(0, index - 5)
  const end = Math.min(allLines.length, index + 5)

  for (let i = start; i < end; i++) {
    const fileMatch = allLines[i].match(/(src[/\\][^\s,;:()]+\.\w{2,4})/)
    if (fileMatch) {
      return normalizeFilePath(fileMatch[1])
    }
  }
  return null
}

// ─── Error context builder ────────────────────────────────────

/**
 * Builds a repair context string from parsed preview errors.
 * This is injected into the AI prompt when repairing files.
 */
export function buildPreviewRepairContext(errors: ParsedPreviewError[]): string {
  if (errors.length === 0) return ''

  const lines = [
    '=== PREVIEW ERROR CONTEXT ===',
    `The Vite dev server failed to start. ${errors.length} error(s) were detected:`,
    '',
  ]

  for (const err of errors) {
    lines.push(`FILE: ${err.file}`)
    lines.push(`TYPE: ${err.errorType}`)
    lines.push(`ERROR: ${err.message}`)
    if (err.line) lines.push(`LOCATION: line ${err.line}${err.column ? `, column ${err.column}` : ''}`)
    lines.push(`FIX: ${getPreviewFixInstruction(err)}`)
    lines.push('')
  }

  lines.push('IMPORTANT: Fix ONLY the errors listed above. Do not change unrelated code.')
  lines.push('=== END PREVIEW ERROR CONTEXT ===')

  return lines.join('\n')
}

function getPreviewFixInstruction(err: ParsedPreviewError): string {
  switch (err.errorType) {
    case 'syntax':
      return 'Fix the syntax error. Check for missing closing brackets, unclosed JSX tags, or invalid JavaScript/TypeScript syntax.'
    case 'import-resolution':
      return 'Fix the import path. Either the file does not exist, the export name is wrong, or the path is incorrect. Use relative paths from the current file.'
    case 'module-not-found':
      return 'The imported module does not exist. Either install the missing package or remove/replace the import with an available alternative.'
    case 'type-error':
      return 'Fix the TypeScript type error. Check that types match, required properties are provided, and generics are correct.'
    case 'jsx-error':
      return 'Fix the JSX error. Check for unclosed tags, invalid JSX expressions, or missing return statements in components.'
    case 'config-error':
      return 'Fix the configuration file. Check vite.config.ts, tsconfig.json, or tailwind.config.ts for syntax or option errors.'
    case 'dependency-error':
      return 'The package is missing from package.json. Add it to dependencies or replace the import with an available alternative.'
    case 'unknown':
    default:
      return 'Review the error message and fix the issue in the affected file.'
  }
}

// ─── Affected files extractor ─────────────────────────────────

/**
 * Returns unique list of affected file paths from parsed errors.
 * Filters out 'unknown' and 'package.json' (those need different handling).
 */
export function getAffectedFiles(errors: ParsedPreviewError[]): string[] {
  const files = new Set<string>()
  for (const err of errors) {
    if (err.file !== 'unknown' && err.file !== 'package.json') {
      files.add(err.file)
    }
  }
  return [...files]
}

/**
 * Returns true if any errors indicate missing npm packages.
 */
export function hasDependencyErrors(errors: ParsedPreviewError[]): boolean {
  return errors.some(e => e.errorType === 'dependency-error' || e.errorType === 'module-not-found')
}
