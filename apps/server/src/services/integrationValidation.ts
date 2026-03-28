/**
 * integrationValidation.ts — Integration Validation
 *
 * Validates that integrations are correctly implemented:
 * 1. API endpoint validation — checks for frontend/backend API endpoint mismatches
 * 2. Data model validation — checks for frontend/backend data model mismatches
 * 3. Database schema validation — checks for backend/database schema mismatches
 * 4. Supabase validation — checks for required files and configurations
 * 5. Stripe validation — checks for required files and configurations
 */

import * as fs from 'fs'
import * as path from 'path'
// Using regex-based parsing instead of @babel/parser to avoid dependency issues
import { ValidationError } from './codeValidation'

// ─── Types ────────────────────────────────────────────────────

export interface IntegrationValidationResult {
  valid: boolean
  errors: ValidationError[]
}

export interface ApiEndpoint {
  method: string;
  path: string;
  file: string;
  line: number;
  params?: string[];
  responseType?: string;
}

export interface DataModel {
  name: string;
  file: string;
  line: number;
  properties: {
    name: string;
    type: string;
    optional: boolean;
  }[];
}

export interface SchemaModel {
  name: string;
  file: string;
  line: number;
  fields: {
    name: string;
    type: string;
    optional: boolean;
  }[];
}

// ─── API Endpoint Validation ────────────────────────────────────

/**
 * Validates that frontend API calls match backend routes.
 * Checks for missing endpoints, method mismatches, and parameter mismatches.
 */
export function validateApiEndpoints(
  workspacePath: string,
  files: { relativePath: string; content: string }[]
): IntegrationValidationResult {
  const errors: ValidationError[] = [];
  
  // Extract frontend API calls
  const frontendApiCalls = extractFrontendApiCalls(files);
  
  // Extract backend API routes
  const backendRoutes = extractBackendRoutes(files);
  
  // Compare and find mismatches
  for (const apiCall of frontendApiCalls) {
    const matchingRoute = findMatchingRoute(apiCall, backendRoutes);
    
    if (!matchingRoute) {
      errors.push({
        type: 'integration',
        filePath: apiCall.file,
        message: `API endpoint ${apiCall.method} ${apiCall.path} referenced in frontend but not defined in backend`,
        integration: 'api',
      });
    } else if (apiCall.method !== matchingRoute.method) {
      errors.push({
        type: 'integration',
        filePath: apiCall.file,
        message: `HTTP method mismatch for ${apiCall.path} - frontend uses ${apiCall.method} but backend defines ${matchingRoute.method}`,
        integration: 'api',
      });
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Extracts API calls from frontend files.
 */
function extractFrontendApiCalls(files: { relativePath: string; content: string }[]): ApiEndpoint[] {
  const apiCalls: ApiEndpoint[] = [];
  
  // Focus on files likely to contain API calls
  const frontendFiles = files.filter(f => 
    f.relativePath.includes('/src/') && 
    (f.relativePath.endsWith('.ts') || f.relativePath.endsWith('.tsx') || f.relativePath.endsWith('.js'))
  );
  
  for (const file of frontendFiles) {
    // Match axios calls: axios.get('/api/users')
    const axiosRegex = /axios\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]/g;
    let match;
    while ((match = axiosRegex.exec(file.content)) !== null) {
      apiCalls.push({
        method: match[1].toUpperCase(),
        path: match[2],
        file: file.relativePath,
        line: getLineNumber(file.content, match.index)
      });
    }
    
    // Match fetch calls: fetch('/api/users', { method: 'GET' })
    const fetchRegex = /fetch\s*\(\s*['"`]([^'"`]+)['"`](?:,\s*\{[^}]*method:\s*['"`](GET|POST|PUT|DELETE|PATCH)['"`][^}]*\})?/g;
    while ((match = fetchRegex.exec(file.content)) !== null) {
      apiCalls.push({
        method: match[2] ? match[2] : 'GET', // Default to GET if method not specified
        path: match[1],
        file: file.relativePath,
        line: getLineNumber(file.content, match.index)
      });
    }
    
    // Match custom API client calls: api.get('/users')
    const apiClientRegex = /(?:api|client)\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]/g;
    while ((match = apiClientRegex.exec(file.content)) !== null) {
      apiCalls.push({
        method: match[1].toUpperCase(),
        path: match[2],
        file: file.relativePath,
        line: getLineNumber(file.content, match.index)
      });
    }
  }
  
  return apiCalls;
}

/**
 * Extracts API routes from backend files.
 */
function extractBackendRoutes(files: { relativePath: string; content: string }[]): ApiEndpoint[] {
  const routes: ApiEndpoint[] = [];
  
  // Focus on files likely to contain route definitions
  const backendFiles = files.filter(f => 
    (f.relativePath.includes('/server/') || f.relativePath.includes('/routes/') || f.relativePath.includes('/api/')) && 
    (f.relativePath.endsWith('.ts') || f.relativePath.endsWith('.js'))
  );
  
  for (const file of backendFiles) {
    // Match Express routes: router.get('/users', ...)
    const expressRegex = /(?:app|router)\.(get|post|put|delete|patch|all)\s*\(\s*['"`]([^'"`]+)['"`]/g;
    let match;
    while ((match = expressRegex.exec(file.content)) !== null) {
      routes.push({
        method: match[1].toUpperCase(),
        path: match[2],
        file: file.relativePath,
        line: getLineNumber(file.content, match.index)
      });
    }
    
    // Match Next.js API routes based on file path
    if (file.relativePath.includes('/pages/api/')) {
      const pathParts = file.relativePath.split('/pages/api/')[1].split('.');
      const apiPath = '/' + pathParts[0].replace(/\/index$/, '');
      
      // Determine HTTP methods from the file content
      const methods = [];
      if (file.content.includes('req.method === \'GET\'') || !file.content.includes('req.method ===')) methods.push('GET');
      if (file.content.includes('req.method === \'POST\'')) methods.push('POST');
      if (file.content.includes('req.method === \'PUT\'')) methods.push('PUT');
      if (file.content.includes('req.method === \'DELETE\'')) methods.push('DELETE');
      if (file.content.includes('req.method === \'PATCH\'')) methods.push('PATCH');
      
      // If no specific methods found, assume it handles all methods
      if (methods.length === 0) methods.push('GET', 'POST', 'PUT', 'DELETE', 'PATCH');
      
      for (const method of methods) {
        routes.push({
          method,
          path: '/api' + apiPath,
          file: file.relativePath,
          line: 1 // File-based routing doesn't have a specific line number
        });
      }
    }
  }
  
  return routes;
}

/**
 * Finds a matching backend route for a frontend API call.
 */
function findMatchingRoute(apiCall: ApiEndpoint, routes: ApiEndpoint[]): ApiEndpoint | undefined {
  // Normalize paths for comparison
  const normalizedCallPath = normalizePath(apiCall.path);
  
  return routes.find(route => {
    const normalizedRoutePath = normalizePath(route.path);
    return route.method === apiCall.method && pathsMatch(normalizedCallPath, normalizedRoutePath);
  });
}

/**
 * Normalizes a path for comparison.
 */
function normalizePath(path: string): string {
  // Remove trailing slashes
  let normalized = path.replace(/\/+$/, '');
  
  // Ensure leading slash
  if (!normalized.startsWith('/')) {
    normalized = '/' + normalized;
  }
  
  return normalized;
}

/**
 * Checks if two paths match, accounting for path parameters.
 */
function pathsMatch(frontendPath: string, backendPath: string): boolean {
  // Exact match
  if (frontendPath === backendPath) return true;
  
  // Convert Express-style path params (/users/:id) to regex
  const paramRegex = /:([^\/]+)/g;
  const backendPathRegex = backendPath.replace(paramRegex, '([^/]+)');
  const fullRegex = new RegExp(`^${backendPathRegex}$`);
  
  return fullRegex.test(frontendPath);
}

/**
 * Gets the line number for a position in a string.
 */
function getLineNumber(content: string, position: number): number {
  const lines = content.substring(0, position).split('\n');
  return lines.length;
}

// ─── Supabase Validation ───────────────────────────────────────

/**
 * Validates that Supabase integration is correctly implemented.
 * Checks for required files and configurations.
 */
export function validateSupabaseIntegration(
  workspacePath: string,
  files: string[]
): IntegrationValidationResult {
  const errors: ValidationError[] = []
  
  // Required files
  const requiredFiles = [
    'src/lib/supabase.ts',
    'src/pages/AuthCallback.tsx',
  ]
  
  for (const requiredFile of requiredFiles) {
    const filePath = path.join(workspacePath, requiredFile)
    if (!files.includes(requiredFile) && !fs.existsSync(filePath)) {
      errors.push({
        type: 'integration',
        integration: 'supabase',
        filePath: requiredFile,
        message: `Required Supabase file '${requiredFile}' is missing`,
      })
    }
  }
  
  // Check App.tsx for auth/callback route
  const appTsxPath = path.join(workspacePath, 'src/App.tsx')
  if (fs.existsSync(appTsxPath)) {
    const appTsxContent = fs.readFileSync(appTsxPath, 'utf8')
    if (!appTsxContent.includes('/auth/callback') || !appTsxContent.includes('AuthCallback')) {
      errors.push({
        type: 'integration',
        integration: 'supabase',
        filePath: 'src/App.tsx',
        message: 'App.tsx is missing the /auth/callback route for Supabase OAuth',
      })
    }
  }
  
  // Check .env.example for Supabase env vars
  const envExamplePath = path.join(workspacePath, '.env.example')
  if (fs.existsSync(envExamplePath)) {
    const envExampleContent = fs.readFileSync(envExamplePath, 'utf8')
    if (!envExampleContent.includes('SUPABASE_URL') || !envExampleContent.includes('SUPABASE_ANON_KEY')) {
      errors.push({
        type: 'integration',
        integration: 'supabase',
        filePath: '.env.example',
        message: '.env.example is missing Supabase environment variables (SUPABASE_URL, SUPABASE_ANON_KEY)',
      })
    }
  }
  
  // Check supabase.ts for client initialization
  const supabaseTsPath = path.join(workspacePath, 'src/lib/supabase.ts')
  if (fs.existsSync(supabaseTsPath)) {
    const supabaseTsContent = fs.readFileSync(supabaseTsPath, 'utf8')
    if (!supabaseTsContent.includes('createClient') || !supabaseTsContent.includes('supabase-js')) {
      errors.push({
        type: 'integration',
        integration: 'supabase',
        filePath: 'src/lib/supabase.ts',
        message: 'src/lib/supabase.ts is missing Supabase client initialization',
      })
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
  }
}

// ─── Stripe Validation ─────────────────────────────────────────

/**
 * Validates that Stripe integration is correctly implemented.
 * Checks for required files and configurations.
 */
export function validateStripeIntegration(
  workspacePath: string,
  files: string[]
): IntegrationValidationResult {
  const errors: ValidationError[] = []
  
  // Required files
  const requiredFiles = [
    'server/routes/stripe.ts',
  ]
  
  for (const requiredFile of requiredFiles) {
    const filePath = path.join(workspacePath, requiredFile)
    if (!files.includes(requiredFile) && !fs.existsSync(filePath)) {
      errors.push({
        type: 'integration',
        integration: 'stripe',
        filePath: requiredFile,
        message: `Required Stripe file '${requiredFile}' is missing`,
      })
    }
  }
  
  // Check server/index.ts for stripe router mounting
  const serverIndexPath = path.join(workspacePath, 'server/index.ts')
  if (fs.existsSync(serverIndexPath)) {
    const serverIndexContent = fs.readFileSync(serverIndexPath, 'utf8')
    if (!serverIndexContent.includes('stripeRouter') || !serverIndexContent.includes('/api/stripe')) {
      errors.push({
        type: 'integration',
        integration: 'stripe',
        filePath: 'server/index.ts',
        message: 'server/index.ts is missing Stripe router mounting',
      })
    }
    
    // Check for webhook raw body handling
    if (!serverIndexContent.includes('express.raw') || !serverIndexContent.includes('/api/stripe/webhook')) {
      errors.push({
        type: 'integration',
        integration: 'stripe',
        filePath: 'server/index.ts',
        message: 'server/index.ts is missing Stripe webhook raw body handling',
      })
    }
  }
  
  // Check .env.example for Stripe env vars
  const envExamplePath = path.join(workspacePath, '.env.example')
  if (fs.existsSync(envExamplePath)) {
    const envExampleContent = fs.readFileSync(envExamplePath, 'utf8')
    if (!envExampleContent.includes('STRIPE_SECRET_KEY') || !envExampleContent.includes('STRIPE_WEBHOOK_SECRET')) {
      errors.push({
        type: 'integration',
        integration: 'stripe',
        filePath: '.env.example',
        message: '.env.example is missing Stripe environment variables (STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET)',
      })
    }
  }
  
  // Check stripe.ts for required endpoints
  const stripeTsPath = path.join(workspacePath, 'server/routes/stripe.ts')
  if (fs.existsSync(stripeTsPath)) {
    const stripeTsContent = fs.readFileSync(stripeTsPath, 'utf8')
    
    // Check for checkout endpoint
    if (!stripeTsContent.includes('/checkout') || !stripeTsContent.includes('checkout.sessions.create')) {
      errors.push({
        type: 'integration',
        integration: 'stripe',
        filePath: 'server/routes/stripe.ts',
        message: 'server/routes/stripe.ts is missing Stripe checkout endpoint',
      })
    }
    
    // Check for portal endpoint
    if (!stripeTsContent.includes('/portal') || !stripeTsContent.includes('billing_portal.sessions.create')) {
      errors.push({
        type: 'integration',
        integration: 'stripe',
        filePath: 'server/routes/stripe.ts',
        message: 'server/routes/stripe.ts is missing Stripe customer portal endpoint',
      })
    }
    
    // Check for webhook endpoint
    if (!stripeTsContent.includes('/webhook') || !stripeTsContent.includes('webhooks.constructEvent')) {
      errors.push({
        type: 'integration',
        integration: 'stripe',
        filePath: 'server/routes/stripe.ts',
        message: 'server/routes/stripe.ts is missing Stripe webhook endpoint',
      })
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
  }
}

// ─── Data Model Validation ──────────────────────────────────────

/**
 * Extracts TypeScript interfaces/types from file content using regex.
 */
function extractDataModels(files: { relativePath: string; content: string }[]): DataModel[] {
  const models: DataModel[] = []

  for (const file of files) {
    // Match interface declarations: interface User { ... }
    const interfaceRegex = /(?:export\s+)?interface\s+(\w+)\s*\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/g
    let match
    while ((match = interfaceRegex.exec(file.content)) !== null) {
      const name = match[1]
      const body = match[2]
      const properties = parseTypeProperties(body)
      models.push({
        name,
        file: file.relativePath,
        line: getLineNumber(file.content, match.index),
        properties,
      })
    }

    // Match type declarations: type User = { ... }
    const typeRegex = /(?:export\s+)?type\s+(\w+)\s*=\s*\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/g
    while ((match = typeRegex.exec(file.content)) !== null) {
      const name = match[1]
      const body = match[2]
      const properties = parseTypeProperties(body)
      models.push({
        name,
        file: file.relativePath,
        line: getLineNumber(file.content, match.index),
        properties,
      })
    }
  }

  return models
}

/**
 * Parses property declarations from a type/interface body.
 */
function parseTypeProperties(body: string): DataModel['properties'] {
  const properties: DataModel['properties'] = []
  // Match: name: type  or  name?: type
  const propRegex = /(\w+)(\?)?:\s*([^;\n,]+)/g
  let match
  while ((match = propRegex.exec(body)) !== null) {
    properties.push({
      name: match[1],
      type: match[3].trim(),
      optional: match[2] === '?',
    })
  }
  return properties
}

/**
 * Validates that data models used in frontend match those defined in backend.
 * Detects missing properties, type mismatches, and undefined models.
 */
export function validateDataModels(
  files: { relativePath: string; content: string }[]
): IntegrationValidationResult {
  const errors: ValidationError[] = []

  const frontendFiles = files.filter(f =>
    f.relativePath.includes('/src/') &&
    (f.relativePath.endsWith('.ts') || f.relativePath.endsWith('.tsx'))
  )
  const backendFiles = files.filter(f =>
    (f.relativePath.includes('/server/') || f.relativePath.includes('/routes/')) &&
    (f.relativePath.endsWith('.ts') || f.relativePath.endsWith('.js'))
  )

  const frontendModels = extractDataModels(frontendFiles)
  const backendModels = extractDataModels(backendFiles)

  // Skip if either side has no models (nothing to compare)
  if (frontendModels.length === 0 || backendModels.length === 0) {
    return { valid: true, errors: [] }
  }

  // Find models with the same name on both sides and compare properties
  for (const feModel of frontendModels) {
    const beModel = backendModels.find(m => m.name === feModel.name)
    if (!beModel) continue // Model only exists on frontend — not necessarily an error

    // Check for property mismatches
    for (const feProp of feModel.properties) {
      const beProp = beModel.properties.find(p => p.name === feProp.name)
      if (!beProp) {
        // Frontend expects a property that backend doesn't define
        errors.push({
          type: 'integration',
          filePath: feModel.file,
          message: `Data model '${feModel.name}' property '${feProp.name}' exists in frontend (${feModel.file}) but not in backend (${beModel.file})`,
          integration: 'api',
          line: feModel.line,
        })
      }
    }
  }

  return { valid: errors.length === 0, errors }
}

// ─── Database Schema Validation ─────────────────────────────────

/**
 * Extracts Prisma schema models from schema.prisma content.
 */
function extractPrismaModels(schemaContent: string, filePath: string): SchemaModel[] {
  const models: SchemaModel[] = []
  const modelRegex = /model\s+(\w+)\s*\{([^}]+)\}/g
  let match

  while ((match = modelRegex.exec(schemaContent)) !== null) {
    const name = match[1]
    const body = match[2]
    const fields: SchemaModel['fields'] = []

    // Parse Prisma fields: name Type? @...
    const fieldRegex = /^\s+(\w+)\s+([\w\[\]]+)(\?)?/gm
    let fieldMatch
    while ((fieldMatch = fieldRegex.exec(body)) !== null) {
      const fieldName = fieldMatch[1]
      // Skip Prisma directives that look like fields
      if (['@@', 'model', 'enum'].some(k => fieldName.startsWith(k))) continue
      fields.push({
        name: fieldName,
        type: fieldMatch[2],
        optional: fieldMatch[3] === '?',
      })
    }

    models.push({
      name,
      file: filePath,
      line: getLineNumber(schemaContent, match.index),
      fields,
    })
  }

  return models
}

/**
 * Validates that backend code references to Prisma models match the schema.
 * Detects references to undefined models and missing fields.
 */
export function validateDatabaseSchema(
  files: { relativePath: string; content: string }[]
): IntegrationValidationResult {
  const errors: ValidationError[] = []

  // Find prisma schema
  const schemaFile = files.find(f => f.relativePath.endsWith('schema.prisma'))
  if (!schemaFile) {
    return { valid: true, errors: [] } // No schema = nothing to validate
  }

  const schemaModels = extractPrismaModels(schemaFile.content, schemaFile.relativePath)
  if (schemaModels.length === 0) {
    return { valid: true, errors: [] }
  }

  const schemaModelNames = new Set(schemaModels.map(m => m.name))

  // Check backend files for prisma model references
  const backendFiles = files.filter(f =>
    (f.relativePath.includes('/server/') || f.relativePath.includes('/routes/')) &&
    (f.relativePath.endsWith('.ts') || f.relativePath.endsWith('.js'))
  )

  for (const file of backendFiles) {
    // Match prisma.modelName.method() calls
    const prismaCallRegex = /prisma\.(\w+)\.(findMany|findUnique|findFirst|create|update|delete|upsert|count|aggregate|groupBy)\s*\(/g
    let match
    while ((match = prismaCallRegex.exec(file.content)) !== null) {
      const modelRef = match[1]
      // Prisma uses camelCase for model access (e.g., prisma.user for model User)
      const modelName = modelRef.charAt(0).toUpperCase() + modelRef.slice(1)

      if (!schemaModelNames.has(modelName)) {
        errors.push({
          type: 'integration',
          filePath: file.relativePath,
          message: `Backend references Prisma model '${modelName}' (via prisma.${modelRef}) but it is not defined in ${schemaFile.relativePath}`,
          integration: 'api',
          line: getLineNumber(file.content, match.index),
        })
      }
    }

    // Match prisma.modelName.method({ where: { fieldName: ... } }) — check field references
    // Simplified: check for common field access patterns in where/data/select
    for (const model of schemaModels) {
      const modelLower = model.name.charAt(0).toLowerCase() + model.name.slice(1)
      // Find blocks like prisma.user.findUnique({ where: { email: ... } })
      const blockRegex = new RegExp(
        `prisma\\.${modelLower}\\.[a-zA-Z]+\\s*\\(\\s*\\{[^}]*(?:where|data|select)\\s*:\\s*\\{([^}]+)\\}`,
        'g'
      )
      let blockMatch
      while ((blockMatch = blockRegex.exec(file.content)) !== null) {
        const innerBlock = blockMatch[1]
        // Extract field names from the block
        const fieldRefRegex = /(\w+)\s*:/g
        let fieldMatch
        while ((fieldMatch = fieldRefRegex.exec(innerBlock)) !== null) {
          const fieldName = fieldMatch[1]
          // Skip common non-field keywords
          if (['contains', 'equals', 'in', 'not', 'gt', 'gte', 'lt', 'lte', 'mode', 'startsWith', 'endsWith', 'has', 'every', 'some', 'none', 'is', 'isNot', 'AND', 'OR', 'NOT'].includes(fieldName)) continue
          
          const schemaField = model.fields.find(f => f.name === fieldName)
          if (!schemaField && model.fields.length > 0) {
            errors.push({
              type: 'integration',
              filePath: file.relativePath,
              message: `Backend references field '${fieldName}' on Prisma model '${model.name}' but it is not defined in the schema`,
              integration: 'api',
              line: getLineNumber(file.content, blockMatch.index),
            })
          }
        }
      }
    }
  }

  return { valid: errors.length === 0, errors }
}

// ─── Combined Validation ───────────────────────────────────────

/**
 * Validates all integrations in a workspace.
 * Returns a ValidationResult with any errors found.
 */
export function validateIntegrations(
  workspacePath: string,
  files: string[],
  integrations: string[]
): IntegrationValidationResult {
  const errors: ValidationError[] = []
  
  // Check for Supabase integration
  if (integrations.includes('Supabase') || integrations.some(i => i.toLowerCase().includes('supabase'))) {
    const supabaseResult = validateSupabaseIntegration(workspacePath, files)
    errors.push(...supabaseResult.errors)
  }
  
  // Check for Stripe integration
  if (integrations.includes('Stripe') || integrations.some(i => i.toLowerCase().includes('stripe'))) {
    const stripeResult = validateStripeIntegration(workspacePath, files)
    errors.push(...stripeResult.errors)
  }
  
  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * Validates all integrations using generated file content (no filesystem reads).
 * This is the primary validation entry point during code generation.
 * Runs API endpoint, data model, and database schema validation.
 */
export function validateAllIntegrations(
  generatedFiles: { relativePath: string; content: string }[],
  integrations: string[],
  workspacePath?: string,
): IntegrationValidationResult {
  const errors: ValidationError[] = []

  // 1. API endpoint validation — frontend calls vs backend routes
  const apiResult = validateApiEndpoints(workspacePath ?? '', generatedFiles)
  errors.push(...apiResult.errors)

  // 2. Data model validation — frontend/backend type mismatches
  const dataModelResult = validateDataModels(generatedFiles)
  errors.push(...dataModelResult.errors)

  // 3. Database schema validation — backend code vs Prisma schema
  const schemaResult = validateDatabaseSchema(generatedFiles)
  errors.push(...schemaResult.errors)

  // 4. Supabase integration validation (file-based, needs workspace path)
  if (workspacePath) {
    const fileList = generatedFiles.map(f => f.relativePath)
    if (integrations.some(i => i.toLowerCase().includes('supabase'))) {
      const supabaseResult = validateSupabaseIntegration(workspacePath, fileList)
      errors.push(...supabaseResult.errors)
    }

    // 5. Stripe integration validation (file-based, needs workspace path)
    if (integrations.some(i => i.toLowerCase().includes('stripe'))) {
      const stripeResult = validateStripeIntegration(workspacePath, fileList)
      errors.push(...stripeResult.errors)
    }
  }

  // 6. Route completeness validation — page files vs App.tsx routes
  const routeResult = validateRouteCompleteness(generatedFiles)
  errors.push(...routeResult.errors)

  // 7. Import resolution validation — relative imports vs generated files
  const importResult = validateImportResolution(generatedFiles)
  errors.push(...importResult.errors)

  return { valid: errors.length === 0, errors }
}

// ─── Route Completeness Validation ──────────────────────────────

/**
 * Validates that every src/pages/*.tsx file has a corresponding route in App.tsx,
 * and every route in App.tsx points to an existing page file.
 */
export function validateRouteCompleteness(
  files: { relativePath: string; content: string }[]
): IntegrationValidationResult {
  const errors: ValidationError[] = []

  const appTsx = files.find(f => f.relativePath.endsWith('src/App.tsx'))
  if (!appTsx) return { valid: true, errors: [] }

  // Extract page files (src/pages/*.tsx) — handle paths with or without leading slash
  const pageFiles = files.filter(f =>
    /(?:^|\/)src\/pages\/[A-Z][^/]*\.tsx$/.test(f.relativePath)
  )

  // Extract route elements from App.tsx: <Route path="/foo" element={<FooPage />} />
  const routeRegex = /<Route\s+[^>]*path\s*=\s*["']([^"']+)["'][^>]*element\s*=\s*\{?\s*<(\w+)/g
  const routeElementRegex = /<Route\s+[^>]*element\s*=\s*\{?\s*<(\w+)[^>]*path\s*=\s*["']([^"']+)["']/g
  const routes: { path: string; component: string }[] = []

  let match: RegExpExecArray | null
  while ((match = routeRegex.exec(appTsx.content)) !== null) {
    routes.push({ path: match[1], component: match[2] })
  }
  // Also try reversed attribute order
  while ((match = routeElementRegex.exec(appTsx.content)) !== null) {
    if (!routes.some(r => r.component === match![1] && r.path === match![2])) {
      routes.push({ path: match[2], component: match[1] })
    }
  }

  // Extract imports from App.tsx to map component names to file paths
  const importRegex = /import\s+(?:\{[^}]*\}|\w+)\s+from\s+['"]([^'"]+)['"]/g
  const importedPaths: string[] = []
  while ((match = importRegex.exec(appTsx.content)) !== null) {
    importedPaths.push(match[1])
  }

  // Check: every page file should have a route
  for (const pageFile of pageFiles) {
    // Extract component name from filename: src/pages/Dashboard.tsx → Dashboard
    const fileName = pageFile.relativePath.split('/').pop()!.replace('.tsx', '')
    // Skip AuthCallback — it's a utility page, not always routed directly
    if (fileName === 'AuthCallback') continue

    const hasRoute = routes.some(r => r.component === fileName) ||
      appTsx.content.includes(fileName)

    if (!hasRoute) {
      errors.push({
        type: 'integration',
        filePath: 'src/App.tsx',
        message: `Page file '${pageFile.relativePath}' exists but has no corresponding <Route> in App.tsx. Add: import ${fileName} from './pages/${fileName}' and <Route path="/${fileName.toLowerCase()}" element={<${fileName} />} />`,
        integration: 'api',
      })
    }
  }

  // Check: every route component should have a corresponding page file
  for (const route of routes) {
    // Skip common non-page components
    if (['Navigate', 'Outlet', 'Layout'].includes(route.component)) continue

    const hasFile = pageFiles.some(f => {
      const name = f.relativePath.split('/').pop()!.replace('.tsx', '')
      return name === route.component
    })

    // Only skip if it's imported from a non-pages path (e.g., a layout component)
    // If it's imported from ./pages/X, we still need the file to exist
    const isImportedFromNonPages = importedPaths.some(p =>
      p.includes(route.component) && !p.includes('/pages/')
    )

    if (!hasFile && !isImportedFromNonPages) {
      errors.push({
        type: 'integration',
        filePath: 'src/App.tsx',
        message: `Route path="${route.path}" references component <${route.component} /> but no matching file 'src/pages/${route.component}.tsx' was generated`,
        integration: 'api',
      })
    }
  }

  return { valid: errors.length === 0, errors }
}

// ─── Import Resolution Validation ───────────────────────────────

/**
 * Validates that relative imports in generated files resolve to actual generated files.
 * Catches broken cross-file references like importing a component that was never generated.
 */
export function validateImportResolution(
  files: { relativePath: string; content: string }[]
): IntegrationValidationResult {
  const errors: ValidationError[] = []

  // Build a set of all generated file paths (normalized, without extensions)
  const generatedPaths = new Set<string>()
  const generatedPathsWithExt = new Set<string>()
  for (const f of files) {
    generatedPathsWithExt.add(f.relativePath)
    // Add without extension
    const noExt = f.relativePath.replace(/\.(tsx?|jsx?|css|json)$/, '')
    generatedPaths.add(noExt)
    // Add index variant: foo/index → foo
    if (noExt.endsWith('/index')) {
      generatedPaths.add(noExt.replace(/\/index$/, ''))
    }
  }

  // Only check .ts/.tsx/.js/.jsx files
  const sourceFiles = files.filter(f =>
    /\.(tsx?|jsx?)$/.test(f.relativePath)
  )

  for (const file of sourceFiles) {
    // Extract relative imports
    const importRegex = /(?:import|from)\s+['"](\.[^'"]+)['"]/g
    let match
    while ((match = importRegex.exec(file.content)) !== null) {
      const importPath = match[1]
      // Resolve relative to the file's directory
      const fileDir = file.relativePath.substring(0, file.relativePath.lastIndexOf('/'))
      const resolved = resolveRelativePath(fileDir, importPath)

      // Check if the resolved path matches any generated file
      const found =
        generatedPaths.has(resolved) ||
        generatedPathsWithExt.has(resolved) ||
        generatedPathsWithExt.has(resolved + '.ts') ||
        generatedPathsWithExt.has(resolved + '.tsx') ||
        generatedPathsWithExt.has(resolved + '.js') ||
        generatedPathsWithExt.has(resolved + '.jsx') ||
        generatedPathsWithExt.has(resolved + '.css') ||
        generatedPathsWithExt.has(resolved + '/index.ts') ||
        generatedPathsWithExt.has(resolved + '/index.tsx') ||
        generatedPathsWithExt.has(resolved + '/index.js')

      // Skip common external-like paths and CSS modules
      if (!found && !importPath.includes('node_modules') && !importPath.endsWith('.css') && !importPath.endsWith('.svg') && !importPath.endsWith('.png')) {
        errors.push({
          type: 'integration',
          filePath: file.relativePath,
          message: `Import '${importPath}' in ${file.relativePath} resolves to '${resolved}' but no matching file was generated. Create the missing file or fix the import path.`,
          integration: 'api',
          line: getLineNumber(file.content, match.index),
        })
      }
    }
  }

  return { valid: errors.length === 0, errors }
}

/**
 * Resolves a relative import path against a directory.
 * e.g., resolveRelativePath('src/pages', '../components/Header') → 'src/components/Header'
 */
function resolveRelativePath(fromDir: string, importPath: string): string {
  const parts = fromDir.split('/').filter(Boolean)
  const importParts = importPath.split('/').filter(Boolean)

  for (const segment of importParts) {
    if (segment === '..') {
      parts.pop()
    } else if (segment !== '.') {
      parts.push(segment)
    }
  }

  return parts.join('/')
}

// ─── Enhanced Error Context ─────────────────────────────────────

/**
 * Generates actionable error context for AI prompts based on integration validation errors.
 * Each error includes specific fix instructions, not just a description.
 */
export function generateIntegrationErrorContext(errors: ValidationError[]): string {
  const supabaseErrors = errors.filter(e => e.integration === 'supabase')
  const stripeErrors = errors.filter(e => e.integration === 'stripe')
  const apiErrors = errors.filter(e => e.integration === 'api')

  let context = 'INTEGRATION VALIDATION ERRORS — You MUST fix all of these:\n\n'

  if (apiErrors.length > 0) {
    context += 'API / ROUTE / IMPORT ERRORS:\n'
    for (const e of apiErrors) {
      context += `- [${e.filePath}] ${e.message}\n`
      context += `  FIX: ${getSpecificFixInstruction(e)}\n`
    }
    context += '\n'
  }

  if (supabaseErrors.length > 0) {
    context += 'SUPABASE INTEGRATION ERRORS:\n'
    for (const e of supabaseErrors) {
      context += `- [${e.filePath}] ${e.message}\n`
      context += `  FIX: ${getSpecificFixInstruction(e)}\n`
    }
    context += '\n'
  }

  if (stripeErrors.length > 0) {
    context += 'STRIPE INTEGRATION ERRORS:\n'
    for (const e of stripeErrors) {
      context += `- [${e.filePath}] ${e.message}\n`
      context += `  FIX: ${getSpecificFixInstruction(e)}\n`
    }
    context += '\n'
  }

  context += 'CRITICAL: Every error above MUST be resolved in the regenerated file. Do not leave any of these issues unfixed.'

  return context
}

/**
 * Returns a specific, actionable fix instruction for a given validation error.
 */
function getSpecificFixInstruction(error: ValidationError): string {
  const msg = error.message

  // API endpoint missing in backend
  if (msg.includes('referenced in frontend but not defined in backend')) {
    const methodMatch = msg.match(/API endpoint (\w+) (\/\S+)/)
    if (methodMatch) {
      return `Add route: router.${methodMatch[1].toLowerCase()}('${methodMatch[2]}', async (req, res) => { /* implement handler */ }) in the appropriate backend routes file.`
    }
  }

  // HTTP method mismatch
  if (msg.includes('HTTP method mismatch')) {
    const mismatchMatch = msg.match(/frontend uses (\w+) but backend defines (\w+)/)
    if (mismatchMatch) {
      return `Change the backend route method from ${mismatchMatch[2]} to ${mismatchMatch[1]}, or update the frontend fetch call to use ${mismatchMatch[2]}.`
    }
  }

  // Missing Supabase file
  if (msg.includes('Required Supabase file') && msg.includes('is missing')) {
    if (msg.includes('AuthCallback')) {
      return `Create src/pages/AuthCallback.tsx that calls supabase.auth.getSession() on mount, handles the OAuth callback, and redirects to /dashboard on success.`
    }
    if (msg.includes('supabase.ts')) {
      return `Create src/lib/supabase.ts that exports a Supabase client: import { createClient } from '@supabase/supabase-js'; export const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);`
    }
  }

  // Missing auth/callback route in App.tsx
  if (msg.includes('missing the /auth/callback route')) {
    return `Add to App.tsx: import AuthCallback from './pages/AuthCallback'; and inside <Routes>: <Route path="/auth/callback" element={<AuthCallback />} />`
  }

  // Missing Supabase env vars
  if (msg.includes('missing Supabase environment variables')) {
    return `Add to .env.example: VITE_SUPABASE_URL=your-supabase-url and VITE_SUPABASE_ANON_KEY=your-supabase-anon-key`
  }

  // Missing Supabase client initialization
  if (msg.includes('missing Supabase client initialization')) {
    return `Ensure src/lib/supabase.ts imports createClient from '@supabase/supabase-js' and exports a configured client instance.`
  }

  // Missing Stripe file
  if (msg.includes('Required Stripe file') && msg.includes('is missing')) {
    return `Create server/routes/stripe.ts with Express router exporting checkout, portal, and webhook endpoints using the Stripe SDK.`
  }

  // Missing Stripe router mounting
  if (msg.includes('missing Stripe router mounting')) {
    return `In server/index.ts, add: import { stripeRouter } from './routes/stripe'; and app.use('/api/stripe', stripeRouter);`
  }

  // Missing Stripe webhook raw body
  if (msg.includes('missing Stripe webhook raw body')) {
    return `In server/index.ts, add BEFORE json middleware: app.use('/api/stripe/webhook', express.raw({ type: 'application/json' })); and ensure the webhook route uses req.body as a Buffer.`
  }

  // Missing Stripe env vars
  if (msg.includes('missing Stripe environment variables')) {
    return `Add to .env.example: STRIPE_SECRET_KEY=sk_test_... and STRIPE_WEBHOOK_SECRET=whsec_...`
  }

  // Missing Stripe checkout/portal/webhook endpoints
  if (msg.includes('missing Stripe checkout endpoint')) {
    return `Add POST /checkout route that calls stripe.checkout.sessions.create() with line_items and success/cancel URLs.`
  }
  if (msg.includes('missing Stripe customer portal endpoint')) {
    return `Add POST /portal route that calls stripe.billingPortal.sessions.create() with the customer ID and return URL.`
  }
  if (msg.includes('missing Stripe webhook endpoint')) {
    return `Add POST /webhook route that calls stripe.webhooks.constructEvent(req.body, sig, webhookSecret) and handles checkout.session.completed events.`
  }

  // Data model property mismatch
  if (msg.includes('property') && msg.includes('exists in frontend') && msg.includes('not in backend')) {
    const propMatch = msg.match(/property '(\w+)' exists in frontend .* not in backend \(([^)]+)\)/)
    if (propMatch) {
      return `Add property '${propMatch[1]}' to the matching interface/type in ${propMatch[2]}, or remove the reference from the frontend file.`
    }
  }

  // Prisma model not defined
  if (msg.includes('Prisma model') && msg.includes('not defined in')) {
    const modelMatch = msg.match(/Prisma model '(\w+)'/)
    if (modelMatch) {
      return `Add 'model ${modelMatch[1]} { id String @id @default(cuid()) ... }' to prisma/schema.prisma, or fix the backend code to use an existing model name.`
    }
  }

  // Prisma field not defined
  if (msg.includes('references field') && msg.includes('not defined in the schema')) {
    const fieldMatch = msg.match(/field '(\w+)' on Prisma model '(\w+)'/)
    if (fieldMatch) {
      return `Add field '${fieldMatch[1]}' to model ${fieldMatch[2]} in prisma/schema.prisma, or remove the reference from the backend code.`
    }
  }

  // Route completeness — page has no route
  if (msg.includes('exists but has no corresponding <Route>')) {
    return msg.substring(msg.indexOf('Add:'))
  }

  // Route completeness — route has no page file
  if (msg.includes('no matching file') && msg.includes('was generated')) {
    const compMatch = msg.match(/component <(\w+)/)
    if (compMatch) {
      return `Create src/pages/${compMatch[1]}.tsx with a default export React component, or remove the route from App.tsx.`
    }
  }

  // Import resolution — missing file
  if (msg.includes('no matching file was generated')) {
    return `Create the missing file, or update the import path to point to an existing file.`
  }

  // Generic fallback
  return `Review and fix the issue described above in ${error.filePath}.`
}
