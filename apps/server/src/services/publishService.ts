/**
 * publishService.ts — Sprint 20
 *
 * Real backend flows for:
 *  1. Publish — create a downloadable zip of the workspace
 *  2. GitHub push — init git repo + push to user's GitHub via token
 *  3. Vercel deploy — push to Vercel via their REST API
 *
 * All operations are workspace-path based (from completed jobs).
 */

import { execSync, exec } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import * as zlib from 'zlib'
import { createReadStream, createWriteStream } from 'fs'
import { pipeline } from 'stream/promises'
import https from 'https'
import http from 'http'

// ─── Types ─────────────────────────────────────────────────────

export interface PublishResult {
  success: boolean
  downloadUrl?: string
  zipPath?: string
  sizeBytes?: number
  error?: string
}

export interface GitHubPushResult {
  success: boolean
  repoUrl?: string
  branch?: string
  commitSha?: string
  error?: string
}

export interface VercelDeployResult {
  success: boolean
  deploymentUrl?: string
  projectUrl?: string
  deploymentId?: string
  status?: string
  error?: string
}

// ─── 1. Publish — Zip the workspace ───────────────────────────

/**
 * Creates a .tar.gz archive of the workspace (excluding node_modules, .git).
 * Returns the path to the archive file in the uploads directory.
 */
export async function createWorkspaceArchive(
  workspacePath: string,
  jobId: string,
  uploadsDir: string
): Promise<PublishResult> {
  try {
    if (!fs.existsSync(workspacePath)) {
      return { success: false, error: 'Workspace directory not found' }
    }

    const archiveName = `coderxp-${jobId.slice(0, 8)}-${Date.now()}.tar.gz`
    const archivePath = path.join(uploadsDir, archiveName)

    // Use tar — convert Windows paths to forward slashes so tar doesn't
    // interpret C: as a remote host prefix.
    const tarArchive = archivePath.replace(/\\/g, '/')
    const tarParent = path.dirname(workspacePath).replace(/\\/g, '/')
    const tarBase = path.basename(workspacePath)

    try {
      // --force-local prevents tar from interpreting C: as a remote host on Windows
      execSync(
        `tar --force-local -czf "${tarArchive}" --exclude=node_modules --exclude=.git --exclude=dist --exclude=.cache -C "${tarParent}" "${tarBase}"`,
        { timeout: 60000, stdio: 'pipe' }
      )
    } catch {
      // Fallback: copy without excluded dirs, then tar
      try {
        const tempDir = path.join(uploadsDir, `_tmp_${jobId.slice(0, 8)}`)
        copyDirSync(workspacePath, tempDir, ['node_modules', '.git', 'dist', '.cache'])
        const tarTmpParent = path.dirname(tempDir).replace(/\\/g, '/')
        const tarTmpBase = path.basename(tempDir)
        execSync(
          `tar --force-local -czf "${tarArchive}" -C "${tarTmpParent}" "${tarTmpBase}"`,
          { timeout: 60000, stdio: 'pipe' }
        )
        fs.rmSync(tempDir, { recursive: true, force: true })
      } catch (fallbackErr) {
        return {
          success: false,
          error: `Archive creation failed: ${fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)}`,
        }
      }
    }

    if (!fs.existsSync(archivePath)) {
      return { success: false, error: 'Archive file was not created' }
    }

    const stat = fs.statSync(archivePath)
    const downloadUrl = `/uploads/${archiveName}`

    console.log(`[Publish] Archive created: ${archivePath} (${(stat.size / 1024).toFixed(1)} KB)`)

    return {
      success: true,
      downloadUrl,
      zipPath: archivePath,
      sizeBytes: stat.size,
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

/** Recursively copy a directory, skipping excluded folder names */
function copyDirSync(src: string, dest: string, excludeDirs: string[]) {
  fs.mkdirSync(dest, { recursive: true })
  const entries = fs.readdirSync(src, { withFileTypes: true })
  for (const entry of entries) {
    if (excludeDirs.includes(entry.name)) continue
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath, excludeDirs)
    } else {
      fs.copyFileSync(srcPath, destPath)
    }
  }
}

// ─── 2. GitHub Push ───────────────────────────────────────────

/**
 * Initializes a git repo in the workspace and pushes to a GitHub repo.
 * Requires a GitHub personal access token (PAT) with 'repo' scope.
 *
 * Flow:
 *  1. Create the repo via GitHub API (if it doesn't exist)
 *  2. git init + add + commit in the workspace
 *  3. git remote add + push
 */
export async function pushToGitHub(
  workspacePath: string,
  options: {
    githubToken: string
    repoName: string
    isPrivate?: boolean
    description?: string
  }
): Promise<GitHubPushResult> {
  const { githubToken, repoName, isPrivate = true, description = 'Created by CoderXP' } = options

  try {
    if (!fs.existsSync(workspacePath)) {
      return { success: false, error: 'Workspace directory not found' }
    }

    // Step 1: Get authenticated user
    const user = await githubApiRequest<{ login: string }>(
      'GET', '/user', githubToken
    )
    if (!user.login) {
      return { success: false, error: 'Could not authenticate with GitHub. Check your token.' }
    }

    // Step 2: Create repo (or verify it exists)
    let repoUrl: string
    try {
      const repo = await githubApiRequest<{ html_url: string; clone_url: string }>(
        'POST', '/user/repos', githubToken,
        { name: repoName, private: isPrivate, description, auto_init: false }
      )
      repoUrl = repo.html_url
    } catch (createErr: any) {
      // 422 = repo already exists — try to get it
      if (createErr?.statusCode === 422) {
        const existing = await githubApiRequest<{ html_url: string }>(
          'GET', `/repos/${user.login}/${repoName}`, githubToken
        )
        repoUrl = existing.html_url
      } else {
        return { success: false, error: `Failed to create GitHub repo: ${createErr?.message ?? String(createErr)}` }
      }
    }

    // Step 3: Git init + add + commit + push
    const remoteUrl = `https://${githubToken}@github.com/${user.login}/${repoName}.git`
    const gitDir = path.join(workspacePath, '.git')
    const isNewRepo = !fs.existsSync(gitDir)

    const gitOpts = { cwd: workspacePath, timeout: 30000, stdio: 'pipe' as const }

    if (isNewRepo) {
      execSync('git init', gitOpts)
    }

    // Write .gitignore if missing
    const gitignorePath = path.join(workspacePath, '.gitignore')
    if (!fs.existsSync(gitignorePath)) {
      fs.writeFileSync(gitignorePath, 'node_modules\ndist\n.cache\n.env\n.env.local\n')
    }

    execSync('git add -A', gitOpts)

    // Check if there are changes to commit
    try {
      execSync('git diff --cached --quiet', gitOpts)
      // No changes — try push anyway (maybe we have unpushed commits)
    } catch {
      // There are staged changes — commit them
      execSync('git commit -m "Deploy from CoderXP"', gitOpts)
    }

    // Set remote
    try {
      execSync(`git remote add origin "${remoteUrl}"`, gitOpts)
    } catch {
      execSync(`git remote set-url origin "${remoteUrl}"`, gitOpts)
    }

    // Push
    const branch = 'main'
    try {
      execSync(`git branch -M ${branch}`, gitOpts)
    } catch { /* already on main */ }

    execSync(`git push -u origin ${branch} --force`, gitOpts)

    // Get latest commit SHA
    let commitSha = ''
    try {
      commitSha = execSync('git rev-parse HEAD', gitOpts).toString().trim()
    } catch { /* non-fatal */ }

    console.log(`[GitHub] Pushed to ${repoUrl} (branch: ${branch}, commit: ${commitSha.slice(0, 7)})`)

    return {
      success: true,
      repoUrl,
      branch,
      commitSha,
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

// ─── 3. Vercel Deploy ─────────────────────────────────────────

/**
 * Deploys the workspace to Vercel via their REST API.
 *
 * Flow:
 *  1. Read all files from workspace (excluding node_modules, .git)
 *  2. POST /v13/deployments with file contents
 *  3. Return deployment URL
 *
 * Requires a Vercel token (from user settings or env).
 */
export async function deployToVercel(
  workspacePath: string,
  options: {
    vercelToken: string
    projectName: string
    teamId?: string
  }
): Promise<VercelDeployResult> {
  const { vercelToken, projectName, teamId } = options

  try {
    if (!fs.existsSync(workspacePath)) {
      return { success: false, error: 'Workspace directory not found' }
    }

    // Step 1: Collect all files (exclude heavy dirs)
    const files = collectFilesForDeploy(workspacePath)
    if (files.length === 0) {
      return { success: false, error: 'No files to deploy' }
    }

    // Inject tsconfig.node.json if referenced by tsconfig.json but missing
    const hasTsconfigNode = files.some(f => f.relativePath === 'tsconfig.node.json')
    if (!hasTsconfigNode) {
      const tsconfigPath = path.join(workspacePath, 'tsconfig.json')
      if (fs.existsSync(tsconfigPath)) {
        try {
          const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf8'))
          if (tsconfig.references?.some((r: { path: string }) => r.path === './tsconfig.node.json')) {
            const nodeConfig = JSON.stringify({
              compilerOptions: {
                composite: true,
                skipLibCheck: true,
                module: "ESNext",
                moduleResolution: "bundler",
                allowSyntheticDefaultImports: true,
              },
              include: ["vite.config.ts"],
            }, null, 2)
            files.push({
              relativePath: 'tsconfig.node.json',
              content: Buffer.from(nodeConfig).toString('base64'),
            })
          }
        } catch { /* non-fatal */ }
      }
    }

    console.log(`[Vercel] Deploying ${files.length} files for project "${projectName}"`)

    // Step 2: Create deployment via Vercel API
    const queryParams = teamId ? `?teamId=${teamId}` : ''
    const deployPayload = {
      name: projectName,
      files: files.map(f => ({
        file: f.relativePath,
        data: f.content,
        encoding: 'base64',
      })),
      projectSettings: {
        framework: 'vite',
        buildCommand: 'vite build',
        outputDirectory: 'dist',
        installCommand: 'npm install --include=dev',
      },
    }

    const deployment = await vercelApiRequest<{
      id: string
      url: string
      readyState: string
    }>(
      'POST',
      `/v13/deployments${queryParams}`,
      vercelToken,
      deployPayload
    )

    const deploymentUrl = `https://${deployment.url}`
    console.log(`[Vercel] Deployment created: ${deploymentUrl} (id: ${deployment.id}, state: ${deployment.readyState})`)

    return {
      success: true,
      deploymentUrl,
      projectUrl: `https://vercel.com/${projectName}`,
      deploymentId: deployment.id,
      status: deployment.readyState,
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

/** Collect all workspace files as { relativePath, content } for Vercel deploy */
function collectFilesForDeploy(
  workspacePath: string,
  base = ''
): Array<{ relativePath: string; content: string }> {
  const EXCLUDE_DIRS = new Set(['node_modules', '.git', 'dist', '.cache', '.next', '__pycache__'])
  const EXCLUDE_FILES = new Set(['.DS_Store', 'Thumbs.db'])
  const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5 MB per file

  const results: Array<{ relativePath: string; content: string }> = []
  const dirPath = path.join(workspacePath, base)

  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true })
  } catch {
    return results
  }

  for (const entry of entries) {
    if (EXCLUDE_FILES.has(entry.name)) continue
    const relPath = base ? `${base}/${entry.name}` : entry.name

    if (entry.isDirectory()) {
      if (EXCLUDE_DIRS.has(entry.name)) continue
      results.push(...collectFilesForDeploy(workspacePath, relPath))
    } else if (entry.isFile()) {
      const fullPath = path.join(dirPath, entry.name)
      try {
        const stat = fs.statSync(fullPath)
        if (stat.size > MAX_FILE_SIZE) continue

        // Read as base64 for binary-safe transfer
        const content = fs.readFileSync(fullPath).toString('base64')
        results.push({ relativePath: relPath, content })
      } catch {
        // Skip unreadable files
      }
    }
  }

  return results
}

// ─── HTTP helpers ──────────────────────────────────────────────

function githubApiRequest<T>(
  method: string,
  endpoint: string,
  token: string,
  body?: unknown
): Promise<T> {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : undefined
    const req = https.request(
      {
        hostname: 'api.github.com',
        path: endpoint,
        method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github+json',
          'User-Agent': 'CoderXP/1.0',
          'X-GitHub-Api-Version': '2022-11-28',
          ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}),
        },
      },
      (res) => {
        let responseBody = ''
        res.on('data', (chunk) => (responseBody += chunk))
        res.on('end', () => {
          try {
            const parsed = JSON.parse(responseBody)
            if (res.statusCode && res.statusCode >= 400) {
              const err: any = new Error(parsed.message ?? `GitHub API ${res.statusCode}`)
              err.statusCode = res.statusCode
              reject(err)
            } else {
              resolve(parsed as T)
            }
          } catch {
            reject(new Error(`GitHub API response parse error (HTTP ${res.statusCode})`))
          }
        })
      }
    )
    req.on('error', reject)
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('GitHub API timeout')) })
    if (data) req.write(data)
    req.end()
  })
}

function vercelApiRequest<T>(
  method: string,
  endpoint: string,
  token: string,
  body?: unknown
): Promise<T> {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : undefined
    const req = https.request(
      {
        hostname: 'api.vercel.com',
        path: endpoint,
        method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        },
      },
      (res) => {
        let responseBody = ''
        res.on('data', (chunk) => (responseBody += chunk))
        res.on('end', () => {
          try {
            const parsed = JSON.parse(responseBody)
            if (res.statusCode && res.statusCode >= 400) {
              reject(new Error(parsed.error?.message ?? `Vercel API ${res.statusCode}`))
            } else {
              resolve(parsed as T)
            }
          } catch {
            reject(new Error(`Vercel API response parse error (HTTP ${res.statusCode})`))
          }
        })
      }
    )
    req.on('error', reject)
    req.setTimeout(60000, () => { req.destroy(); reject(new Error('Vercel API timeout')) })
    if (data) req.write(data)
    req.end()
  })
}
