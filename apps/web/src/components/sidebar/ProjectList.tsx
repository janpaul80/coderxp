import React from 'react'
import { motion } from 'framer-motion'
import { FolderOpen, Clock, CheckCircle2, AlertCircle, Loader2, Hammer } from 'lucide-react'
import { useChatStore } from '@/store/chatStore'
import { useAppStore } from '@/store/appStore'
import { cn, formatRelativeTime } from '@/lib/utils'
import type { Project, ProjectStatus } from '@/types'

// ─── Status icon map ──────────────────────────────────────────

const statusIcon: Record<ProjectStatus, React.ReactNode> = {
  draft: <Clock className="w-3 h-3 text-text-muted" />,
  planning: <Loader2 className="w-3 h-3 text-warning animate-spin" />,
  building: <Hammer className="w-3 h-3 text-accent animate-pulse" />,
  ready: <CheckCircle2 className="w-3 h-3 text-success" />,
  error: <AlertCircle className="w-3 h-3 text-error" />,
}

// ─── Project item ─────────────────────────────────────────────

function ProjectItem({ project }: { project: Project }) {
  const activeProjectId = useChatStore((s) => s.activeProjectId)
  const setActiveProject = useChatStore((s) => s.setActiveProject)
  const setAppActiveProject = useAppStore((s) => s.setActiveProject)

  const isActive = activeProjectId === project.id

  const handleClick = () => {
    setActiveProject(project.id)
    setAppActiveProject(project.id)
  }

  return (
    <motion.button
      initial={{ opacity: 0, x: -4 }}
      animate={{ opacity: 1, x: 0 }}
      onClick={handleClick}
      className={cn(
        'w-full flex items-start gap-2.5 px-3 py-2.5 rounded-lg text-left',
        'transition-all duration-150 group',
        isActive
          ? 'bg-accent/10 border border-accent/20 text-text-primary'
          : 'hover:bg-white/[0.04] border border-transparent text-text-secondary hover:text-text-primary'
      )}
    >
      <div className="mt-0.5 shrink-0">
        {isActive ? (
          <FolderOpen className="w-3.5 h-3.5 text-accent" />
        ) : (
          <FolderOpen className="w-3.5 h-3.5 text-text-muted group-hover:text-text-secondary" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1">
          <p className={cn(
            'text-xs font-medium truncate',
            isActive ? 'text-text-primary' : 'text-text-secondary'
          )}>
            {project.name}
          </p>
          <span className="shrink-0">{statusIcon[project.status]}</span>
        </div>
        <p className="text-2xs text-text-muted mt-0.5">
          {formatRelativeTime(project.updatedAt)}
        </p>
      </div>
    </motion.button>
  )
}

// ─── Empty state ──────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
      <div className="w-10 h-10 rounded-xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center mb-3">
        <FolderOpen className="w-5 h-5 text-text-muted" />
      </div>
      <p className="text-xs text-text-muted">No projects yet</p>
      <p className="text-2xs text-text-muted/60 mt-1">
        Start a conversation to create your first app
      </p>
    </div>
  )
}

// ─── Project list ─────────────────────────────────────────────

export function ProjectList() {
  const projects = useChatStore((s) => s.projects)

  if (projects.length === 0) {
    return <EmptyState />
  }

  return (
    <div className="space-y-0.5 pb-2">
      {projects.map((project) => (
        <ProjectItem key={project.id} project={project} />
      ))}
    </div>
  )
}
