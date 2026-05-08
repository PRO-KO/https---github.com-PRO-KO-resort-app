/**
 * src/api.js — 프론트엔드 API 클라이언트
 */

const API_BASE = '/api'
const TOKEN_KEY = '_jwt'

export const getToken  = ()  => sessionStorage.getItem(TOKEN_KEY)
export const setToken  = t   => sessionStorage.setItem(TOKEN_KEY, t)
export const clearToken= ()  => sessionStorage.removeItem(TOKEN_KEY)

export const isTokenValid = () => {
    const token = getToken()
    if (!token) return false
    try {
        const payload = JSON.parse(atob(token.split('.')[1]))
        return payload.exp * 1000 > Date.now()
    } catch {
        return false
    }
}

async function req(method, path, body) {
    const headers = { 'Content-Type': 'application/json' }
    const token = getToken()
    if (token) headers['Authorization'] = `Bearer ${token}`
    const response = await fetch(`${API_BASE}${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    if (!response.ok) {
        const err = await response.json().catch(() => ({ message: `HTTP ${response.status}` }))
        throw new Error(err.message || '서버 오류가 발생했습니다.')
    }
    if (response.status === 204) return null
    return response.json()
}

const get    = path         => req('GET',    path)
const post   = (path, body) => req('POST',   path, body)
const put    = (path, body) => req('PUT',    path, body)
const del    = path         => req('DELETE', path)

// 인증
export const login = (empId, password) => post('/auth/login', { empId, password })
export const adminLogin = password => post('/auth/admin-login', { password })
export const refreshToken = async () => {
    const { token } = await post('/auth/refresh')
    setToken(token)
}

// 직원
export const fetchEmployees = () => get('/employees')
export const saveEmployees = async (newMap, oldMap = {}) => {
    const newIds = Object.keys(newMap)
    const oldIds = Object.keys(oldMap)
    for (const id of oldIds) { if (!newMap[id]) await del(`/employees/${id}`) }
    for (const id of newIds) {
        const n = newMap[id], o = oldMap[id]
        if (o && o.status !== n.status) await req('PUT', `/employees/${id}`, { status: n.status })
    }
}
export const registerEmployee = data => post('/employees/register', data)
export const updateStatus = (empId, status) => req('PUT', `/employees/${empId}`, { status })

// 신청
export const fetchApps = () => get('/apps')
export const applyReservation = data => post('/api/apps', data) // backend path is /api/apps, wait req already adds /api
export const updateApp = (id, data) => put(`/apps/${id}`, data)
export const cancelApp = (id, reason) => post(`/apps/${id}/cancel`, { reason })
export const approveCancelApp = id => post(`/apps/${id}/approve-cancel`)

// 설정
export const fetchSettings = () => get('/settings')
export const saveSettings = settings => put('/settings', settings)

// 발전기금
export const fetchFundUsed = () => get('/fund')

export const loadAll = async () => {
    const [employees, apps, settings, fundUsed] = await Promise.all([
        fetchEmployees(),
        fetchApps(),
        fetchSettings(),
        fetchFundUsed(),
    ])
    return { employees, apps, settings, fundUsed: fundUsed.value }
}
