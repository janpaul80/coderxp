import React, { useRef, useState, useCallback, useEffect } from 'react'
import { Send, Paperclip, Mic, MicOff, X, FileText, FileCode, FileImage, File } from 'lucide-react'
import { useChatStore } from '@/store/chatStore'
import { useAppStore } from '@/store/appStore'
import { useSocket } from '@/hooks/useSocket'
import { cn, formatBytes, generateId } from '@/lib/utils'
import { Spinner } from '@/components/ui/Spinner'
import { getSocket } from '@/lib/socket'
import { projectsApi, chatsApi } from '@/lib/api'
import type { UploadedFile, UploadedFileType, Project, Chat } from '@/types'

// ─── Helpers ─────────────────────────────────────────────────

function getFileType(mimeType: string): UploadedFileType {
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType === 'application/pdf') return 'pdf'
  if (mimeType.startsWith('text/')) return 'text'
  if (
    mimeType.includes('javascript') ||
    mimeType.includes('typescript') ||
    mimeType.includes('json') ||
    mimeType.includes('html') ||
    mimeType.includes('css')
  )
    return 'code'
  return 'other'
}

function FileTypeIcon({ type, className }: { type: UploadedFileType; className?: string }) {
  switch (type) {
    case 'image':
      return <FileImage className={className} />
    case 'pdf':
      return <FileText className={className} />
    case 'code':
      return <FileCode className={className} />
    default:
      return <File className={className} />
  }
}

// ─── Image thumbnail attachment ───────────────────────────────

function ImageAttachment({ file, onRemove }: { file: UploadedFile; onRemove: (id: string) => void }) {
  return (
    <div className="relative group shrink-0">
      <img
        src={file.url}
        alt={file.name}
        className="w-14 h-14 rounded-lg object-cover border border-white/[0.1]"
      />
      <button
        onClick={() => onRemove(file.id)}
        className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-base-card border border-white/[0.12]
          flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity
          hover:bg-error/80 text-text-muted hover:text-white"
      >
        <X className="w-2.5 h-2.5" />
      </button>
      <div className="absolute bottom-0 left-0 right-0 rounded-b-lg bg-black/50 px-1 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <p className="text-[9px] text-white truncate">{file.name}</p>
      </div>
    </div>
  )
}

// ─── File chip attachment ─────────────────────────────────────

function FileAttachment({ file, onRemove }: { file: UploadedFile; onRemove: (id: string) => void }) {
  const colorMap: Record<UploadedFileType, string> = {
    pdf: 'text-red-400 bg-red-400/10',
    text: 'text-blue-400 bg-blue-400/10',
    code: 'text-green-400 bg-green-400/10',
    image: 'text-purple-400 bg-purple-400/10',
    other: 'text-text-muted bg-white/[0.06]',
  }

  return (
    <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-base-card border border-white/[0.08] group shrink-0 max-w-[160px]">
      <div className={cn('p-1 rounded-md shrink-0', colorMap[file.type])}>
        <FileTypeIcon type={file.type} className="w-3 h-3" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-text-primary truncate leading-tight">{file.name}</p>
        <p className="text-[10px] text-text-muted leading-tight">{formatBytes(file.size)}</p>
      </div>
      <button
        onClick={() => onRemove(file.id)}
        className="shrink-0 text-text-muted hover:text-error transition-colors opacity-0 group-hover:opacity-100"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  )
}

// ─── Main input ───────────────────────────────────────────────

export function ChatInput() {
  const inputValue = useChatStore((s) => s.inputValue)
  const setInputValue = useChatStore((s) => s.setInputValue)
  const pendingFiles = useChatStore((s) => s.pendingFiles)
  const addPendingFile = useChatStore((s) => s.addPendingFile)
  const removePendingFile = useChatStore((s) => s.removePendingFile)
  const clearPendingFiles = useChatStore((s) => s.clearPendingFiles)
  const addMessage = useChatStore((s) => s.addMessage)
  const setAssistantTyping = useChatStore((s) => s.setAssistantTyping)
  const activeChatId = useChatStore((s) => s.activeChatId)
  const isStreaming = useChatStore((s) => s.isStreaming)
  const addProject = useChatStore((s) => s.addProject)
  const setActiveProject = useChatStore((s) => s.setActiveProject)
  const setActiveChat = useChatStore((s) => s.setActiveChat)

  const appMode = useAppStore((s) => s.appMode)
  const { sendMessage } = useSocket()

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [isRecording, setIsRecording] = useState(false)
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null)

  // Auto-resize textarea — grows with content up to 300px
  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, 300)}px`
  }, [inputValue])

  // Revoke object URLs on unmount to avoid memory leaks
  useEffect(() => {
    return () => {
      pendingFiles.forEach((f) => {
        if (f.url.startsWith('blob:')) URL.revokeObjectURL(f.url)
      })
    }
  }, [])

  // ── Send message ──────────────────────────────────────────

  const handleSend = useCallback(async () => {
    const content = inputValue.trim()
    if (!content && pendingFiles.length === 0) return
    if (isStreaming) return

    const fileIds = pendingFiles.map((f) => f.id)

    // ── Auto-create project + chat on first message ───────
    // When no active chat exists (fresh session or "+ New" clicked),
    // create a project and its default chat before sending.
    let chatId = activeChatId
    if (!chatId) {
      const isSocketConnected = getSocket().connected
      if (!isSocketConnected) {
        // Offline / demo mode — use a local placeholder id
        chatId = 'default'
      } else {
        try {
          // Derive a project name from the first ~60 chars of the message
          const projectName = content.slice(0, 60).trim() || 'New Project'
          const projectRes = await projectsApi.create({ name: projectName })
          const project = projectRes.data as Project

          // Fetch the default chat that was auto-created with the project
          const chatsRes = await chatsApi.list(project.id)
          const chats = chatsRes.data as Chat[]
          const defaultChat = chats[0]
          if (!defaultChat) throw new Error('No default chat found after project creation')

          // Update store so the rest of the app knows about the new project/chat
          addProject(project)
          setActiveProject(project.id)
          setActiveChat(defaultChat.id)
          chatId = defaultChat.id
        } catch (err) {
          console.error('[ChatInput] Failed to auto-create project:', err)
          setAssistantTyping(false)
          return
        }
      }
    }

    // Always show user message instantly (optimistic) — server echo is deduplicated by id
    const optimisticId = generateId()
    addMessage({
      id: optimisticId,
      chatId,
      role: 'user',
      type: 'text',
      content: content || `[${pendingFiles.length} file${pendingFiles.length > 1 ? 's' : ''} attached]`,
      createdAt: new Date().toISOString(),
      metadata: fileIds.length > 0 ? { fileIds } : undefined,
    })

    setAssistantTyping(true)

    const isSocketConnected = getSocket().connected
    if (!isSocketConnected) {
      // Not connected to backend — show error instead of faking a response
      setAssistantTyping(false)
      addMessage({
        id: generateId(),
        chatId,
        role: 'assistant',
        type: 'text',
        content: 'Not connected to the server. Please check that the backend is running and refresh the page.',
        createdAt: new Date().toISOString(),
      })
    } else {
      sendMessage(chatId, content, fileIds.length > 0 ? fileIds : undefined)
    }

    setInputValue('')
    clearPendingFiles()

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }, [
    inputValue,
    isStreaming,
    activeChatId,
    pendingFiles,
    addMessage,
    addProject,
    setActiveProject,
    setActiveChat,
    setAssistantTyping,
    sendMessage,
    setInputValue,
    clearPendingFiles,
  ])

  // ── Keyboard handler ──────────────────────────────────────

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // ── File picker — local only, no API call ─────────────────

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return

    for (const file of files) {
      const fileType = getFileType(file.type)
      const localUrl = fileType === 'image' ? URL.createObjectURL(file) : ''

      const uploadedFile: UploadedFile = {
        id: generateId(),
        name: file.name,
        type: fileType,
        mimeType: file.type,
        size: file.size,
        url: localUrl,
        createdAt: new Date().toISOString(),
      }

      addPendingFile(uploadedFile)
    }

    // Reset input so same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // ── Voice recording ───────────────────────────────────────

  const toggleRecording = async () => {
    if (isRecording && mediaRecorder) {
      mediaRecorder.stop()
      setIsRecording(false)
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      const chunks: BlobPart[] = []

      recorder.ondataavailable = (e) => chunks.push(e.data)
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm' })
        console.log('Voice recorded:', blob.size, 'bytes — transcription pending')
        stream.getTracks().forEach((t) => t.stop())
      }

      recorder.start()
      setMediaRecorder(recorder)
      setIsRecording(true)
    } catch {
      console.error('Microphone access denied')
    }
  }

  // ── State ─────────────────────────────────────────────────

  const isDisabled = appMode === 'building' || isStreaming
  const canSend = (inputValue.trim().length > 0 || pendingFiles.length > 0) && !isDisabled

  const placeholder =
    appMode === 'building'
      ? 'Building your app...'
      : appMode === 'awaiting_approval'
      ? 'Approve the plan above or ask for changes...'
      : appMode === 'planning'
      ? 'Agent is thinking...'
      : 'Describe what you want to build...'

  const imageFiles = pendingFiles.filter((f) => f.type === 'image')
  const otherFiles = pendingFiles.filter((f) => f.type !== 'image')

  return (
    <div className="px-4 py-3 pb-6">
      {/* ── Input container ────────────────────────────────── */}
      <div className={cn(
        'flex flex-col rounded-3xl',
        'bg-white/[0.04] transition-all duration-200',
        isDisabled
          ? 'opacity-60'
          : 'focus-within:bg-white/[0.06] shadow-sm'
      )}>

        {/* ── Attached files — inside the box ──────────────── */}
        {pendingFiles.length > 0 && (
          <div className="px-3 pt-3 pb-2 border-b border-white/[0.05]">
            <div className="flex flex-wrap gap-2">
              {/* Image thumbnails */}
              {imageFiles.map((file) => (
                <ImageAttachment key={file.id} file={file} onRemove={removePendingFile} />
              ))}
              {/* File chips */}
              {otherFiles.map((file) => (
                <FileAttachment key={file.id} file={file} onRemove={removePendingFile} />
              ))}
            </div>
          </div>
        )}

        {/* ── Textarea + action buttons ─────────────────────── */}
        <div className="flex items-end gap-2 px-3 py-2.5">
          <textarea
            ref={textareaRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={isDisabled}
            rows={2}
            className={cn(
              'flex-1 bg-transparent text-[15px] text-[#e8e8e8] placeholder:text-white/30',
              'resize-none outline-none border-0 appearance-none leading-relaxed',
              'overflow-y-auto scrollbar-none min-h-[48px] max-h-[300px]',
              'focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0',
              'disabled:cursor-not-allowed'
            )}
          />

          {/* Action buttons */}
          <div className="flex items-center gap-1 shrink-0 pb-0.5">
            {/* File upload */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,.pdf,.txt,.md,.js,.ts,.jsx,.tsx,.json,.css,.html,.py,.go,.rs,.java"
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isDisabled}
              className={cn(
                'p-1.5 rounded-xl transition-all duration-150',
                pendingFiles.length > 0
                  ? 'text-white bg-white/10'
                  : 'text-white/40 hover:text-white hover:bg-white/[0.08]',
                'disabled:opacity-40 disabled:cursor-not-allowed'
              )}
              title="Attach file"
            >
              <Paperclip className="w-4 h-4" />
            </button>

            {/* Microphone */}
            <button
              onClick={toggleRecording}
              disabled={isDisabled}
              className={cn(
                'p-1.5 rounded-xl transition-all duration-150',
                isRecording
                  ? 'text-error bg-error/10 hover:bg-error/15'
                  : 'text-white/40 hover:text-white hover:bg-white/[0.08]',
                'disabled:opacity-40 disabled:cursor-not-allowed'
              )}
              title={isRecording ? 'Stop recording' : 'Voice input'}
            >
              {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>

            {/* Send */}
            <button
              onClick={handleSend}
              disabled={!canSend}
              className={cn(
                'p-1.5 rounded-xl transition-all duration-150',
                canSend
                  ? 'bg-white text-black hover:bg-white/90 shadow-md'
                  : 'text-white/20 bg-white/[0.02]',
                'disabled:opacity-40 disabled:cursor-not-allowed'
              )}
              title="Send message"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
      {/* ── Hint ───────────────────────────────────────────── */}
      <p className="text-2xs text-text-muted text-center mt-2">
        Press{' '}
        <kbd className="px-1 py-0.5 rounded bg-white/[0.06] font-mono text-2xs">Enter</kbd> to send
        {' · '}
        <kbd className="px-1 py-0.5 rounded bg-white/[0.06] font-mono text-2xs">Shift+Enter</kbd> for new line
      </p>
    </div>
  )
}
