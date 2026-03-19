import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { Message, Chat, Project, UploadedFile } from '@/types'

interface ChatStore {
  // Projects list
  projects: Project[]
  setProjects: (projects: Project[]) => void
  addProject: (project: Project) => void
  updateProject: (id: string, updates: Partial<Project>) => void

  // Active project + chat
  activeProjectId: string | null
  activeChatId: string | null
  setActiveProject: (projectId: string | null) => void
  setActiveChat: (chatId: string | null) => void

  // Chats
  chats: Record<string, Chat>
  setChat: (chat: Chat) => void
  updateChat: (chatId: string, updates: Partial<Chat>) => void

  // Messages
  messages: Message[]
  setMessages: (messages: Message[]) => void
  addMessage: (message: Message) => void
  updateMessage: (id: string, updates: Partial<Message>) => void
  appendStreamDelta: (messageId: string, delta: string) => void
  finalizeStream: (messageId: string) => void

  // Streaming state
  isStreaming: boolean
  streamingMessageId: string | null
  setStreaming: (streaming: boolean, messageId?: string) => void

  // Pending uploads
  pendingFiles: UploadedFile[]
  addPendingFile: (file: UploadedFile) => void
  removePendingFile: (fileId: string) => void
  clearPendingFiles: () => void

  // Input state
  inputValue: string
  setInputValue: (value: string) => void

  // Typing indicator
  isAssistantTyping: boolean
  setAssistantTyping: (typing: boolean) => void
}

export const useChatStore = create<ChatStore>()(
  devtools(
    (set) => ({
      // ── Projects ──────────────────────────────────────────
      projects: [],
      setProjects: (projects) =>
        set({ projects }, false, 'setProjects'),

      addProject: (project) =>
        set(
          (state) => ({ projects: [project, ...state.projects] }),
          false,
          'addProject'
        ),

      updateProject: (id, updates) =>
        set(
          (state) => ({
            projects: state.projects.map((p) =>
              p.id === id ? { ...p, ...updates } : p
            ),
          }),
          false,
          'updateProject'
        ),

      // ── Active project/chat ───────────────────────────────
      activeProjectId: null,
      activeChatId: null,

      setActiveProject: (projectId) =>
        set({ activeProjectId: projectId }, false, 'setActiveProject'),

      setActiveChat: (chatId) =>
        set({ activeChatId: chatId }, false, 'setActiveChat'),

      // ── Chats ─────────────────────────────────────────────
      chats: {},

      setChat: (chat) =>
        set(
          (state) => ({ chats: { ...state.chats, [chat.id]: chat } }),
          false,
          'setChat'
        ),

      updateChat: (chatId, updates) =>
        set(
          (state) => ({
            chats: {
              ...state.chats,
              [chatId]: { ...state.chats[chatId], ...updates },
            },
          }),
          false,
          'updateChat'
        ),

      // ── Messages ──────────────────────────────────────────
      messages: [],

      setMessages: (messages) =>
        set({ messages }, false, 'setMessages'),

      addMessage: (message) =>
        set(
          (state) => {
            // Deduplicate: skip if a message with the same id already exists.
            // This guards against the socket event firing multiple times (e.g.
            // during HMR or if multiple useSocket() instances briefly co-exist).
            if (state.messages.some((m) => m.id === message.id)) return state
            return { messages: [...state.messages, message] }
          },
          false,
          'addMessage'
        ),

      updateMessage: (id, updates) =>
        set(
          (state) => ({
            messages: state.messages.map((m) =>
              m.id === id ? { ...m, ...updates } : m
            ),
          }),
          false,
          'updateMessage'
        ),

      appendStreamDelta: (messageId, delta) =>
        set(
          (state) => ({
            messages: state.messages.map((m) =>
              m.id === messageId
                ? { ...m, content: m.content + delta }
                : m
            ),
          }),
          false,
          'appendStreamDelta'
        ),

      finalizeStream: (messageId) =>
        set(
          (state) => ({
            messages: state.messages.map((m) =>
              m.id === messageId ? { ...m, isStreaming: false } : m
            ),
            isStreaming: false,
            streamingMessageId: null,
          }),
          false,
          'finalizeStream'
        ),

      // ── Streaming ─────────────────────────────────────────
      isStreaming: false,
      streamingMessageId: null,

      setStreaming: (streaming, messageId) =>
        set(
          {
            isStreaming: streaming,
            streamingMessageId: messageId ?? null,
          },
          false,
          'setStreaming'
        ),

      // ── Pending files ─────────────────────────────────────
      pendingFiles: [],

      addPendingFile: (file) =>
        set(
          (state) => ({ pendingFiles: [...state.pendingFiles, file] }),
          false,
          'addPendingFile'
        ),

      removePendingFile: (fileId) =>
        set(
          (state) => ({
            pendingFiles: state.pendingFiles.filter((f) => f.id !== fileId),
          }),
          false,
          'removePendingFile'
        ),

      clearPendingFiles: () =>
        set({ pendingFiles: [] }, false, 'clearPendingFiles'),

      // ── Input ─────────────────────────────────────────────
      inputValue: '',
      setInputValue: (value) =>
        set({ inputValue: value }, false, 'setInputValue'),

      // ── Typing indicator ──────────────────────────────────
      isAssistantTyping: false,
      setAssistantTyping: (typing) =>
        set({ isAssistantTyping: typing }, false, 'setAssistantTyping'),
    }),
    { name: 'CodedXP/ChatStore' }
  )
)
