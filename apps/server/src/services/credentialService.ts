/**
 * Credential Service — Phase 7 Slice 2
 *
 * In-memory resolver map for credential handoff flow.
 * Values are NEVER persisted — only passed in-memory from socket handler to builder.
 *
 * Security model:
 *   - DB record: metadata only (integration, label, purpose, fields schema, status)
 *   - Values: in-memory only, passed directly to builder via Promise resolution
 *   - 5-minute timeout → credential_timeout failureCategory
 *   - Scoped to jobId — resolver is keyed by requestId (cuid)
 */

export const CREDENTIAL_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes

interface CredentialResolver {
  resolve: (values: Record<string, string>) => void
  reject: (reason: string) => void
  timer: NodeJS.Timeout
}

// In-memory map: requestId → resolver
// Values are never written to DB — only held here until resolved/rejected/timed out
const credentialResolvers = new Map<string, CredentialResolver>()

/**
 * Register a resolver for a credential request.
 * The resolver will be called when the user provides credentials or skips.
 * The timer will reject the resolver after timeoutMs.
 */
export function registerCredentialResolver(
  requestId: string,
  resolve: (values: Record<string, string>) => void,
  reject: (reason: string) => void,
  timeoutMs: number = CREDENTIAL_TIMEOUT_MS
): void {
  // Clear any existing resolver for this requestId
  cancelCredentialResolver(requestId)

  const timer = setTimeout(() => {
    const resolver = credentialResolvers.get(requestId)
    if (resolver) {
      credentialResolvers.delete(requestId)
      resolver.reject('timeout')
    }
  }, timeoutMs)

  credentialResolvers.set(requestId, { resolve, reject, timer })
}

/**
 * Cancel a credential resolver (e.g., when job is cancelled).
 * Does NOT call resolve or reject — just cleans up the timer and map entry.
 */
export function cancelCredentialResolver(requestId: string): void {
  const resolver = credentialResolvers.get(requestId)
  if (resolver) {
    clearTimeout(resolver.timer)
    credentialResolvers.delete(requestId)
  }
}

/**
 * Resolve a credential request with provided values.
 * Returns true if a resolver was found and called, false otherwise.
 * Values are passed in-memory only — never persisted.
 */
export function resolveCredential(requestId: string, values: Record<string, string>): boolean {
  const resolver = credentialResolvers.get(requestId)
  if (!resolver) return false
  clearTimeout(resolver.timer)
  credentialResolvers.delete(requestId)
  resolver.resolve(values)
  return true
}

/**
 * Skip a credential request (user chose not to provide credentials).
 * Resolves with empty values — builder handles gracefully (uses defaults or skips integration).
 */
export function skipCredential(requestId: string): boolean {
  return resolveCredential(requestId, {})
}

/**
 * Check if a resolver is registered for a given requestId.
 */
export function hasCredentialResolver(requestId: string): boolean {
  return credentialResolvers.has(requestId)
}

/**
 * Get the number of active credential requests (for monitoring/health).
 */
export function getActiveCredentialRequestCount(): number {
  return credentialResolvers.size
}
