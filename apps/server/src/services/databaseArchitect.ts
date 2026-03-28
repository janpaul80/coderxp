/**
 * databaseArchitect.ts — Roadmap Item #5: Autonomous Database Architect Expansion
 *
 * Sub-module of the Backend agent that provides database intelligence:
 *   1. Schema Designer — generates strong relational schemas from product requirements
 *   2. Migration Intelligence — detects evolution needs, generates migration plans
 *   3. Seed Data Generation — produces realistic dev seed data
 *   4. Query Analysis — detects N+1 risks, missing includes, inefficient patterns
 *   5. Supabase/RLS Policy Generation — RLS policies, ownership rules, access boundaries
 *
 * Integrated into:
 *   - builderQueue.ts (schema/seed generation phase)
 *   - codeGeneratorPrompts.ts (enriched prompt context)
 *   - workspaceIndexer.ts (repo-aware memory: schema intelligence)
 *   - codeQualityMetrics.ts (query analysis in quality phase)
 */

import { z } from 'zod'
import { completeJSON, complete, isProviderAvailable } from '../lib/providers'
import * as fs from 'fs'
import * as path from 'path'

// ═══════════════════════════════════════════════════════════════
// 1. SCHEMA DESIGNER
// ═══════════════════════════════════════════════════════════════

export interface SchemaEntity {
  name: string
  tableName: string
  fields: SchemaField[]
  indexes: SchemaIndex[]
  relations: SchemaRelation[]
  hasTimestamps: boolean
  hasOwnership: boolean
  hasSoftDelete: boolean
}

export interface SchemaField {
  name: string
  type: string        // Prisma type: String, Int, Boolean, DateTime, Json, etc.
  isRequired: boolean
  isUnique: boolean
  isId: boolean
  defaultValue?: string
  attributes?: string[]  // e.g. ['@db.Text', '@default(cuid())']
}

export interface SchemaIndex {
  fields: string[]
  unique: boolean
  name?: string
}

export interface SchemaRelation {
  fieldName: string
  relatedModel: string
  type: 'one-to-one' | 'one-to-many' | 'many-to-one'
  foreignKey: string
  onDelete: 'Cascade' | 'SetNull' | 'Restrict' | 'NoAction'
}

export interface SchemaDesign {
  entities: SchemaEntity[]
  enums: Array<{ name: string; values: string[] }>
  datasource: { provider: 'postgresql' | 'mysql' | 'sqlite'; url: string }
}

const schemaDesignSchema = z.object({
  entities: z.array(z.object({
    name: z.string(),
    tableName: z.string(),
    fields: z.array(z.object({
      name: z.string(),
      type: z.string(),
      isRequired: z.boolean(),
      isUnique: z.boolean(),
      isId: z.boolean(),
      defaultValue: z.string().optional(),
      attributes: z.array(z.string()).optional(),
    })),
    indexes: z.array(z.object({
      fields: z.array(z.string()),
      unique: z.boolean(),
      name: z.string().optional(),
    })),
    relations: z.array(z.object({
      fieldName: z.string(),
      relatedModel: z.string(),
      type: z.enum(['one-to-one', 'one-to-many', 'many-to-one']),
      foreignKey: z.string(),
      onDelete: z.enum(['Cascade', 'SetNull', 'Restrict', 'NoAction']),
    })),
    hasTimestamps: z.boolean(),
    hasOwnership: z.boolean(),
    hasSoftDelete: z.boolean(),
  })),
  enums: z.array(z.object({
    name: z.string(),
    values: z.array(z.string()),
  })),
})

const SCHEMA_DESIGNER_PROMPT = `You are a senior database architect designing a Prisma schema.
Given a product description and feature list, design a complete relational schema.

RULES:
- Every entity MUST have: id String @id @default(cuid()), createdAt DateTime @default(now()), updatedAt DateTime @updatedAt
- User model is ALWAYS required (id, name, email @unique, password, createdAt, updatedAt)
- If a model is user-owned, include: userId String + @relation to User + onDelete: Cascade
- Use lowercase plural table names via @@map("table_name")
- Add composite or single-field indexes for commonly queried fields (e.g. userId, status, email)
- Include status/enum fields where domain logic requires state tracking (e.g. order status, subscription status)
- Use proper Prisma relation syntax: @relation(fields: [fk], references: [id], onDelete: X)
- Use enum types for fields with a fixed set of values
- For soft deletes, add: deletedAt DateTime? (only where domain needs it, e.g. projects, posts)
- Foreign keys: use descriptive names (e.g. authorId, ownerId, projectId)
- Think about N+1: structure relations so eager loading is natural

Return JSON matching this schema:
{
  "entities": [
    {
      "name": "User",
      "tableName": "users",
      "fields": [{ "name": "id", "type": "String", "isRequired": true, "isUnique": false, "isId": true, "defaultValue": "cuid()", "attributes": ["@id", "@default(cuid())"] }],
      "indexes": [{ "fields": ["email"], "unique": true }],
      "relations": [],
      "hasTimestamps": true,
      "hasOwnership": false,
      "hasSoftDelete": false
    }
  ],
  "enums": [{ "name": "Status", "values": ["ACTIVE", "INACTIVE"] }]
}

Return ONLY the JSON, no explanation.`

/**
 * Design a database schema from product requirements.
 */
export async function designSchema(
  summary: string,
  features: string[],
  integrations: string[],
  backendScope: string[],
  existingModels?: string[],
): Promise<SchemaDesign | null> {
  if (!isProviderAvailable('openrouter') && !isProviderAvailable('openclaw')) {
    return null
  }

  const existingBlock = existingModels?.length
    ? `\n\nExisting models (do not duplicate, but extend/relate to):\n${existingModels.join(', ')}`
    : ''

  const integrationsBlock = integrations.length > 0
    ? `\nIntegrations: ${integrations.join(', ')}`
    : ''

  try {
    const result = await completeJSON({
      role: 'planner',
      schema: schemaDesignSchema,
      systemPrompt: SCHEMA_DESIGNER_PROMPT,
      userPrompt: `Product: ${summary}
Features: ${features.join(', ')}${integrationsBlock}
Backend scope: ${backendScope.join(', ')}${existingBlock}

Design the complete database schema.`,
      temperature: 0.3,
      maxTokens: 3000,
      retries: 1,
    })

    return {
      ...result.parsed,
      datasource: { provider: 'postgresql', url: 'env("DATABASE_URL")' },
    } as SchemaDesign
  } catch (err) {
    console.warn('[DatabaseArchitect] Schema design failed:', err instanceof Error ? err.message : err)
    return null
  }
}

/**
 * Convert a SchemaDesign into a complete Prisma schema string.
 */
export function renderPrismaSchema(design: SchemaDesign): string {
  const lines: string[] = [
    'generator client {',
    '  provider = "prisma-client-js"',
    '}',
    '',
    `datasource db {`,
    `  provider = "${design.datasource.provider}"`,
    `  url      = ${design.datasource.url}`,
    '}',
    '',
  ]

  // Render enums
  for (const en of design.enums) {
    lines.push(`enum ${en.name} {`)
    for (const v of en.values) {
      lines.push(`  ${v}`)
    }
    lines.push('}')
    lines.push('')
  }

  // Render models
  for (const entity of design.entities) {
    lines.push(`model ${entity.name} {`)

    // Fields
    for (const field of entity.fields) {
      let line = `  ${field.name}`
      line += ` ${field.type}`
      if (!field.isRequired && !field.isId) line += '?'

      if (field.attributes?.length) {
        line += ' ' + field.attributes.join(' ')
      } else {
        if (field.isId) line += ' @id'
        if (field.defaultValue) line += ` @default(${field.defaultValue})`
        if (field.isUnique && !field.isId) line += ' @unique'
      }
      lines.push(line)
    }

    // Relations (render relation fields inline)
    for (const rel of entity.relations) {
      if (rel.type === 'one-to-many') {
        lines.push(`  ${rel.fieldName} ${rel.relatedModel}[]`)
      } else {
        lines.push(`  ${rel.fieldName} ${rel.relatedModel} @relation(fields: [${rel.foreignKey}], references: [id], onDelete: ${rel.onDelete})`)
      }
    }

    // Indexes
    for (const idx of entity.indexes) {
      if (idx.unique) {
        if (idx.fields.length === 1) {
          // Already handled via @unique on field — skip duplicate
        } else {
          lines.push(`  @@unique([${idx.fields.join(', ')}])`)
        }
      } else {
        lines.push(`  @@index([${idx.fields.join(', ')}])`)
      }
    }

    lines.push(`  @@map("${entity.tableName}")`)
    lines.push('}')
    lines.push('')
  }

  return lines.join('\n')
}

// ═══════════════════════════════════════════════════════════════
// 2. MIGRATION INTELLIGENCE
// ═══════════════════════════════════════════════════════════════

export interface MigrationPlan {
  hasChanges: boolean
  changes: MigrationChange[]
  migrationName: string
  sql?: string
  warnings: string[]
}

export interface MigrationChange {
  type: 'add_model' | 'add_field' | 'remove_field' | 'modify_field' | 'add_index' | 'add_relation' | 'add_enum' | 'rename'
  target: string
  description: string
  breaking: boolean
}

/**
 * Compare existing schema models with a new design and generate a migration plan.
 */
export function detectSchemaEvolution(
  existingModels: string[],
  existingSchemaContent: string | null,
  newDesign: SchemaDesign,
): MigrationPlan {
  const changes: MigrationChange[] = []
  const warnings: string[] = []

  const existingModelSet = new Set(existingModels.map(m => m.toLowerCase()))
  const existingFieldMap = existingSchemaContent
    ? parseExistingFields(existingSchemaContent)
    : new Map<string, Set<string>>()

  // Detect new models
  for (const entity of newDesign.entities) {
    if (!existingModelSet.has(entity.name.toLowerCase())) {
      changes.push({
        type: 'add_model',
        target: entity.name,
        description: `Add new model ${entity.name} with ${entity.fields.length} fields`,
        breaking: false,
      })
    } else {
      // Detect new fields in existing models
      const existingFields = existingFieldMap.get(entity.name.toLowerCase()) ?? new Set()
      for (const field of entity.fields) {
        if (!existingFields.has(field.name.toLowerCase())) {
          const isBreaking = field.isRequired && !field.defaultValue && !field.isId
          changes.push({
            type: 'add_field',
            target: `${entity.name}.${field.name}`,
            description: `Add field ${field.name} (${field.type}${field.isRequired ? '' : '?'}) to ${entity.name}`,
            breaking: isBreaking,
          })
          if (isBreaking) {
            warnings.push(`Adding required field ${entity.name}.${field.name} without default — existing rows will fail. Consider making it optional or adding a default.`)
          }
        }
      }

      // Detect new relations
      for (const rel of entity.relations) {
        if (!existingFields.has(rel.fieldName.toLowerCase())) {
          changes.push({
            type: 'add_relation',
            target: `${entity.name}.${rel.fieldName}`,
            description: `Add ${rel.type} relation to ${rel.relatedModel}`,
            breaking: false,
          })
        }
      }
    }
  }

  // Detect new enums
  for (const en of newDesign.enums) {
    if (existingSchemaContent && !new RegExp(`enum\\s+${en.name}\\s*\\{`, 'i').test(existingSchemaContent)) {
      changes.push({
        type: 'add_enum',
        target: en.name,
        description: `Add enum ${en.name} with values: ${en.values.join(', ')}`,
        breaking: false,
      })
    }
  }

  // Detect new indexes
  for (const entity of newDesign.entities) {
    for (const idx of entity.indexes) {
      if (!idx.unique || idx.fields.length > 1) {
        changes.push({
          type: 'add_index',
          target: `${entity.name}.[${idx.fields.join(', ')}]`,
          description: `Add ${idx.unique ? 'unique ' : ''}index on ${entity.name}(${idx.fields.join(', ')})`,
          breaking: false,
        })
      }
    }
  }

  const migrationName = changes.length > 0
    ? changes[0].type === 'add_model'
      ? `add_${changes.filter(c => c.type === 'add_model').map(c => c.target.toLowerCase()).join('_and_')}`
      : `update_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`
    : 'no_changes'

  return {
    hasChanges: changes.length > 0,
    changes,
    migrationName,
    warnings,
  }
}

/** Parse existing schema file to extract model→field mappings */
function parseExistingFields(schemaContent: string): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>()
  const modelRegex = /model\s+(\w+)\s*\{([^}]+)\}/g
  let match: RegExpExecArray | null

  while ((match = modelRegex.exec(schemaContent)) !== null) {
    const modelName = match[1].toLowerCase()
    const body = match[2]
    const fields = new Set<string>()

    for (const line of body.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('@@') || trimmed.startsWith('//')) continue
      const fieldMatch = trimmed.match(/^(\w+)\s+/)
      if (fieldMatch) fields.add(fieldMatch[1].toLowerCase())
    }

    map.set(modelName, fields)
  }

  return map
}

/**
 * Generate migration instructions (human-readable + Prisma CLI commands).
 */
export function generateMigrationInstructions(plan: MigrationPlan): string {
  if (!plan.hasChanges) return 'No schema changes detected.'

  const lines: string[] = [
    `Migration: ${plan.migrationName}`,
    `Changes: ${plan.changes.length}`,
    '',
  ]

  for (const change of plan.changes) {
    const prefix = change.breaking ? '[BREAKING] ' : ''
    lines.push(`  ${prefix}${change.description}`)
  }

  if (plan.warnings.length > 0) {
    lines.push('')
    lines.push('Warnings:')
    for (const w of plan.warnings) {
      lines.push(`  ⚠ ${w}`)
    }
  }

  lines.push('')
  lines.push('Run:')
  lines.push(`  npx prisma migrate dev --name ${plan.migrationName}`)
  lines.push('  npx prisma generate')

  return lines.join('\n')
}

// ═══════════════════════════════════════════════════════════════
// 3. SEED DATA GENERATION
// ═══════════════════════════════════════════════════════════════

export interface SeedDataPlan {
  seedFile: string       // Full seed script content
  entityCount: number    // Number of entities being seeded
  recordCount: number    // Total records across all entities
}

const seedDataSchema = z.object({
  seedScript: z.string(),
  entities: z.array(z.object({
    model: z.string(),
    count: z.number(),
  })),
})

/**
 * Generate a realistic Prisma seed script for the given schema.
 */
export async function generateSeedData(
  schemaEntities: string[],
  summary: string,
  features: string[],
  hasAuth: boolean,
): Promise<SeedDataPlan | null> {
  if (!isProviderAvailable('openrouter') && !isProviderAvailable('openclaw') && !isProviderAvailable('blackbox')) {
    return buildFallbackSeed(schemaEntities, hasAuth)
  }

  try {
    const result = await completeJSON({
      role: 'planner',
      schema: seedDataSchema,
      systemPrompt: `You are a database seed data generator for a Prisma + PostgreSQL project.
Generate a complete prisma/seed.ts file that populates the database with realistic development data.

RULES:
- Import { PrismaClient } from '@prisma/client'
- const prisma = new PrismaClient()
- async function main() { ... }
- main().then(() => prisma.$disconnect()).catch(e => { console.error(e); prisma.$disconnect(); process.exit(1) })
- Use prisma.model.createMany or prisma.model.create
- Generate 3-5 users with realistic names, emails (user1@example.com, etc.), bcrypt-hashed passwords (use a pre-hashed string for 'password123')
- Generate 5-10 records per entity with realistic domain-specific data
- Respect foreign key relationships (create parents before children)
- Use proper date ranges (within last 6 months)
- Status fields should have varied values (not all the same)
- Use upsert or deleteMany before creating to make the seed idempotent

Return JSON: { "seedScript": "full TypeScript content", "entities": [{ "model": "User", "count": 5 }] }
Return ONLY the JSON.`,
      userPrompt: `Product: ${summary}
Features: ${features.join(', ')}
Models to seed: ${schemaEntities.join(', ')}
Has auth: ${hasAuth}

Generate the seed script.`,
      temperature: 0.4,
      maxTokens: 3000,
      retries: 1,
    })

    const entities = result.parsed.entities as Array<{ model: string; count: number }>
    return {
      seedFile: result.parsed.seedScript as string,
      entityCount: entities.length,
      recordCount: entities.reduce((sum, e) => sum + e.count, 0),
    }
  } catch (err) {
    console.warn('[DatabaseArchitect] Seed generation failed:', err instanceof Error ? err.message : err)
    return buildFallbackSeed(schemaEntities, hasAuth)
  }
}

function buildFallbackSeed(models: string[], hasAuth: boolean): SeedDataPlan {
  const lines: string[] = [
    "import { PrismaClient } from '@prisma/client'",
    '',
    'const prisma = new PrismaClient()',
    '',
    'async function main() {',
    '  console.log("Seeding database...")',
    '',
  ]

  if (hasAuth || models.some(m => m.toLowerCase() === 'user')) {
    lines.push(
      '  // Pre-hashed password for "password123" (bcrypt 12 rounds)',
      '  const hashedPassword = "$2b$12$LQv3c1yqBo9SkvXS7QTJPOogt2Q6g0/N2.6C3cZeJm7pC5DGK1P2e"',
      '',
      '  await prisma.user.createMany({',
      '    data: [',
      '      { name: "Alice Johnson", email: "alice@example.com", password: hashedPassword },',
      '      { name: "Bob Smith", email: "bob@example.com", password: hashedPassword },',
      '      { name: "Carol Davis", email: "carol@example.com", password: hashedPassword },',
      '    ],',
      '    skipDuplicates: true,',
      '  })',
      '',
    )
  }

  for (const model of models.filter(m => m.toLowerCase() !== 'user')) {
    const lower = model.charAt(0).toLowerCase() + model.slice(1)
    lines.push(
      `  await prisma.${lower}.createMany({`,
      '    data: [',
      `      { title: "Sample ${model} 1" },`,
      `      { title: "Sample ${model} 2" },`,
      `      { title: "Sample ${model} 3" },`,
      '    ],',
      '    skipDuplicates: true,',
      '  })',
      '',
    )
  }

  lines.push(
    '  console.log("Seeding complete.")',
    '}',
    '',
    'main()',
    '  .then(() => prisma.$disconnect())',
    '  .catch((e) => {',
    '    console.error(e)',
    '    prisma.$disconnect()',
    '    process.exit(1)',
    '  })',
  )

  return {
    seedFile: lines.join('\n'),
    entityCount: models.length,
    recordCount: models.length * 3,
  }
}

// ═══════════════════════════════════════════════════════════════
// 4. QUERY ANALYSIS / N+1 DETECTION
// ═══════════════════════════════════════════════════════════════

export interface QueryIssue {
  type: 'n_plus_one' | 'missing_include' | 'inefficient_pattern' | 'repeated_fetch' | 'missing_index'
  severity: 'high' | 'medium' | 'low'
  filePath: string
  line?: number
  description: string
  suggestion: string
}

export interface QueryAnalysisReport {
  issues: QueryIssue[]
  score: number           // 0-100 (100 = no issues)
  totalFilesScanned: number
  totalQueriesDetected: number
}

/**
 * Analyze workspace source files for common query anti-patterns.
 * Regex-based static analysis — no AST parsing, no runtime.
 */
export function analyzeQueries(workspacePath: string): QueryAnalysisReport {
  const issues: QueryIssue[] = []
  let totalQueries = 0

  // Scan server route/service files
  const scanDirs = [
    path.join(workspacePath, 'server', 'routes'),
    path.join(workspacePath, 'server', 'services'),
    path.join(workspacePath, 'server', 'lib'),
    path.join(workspacePath, 'src', 'server'),
    path.join(workspacePath, 'src', 'routes'),
    path.join(workspacePath, 'src', 'api'),
  ]

  const files: Array<{ filePath: string; content: string }> = []
  for (const dir of scanDirs) {
    if (!fs.existsSync(dir)) continue
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isFile()) continue
        if (!/\.(ts|tsx|js|jsx)$/.test(entry.name)) continue
        const fullPath = path.join(dir, entry.name)
        try {
          const content = fs.readFileSync(fullPath, 'utf-8')
          files.push({ filePath: fullPath.replace(workspacePath + path.sep, '').replace(/\\/g, '/'), content })
        } catch { /* skip unreadable */ }
      }
    } catch { /* skip unreadable dirs */ }
  }

  for (const file of files) {
    const lines = file.content.split('\n')

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // Count Prisma queries
      const prismaQueryMatch = line.match(/prisma\.\w+\.(find|create|update|delete|count|aggregate|group)/g)
      if (prismaQueryMatch) totalQueries += prismaQueryMatch.length

      // N+1 Detection: findMany followed by a loop with individual finds
      if (/prisma\.\w+\.findMany\b/.test(line)) {
        // Look ahead 10 lines for a loop containing another prisma query
        const lookahead = lines.slice(i + 1, i + 12).join('\n')
        if (/for\s*\(|\.forEach|\.map\s*\(/.test(lookahead) && /prisma\.\w+\.find/.test(lookahead)) {
          issues.push({
            type: 'n_plus_one',
            severity: 'high',
            filePath: file.filePath,
            line: i + 1,
            description: `Potential N+1 query: findMany followed by individual queries in a loop`,
            suggestion: 'Use include/select to eager-load related data in the initial findMany, or use a single query with a WHERE IN clause.',
          })
        }

        // Missing include detection: findMany without include on a model that likely has relations
        if (!/include\s*:/.test(line) && !/select\s*:/.test(line)) {
          const modelMatch = line.match(/prisma\.(\w+)\.findMany/)
          if (modelMatch) {
            issues.push({
              type: 'missing_include',
              severity: 'medium',
              filePath: file.filePath,
              line: i + 1,
              description: `prisma.${modelMatch[1]}.findMany without include/select — may fetch incomplete data or cause N+1 downstream`,
              suggestion: `Add include: { ... } to eagerly load related records, or use select: { ... } to fetch only needed fields.`,
            })
          }
        }
      }

      // Repeated fetch detection: same prisma query called multiple times in a function
      if (/prisma\.\w+\.findUnique\b/.test(line)) {
        const queryTarget = line.match(/prisma\.(\w+)\.findUnique/)
        if (queryTarget) {
          const fnBody = lines.slice(Math.max(0, i - 20), i + 20).join('\n')
          const occurrences = (fnBody.match(new RegExp(`prisma\\.${queryTarget[1]}\\.findUnique`, 'g')) ?? []).length
          if (occurrences >= 2) {
            issues.push({
              type: 'repeated_fetch',
              severity: 'medium',
              filePath: file.filePath,
              line: i + 1,
              description: `prisma.${queryTarget[1]}.findUnique called ${occurrences} times in proximity — possible duplicate fetch`,
              suggestion: 'Cache the first query result in a variable and reuse it instead of querying again.',
            })
          }
        }
      }

      // Raw SQL without parameterization
      if (/\$queryRaw\s*`/.test(line) || /\$executeRaw\s*`/.test(line)) {
        if (/\$\{/.test(line)) {
          issues.push({
            type: 'inefficient_pattern',
            severity: 'high',
            filePath: file.filePath,
            line: i + 1,
            description: 'Raw SQL with string interpolation — potential SQL injection risk',
            suggestion: 'Use Prisma.$queryRaw with Prisma.sql template tag for parameterized queries.',
          })
        }
      }
    }
  }

  // Deduplicate repeated_fetch issues (same file + model)
  const dedupedIssues = deduplicateIssues(issues)

  const score = Math.max(0, 100 - dedupedIssues.reduce((sum, i) => {
    if (i.severity === 'high') return sum + 15
    if (i.severity === 'medium') return sum + 8
    return sum + 3
  }, 0))

  return {
    issues: dedupedIssues,
    score,
    totalFilesScanned: files.length,
    totalQueriesDetected: totalQueries,
  }
}

function deduplicateIssues(issues: QueryIssue[]): QueryIssue[] {
  const seen = new Set<string>()
  return issues.filter(issue => {
    const key = `${issue.type}:${issue.filePath}:${issue.description.slice(0, 50)}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

// ═══════════════════════════════════════════════════════════════
// 5. SUPABASE / RLS POLICY GENERATION
// ═══════════════════════════════════════════════════════════════

export interface RLSPolicy {
  modelName: string
  tableName: string
  policies: Array<{
    name: string
    operation: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'ALL'
    role: 'authenticated' | 'anon' | 'service_role'
    using: string         // SQL expression for row-level check
    withCheck?: string    // SQL expression for INSERT/UPDATE check
    description: string
  }>
}

export interface RLSReport {
  policies: RLSPolicy[]
  enableRLSStatements: string[]
  totalPolicies: number
  sql: string             // Complete SQL for all policies
}

/**
 * Generate Supabase RLS policies from a schema design.
 */
export function generateRLSPolicies(design: SchemaDesign): RLSReport {
  const policies: RLSPolicy[] = []
  const enableStatements: string[] = []
  const sqlParts: string[] = [
    '-- Supabase Row Level Security (RLS) Policies',
    '-- Generated by CoderXP Database Architect',
    '',
  ]

  for (const entity of design.entities) {
    const tableName = entity.tableName
    const entityPolicies: RLSPolicy['policies'] = []

    // Enable RLS
    enableStatements.push(`ALTER TABLE "${tableName}" ENABLE ROW LEVEL SECURITY;`)
    sqlParts.push(`ALTER TABLE "${tableName}" ENABLE ROW LEVEL SECURITY;`)

    if (entity.hasOwnership) {
      // Owner-based policies: user can only access their own data
      const fkField = entity.fields.find(f => f.name === 'userId' || f.name === 'user_id')
      const ownerField = fkField ? fkField.name : 'userId'
      const ownerColumn = camelToSnake(ownerField)

      entityPolicies.push({
        name: `${tableName}_select_own`,
        operation: 'SELECT',
        role: 'authenticated',
        using: `auth.uid() = "${ownerColumn}"`,
        description: `Users can only read their own ${entity.name} records`,
      })
      entityPolicies.push({
        name: `${tableName}_insert_own`,
        operation: 'INSERT',
        role: 'authenticated',
        using: 'true',
        withCheck: `auth.uid() = "${ownerColumn}"`,
        description: `Users can only create ${entity.name} records owned by themselves`,
      })
      entityPolicies.push({
        name: `${tableName}_update_own`,
        operation: 'UPDATE',
        role: 'authenticated',
        using: `auth.uid() = "${ownerColumn}"`,
        withCheck: `auth.uid() = "${ownerColumn}"`,
        description: `Users can only update their own ${entity.name} records`,
      })
      entityPolicies.push({
        name: `${tableName}_delete_own`,
        operation: 'DELETE',
        role: 'authenticated',
        using: `auth.uid() = "${ownerColumn}"`,
        description: `Users can only delete their own ${entity.name} records`,
      })
    } else if (entity.name === 'User') {
      // User table: users can read/update their own profile
      entityPolicies.push({
        name: `${tableName}_select_own`,
        operation: 'SELECT',
        role: 'authenticated',
        using: `auth.uid() = "id"`,
        description: 'Users can read their own profile',
      })
      entityPolicies.push({
        name: `${tableName}_update_own`,
        operation: 'UPDATE',
        role: 'authenticated',
        using: `auth.uid() = "id"`,
        withCheck: `auth.uid() = "id"`,
        description: 'Users can update their own profile',
      })
    } else {
      // Public-readable with authenticated write
      entityPolicies.push({
        name: `${tableName}_select_all`,
        operation: 'SELECT',
        role: 'authenticated',
        using: 'true',
        description: `Authenticated users can read all ${entity.name} records`,
      })
      entityPolicies.push({
        name: `${tableName}_insert_auth`,
        operation: 'INSERT',
        role: 'authenticated',
        using: 'true',
        withCheck: 'true',
        description: `Authenticated users can create ${entity.name} records`,
      })
    }

    // Render SQL for this entity's policies
    for (const p of entityPolicies) {
      let sql = `CREATE POLICY "${p.name}" ON "${tableName}" FOR ${p.operation} TO ${p.role}`
      sql += ` USING (${p.using})`
      if (p.withCheck) sql += ` WITH CHECK (${p.withCheck})`
      sql += ';'
      sqlParts.push(sql)
    }
    sqlParts.push('')

    policies.push({ modelName: entity.name, tableName, policies: entityPolicies })
  }

  return {
    policies,
    enableRLSStatements: enableStatements,
    totalPolicies: policies.reduce((sum, p) => sum + p.policies.length, 0),
    sql: sqlParts.join('\n'),
  }
}

function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`).replace(/^_/, '')
}

// ═══════════════════════════════════════════════════════════════
// CONTEXT BUILDERS — for prompt injection
// ═══════════════════════════════════════════════════════════════

/**
 * Build a compact database intelligence context for prompt injection.
 */
export function buildDatabaseContext(
  design: SchemaDesign | null,
  queryReport: QueryAnalysisReport | null,
  rlsReport: RLSReport | null,
  migrationPlan: MigrationPlan | null,
): string {
  const lines: string[] = ['=== DATABASE INTELLIGENCE ===', '']

  if (design) {
    lines.push('--- Schema Design ---')
    for (const entity of design.entities) {
      const fieldNames = entity.fields.map(f => `${f.name}:${f.type}${f.isRequired ? '' : '?'}`).join(', ')
      const rels = entity.relations.map(r => `→${r.relatedModel}`).join(', ')
      lines.push(`  ${entity.name} (${entity.tableName}): ${fieldNames}${rels ? ' | Relations: ' + rels : ''}`)
    }
    if (design.enums.length > 0) {
      lines.push(`  Enums: ${design.enums.map(e => `${e.name}(${e.values.join('|')})`).join(', ')}`)
    }
    lines.push('')
  }

  if (queryReport && queryReport.issues.length > 0) {
    lines.push('--- Query Issues ---')
    lines.push(`  Score: ${queryReport.score}/100, Queries found: ${queryReport.totalQueriesDetected}`)
    for (const issue of queryReport.issues.slice(0, 8)) {
      lines.push(`  [${issue.severity}] ${issue.type}: ${issue.description}`)
      lines.push(`    Fix: ${issue.suggestion}`)
    }
    lines.push('')
  }

  if (rlsReport && rlsReport.totalPolicies > 0) {
    lines.push('--- RLS Policies ---')
    lines.push(`  Total: ${rlsReport.totalPolicies} policies across ${rlsReport.policies.length} tables`)
    for (const p of rlsReport.policies) {
      lines.push(`  ${p.modelName}: ${p.policies.map(pp => pp.name).join(', ')}`)
    }
    lines.push('')
  }

  if (migrationPlan && migrationPlan.hasChanges) {
    lines.push('--- Pending Migration ---')
    lines.push(`  Name: ${migrationPlan.migrationName}`)
    lines.push(`  Changes: ${migrationPlan.changes.length}`)
    for (const c of migrationPlan.changes.slice(0, 5)) {
      lines.push(`  ${c.breaking ? '[BREAKING] ' : ''}${c.description}`)
    }
    lines.push('')
  }

  if (lines.length <= 2) return '' // No intelligence to inject

  lines.push('Use the database intelligence above: follow the schema design, respect relations and indexes, address query issues in generated code, apply RLS patterns for Supabase builds.')

  return lines.join('\n')
}
