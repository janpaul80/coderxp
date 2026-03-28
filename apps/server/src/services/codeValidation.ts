/**
 * codeValidation.ts — Code Quality Gates
 *
 * Implements validation gates to catch errors before they cause build failures:
 * 1. Syntax validation — catches syntax errors before writing files
 * 2. Import validation — catches missing imports before writing files
 * 3. TypeScript validation — catches TypeScript errors before preview
 */

import * as parser from '@babel/parser'
import * as ts from 'typescript'
import * as path from 'path'
import * as fs from 'fs'

// ─── Types ────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean
  errors: ValidationError[]
}

export interface ValidationError {
  type: 'syntax' | 'import' | 'typescript' | 'integration'
  filePath: string
  message: string
  line?: number
  column?: number
  importName?: string
  integration?: 'supabase' | 'stripe' | 'api'
}

// ─── Syntax Validation ─────────────────────────────────────────

/**
 * Validates the syntax of a file using @babel/parser.
 * Returns a ValidationResult with any syntax errors found.
 */
export function validateSyntax(content: string, filePath: string): ValidationResult {
  const ext = path.extname(filePath).toLowerCase()
  const isTS = ext === '.ts' || ext === '.tsx'
  const isJSX = ext === '.jsx' || ext === '.tsx'
  
  try {
    parser.parse(content, {
      sourceType: 'module',
      plugins: [
        isTS && 'typescript',
        isJSX && 'jsx',
        'classProperties',
        'decorators-legacy',
      ].filter(Boolean) as parser.ParserPlugin[],
    })
    
    return { valid: true, errors: [] }
  } catch (err) {
    const error = err as Error & { loc?: { line: number, column: number } }
    const line = error.loc?.line ?? 0
    const column = error.loc?.column ?? 0
    
    return {
      valid: false,
      errors: [{
        type: 'syntax',
        filePath,
        message: error.message.replace(/\(\d+:\d+\)/, '').trim(),
        line,
        column,
      }]
    }
  }
}

// ─── Import Validation ─────────────────────────────────────────

/**
 * Extracts all imports from a file using @babel/parser.
 * Returns an array of import names.
 */
function extractImports(content: string, filePath: string): string[] {
  const ext = path.extname(filePath).toLowerCase()
  const isTS = ext === '.ts' || ext === '.tsx'
  const isJSX = ext === '.jsx' || ext === '.tsx'
  
  try {
    const ast = parser.parse(content, {
      sourceType: 'module',
      plugins: [
        isTS && 'typescript',
        isJSX && 'jsx',
        'classProperties',
        'decorators-legacy',
      ].filter(Boolean) as parser.ParserPlugin[],
    })
    
    const imports: string[] = []
    
    // @ts-ignore - AST types are complex
    for (const node of ast.program.body) {
      if (node.type === 'ImportDeclaration') {
        imports.push(node.source.value)
      }
    }
    
    return imports
  } catch (err) {
    // If syntax validation failed, we can't extract imports
    return []
  }
}

/**
 * Validates imports in a file.
 * Checks if imported modules exist in the workspace or package.json.
 * Returns a ValidationResult with any import errors found.
 */
export function validateImports(
  content: string, 
  filePath: string, 
  allFiles: string[], 
  packageJson: Record<string, any>
): ValidationResult {
  const imports = extractImports(content, filePath)
  const errors: ValidationError[] = []
  const fileDir = path.dirname(filePath)
  
  for (const importPath of imports) {
    // Skip relative imports that start with . or ..
    if (importPath.startsWith('.')) {
      const resolvedPath = path.resolve(fileDir, importPath)
      const normalizedPath = resolvedPath.replace(/\\/g, '/')
      
      // Check if the file exists in the workspace
      const fileExists = allFiles.some(file => {
        // Try with and without extension
        return file === normalizedPath || 
               file === `${normalizedPath}.ts` || 
               file === `${normalizedPath}.tsx` || 
               file === `${normalizedPath}.js` || 
               file === `${normalizedPath}.jsx` ||
               file === `${normalizedPath}/index.ts` || 
               file === `${normalizedPath}/index.tsx` || 
               file === `${normalizedPath}/index.js` || 
               file === `${normalizedPath}/index.jsx`
      })
      
      if (!fileExists) {
        errors.push({
          type: 'import',
          filePath,
          message: `Cannot find module '${importPath}'`,
          importName: importPath,
        })
      }
    } else {
      // Check if the package exists in package.json
      const deps = {
        ...(packageJson.dependencies || {}),
        ...(packageJson.devDependencies || {}),
      }
      
      // Extract the package name (e.g., 'react' from 'react/dom')
      const packageName = importPath.split('/')[0]
      
      // Skip built-in Node.js modules
      const builtInModules = ['fs', 'path', 'http', 'https', 'util', 'os', 'crypto', 'stream', 'events']
      if (builtInModules.includes(packageName)) {
        continue
      }
      
      if (!deps[packageName]) {
        errors.push({
          type: 'import',
          filePath,
          message: `Package '${packageName}' is not in package.json`,
          importName: packageName,
        })
      }
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
  }
}

// ─── TypeScript Validation ──────────────────────────────────────

/**
 * Validates TypeScript code using the TypeScript compiler API.
 * Returns a ValidationResult with any TypeScript errors found.
 */
export function validateTypeScript(
  workspacePath: string, 
  timeoutMs: number = 30000
): Promise<ValidationResult> {
  return new Promise((resolve) => {
    const startTime = Date.now()
    const errors: ValidationError[] = []
    
    try {
      // Find tsconfig.json
      const tsconfigPath = path.join(workspacePath, 'tsconfig.json')
      if (!fs.existsSync(tsconfigPath)) {
        return resolve({
          valid: true,
          errors: [],
        })
      }
      
      // Read tsconfig.json
      const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf8'))
      
      // Create a TypeScript program
      const compilerOptions = ts.parseJsonConfigFileContent(
        tsconfig,
        ts.sys,
        workspacePath
      ).options
      
      // Find all TypeScript files
      const files = findTypeScriptFiles(workspacePath)
      
      // Create program
      const program = ts.createProgram(files, compilerOptions)
      
      // Get diagnostics
      const diagnostics = ts.getPreEmitDiagnostics(program)
      
      // Convert diagnostics to validation errors
      for (const diagnostic of diagnostics) {
        if (diagnostic.file) {
          const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start!)
          const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')
          const filePath = diagnostic.file.fileName.replace(workspacePath, '').replace(/^[/\\]/, '')
          
          errors.push({
            type: 'typescript',
            filePath,
            message,
            line: line + 1,
            column: character + 1,
          })
        }
      }
      
      resolve({
        valid: errors.length === 0,
        errors,
      })
    } catch (err) {
      const error = err as Error
      errors.push({
        type: 'typescript',
        filePath: 'tsconfig.json',
        message: `TypeScript validation failed: ${error.message}`,
      })
      
      resolve({
        valid: false,
        errors,
      })
    }
    
    // Check timeout
    const elapsed = Date.now() - startTime
    if (elapsed > timeoutMs) {
      errors.push({
        type: 'typescript',
        filePath: 'tsconfig.json',
        message: `TypeScript validation timed out after ${timeoutMs}ms`,
      })
      
      resolve({
        valid: false,
        errors,
      })
    }
  })
}

/**
 * Finds all TypeScript files in a directory.
 * Skips node_modules and other non-source directories.
 */
function findTypeScriptFiles(dir: string): string[] {
  const files: string[] = []
  
  function traverse(currentDir: string) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true })
    
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name)
      
      // Skip node_modules and other non-source directories
      if (entry.isDirectory()) {
        if (
          entry.name !== 'node_modules' &&
          entry.name !== '.git' &&
          entry.name !== 'dist' &&
          entry.name !== 'build'
        ) {
          traverse(fullPath)
        }
      } else if (
        entry.name.endsWith('.ts') || 
        entry.name.endsWith('.tsx')
      ) {
        files.push(fullPath)
      }
    }
  }
  
  traverse(dir)
  return files
}

// ─── Combined Validation ───────────────────────────────────────

/**
 * Validates a file for syntax and import errors.
 * Returns a ValidationResult with any errors found.
 */
export function validateFile(
  content: string, 
  filePath: string, 
  allFiles: string[], 
  packageJson: Record<string, any>
): ValidationResult {
  // First check syntax
  const syntaxResult = validateSyntax(content, filePath)
  if (!syntaxResult.valid) {
    return syntaxResult
  }
  
  // Then check imports
  const importResult = validateImports(content, filePath, allFiles, packageJson)
  if (!importResult.valid) {
    return importResult
  }
  
  return { valid: true, errors: [] }
}

/**
 * Formats validation errors into a string that can be used in error messages.
 */
export function formatValidationErrors(errors: ValidationError[]): string {
  return errors.map(error => {
    if (error.type === 'syntax') {
      return `Syntax error in ${error.filePath} at line ${error.line}, column ${error.column}: ${error.message}`
    } else if (error.type === 'import') {
      return `Import error in ${error.filePath}: ${error.message}`
    } else if (error.type === 'typescript') {
      return `TypeScript error in ${error.filePath}${error.line ? ` at line ${error.line}` : ''}: ${error.message}`
    } else {
      return `Validation error in ${error.filePath}: ${error.message}`
    }
  }).join('\n')
}

/**
 * Generates error context for AI prompts based on validation errors.
 */
export function generateErrorContext(errors: ValidationError[]): string {
  const syntaxErrors = errors.filter(e => e.type === 'syntax')
  const importErrors = errors.filter(e => e.type === 'import')
  const tsErrors = errors.filter(e => e.type === 'typescript')
  
  let context = 'Previous generation had the following errors:\n\n'
  
  if (syntaxErrors.length > 0) {
    context += 'SYNTAX ERRORS:\n'
    context += syntaxErrors.map(e => 
      `- ${e.filePath} (line ${e.line}, column ${e.column}): ${e.message}`
    ).join('\n')
    context += '\n\n'
  }
  
  if (importErrors.length > 0) {
    context += 'IMPORT ERRORS:\n'
    context += importErrors.map(e => 
      `- ${e.filePath}: ${e.message}`
    ).join('\n')
    context += '\n\n'
  }
  
  if (tsErrors.length > 0) {
    context += 'TYPESCRIPT ERRORS:\n'
    context += tsErrors.map(e => 
      `- ${e.filePath}${e.line ? ` (line ${e.line})` : ''}: ${e.message}`
    ).join('\n')
    context += '\n\n'
  }
  
  context += 'Please fix these errors in your next generation.'
  
  return context
}
