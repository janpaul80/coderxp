/**
 * runtimeErrorParser.ts — Sprint 16
 *
 * Parses runtime errors from client applications and extracts structured information:
 * - Error type classification
 * - Affected component/file identification
 * - Root cause analysis
 * - Repair context generation
 */

import type { RuntimeError } from './runtimeErrorCollector'

// ─── Types ────────────────────────────────────────────────────

export type RuntimeErrorType =
  | 'state-update'
  | 'prop-type'
  | 'undefined-variable'
  | 'null-reference'
  | 'api-error'
  | 'event-handler'
  | 'render-error'
  | 'lifecycle-error'
  | 'async-error'
  | 'unknown'

export interface ParsedRuntimeError {
  errorType: RuntimeErrorType
  message: string
  affectedComponent?: string
  affectedFile?: string
  lineNumber?: number
  columnNumber?: number
  suggestedFix?: string
  relatedCode?: string
  raw: RuntimeError
}

// ─── Main Parser ──────────────────────────────────────────────

/**
 * Parse a runtime error into a structured format with error type classification
 */
export function parseRuntimeError(error: RuntimeError): ParsedRuntimeError {
  // Start with basic information
  const result: ParsedRuntimeError = {
    errorType: 'unknown',
    message: error.message,
    affectedComponent: error.componentName,
    affectedFile: error.fileName,
    lineNumber: error.lineNumber,
    columnNumber: error.columnNumber,
    raw: error
  }

  // Classify error type based on message and stack
  result.errorType = classifyErrorType(error)
  
  // Extract additional context if available
  if (error.stack) {
    extractContextFromStack(error.stack, result)
  }

  // Generate suggested fix based on error type
  result.suggestedFix = generateSuggestedFix(result)

  return result
}

/**
 * Parse multiple runtime errors and deduplicate them
 */
export function parseRuntimeErrors(errors: RuntimeError[]): ParsedRuntimeError[] {
  const parsedErrors = errors.map(parseRuntimeError)
  
  // Deduplicate by component and error type
  const uniqueErrors: ParsedRuntimeError[] = []
  const seen = new Set<string>()
  
  for (const error of parsedErrors) {
    const key = `${error.affectedComponent || 'unknown'}-${error.errorType}-${error.message.substring(0, 50)}`
    if (!seen.has(key)) {
      seen.add(key)
      uniqueErrors.push(error)
    }
  }
  
  return uniqueErrors
}

// ─── Error Classification ───────────────────────────────────────

/**
 * Classify the error type based on message and stack
 */
function classifyErrorType(error: RuntimeError): RuntimeErrorType {
  const { message, stack } = error
  
  // Check for common React error patterns
  if (message.includes('Cannot update a component') || message.includes('setState')) {
    return 'state-update'
  }
  
  if (message.includes('undefined is not an object') || message.includes('null is not an object')) {
    return 'null-reference'
  }
  
  if (message.includes('is not a function') || message.includes('is not defined')) {
    return 'undefined-variable'
  }
  
  if (message.includes('Failed prop type') || message.includes('expected `') || message.includes('Invalid prop')) {
    return 'prop-type'
  }
  
  if (message.includes('fetch') || message.includes('api') || message.includes('network') || message.includes('status code')) {
    return 'api-error'
  }
  
  if (message.includes('onClick') || message.includes('addEventListener') || message.includes('handler')) {
    return 'event-handler'
  }
  
  if (message.includes('render') || message.includes('ReactDOM') || message.includes('Invalid hook call')) {
    return 'render-error'
  }
  
  if (message.includes('useEffect') || message.includes('componentDidMount') || message.includes('componentWillUnmount')) {
    return 'lifecycle-error'
  }
  
  if (message.includes('async') || message.includes('promise') || message.includes('then') || message.includes('await')) {
    return 'async-error'
  }
  
  return 'unknown'
}

/**
 * Extract additional context from the error stack trace
 */
function extractContextFromStack(stack: string, result: ParsedRuntimeError): void {
  // Look for component names in the stack trace
  if (!result.affectedComponent) {
    const componentMatch = stack.match(/at\s+([A-Z][a-zA-Z0-9]+)\s+\(/);
    if (componentMatch) {
      result.affectedComponent = componentMatch[1]
    }
  }
  
  // Look for file paths in the stack trace
  if (!result.affectedFile) {
    // Match paths like: src/components/Header.tsx or /static/js/main.chunk.js
    const fileMatch = stack.match(/\(([^:]+\.(jsx|tsx|js|ts))/);
    if (fileMatch) {
      result.affectedFile = fileMatch[1]
    }
  }
  
  // Extract line and column numbers if not already available
  if (!result.lineNumber || !result.columnNumber) {
    const lineColMatch = stack.match(/:(\d+):(\d+)/);
    if (lineColMatch) {
      result.lineNumber = parseInt(lineColMatch[1], 10)
      result.columnNumber = parseInt(lineColMatch[2], 10)
    }
  }
}

/**
 * Generate a suggested fix based on the error type
 */
function generateSuggestedFix(error: ParsedRuntimeError): string {
  switch (error.errorType) {
    case 'state-update':
      return "Check if you're updating state in an effect without a dependency array, or during render. Move state updates to event handlers or useEffect with proper dependencies."
      
    case 'prop-type':
      return "Verify the props being passed to the component match the expected types. Check for null/undefined values and ensure required props are provided."
      
    case 'undefined-variable':
      return "Check for typos in variable names or ensure the variable is defined before use. You might need to add a null check or provide a default value."
      
    case 'null-reference':
      return "Add a conditional check before accessing properties on potentially null/undefined objects. Consider using optional chaining (obj?.prop) or nullish coalescing (obj ?? defaultValue)."
      
    case 'api-error':
      return "Verify API endpoints are correct and add proper error handling for API calls. Ensure you're handling loading states and error responses appropriately."
      
    case 'event-handler':
      return "Check that event handler functions are properly bound to the component or defined using arrow functions. Verify the function exists and is being called correctly."
      
    case 'render-error':
      return "Ensure your component returns valid JSX. Check for missing closing tags, rendering null/undefined values, or invalid hook usage patterns."
      
    case 'lifecycle-error':
      return "Review your useEffect dependencies and cleanup functions. Ensure you're not causing infinite update loops or accessing stale state/props in effects."
      
    case 'async-error':
      return "Make sure async operations are properly handled with try/catch blocks. Check that promises are being awaited and errors are caught appropriately."
      
    case 'unknown':
    default:
      return "Review the error message and stack trace carefully. Look for typos, undefined variables, or logic errors in the affected component."
  }
}

// ─── Repair Context Generation ───────────────────────────────────

/**
 * Generate a comprehensive repair context for AI-based fixes
 */
export function buildRuntimeErrorRepairContext(errors: ParsedRuntimeError[]): string {
  const lines: string[] = [
    '=== RUNTIME ERROR REPAIR CONTEXT ===',
    '',
    `${errors.length} runtime error(s) detected in the application:`,
    ''
  ]
  
  errors.forEach((err, index) => {
    lines.push(`ERROR ${index + 1}: ${err.errorType.toUpperCase()} in ${err.affectedComponent || 'unknown component'}`)
    lines.push(`MESSAGE: ${err.message}`)
    
    if (err.affectedFile) {
      lines.push(`FILE: ${err.affectedFile}`)
    }
    
    if (err.lineNumber) {
      lines.push(`LOCATION: Line ${err.lineNumber}${err.columnNumber ? `, Column ${err.columnNumber}` : ''}`)
    }
    
    lines.push(`DIAGNOSIS: ${getDiagnosisForErrorType(err.errorType, err)}`)
    lines.push(`REPAIR STRATEGY: ${err.suggestedFix}`)
    lines.push('')
  })
  
  lines.push('IMPORTANT GUIDELINES:')
  lines.push('1. Fix ONLY the specific issues identified above')
  lines.push('2. Make minimal changes to resolve the errors')
  lines.push('3. Preserve existing functionality and component structure')
  lines.push('4. Add appropriate error handling to prevent similar issues')
  lines.push('5. Focus on the affected components and their direct dependencies')
  lines.push('')
  lines.push('=== END RUNTIME ERROR REPAIR CONTEXT ===')
  
  return lines.join('\n')
}

/**
 * Get a detailed diagnosis for a specific error type
 */
function getDiagnosisForErrorType(errorType: RuntimeErrorType, error: ParsedRuntimeError): string {
  switch (errorType) {
    case 'state-update':
      return "Component is attempting to update state after it has unmounted or during rendering. This typically happens in async operations that complete after component unmount, or when setState is called during render."
      
    case 'prop-type':
      return `Component received incorrect prop types. Expected valid ${error.message.includes('expected') ? error.message.split('expected')[1].split(',')[0].trim() : 'value'} but received ${error.message.includes('received') ? error.message.split('received')[1].split('.')[0].trim() : 'invalid data'}.`
      
    case 'undefined-variable':
      return `Code is attempting to access a variable or property that doesn't exist. This could be due to a typo, missing import, or accessing a property on an undefined object.`
      
    case 'null-reference':
      return "Code is attempting to access a property or method on null or undefined. This often happens when data isn't loaded yet or when an expected object is missing."
      
    case 'api-error':
      return "API request failed or returned unexpected data. This could be due to incorrect endpoint URLs, missing authentication, network issues, or improper handling of API responses."
      
    case 'event-handler':
      return "Event handler is undefined or improperly bound. This typically happens when event handlers are not bound to the component instance or when they're called with incorrect parameters."
      
    case 'render-error':
      return "Component's render method is returning invalid JSX or throwing an error during rendering. This could be due to conditional rendering issues, invalid JSX syntax, or rendering null/undefined values."
      
    case 'lifecycle-error':
      return "Error in component lifecycle method or hook. This often happens with incorrect useEffect dependencies, missing cleanup functions, or accessing stale state/props in effects."
      
    case 'async-error':
      return "Unhandled promise rejection or async error. This typically occurs when async operations don't have proper error handling or when promises are not properly awaited."
      
    case 'unknown':
    default:
      return `Unclassified runtime error. Review the full error message and stack trace: "${error.message}"`
  }
}

/**
 * Get a list of affected files that need repair
 */
export function getAffectedFiles(errors: ParsedRuntimeError[]): string[] {
  const files = new Set<string>()
  
  for (const error of errors) {
    if (error.affectedFile) {
      files.add(error.affectedFile)
    }
  }
  
  return [...files]
}

/**
 * Check if any errors are related to API or network issues
 */
export function hasApiErrors(errors: ParsedRuntimeError[]): boolean {
  return errors.some(err => err.errorType === 'api-error')
}
