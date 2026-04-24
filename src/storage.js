import { SK } from './constants'

// ── localStorage 래퍼 ─────────────────────────────────────────────────────
// Claude.ai 아티팩트와 달리 VS Code 실행 환경(브라우저)에서는
// localStorage를 직접 사용합니다.

const key = suffix => `${SK}::${suffix}`

export const lsGet = (suffix, defaultVal) => {
  try {
    const raw = localStorage.getItem(key(suffix))
    return raw !== null ? JSON.parse(raw) : defaultVal
  } catch {
    return defaultVal
  }
}

export const lsSet = (suffix, value) => {
  try {
    localStorage.setItem(key(suffix), JSON.stringify(value))
  } catch (e) {
    console.warn('[storage] write failed', e)
  }
}

export const lsDel = suffix => {
  try { localStorage.removeItem(key(suffix)) } catch {}
}

// ── 키 목록 (앱에서 사용하는 모든 스토리지 키) ───────────────────────────
export const KEYS = {
  employees: 'employees',  // { [empId]: EmployeeRecord }
  apps:      'apps',       // ApplicationRecord[]
  settings:  'settings',  // AppSettings
  fundUsed:  'fundUsed',  // number
}
