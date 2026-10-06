const TOKEN_KEY = 'mediguide_token'

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || ''
}

export function setSession(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

async function request(path, { method = 'GET', body, isForm = false } = {}) {
  const headers = {}
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  if (!isForm && body !== undefined) headers['Content-Type'] = 'application/json'
  const response = await fetch(path, {
    method,
    headers,
    body: isForm ? body : body !== undefined ? JSON.stringify(body) : undefined,
  })
  let payload = null
  const text = await response.text()
  if (text) {
    try { payload = JSON.parse(text) } catch { payload = { detail: text } }
  }
  if (!response.ok) {
    const detail = payload?.detail
    const message = Array.isArray(detail) ? detail[0]?.msg || 'Request failed' : detail || 'Request failed'
    const error = new Error(message)
    error.status = response.status
    throw error
  }
  return payload
}

export const api = {
  me: () => request('/api/auth/me'),
  register: (body) => request('/api/auth/register', { method: 'POST', body }),
  login: (body) => request('/api/auth/login', { method: 'POST', body }),
  logout: () => request('/api/auth/logout', { method: 'POST' }),
  reports: () => request('/api/reports'),
  uploadReport: (file) => {
    const data = new FormData()
    data.append('file', file)
    return request('/api/reports', { method: 'POST', body: data, isForm: true })
  },
  analyze: (reportId) => request('/api/analyze', { method: 'POST', body: { report_id: reportId } }),
  conversations: () => request('/api/conversations'),
  conversation: (id) => request(`/api/conversations/${id}`),
  chat: (body) => request('/api/chat', { method: 'POST', body }),
  providers: (params) => {
    const query = new URLSearchParams()
    Object.entries(params || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') query.set(key, String(value))
    })
    const suffix = query.toString() ? `?${query}` : ''
    return request(`/api/providers${suffix}`)
  },
}
