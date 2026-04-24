/**
 * API Service — Typed fetch wrappers for HireAI backend.
 * All endpoints point to FastAPI at NEXT_PUBLIC_API_URL (see getApiUrl).
 */

import { getApiUrl } from '@/lib/api'

const BASE_URL = getApiUrl()

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'ApiError'
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('hireai_token') : null

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Request failed' }))
    throw new ApiError(res.status, err.detail || 'Request failed')
  }

  if (res.status === 204) return null as T
  return res.json()
}

// ─── Auth ────────────────────────────────────────────────────

export const authApi = {
  register: (data: { name: string; email: string; password: string; phone?: string; role: string }) =>
    request('/api/v1/auth/register', { method: 'POST', body: JSON.stringify(data) }),

  login: (email: string, password: string) =>
    request('/api/v1/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),

  me: () => request('/api/v1/auth/me'),

  getTeamMembers: () => request('/api/v1/auth/team'),

  inviteTeamMember: (name: string, email: string) =>
    request('/api/v1/auth/invite', { method: 'POST', body: JSON.stringify({ name, email }) }),
}

// ─── Profiles ────────────────────────────────────────────────

export const profilesApi = {
  uploadAvatar: (formData: FormData) => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('hireai_token') : null
    return fetch(`${BASE_URL}/api/v1/profiles/me/avatar`, {
      method: 'POST',
      body: formData,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      }
    }).then(r => r.json())
  },

  updateProfile: (data: Record<string, any>) =>
    request('/api/v1/profiles/me', { method: 'PUT', body: JSON.stringify(data) }),
}

// ─── Jobs ────────────────────────────────────────────────────

export const jobsApi = {
  list: (params?: { status?: string; department?: string; search?: string }) => {
    const qs = new URLSearchParams(params as Record<string, string>).toString()
    return request(`/api/v1/jobs${qs ? `?${qs}` : ''}`)
  },

  get: (jobId: string) => request(`/api/v1/jobs/${jobId}`),

  create: (data: Record<string, unknown>) =>
    request('/api/v1/jobs', { method: 'POST', body: JSON.stringify(data) }),

  update: (jobId: string, data: Record<string, unknown>) =>
    request(`/api/v1/jobs/${jobId}`, { method: 'PATCH', body: JSON.stringify(data) }),

  delete: (jobId: string) => request(`/api/v1/jobs/${jobId}`, { method: 'DELETE' }),

  getCandidates: (jobId: string, minScore?: number) =>
    request(`/api/v1/jobs/${jobId}/candidates${minScore ? `?min_score=${minScore}` : ''}`),
}

// ─── Applications ────────────────────────────────────────────

export const applicationsApi = {
  apply: (formData: FormData) =>
    fetch(`${BASE_URL}/api/v1/applications/apply`, {
      method: 'POST',
      body: formData,
    }).then(r => r.json()),

  getStatus: (applicationId: string) =>
    request(`/api/v1/applications/${applicationId}/status`),

  list: (params?: { jobId?: string; status?: string }) => {
    const qs = new URLSearchParams(params as Record<string, string>).toString()
    return request(`/api/v1/applications${qs ? `?${qs}` : ''}`)
  },
}

// ─── Schedule ────────────────────────────────────────────────

export const scheduleApi = {
  getSlots: (applicationId: string) =>
    request(`/api/v1/schedule/slots?application_id=${applicationId}`),

  bookSlot: (applicationId: string, slotId: string) =>
    request('/api/v1/schedule/book', {
      method: 'POST',
      body: JSON.stringify({ application_id: applicationId, slot_id: slotId }),
    }),
}

// ─── Assessments ─────────────────────────────────────────────

export const assessmentsApi = {
  get: (interviewId: string) => request(`/api/v1/assessments/${interviewId}`),
  list: (jobId?: string) => request(`/api/v1/assessments${jobId ? `?job_id=${jobId}` : ''}`),
}

// ─── Analytics ─────────────────────────────────────────────

export const analyticsApi = {
  getDashboard: () => request('/api/v1/analytics/dashboard'),
  getMetrics: (range: string = '30d') => request(`/api/v1/analytics/metrics?range=${range}`),
  getTalentPool: () => request('/api/v1/analytics/talent-pool'),
}

// ─── WebSocket Interview ─────────────────────────────────────

export const createInterviewWebSocket = (interviewId: string, token: string): WebSocket => {
  const wsBase = BASE_URL.replace('http', 'ws').replace('https', 'wss')
  return new WebSocket(`${wsBase}/ws/v1/interview/${interviewId}?token=${token}`)
}
