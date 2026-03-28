import React, { useEffect } from 'react'
import { Link } from 'react-router-dom'

// ─── Nav ──────────────────────────────────────────────────────

const NAV_SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'base-url', label: 'Base URL' },
  { id: 'authentication', label: 'Authentication' },
  { id: 'api-keys', label: 'API Keys' },
  { id: 'endpoints', label: 'Endpoints' },
  { id: 'examples', label: 'Examples' },
  { id: 'responses', label: 'Responses' },
  { id: 'errors', label: 'Errors' },
  { id: 'credits', label: 'Credits & Billing' },
  { id: 'rate-limits', label: 'Rate Limits' },
  { id: 'sdks', label: 'SDKs & More' },
]

// ─── Code block ───────────────────────────────────────────────

function CodeBlock({ lang, children }: { lang?: string; children: string }) {
  return (
    <div className="relative rounded-xl bg-[#0a0a14] border border-white/[0.06] overflow-hidden">
      {lang && (
        <div className="px-4 py-2 border-b border-white/[0.04] text-2xs text-white/25 font-mono uppercase tracking-wider">
          {lang}
        </div>
      )}
      <pre className="px-4 py-4 overflow-x-auto">
        <code className="text-[13px] leading-[1.7] font-mono text-white/60">{children}</code>
      </pre>
    </div>
  )
}

// ─── Section ──────────────────────────────────────────────────

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 mb-16">
      <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-3">
        <span className="w-1 h-6 rounded-full bg-accent/60" />
        {title}
      </h2>
      <div className="text-sm text-white/50 leading-relaxed space-y-4">
        {children}
      </div>
    </section>
  )
}

// ─── Page ─────────────────────────────────────────────────────

export default function DocsPage() {
  useEffect(() => {
    document.body.classList.add('landing-page')
    return () => { document.body.classList.remove('landing-page') }
  }, [])

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#000000' }}>
      {/* ── Header ────────────────────────────────────────── */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-2xl border-b border-white/[0.06]">
        <nav className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center">
            <span className="font-extrabold text-white text-lg tracking-tight">
              CODER<sup className="text-[10px] font-bold text-white/50 ml-0.5">XP</sup>
            </span>
            <span className="ml-3 text-xs text-white/30 font-medium">Docs</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link to="/" className="text-xs text-white/40 hover:text-white/70 transition-colors">
              Home
            </Link>
            <Link
              to="/auth?mode=register"
              className="px-3 py-1.5 rounded-lg bg-white text-black text-xs font-semibold hover:bg-white/90 transition-all"
            >
              Get API Key
            </Link>
          </div>
        </nav>
      </header>

      <div className="max-w-6xl mx-auto px-6 pt-24 pb-20 flex gap-12">
        {/* ── Sidebar nav ──────────────────────────────────── */}
        <aside className="hidden lg:block w-48 shrink-0">
          <div className="sticky top-24">
            <p className="text-2xs text-white/25 uppercase tracking-wider font-bold mb-4">On this page</p>
            <nav className="space-y-1">
              {NAV_SECTIONS.map((s) => (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  className="block px-3 py-1.5 rounded-lg text-xs text-white/35 hover:text-white/70 hover:bg-white/[0.04] transition-all"
                >
                  {s.label}
                </a>
              ))}
            </nav>
          </div>
        </aside>

        {/* ── Main content ─────────────────────────────────── */}
        <main className="flex-1 min-w-0">
          {/* Hero */}
          <div className="mb-16">
            <h1 className="text-3xl md:text-4xl font-extrabold text-white mb-4 tracking-tight">
              CoderXP API
            </h1>
            <p className="text-base text-white/40 leading-relaxed max-w-2xl mb-6">
              Build apps programmatically using the CoderXP API. Send requests to our endpoint with your API key, and our AI agents will plan, code, and deploy full-stack applications.
            </p>
            <div className="flex items-center gap-3">
              <a
                href="#api-keys"
                className="px-4 py-2 rounded-lg bg-accent hover:bg-accent/90 text-white text-sm font-semibold transition-all"
              >
                Get API Key
              </a>
              <a
                href="#base-url"
                className="px-4 py-2 rounded-lg bg-white/[0.06] border border-white/[0.08] text-white/60 text-sm font-medium hover:text-white hover:bg-white/[0.10] transition-all"
              >
                View Endpoint
              </a>
              <a
                href="#examples"
                className="px-4 py-2 rounded-lg bg-white/[0.06] border border-white/[0.08] text-white/60 text-sm font-medium hover:text-white hover:bg-white/[0.10] transition-all"
              >
                Read Examples
              </a>
            </div>
          </div>

          {/* ── Overview ────────────────────────────────────── */}
          <Section id="overview" title="Overview">
            <p>
              The CoderXP API lets you generate full-stack applications using our autonomous AI engine. You send a prompt describing what you want to build, and CoderXP's multi-agent system plans, scaffolds, codes, tests, and deploys your app.
            </p>
            <p>
              You can use CoderXP as your AI service provider directly — no need to bring your own API keys for other providers. Authenticate using a CoderXP API key, and all requests are routed through our infrastructure.
            </p>
            <div className="p-4 rounded-xl bg-accent/[0.04] border border-accent/15">
              <p className="text-xs text-accent/80 font-medium mb-1">How it works</p>
              <ol className="text-xs text-white/40 space-y-1 list-decimal list-inside">
                <li>Create an account and generate an API key from your dashboard</li>
                <li>Send a request to the CoderXP endpoint with your prompt</li>
                <li>Our AI agents plan, code, and build your app</li>
                <li>Receive the completed project or a live preview URL</li>
              </ol>
            </div>
          </Section>

          {/* ── Base URL ────────────────────────────────────── */}
          <Section id="base-url" title="Base Endpoint URL">
            <p>All API requests are made to the following base URL:</p>
            <CodeBlock lang="url">{`https://coderxp.pro/api/v1`}</CodeBlock>
            <p>
              All endpoints are prefixed with <code className="text-xs text-accent/70 bg-accent/10 px-1.5 py-0.5 rounded">/api/v1</code>. The API uses JSON for request and response bodies.
            </p>
          </Section>

          {/* ── Authentication ──────────────────────────────── */}
          <Section id="authentication" title="Authentication">
            <p>
              All API requests require authentication via a Bearer token in the <code className="text-xs text-accent/70 bg-accent/10 px-1.5 py-0.5 rounded">Authorization</code> header.
            </p>
            <CodeBlock lang="http">{`Authorization: Bearer cxp_your_api_key_here`}</CodeBlock>
            <p>
              Your API key starts with <code className="text-xs text-accent/70 bg-accent/10 px-1.5 py-0.5 rounded">cxp_</code> and should be kept secret. Do not expose it in client-side code or public repositories.
            </p>
            <div className="p-4 rounded-xl bg-amber-400/[0.04] border border-amber-400/15">
              <p className="text-xs text-amber-400/80 font-medium">Security</p>
              <p className="text-xs text-white/35 mt-1">
                Never share your API key. Treat it like a password. If you believe a key has been compromised, revoke it immediately from your dashboard and create a new one.
              </p>
            </div>
          </Section>

          {/* ── API Keys ────────────────────────────────────── */}
          <Section id="api-keys" title="Create & Manage API Keys">
            <p>
              API keys are created and managed from your CoderXP dashboard settings.
            </p>
            <div className="space-y-3">
              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                <p className="text-xs text-white/60 font-semibold mb-2">Creating a key</p>
                <ol className="text-xs text-white/40 space-y-1 list-decimal list-inside">
                  <li>Sign in to your CoderXP account</li>
                  <li>Navigate to <strong>Settings</strong> from the user dropdown</li>
                  <li>Go to the <strong>API Keys</strong> tab</li>
                  <li>Click <strong>Generate New Key</strong></li>
                  <li>Copy the key immediately — it is only shown once</li>
                </ol>
              </div>
              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                <p className="text-xs text-white/60 font-semibold mb-2">Key management</p>
                <ul className="text-xs text-white/40 space-y-1 list-disc list-inside">
                  <li>You can have up to 5 active keys</li>
                  <li>Keys can be revoked at any time</li>
                  <li>Usage is tracked per key for billing purposes</li>
                  <li>Keys inherit your account's credit balance and plan</li>
                </ul>
              </div>
            </div>
            <p>
              Programmatically, you can also manage keys via the API:
            </p>
            <CodeBlock lang="bash">{`# List your API keys
curl https://coderxp.pro/api/v1/keys \\
  -H "Authorization: Bearer cxp_your_key"

# Create a new key
curl -X POST https://coderxp.pro/api/v1/keys \\
  -H "Authorization: Bearer cxp_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{"name": "Production Key"}'

# Revoke a key
curl -X DELETE https://coderxp.pro/api/v1/keys/key_id_here \\
  -H "Authorization: Bearer cxp_your_key"`}</CodeBlock>
          </Section>

          {/* ── Endpoints ───────────────────────────────────── */}
          <Section id="endpoints" title="Endpoints">
            {/* Chat / Completion */}
            <div className="p-5 rounded-xl bg-white/[0.02] border border-white/[0.06] mb-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-400/15 text-emerald-400 uppercase">POST</span>
                <code className="text-xs text-white/60 font-mono">/api/v1/chat/completions</code>
              </div>
              <p className="text-xs text-white/40 mb-3">
                Send a message and receive an AI response. Works like a standard chat completion API, with CoderXP's multi-agent system handling the request.
              </p>
              <p className="text-2xs text-white/25 uppercase tracking-wider font-bold mb-2">Request body</p>
              <CodeBlock lang="json">{`{
  "model": "coderxp-auto",
  "messages": [
    {
      "role": "user",
      "content": "Build a todo app with React and Tailwind"
    }
  ],
  "stream": false
}`}</CodeBlock>
            </div>

            {/* Build */}
            <div className="p-5 rounded-xl bg-white/[0.02] border border-white/[0.06] mb-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-400/15 text-emerald-400 uppercase">POST</span>
                <code className="text-xs text-white/60 font-mono">/api/v1/build</code>
              </div>
              <p className="text-xs text-white/40 mb-3">
                Trigger a full app build from a prompt. Returns a build job that you can poll for status.
              </p>
              <p className="text-2xs text-white/25 uppercase tracking-wider font-bold mb-2">Request body</p>
              <CodeBlock lang="json">{`{
  "prompt": "Create a SaaS dashboard with auth and Stripe billing",
  "options": {
    "framework": "react",
    "styling": "tailwind",
    "deploy": true
  }
}`}</CodeBlock>
            </div>

            {/* Build status */}
            <div className="p-5 rounded-xl bg-white/[0.02] border border-white/[0.06] mb-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-400/15 text-blue-400 uppercase">GET</span>
                <code className="text-xs text-white/60 font-mono">/api/v1/build/:jobId</code>
              </div>
              <p className="text-xs text-white/40">
                Check the status of a build job. Returns progress percentage, current phase, and preview URL when complete.
              </p>
            </div>

            {/* Keys */}
            <div className="p-5 rounded-xl bg-white/[0.02] border border-white/[0.06]">
              <div className="flex items-center gap-2 mb-3">
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-400/15 text-blue-400 uppercase">GET</span>
                <code className="text-xs text-white/60 font-mono">/api/v1/keys</code>
              </div>
              <p className="text-xs text-white/40">
                List, create, or revoke your API keys. See the API Keys section above for usage.
              </p>
            </div>
          </Section>

          {/* ── Examples ────────────────────────────────────── */}
          <Section id="examples" title="Example Requests">
            <p className="mb-2">JavaScript / TypeScript:</p>
            <CodeBlock lang="typescript">{`const response = await fetch('https://coderxp.pro/api/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer cxp_your_api_key_here',
  },
  body: JSON.stringify({
    model: 'coderxp-auto',
    messages: [
      { role: 'user', content: 'Build a landing page with a hero section and pricing table' }
    ],
  }),
});

const data = await response.json();
console.log(data.choices[0].message.content);`}</CodeBlock>

            <p className="mb-2 mt-6">curl:</p>
            <CodeBlock lang="bash">{`curl -X POST https://coderxp.pro/api/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer cxp_your_api_key_here" \\
  -d '{
    "model": "coderxp-auto",
    "messages": [
      {"role": "user", "content": "Create a blog platform with MDX support"}
    ]
  }'`}</CodeBlock>

            <p className="mb-2 mt-6">Triggering a full build:</p>
            <CodeBlock lang="bash">{`# Start a build
curl -X POST https://coderxp.pro/api/v1/build \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer cxp_your_api_key_here" \\
  -d '{"prompt": "E-commerce store with cart and checkout"}'

# Check build status
curl https://coderxp.pro/api/v1/build/job_abc123 \\
  -H "Authorization: Bearer cxp_your_api_key_here"`}</CodeBlock>
          </Section>

          {/* ── Responses ───────────────────────────────────── */}
          <Section id="responses" title="Responses">
            <p className="mb-2">Success response:</p>
            <CodeBlock lang="json">{`{
  "id": "cmpl_abc123",
  "object": "chat.completion",
  "created": 1711929600,
  "model": "coderxp-auto",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "I'll build a landing page with..."
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 24,
    "completion_tokens": 512,
    "total_tokens": 536,
    "credits_used": 2
  }
}`}</CodeBlock>

            <p className="mb-2 mt-6">Build response:</p>
            <CodeBlock lang="json">{`{
  "id": "job_abc123",
  "status": "complete",
  "progress": 100,
  "previewUrl": "https://preview.coderxp.pro/job_abc123",
  "files": 12,
  "duration": 45200,
  "techStack": ["react", "tailwind", "vite"]
}`}</CodeBlock>

            <p className="mb-2 mt-6">Error response:</p>
            <CodeBlock lang="json">{`{
  "error": {
    "type": "authentication_error",
    "message": "Invalid API key provided",
    "code": "invalid_api_key"
  }
}`}</CodeBlock>
          </Section>

          {/* ── Errors ──────────────────────────────────────── */}
          <Section id="errors" title="Errors">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    <th className="text-left py-3 pr-4 text-white/30 font-semibold">Code</th>
                    <th className="text-left py-3 pr-4 text-white/30 font-semibold">Status</th>
                    <th className="text-left py-3 text-white/30 font-semibold">Description</th>
                  </tr>
                </thead>
                <tbody className="text-white/45">
                  <tr className="border-b border-white/[0.04]">
                    <td className="py-2.5 pr-4 font-mono text-red-400/70">invalid_api_key</td>
                    <td className="py-2.5 pr-4">401</td>
                    <td className="py-2.5">The API key is missing, invalid, or revoked</td>
                  </tr>
                  <tr className="border-b border-white/[0.04]">
                    <td className="py-2.5 pr-4 font-mono text-red-400/70">insufficient_credits</td>
                    <td className="py-2.5 pr-4">402</td>
                    <td className="py-2.5">Your account does not have enough credits</td>
                  </tr>
                  <tr className="border-b border-white/[0.04]">
                    <td className="py-2.5 pr-4 font-mono text-red-400/70">invalid_request</td>
                    <td className="py-2.5 pr-4">400</td>
                    <td className="py-2.5">Request body is missing required fields or malformed</td>
                  </tr>
                  <tr className="border-b border-white/[0.04]">
                    <td className="py-2.5 pr-4 font-mono text-red-400/70">rate_limited</td>
                    <td className="py-2.5 pr-4">429</td>
                    <td className="py-2.5">Too many requests — slow down and retry</td>
                  </tr>
                  <tr className="border-b border-white/[0.04]">
                    <td className="py-2.5 pr-4 font-mono text-red-400/70">provider_unavailable</td>
                    <td className="py-2.5 pr-4">503</td>
                    <td className="py-2.5">Upstream AI provider is temporarily unavailable</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 pr-4 font-mono text-red-400/70">internal_error</td>
                    <td className="py-2.5 pr-4">500</td>
                    <td className="py-2.5">An unexpected error occurred on our end</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Section>

          {/* ── Credits ─────────────────────────────────────── */}
          <Section id="credits" title="Credits & Billing">
            <p>
              API usage consumes credits from your CoderXP account. Each request costs a certain number of credits depending on the model and complexity.
            </p>
            <div className="space-y-3">
              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                <p className="text-xs text-white/60 font-semibold mb-2">Credit consumption</p>
                <ul className="text-xs text-white/40 space-y-1 list-disc list-inside">
                  <li>Chat completions: 1-5 credits per request</li>
                  <li>Full app builds: 10-50 credits depending on complexity</li>
                  <li>Image generation: 2-8 credits per image</li>
                </ul>
              </div>
              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                <p className="text-xs text-white/60 font-semibold mb-2">Managing credits</p>
                <ul className="text-xs text-white/40 space-y-1 list-disc list-inside">
                  <li>Check your balance in your dashboard or via the Credits modal</li>
                  <li>Top up credits from your account settings</li>
                  <li>Subscription plans include monthly credit allowances</li>
                  <li>Usage is tracked per API key</li>
                </ul>
              </div>
            </div>
          </Section>

          {/* ── Rate limits ─────────────────────────────────── */}
          <Section id="rate-limits" title="Rate Limits">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    <th className="text-left py-3 pr-4 text-white/30 font-semibold">Plan</th>
                    <th className="text-left py-3 pr-4 text-white/30 font-semibold">Requests/min</th>
                    <th className="text-left py-3 text-white/30 font-semibold">Concurrent builds</th>
                  </tr>
                </thead>
                <tbody className="text-white/45">
                  <tr className="border-b border-white/[0.04]">
                    <td className="py-2.5 pr-4">Free</td>
                    <td className="py-2.5 pr-4">10</td>
                    <td className="py-2.5">1</td>
                  </tr>
                  <tr className="border-b border-white/[0.04]">
                    <td className="py-2.5 pr-4">Pro</td>
                    <td className="py-2.5 pr-4">60</td>
                    <td className="py-2.5">3</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 pr-4">Team</td>
                    <td className="py-2.5 pr-4">200</td>
                    <td className="py-2.5">10</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-4">
              If you exceed the rate limit, you'll receive a <code className="text-xs text-accent/70 bg-accent/10 px-1.5 py-0.5 rounded">429</code> response. Use exponential backoff when retrying. The <code className="text-xs text-accent/70 bg-accent/10 px-1.5 py-0.5 rounded">Retry-After</code> header indicates how long to wait.
            </p>
          </Section>

          {/* ── SDKs ────────────────────────────────────────── */}
          <Section id="sdks" title="SDKs & Integrations">
            <p>
              Currently, the CoderXP API is accessed via standard REST. Use <code className="text-xs text-accent/70 bg-accent/10 px-1.5 py-0.5 rounded">fetch</code>, <code className="text-xs text-accent/70 bg-accent/10 px-1.5 py-0.5 rounded">axios</code>, or <code className="text-xs text-accent/70 bg-accent/10 px-1.5 py-0.5 rounded">curl</code> to interact with the API.
            </p>
            <div className="p-4 rounded-xl bg-accent/[0.04] border border-accent/15">
              <p className="text-xs text-accent/80 font-medium mb-1">Coming soon</p>
              <ul className="text-xs text-white/40 space-y-1 list-disc list-inside">
                <li>Official JavaScript/TypeScript SDK</li>
                <li>Python SDK</li>
                <li>OpenAI-compatible mode (drop-in replacement)</li>
                <li>Additional AI providers and models</li>
              </ul>
            </div>
          </Section>

          {/* ── Footer ──────────────────────────────────────── */}
          <div className="pt-12 mt-12 border-t border-white/[0.06]">
            <p className="text-xs text-white/20">
              &copy; {new Date().getFullYear()} CoderXP. Questions? Reach out at{' '}
              <a href="mailto:support@coderxp.pro" className="text-accent/50 hover:text-accent transition-colors">
                support@coderxp.pro
              </a>
            </p>
          </div>
        </main>
      </div>
    </div>
  )
}
