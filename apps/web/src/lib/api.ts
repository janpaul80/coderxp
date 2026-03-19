import axios from 'axios'
import type {
  User,
  Project,
  Chat,
  Message,
  Plan,
  ApiResponse,
  PaginatedResponse,
} from '@/types'

// ─── Axios Instance ───────────────────────────────────────────

const api = axios.create({
  baseURL: (import.meta as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL ?? 'http://localhost:3001',
  headers: { 'Content-Type': 'application/json' },
  timeout: 30_000,
})

// ─── Request Interceptor (attach token) ───────────────────────

api.interceptors.request.use((config) => {
  try {
    const raw = localStorage.getItem('codedxp-auth')
    if (raw) {
      const parsed = JSON.parse(raw)
      const token = parsed?.state?.token
      if (token) {
        config.headers.Authorization = `Bearer ${token}`
      }
    }
  } catch {
    // ignore
  }
  return config
})

// ─── Response Interceptor ─────────────────────────────────────

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('codedxp-auth')
      window.location.href = '/auth'
    }
    return Promise.reject(err)
  }
)

// ─── Auth ─────────────────────────────────────────────────────
// Note: API returns { user, token } directly (not wrapped in ApiResponse)

export const authApi = {
  register: (data: { name: string; email: string; password: string }) =>
    api.post<{ user: User; token: string }>('/api/auth/register', data),

  login: (data: { email: string; password: string }) =>
    api.post<{ user: User; token: string }>('/api/auth/login', data),

  me: () =>
    api.get<{ user: User }>('/api/auth/me'),

  logout: () =>
    api.post('/api/auth/logout'),
}

// ─── Projects ─────────────────────────────────────────────────
// Note: API returns Project[] directly (not wrapped in ApiResponse)

export const projectsApi = {
  list: () =>
    api.get<Project[]>('/api/projects'),

  get: (id: string) =>
    api.get<Project>(`/api/projects/${id}`),

  create: (data: { name: string; description?: string }) =>
    api.post<Project>('/api/projects', data),

  update: (id: string, data: Partial<Project>) =>
    api.patch<Project>(`/api/projects/${id}`, data),

  delete: (id: string) =>
    api.delete(`/api/projects/${id}`),
}

// ─── Chats ────────────────────────────────────────────────────

export const chatsApi = {
  list: (projectId: string) =>
    api.get<Chat[]>(`/api/chats/project/${projectId}`),

  messages: (chatId: string) =>
    api.get<Message[]>(`/api/chats/${chatId}/messages`),

  sendMessage: (
    chatId: string,
    data: {
      content: string
      type?: 'text' | 'approval_response' | 'credential_request'
      metadata?: Record<string, unknown>
    }
  ) =>
    api.post<Message>(`/api/chats/${chatId}/messages`, data),

  plans: (chatId: string) =>
    api.get<Plan[]>(`/api/chats/${chatId}/plans`),
}

// ─── Plans ────────────────────────────────────────────────────

export const plansApi = {
  action: (
    planId: string,
    data: { action: 'approve' | 'reject' | 'modify'; reason?: string; modifications?: string }
  ) =>
    api.post<Plan>(`/api/chats/plans/${planId}/action`, data),

  approve: (planId: string) =>
    api.post<Plan>(`/api/chats/plans/${planId}/action`, { action: 'approve' }),

  reject: (planId: string, reason?: string) =>
    api.post<Plan>(`/api/chats/plans/${planId}/action`, { action: 'reject', reason }),

  modify: (planId: string, modifications: string) =>
    api.post<Plan>(`/api/chats/plans/${planId}/action`, { action: 'modify', modifications }),
}

// ─── Uploads ──────────────────────────────────────────────────

export const uploadsApi = {
  upload: (file: File, chatId?: string, projectId?: string) => {
    const form = new FormData()
    form.append('file', file)
    if (chatId) form.append('chatId', chatId)
    if (projectId) form.append('projectId', projectId)
    return api.post('/api/uploads', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
}

// ─── Planner ──────────────────────────────────────────────────

export const plannerApi = {
  status: () =>
    api.get<{ available: boolean; provider: string; model: string; plannerVersion: string; mode: string }>('/api/planner/status'),

  generate: (data: {
    chatId: string
    projectId: string
    userRequest: string
    chatHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
  }) =>
    api.post<{
      intent: string
      plan: Plan | null
      message: Message
      metadata?: { plannerVersion: string; provider: string; model: string; durationMs: number; parseSuccess: boolean }
    }>('/api/planner/generate', data),

  refine: (data: {
    planId: string
    modifications: string
    chatHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
  }) =>
    api.post<{
      plan: Plan
      metadata?: { plannerVersion: string; provider: string; model: string; durationMs: number; parseSuccess: boolean }
    }>('/api/planner/refine', data),
}

// ─── Billing ──────────────────────────────────────────────────

export const billingApi = {
  plans: () =>
    api.get<{ plans: Array<{ id: string; name: string; price: number; promoPrice: number | null; credits: number; projectLimit: number; previewLimit: number; storageLimitMb: number }> }>('/api/billing/plans'),

  subscription: () =>
    api.get<{ subscription: unknown; plan: string; status: string; usage: unknown }>('/api/billing/subscription'),

  checkout: (planId: string) =>
    api.post<{ url?: string; error?: string }>('/api/billing/checkout', { planId }),
}

// ─── Jobs ─────────────────────────────────────────────────────

export const jobsApi = {
  /** Returns the most recent non-terminal job across all user projects, or null */
  getActive: () =>
    api.get<{ job: Record<string, unknown> | null }>('/api/jobs/active'),

  /** Returns the most recent completed job that has a previewUrl, or null */
  getLastCompleted: () =>
    api.get<{ job: Record<string, unknown> | null }>('/api/jobs/active/completed'),
}

export default api
