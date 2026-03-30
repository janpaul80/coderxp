/**
 * visualBuilderService.ts — Server-side AST engine for Visual Builder
 *
 * Parses React TSX/JSX files into a visual-builder-compatible node tree.
 * Supports:
 *  - Section/page-level extraction from component files
 *  - Syncability scoring (can the visual builder safely edit this file?)
 *  - AST-based transforms: reorder children, insert component, delete component
 *  - Text replacement, className replacement
 *  - Import management (auto-add/remove)
 *  - Format-preserving code generation
 *
 * Uses @babel/parser for parsing (already in devDeps).
 * Uses manual string splicing for format-preserving edits (no recast dep needed for v1).
 */

import { parse, type ParserOptions, type ParserPlugin } from '@babel/parser'
// @ts-ignore
import type {
  File as BabelFile,
  Node,
  JSXElement,
  JSXFragment,
  JSXText,
  JSXExpressionContainer,
  ImportDeclaration,
  ExportDefaultDeclaration,
  ExportNamedDeclaration,
  FunctionDeclaration,
  ArrowFunctionExpression,
  ReturnStatement,
  JSXIdentifier,
  JSXMemberExpression,
  JSXOpeningElement,
  JSXAttribute,
  StringLiteral,
  JSXSpreadAttribute,
  VariableDeclaration,
  Program,
// @ts-ignore
} from '@babel/types'

// ─── Types ────────────────────────────────────────────────────

export interface VisualNode {
  /** Stable ID: line:col hash or data-vb-id value */
  vbId: string
  /** 'element' | 'component' | 'text' | 'expression' | 'fragment' */
  type: 'element' | 'component' | 'text' | 'expression' | 'fragment'
  /** Tag name: 'div', 'Button', 'PricingCard' */
  tagName: string
  /** Tailwind / CSS classes */
  className: string
  /** Props (serializable subset) */
  props: Record<string, unknown>
  /** Child nodes */
  children: VisualNode[]
  /** AST source location */
  loc: { start: { line: number; column: number; index: number }; end: { line: number; column: number; index: number } }
  /** Whether this node can be visually edited */
  editable: boolean
  /** Section type hint: 'hero', 'footer', 'nav', etc. */
  sectionHint?: string
  /** Whether this is a text-only leaf */
  isTextOnly: boolean
  /** Nesting depth */
  depth: number
}

export interface FileAnalysis {
  /** Relative file path */
  filePath: string
  /** Whether this file is visual-builder-syncable */
  syncable: boolean
  /** If not syncable, why */
  unsyncableReason?: string
  /** Syncability score 0–100 */
  syncScore: number
  /** The default export component name */
  componentName: string | null
  /** Extracted visual node tree */
  tree: VisualNode[]
  /** Imports in the file */
  imports: ImportInfo[]
  /** Raw source code length */
  sourceLength: number
}

export interface ImportInfo {
  source: string
  specifiers: Array<{
    local: string
    imported: string
    type: 'default' | 'named' | 'namespace'
  }>
  loc: { start: { line: number; column: number }; end: { line: number; column: number } }
}

export type TransformOp =
  | { type: 'reorder'; parentVbId: string; childVbId: string; newIndex: number }
  | { type: 'delete'; vbId: string }
  | { type: 'insert'; parentVbId: string; index: number; jsx: string; importNeeded?: { source: string; specifier: string } }
  | { type: 'replaceText'; vbId: string; newText: string }
  | { type: 'replaceClassName'; vbId: string; newClassName: string }
  | { type: 'updateProp'; vbId: string; propName: string; propValue: string }

// ─── Parser configuration ────────────────────────────────────

const PARSER_PLUGINS: ParserPlugin[] = [
  'jsx',
  'typescript',
  'decorators-legacy',
  'classProperties',
  'optionalChaining',
  'nullishCoalescingOperator',
  'objectRestSpread',
  'dynamicImport',
]

const PARSER_OPTIONS: ParserOptions = {
  sourceType: 'module',
  plugins: PARSER_PLUGINS,
  ranges: true,
  tokens: false,
  errorRecovery: true,
}

// ─── Section type inference ──────────────────────────────────

const SECTION_HINTS: Record<string, string[]> = {
  hero: ['hero', 'banner', 'jumbotron', 'splash', 'landing-hero'],
  nav: ['nav', 'navbar', 'navigation', 'header', 'topbar', 'menu-bar'],
  header: ['header', 'site-header', 'page-header', 'masthead'],
  footer: ['footer', 'site-footer', 'page-footer'],
  features: ['features', 'feature', 'capabilities', 'benefits', 'services'],
  pricing: ['pricing', 'plans', 'price', 'tiers', 'subscription'],
  testimonials: ['testimonials', 'testimonial', 'reviews', 'social-proof', 'quotes'],
  cta: ['cta', 'call-to-action', 'signup', 'get-started', 'action'],
  contact: ['contact', 'contact-form', 'reach-out', 'get-in-touch'],
  about: ['about', 'about-us', 'team', 'our-story'],
  faq: ['faq', 'questions', 'help', 'support'],
  stats: ['stats', 'statistics', 'metrics', 'numbers', 'counters'],
  gallery: ['gallery', 'portfolio', 'showcase', 'work', 'projects'],
  sidebar: ['sidebar', 'side-panel', 'aside'],
  main: ['main', 'content', 'main-content', 'page-content'],
}

function inferSectionType(tagName: string, className: string, id?: string): string | undefined {
  const searchTerms = [
    tagName.toLowerCase(),
    ...className.toLowerCase().split(/\s+/),
    ...(id ? [id.toLowerCase()] : []),
  ]

  for (const [sectionType, patterns] of Object.entries(SECTION_HINTS)) {
    if (patterns.some(p => searchTerms.some(t => t.includes(p)))) {
      return sectionType
    }
  }

  // Semantic HTML tag hints
  const tagHints: Record<string, string> = {
    header: 'header', nav: 'nav', footer: 'footer',
    main: 'main', aside: 'sidebar', article: 'content',
  }
  return tagHints[tagName.toLowerCase()]
}

// ─── AST helpers ─────────────────────────────────────────────

function getJSXTagName(opening: JSXOpeningElement): string {
  if (opening.name.type === 'JSXIdentifier') {
    return opening.name.name
  }
  if (opening.name.type === 'JSXMemberExpression') {
    const parts: string[] = []
    let node: JSXMemberExpression | JSXIdentifier = opening.name
    while (node.type === 'JSXMemberExpression') {
      parts.unshift(node.property.name)
      node = node.object as JSXMemberExpression | JSXIdentifier
    }
    if (node.type === 'JSXIdentifier') parts.unshift(node.name)
    return parts.join('.')
  }
  return 'Unknown'
}

function isComponentTag(tagName: string): boolean {
  return tagName[0] === tagName[0].toUpperCase() && tagName[0] !== tagName[0].toLowerCase()
}

function extractClassName(attrs: (JSXAttribute | JSXSpreadAttribute)[]): string {
  for (const attr of attrs) {
    if (attr.type !== 'JSXAttribute') continue
    if (attr.name.type !== 'JSXIdentifier') continue
    if (attr.name.name !== 'className' && attr.name.name !== 'class') continue

    if (!attr.value) return ''
    if (attr.value.type === 'StringLiteral') return attr.value.value
    if (attr.value.type === 'JSXExpressionContainer') {
      const expr = attr.value.expression
      // Handle cn("x", "y"), clsx("x"), etc. — extract string args
      if (expr.type === 'CallExpression') {
        const strs: string[] = []
        for (const arg of expr.arguments) {
          if (arg.type === 'StringLiteral') strs.push(arg.value)
          if (arg.type === 'TemplateLiteral') {
            strs.push(arg.quasis.map((q: any) => q.value.raw).join(' '))
          }
        }
        return strs.join(' ')
      }
      if (expr.type === 'StringLiteral') return expr.value
      if (expr.type === 'TemplateLiteral') {
        return expr.quasis.map((q: any) => q.value.raw).join(' ')
      }
    }
  }
  return ''
}

function extractSimpleProps(attrs: (JSXAttribute | JSXSpreadAttribute)[]): Record<string, unknown> {
  const props: Record<string, unknown> = {}
  for (const attr of attrs) {
    if (attr.type !== 'JSXAttribute') continue
    if (attr.name.type !== 'JSXIdentifier') continue
    const key = attr.name.name
    if (key === 'className' || key === 'class' || key === 'key' || key === 'ref') continue

    if (!attr.value) {
      props[key] = true
      continue
    }
    if (attr.value.type === 'StringLiteral') {
      props[key] = attr.value.value
      continue
    }
    if (attr.value.type === 'JSXExpressionContainer') {
      const expr = attr.value.expression
      if (expr.type === 'StringLiteral') { props[key] = expr.value; continue }
      if (expr.type === 'NumericLiteral') { props[key] = expr.value; continue }
      if (expr.type === 'BooleanLiteral') { props[key] = expr.value; continue }
      if (expr.type === 'NullLiteral') { props[key] = null; continue }
      // Complex expressions → mark as dynamic
      props[key] = '{{dynamic}}'
    }
  }
  return props
}

function extractIdProp(attrs: (JSXAttribute | JSXSpreadAttribute)[]): string | undefined {
  for (const attr of attrs) {
    if (attr.type !== 'JSXAttribute') continue
    if (attr.name.type !== 'JSXIdentifier') continue
    if (attr.name.name !== 'id' && attr.name.name !== 'data-vb-id' && attr.name.name !== 'data-section') continue
    if (attr.value?.type === 'StringLiteral') return attr.value.value
  }
  return undefined
}

// ─── Node ID generation ──────────────────────────────────────

function generateVbId(node: Node, filePath: string): string {
  const loc = node.loc
  if (!loc) return `${filePath}:unknown`
  return `${filePath}:${loc.start.line}:${loc.start.column}`
}

// ─── Extract visual tree from JSX ────────────────────────────

function extractVisualTree(
  node: Node,
  filePath: string,
  source: string,
  depth: number = 0,
  maxDepth: number = 20,
): VisualNode[] {
  if (depth > maxDepth) return []

  const nodes: VisualNode[] = []

  if (node.type === 'JSXElement') {
    const jsx = node as JSXElement
    const tagName = getJSXTagName(jsx.openingElement)
    const className = extractClassName(jsx.openingElement.attributes)
    const props = extractSimpleProps(jsx.openingElement.attributes)
    const idProp = extractIdProp(jsx.openingElement.attributes)
    const sectionHint = inferSectionType(tagName, className, idProp)

    // Determine editability
    const editable = true // v1: all JSXElements are editable at section level

    // Check if text-only
    const isTextOnly = jsx.children.every(
      (c: any) => c.type === 'JSXText' || (c.type === 'JSXExpressionContainer' && c.expression.type === 'StringLiteral')
    )

    // Recurse into children
    const children: VisualNode[] = []
    for (const child of jsx.children) {
      children.push(...extractVisualTree(child, filePath, source, depth + 1, maxDepth))
    }

    const loc = jsx.loc!
    const startIndex = jsx.start ?? 0
    const endIndex = jsx.end ?? source.length

    nodes.push({
      vbId: idProp || generateVbId(jsx, filePath),
      type: isComponentTag(tagName) ? 'component' : 'element',
      tagName,
      className,
      props,
      children,
      loc: {
        start: { line: loc.start.line, column: loc.start.column, index: startIndex },
        end: { line: loc.end.line, column: loc.end.column, index: endIndex },
      },
      editable,
      sectionHint,
      isTextOnly,
      depth,
    })
  } else if (node.type === 'JSXFragment') {
    const frag = node as JSXFragment
    const children: VisualNode[] = []
    for (const child of frag.children) {
      children.push(...extractVisualTree(child, filePath, source, depth + 1, maxDepth))
    }
    nodes.push({
      vbId: generateVbId(frag, filePath),
      type: 'fragment',
      tagName: 'Fragment',
      className: '',
      props: {},
      children,
      loc: {
        start: { line: frag.loc!.start.line, column: frag.loc!.start.column, index: frag.start ?? 0 },
        end: { line: frag.loc!.end.line, column: frag.loc!.end.column, index: frag.end ?? source.length },
      },
      editable: false,
      isTextOnly: false,
      depth,
    })
  } else if (node.type === 'JSXText') {
    const text = (node as JSXText).value.trim()
    if (text) {
      nodes.push({
        vbId: generateVbId(node, filePath),
        type: 'text',
        tagName: '#text',
        className: '',
        props: {},
        children: [],
        loc: {
          start: { line: node.loc!.start.line, column: node.loc!.start.column, index: node.start ?? 0 },
          end: { line: node.loc!.end.line, column: node.loc!.end.column, index: node.end ?? source.length },
        },
        editable: true,
        isTextOnly: true,
        depth,
      })
    }
  } else if (node.type === 'JSXExpressionContainer') {
    const container = node as JSXExpressionContainer
    const expr = container.expression

    // String literal expressions are editable as text
    if (expr.type === 'StringLiteral') {
      nodes.push({
        vbId: generateVbId(node, filePath),
        type: 'text',
        tagName: '#text',
        className: '',
        props: { value: expr.value },
        children: [],
        loc: {
          start: { line: node.loc!.start.line, column: node.loc!.start.column, index: node.start ?? 0 },
          end: { line: node.loc!.end.line, column: node.loc!.end.column, index: node.end ?? source.length },
        },
        editable: true,
        isTextOnly: true,
        depth,
      })
    } else if (expr.type !== 'JSXEmptyExpression') {
      // Complex expression — mark as non-editable expression node
      nodes.push({
        vbId: generateVbId(node, filePath),
        type: 'expression',
        tagName: '#expression',
        className: '',
        props: { expressionType: expr.type },
        children: [],
        loc: {
          start: { line: node.loc!.start.line, column: node.loc!.start.column, index: node.start ?? 0 },
          end: { line: node.loc!.end.line, column: node.loc!.end.column, index: node.end ?? source.length },
        },
        editable: false,
        isTextOnly: false,
        depth,
      })
    }
  }

  return nodes
}

// ─── Find the JSX return statement of the default export ─────

function findComponentReturn(ast: BabelFile): { node: Node; componentName: string | null } | null {
  const body = ast.program.body

  for (const stmt of body) {
    // export default function Foo() { return <jsx> }
    if (stmt.type === 'ExportDefaultDeclaration') {
      const decl = (stmt as ExportDefaultDeclaration).declaration
      if (decl.type === 'FunctionDeclaration') {
        const func = decl as FunctionDeclaration
        const ret = findReturn(func.body)
        if (ret) return { node: ret, componentName: func.id?.name ?? null }
      }
      if (decl.type === 'ArrowFunctionExpression') {
        const arrow = decl as ArrowFunctionExpression
        if (arrow.body.type === 'BlockStatement') {
          const ret = findReturn(arrow.body)
          if (ret) return { node: ret, componentName: null }
        } else {
          // Implicit return: () => <jsx>
          return { node: arrow.body, componentName: null }
        }
      }
      // export default Identifier — look for the function in body
      if (decl.type === 'Identifier') {
        const name = decl.name
        for (const s of body) {
          if (s.type === 'FunctionDeclaration' && (s as FunctionDeclaration).id?.name === name) {
            const ret = findReturn((s as FunctionDeclaration).body)
            if (ret) return { node: ret, componentName: name }
          }
          if (s.type === 'VariableDeclaration') {
            for (const d of (s as VariableDeclaration).declarations) {
              if (d.id.type === 'Identifier' && d.id.name === name && d.init) {
                if (d.init.type === 'ArrowFunctionExpression') {
                  const arrow = d.init as ArrowFunctionExpression
                  if (arrow.body.type === 'BlockStatement') {
                    const ret = findReturn(arrow.body)
                    if (ret) return { node: ret, componentName: name }
                  } else {
                    return { node: arrow.body, componentName: name }
                  }
                }
              }
            }
          }
        }
      }
    }

    // Named export: export function Foo()
    if (stmt.type === 'ExportNamedDeclaration') {
      const named = stmt as ExportNamedDeclaration
      if (named.declaration?.type === 'FunctionDeclaration') {
        const func = named.declaration as FunctionDeclaration
        const ret = findReturn(func.body)
        if (ret) return { node: ret, componentName: func.id?.name ?? null }
      }
    }
  }

  // Fallback: look for any exported function with a JSX return
  for (const stmt of body) {
    if (stmt.type === 'FunctionDeclaration') {
      const func = stmt as FunctionDeclaration
      const ret = findReturn(func.body)
      if (ret && containsJSX(ret)) return { node: ret, componentName: func.id?.name ?? null }
    }
    if (stmt.type === 'VariableDeclaration') {
      for (const d of (stmt as VariableDeclaration).declarations) {
        if (d.init?.type === 'ArrowFunctionExpression') {
          const arrow = d.init as ArrowFunctionExpression
          if (arrow.body.type === 'BlockStatement') {
            const ret = findReturn(arrow.body)
            if (ret && containsJSX(ret)) {
              const name = d.id.type === 'Identifier' ? d.id.name : null
              return { node: ret, componentName: name }
            }
          } else if (containsJSX(arrow.body)) {
            const name = d.id.type === 'Identifier' ? d.id.name : null
            return { node: arrow.body, componentName: name }
          }
        }
      }
    }
  }

  return null
}

function findReturn(block: Node): Node | null {
  if (block.type !== 'BlockStatement') return null
  for (const stmt of (block as { body: Node[] }).body) {
    if (stmt.type === 'ReturnStatement') {
      const ret = stmt as ReturnStatement
      return ret.argument ?? null
    }
  }
  return null
}

function containsJSX(node: Node): boolean {
  if (node.type === 'JSXElement' || node.type === 'JSXFragment') return true
  if (node.type === 'ParenthesizedExpression' && 'expression' in node) {
    return containsJSX((node as { expression: Node }).expression)
  }
  return false
}

// ─── Extract imports ─────────────────────────────────────────

function extractImports(ast: BabelFile): ImportInfo[] {
  const imports: ImportInfo[] = []
  for (const stmt of ast.program.body) {
    if (stmt.type !== 'ImportDeclaration') continue
    const imp = stmt as ImportDeclaration
    const specifiers: ImportInfo['specifiers'] = []
    for (const spec of imp.specifiers) {
      if (spec.type === 'ImportDefaultSpecifier') {
        specifiers.push({ local: spec.local.name, imported: 'default', type: 'default' })
      } else if (spec.type === 'ImportSpecifier') {
        const imported = spec.imported.type === 'Identifier' ? spec.imported.name : spec.imported.value
        specifiers.push({ local: spec.local.name, imported, type: 'named' })
      } else if (spec.type === 'ImportNamespaceSpecifier') {
        specifiers.push({ local: spec.local.name, imported: '*', type: 'namespace' })
      }
    }
    imports.push({
      source: imp.source.value,
      specifiers,
      loc: {
        start: { line: imp.loc!.start.line, column: imp.loc!.start.column },
        end: { line: imp.loc!.end.line, column: imp.loc!.end.column },
      },
    })
  }
  return imports
}

// ─── Syncability scoring ─────────────────────────────────────

interface SyncabilityResult {
  syncable: boolean
  score: number
  reason?: string
}

function scoreSyncability(source: string, tree: VisualNode[], componentName: string | null): SyncabilityResult {
  let score = 100
  const issues: string[] = []

  // No component found
  if (!componentName && tree.length === 0) {
    return { syncable: false, score: 0, reason: 'No React component with JSX return found' }
  }

  // File too large (>500 lines → penalty, >2000 → unsyncable)
  const lineCount = source.split('\n').length
  if (lineCount > 2000) {
    return { syncable: false, score: 10, reason: `File too large (${lineCount} lines) — split into smaller components` }
  }
  if (lineCount > 500) {
    score -= 15
    issues.push('Large file')
  }

  // Check for patterns that reduce syncability
  if (source.includes('dangerouslySetInnerHTML')) {
    score -= 30
    issues.push('Uses dangerouslySetInnerHTML')
  }
  if (/\beval\s*\(/.test(source)) {
    score -= 40
    issues.push('Uses eval()')
  }

  // Check for dynamic component rendering
  const dynamicComponentPattern = /\{.*<\s*[a-z]/
  if (dynamicComponentPattern.test(source)) {
    score -= 10
  }

  // Check for render props / children-as-function
  if (/children\s*\(\s*\{/.test(source) || /render\s*=\s*\{\s*\(/.test(source)) {
    score -= 20
    issues.push('Render props or children-as-function')
  }

  // Bonus for well-structured section patterns
  const hasSections = tree.some(n => n.sectionHint)
  if (hasSections) score = Math.min(100, score + 5)

  // Bonus for data-vb-id annotations
  if (source.includes('data-vb-id')) score = Math.min(100, score + 5)

  // Bonus for Tailwind usage
  if (source.includes('className=')) score = Math.min(100, score + 3)

  const syncable = score >= 30
  const reason = !syncable ? issues.join('; ') || 'Low syncability score' : undefined

  return { syncable, score: Math.max(0, Math.min(100, score)), reason }
}

// ─── Public API ──────────────────────────────────────────────

/**
 * Analyze a React TSX/JSX file and extract its visual builder tree.
 */
export function analyzeFile(source: string, filePath: string): FileAnalysis {
  try {
    const ast = parse(source, PARSER_OPTIONS)

    const result = findComponentReturn(ast)
    const componentName = result?.componentName ?? null

    let tree: VisualNode[] = []
    if (result?.node) {
      // Unwrap parenthesized expression if needed
      let jsxRoot = result.node
      if (jsxRoot.type === 'ParenthesizedExpression' && 'expression' in jsxRoot) {
        jsxRoot = (jsxRoot as { expression: Node }).expression
      }
      tree = extractVisualTree(jsxRoot, filePath, source)
    }

    const imports = extractImports(ast)
    const { syncable, score, reason } = scoreSyncability(source, tree, componentName)

    return {
      filePath,
      syncable,
      unsyncableReason: reason,
      syncScore: score,
      componentName,
      tree,
      imports,
      sourceLength: source.length,
    }
  } catch (err) {
    return {
      filePath,
      syncable: false,
      unsyncableReason: `Parse error: ${err instanceof Error ? err.message : String(err)}`,
      syncScore: 0,
      componentName: null,
      tree: [],
      imports: [],
      sourceLength: source.length,
    }
  }
}

/**
 * Analyze multiple files and return analyses sorted by syncability.
 */
export function analyzeWorkspace(
  files: Array<{ path: string; content: string }>,
): FileAnalysis[] {
  return files
    .filter(f => /\.(tsx|jsx)$/.test(f.path))
    .map(f => analyzeFile(f.content, f.path))
    .sort((a, b) => b.syncScore - a.syncScore)
}

// ─── Transform operations ────────────────────────────────────

/**
 * Find a node in the tree by vbId.
 */
function findNodeInTree(tree: VisualNode[], vbId: string): VisualNode | null {
  for (const node of tree) {
    if (node.vbId === vbId) return node
    const found = findNodeInTree(node.children, vbId)
    if (found) return found
  }
  return null
}

/**
 * Find a node and its parent.
 */
function findNodeWithParent(
  tree: VisualNode[],
  vbId: string,
  parent: VisualNode | null = null,
): { node: VisualNode; parent: VisualNode | null; index: number } | null {
  for (let i = 0; i < tree.length; i++) {
    if (tree[i].vbId === vbId) return { node: tree[i], parent, index: i }
    const found = findNodeWithParent(tree[i].children, vbId, tree[i])
    if (found) return found
  }
  return null
}

/**
 * Apply a transform operation to source code.
 * Returns the modified source code, or null if the transform failed.
 *
 * Uses character-index-based string splicing for format preservation.
 */
export function applyTransform(source: string, tree: VisualNode[], op: TransformOp): string | null {
  switch (op.type) {
    case 'replaceText': {
      const node = findNodeInTree(tree, op.vbId)
      if (!node) return null
      if (node.type !== 'text') return null
      // Replace the text content between the node's start and end indices
      const before = source.slice(0, node.loc.start.index)
      const after = source.slice(node.loc.end.index)
      return before + op.newText + after
    }

    case 'replaceClassName': {
      const node = findNodeInTree(tree, op.vbId)
      if (!node || (node.type !== 'element' && node.type !== 'component')) return null

      // Find className="..." or className={...} in the source range
      const nodeSource = source.slice(node.loc.start.index, node.loc.end.index)
      // Match className="..." pattern
      const classNameMatch = nodeSource.match(/className\s*=\s*"([^"]*)"/)
      if (classNameMatch) {
        const matchStart = node.loc.start.index + nodeSource.indexOf(classNameMatch[0])
        const matchEnd = matchStart + classNameMatch[0].length
        const replacement = `className="${op.newClassName}"`
        return source.slice(0, matchStart) + replacement + source.slice(matchEnd)
      }
      // Match className={cn("...")} or className={"..."}
      const exprMatch = nodeSource.match(/className\s*=\s*\{[^}]*\}/)
      if (exprMatch) {
        const matchStart = node.loc.start.index + nodeSource.indexOf(exprMatch[0])
        const matchEnd = matchStart + exprMatch[0].length
        const replacement = `className="${op.newClassName}"`
        return source.slice(0, matchStart) + replacement + source.slice(matchEnd)
      }
      // No className attribute found — add one after the tag name
      const tagMatch = nodeSource.match(/^<[A-Za-z][A-Za-z0-9.]*/)
      if (tagMatch) {
        const insertPos = node.loc.start.index + tagMatch[0].length
        return source.slice(0, insertPos) + ` className="${op.newClassName}"` + source.slice(insertPos)
      }
      return null
    }

    case 'delete': {
      const found = findNodeWithParent(tree, op.vbId)
      if (!found) return null
      const { node } = found
      // Remove the node and any surrounding whitespace
      let start = node.loc.start.index
      let end = node.loc.end.index
      // Consume trailing newline if present
      if (source[end] === '\n') end++
      // Consume leading whitespace on the same line
      while (start > 0 && source[start - 1] === ' ') start--
      return source.slice(0, start) + source.slice(end)
    }

    case 'insert': {
      const parent = findNodeInTree(tree, op.parentVbId)
      if (!parent) return null

      // Find insertion point among parent's children
      let insertIndex: number
      if (op.index >= parent.children.length) {
        // Insert at end — before the closing tag
        const closingTagMatch = source.slice(0, parent.loc.end.index).lastIndexOf('</')
        insertIndex = closingTagMatch > parent.loc.start.index ? closingTagMatch : parent.loc.end.index
      } else if (op.index === 0) {
        // Insert at beginning — after the opening tag
        const nodeSource = source.slice(parent.loc.start.index, parent.loc.end.index)
        const openingEnd = nodeSource.indexOf('>') + 1
        insertIndex = parent.loc.start.index + openingEnd
      } else {
        // Insert before the child at op.index
        const beforeChild = parent.children[op.index]
        insertIndex = beforeChild.loc.start.index
      }

      // Determine indentation from parent
      const lineStart = source.lastIndexOf('\n', parent.loc.start.index) + 1
      const parentIndent = source.slice(lineStart, parent.loc.start.index).match(/^\s*/)?.[0] ?? ''
      const childIndent = parentIndent + '  '

      let result = source.slice(0, insertIndex) + '\n' + childIndent + op.jsx + '\n' + source.slice(insertIndex)

      // Add import if needed
      if (op.importNeeded) {
        result = addImport(result, op.importNeeded.source, op.importNeeded.specifier)
      }

      return result
    }

    case 'reorder': {
      const parent = findNodeInTree(tree, op.parentVbId)
      if (!parent) return null
      const childFound = findNodeWithParent(parent.children, op.childVbId, parent)
      if (!childFound) return null

      const { node: child, index: oldIndex } = childFound
      if (oldIndex === op.newIndex) return source // No change

      // Extract the child's source
      const childSource = source.slice(child.loc.start.index, child.loc.end.index)

      // Delete the child first
      let result = applyTransform(source, tree, { type: 'delete', vbId: op.childVbId })
      if (!result) return null

      // Re-parse to get updated positions
      const updatedAnalysis = analyzeFile(result, 'temp.tsx')
      const updatedParent = findNodeInTree(updatedAnalysis.tree, op.parentVbId)
      if (!updatedParent) return null

      // Insert at new position
      return applyTransform(result, updatedAnalysis.tree, {
        type: 'insert',
        parentVbId: op.parentVbId,
        index: op.newIndex > oldIndex ? op.newIndex - 1 : op.newIndex,
        jsx: childSource,
      })
    }

    case 'updateProp': {
      const node = findNodeInTree(tree, op.vbId)
      if (!node || (node.type !== 'element' && node.type !== 'component')) return null

      const nodeSource = source.slice(node.loc.start.index, node.loc.end.index)
      // Try to find existing prop
      const propRegex = new RegExp(`${op.propName}\\s*=\\s*(?:"[^"]*"|\\{[^}]*\\})`)
      const propMatch = nodeSource.match(propRegex)

      if (propMatch) {
        // Replace existing prop value
        const matchStart = node.loc.start.index + nodeSource.indexOf(propMatch[0])
        const matchEnd = matchStart + propMatch[0].length
        const isString = /^".*"$/.test(op.propValue) || !/[{}\[\]()]/.test(op.propValue)
        const replacement = isString
          ? `${op.propName}="${op.propValue.replace(/^"|"$/g, '')}"`
          : `${op.propName}={${op.propValue}}`
        return source.slice(0, matchStart) + replacement + source.slice(matchEnd)
      } else {
        // Add new prop after tag name
        const tagMatch = nodeSource.match(/^<[A-Za-z][A-Za-z0-9.]*/)
        if (!tagMatch) return null
        const insertPos = node.loc.start.index + tagMatch[0].length
        const isString = /^".*"$/.test(op.propValue) || !/[{}\[\]()]/.test(op.propValue)
        const propStr = isString
          ? ` ${op.propName}="${op.propValue.replace(/^"|"$/g, '')}"`
          : ` ${op.propName}={${op.propValue}}`
        return source.slice(0, insertPos) + propStr + source.slice(insertPos)
      }
    }

    default:
      return null
  }
}

/**
 * Add an import to the source code if it doesn't already exist.
 */
export function addImport(source: string, importSource: string, specifier: string): string {
  // Check if import already exists
  const importRegex = new RegExp(`from\\s+['"]${escapeRegex(importSource)}['"]`)
  if (importRegex.test(source)) {
    // Check if specifier already imported
    const specRegex = new RegExp(`\\b${escapeRegex(specifier)}\\b[^}]*from\\s+['"]${escapeRegex(importSource)}['"]`)
    if (specRegex.test(source)) return source // Already imported

    // Add specifier to existing import
    const existingImport = source.match(new RegExp(`import\\s*\\{([^}]*)\\}\\s*from\\s*['"]${escapeRegex(importSource)}['"]`))
    if (existingImport) {
      const oldImport = existingImport[0]
      const specifiers = existingImport[1]
      const newImport = oldImport.replace(specifiers, specifiers.trimEnd() + `, ${specifier}`)
      return source.replace(oldImport, newImport)
    }
  }

  // Add new import line at the end of the import block
  const lines = source.split('\n')
  let lastImportIndex = -1
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trimStart().startsWith('import ')) lastImportIndex = i
  }

  const newImportLine = `import { ${specifier} } from '${importSource}'`
  if (lastImportIndex >= 0) {
    lines.splice(lastImportIndex + 1, 0, newImportLine)
  } else {
    lines.unshift(newImportLine)
  }

  return lines.join('\n')
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Remove an import specifier. If it's the last specifier, remove the entire import line.
 */
export function removeImport(source: string, importSource: string, specifier: string): string {
  const lines = source.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line.includes(importSource)) continue

    const match = line.match(/import\s*\{([^}]*)\}\s*from/)
    if (!match) continue

    const specs = match[1].split(',').map(s => s.trim()).filter(Boolean)
    if (!specs.includes(specifier)) continue

    if (specs.length === 1) {
      // Remove entire import line
      lines.splice(i, 1)
    } else {
      // Remove just the specifier
      const newSpecs = specs.filter(s => s !== specifier).join(', ')
      lines[i] = line.replace(match[1], ` ${newSpecs} `)
    }
    break
  }

  return lines.join('\n')
}

// ─── Bulk file analysis for workspace ────────────────────────

/**
 * Analyze which files in a workspace are suitable for visual building.
 * Returns a summary with syncability status per file.
 */
export function getWorkspaceSyncReport(
  files: Array<{ path: string; content: string }>,
): {
  syncable: Array<{ path: string; componentName: string | null; score: number; sectionCount: number }>
  unsyncable: Array<{ path: string; reason: string; score: number }>
  totalFiles: number
  syncableCount: number
} {
  const analyses = analyzeWorkspace(files)
  const syncable: Array<{ path: string; componentName: string | null; score: number; sectionCount: number }> = []
  const unsyncable: Array<{ path: string; reason: string; score: number }> = []

  for (const a of analyses) {
    if (a.syncable) {
      const sectionCount = countSections(a.tree)
      syncable.push({ path: a.filePath, componentName: a.componentName, score: a.syncScore, sectionCount })
    } else {
      unsyncable.push({ path: a.filePath, reason: a.unsyncableReason ?? 'Unknown', score: a.syncScore })
    }
  }

  return {
    syncable,
    unsyncable,
    totalFiles: analyses.length,
    syncableCount: syncable.length,
  }
}

function countSections(tree: VisualNode[]): number {
  let count = 0
  for (const node of tree) {
    if (node.sectionHint) count++
    count += countSections(node.children)
  }
  return count
}
