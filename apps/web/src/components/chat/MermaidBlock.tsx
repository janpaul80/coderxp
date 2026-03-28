import React, { useEffect, useRef, useState } from 'react'

let mermaidReady = false

async function ensureMermaid() {
  if (mermaidReady) return
  const mermaid = (await import('mermaid')).default
  mermaid.initialize({
    startOnLoad: false,
    theme: 'dark',
    themeVariables: {
      background: '#0d0d0f',
      primaryColor: '#7c3aed',
      primaryTextColor: '#e2e8f0',
      primaryBorderColor: '#4c1d95',
      lineColor: '#6b7280',
      secondaryColor: '#1e1b4b',
      tertiaryColor: '#1f2937',
      edgeLabelBackground: '#1e1b4b',
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      fontSize: '13px',
    },
    securityLevel: 'loose',
  })
  mermaidReady = true
}

interface MermaidBlockProps {
  code: string
}

export function MermaidBlock({ code }: MermaidBlockProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [rendered, setRendered] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function render() {
      try {
        await ensureMermaid()
        const mermaid = (await import('mermaid')).default
        const id = `mermaid-${Math.random().toString(36).slice(2)}`
        const { svg } = await mermaid.render(id, code.trim())
        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg
          setRendered(true)
          setError(null)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Diagram render failed')
          setRendered(false)
        }
      }
    }

    render()
    return () => { cancelled = true }
  }, [code])

  if (error) {
    return (
      <div className="my-3 rounded-lg border border-error/30 bg-error/5 p-3">
        <p className="text-xs text-error/80 font-mono mb-1">Diagram error</p>
        <pre className="text-xs text-text-muted whitespace-pre-wrap">{code}</pre>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="my-3 overflow-x-auto rounded-lg border border-white/[0.08] bg-base-elevated p-4 text-center"
      style={{ opacity: rendered ? 1 : 0.4, transition: 'opacity 0.2s' }}
    />
  )
}
