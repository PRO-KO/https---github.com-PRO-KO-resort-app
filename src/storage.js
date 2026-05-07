import { SK } from './constants'

// ── localStorage 래퍼 ─────────────────────────────────────────────────────
// Claude.ai 아티팩트와 달리 VS Code 실행 환경(브라우저)에서는
// localStorage를 직접 사용합니다.

const key = suffix => `${SK}::${suffix}`
const memoryStore = new Map()

const getLocalStorage = () => {
  try {
    const probe = `${SK}::__probe__`
    localStorage.setItem(probe, probe)
    localStorage.removeItem(probe)
    return localStorage
  } catch {
    return null
  }
}

export const lsGet = (suffix, defaultVal) => {
  const k = key(suffix)
  try {
    const store = getLocalStorage()
    const raw = store ? store.getItem(k) : memoryStore.get(k)
    return raw !== null ? JSON.parse(raw) : defaultVal
  } catch {
    return defaultVal
  }
}

export const lsSet = (suffix, value) => {
  const k = key(suffix)
  try {
    const raw = JSON.stringify(value)
    const store = getLocalStorage()
    if (store) store.setItem(k, raw)
    else memoryStore.set(k, raw)
  } catch (e) {
    console.warn('[storage] write failed', e)
  }
}

export const lsDel = suffix => {
  const k = key(suffix)
  try {
    const store = getLocalStorage()
    if (store) store.removeItem(k)
    memoryStore.delete(k)
  } catch {}
}

// ── 키 목록 (앱에서 사용하는 모든 스토리지 키) ───────────────────────────
export const KEYS = {
  employees: 'employees',  // { [empId]: EmployeeRecord }
  apps:      'apps',       // ApplicationRecord[]
  settings:  'settings',  // AppSettings
  fundUsed:  'fundUsed',  // number
}
