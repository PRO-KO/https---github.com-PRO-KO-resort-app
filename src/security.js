/**
 * security.js — 시큐어 코딩 유틸리티
 *
 * 적용 항목:
 *  1. PBKDF2-SHA256 패스워드 해싱 (Web Crypto API, 100,000 iterations)
 *  2. 랜덤 솔트 생성 (16 bytes, CSPRNG)
 *  3. 타이밍 안전 비교 (Timing-safe comparison)
 *  4. 구버전 해시 하위 호환 마이그레이션
 *  5. 입력 검증 (Validation)
 *  6. 입력 새니타이징 (Sanitization / XSS 방지)
 *  7. 로그인 시도 제한 (Brute-force 방지, 5회 실패 → 15분 잠금)
 *  8. 세션 타임아웃 (30분 비활동 시 자동 만료)
 */

// ── 1. 패스워드 해싱 (PBKDF2-SHA256) ─────────────────────────────────────────

const PBKDF2_ITER  = 100_000   // OWASP 권장 최솟값
const HASH_BITS    = 256
const SALT_BYTES   = 16

export const cryptoErrorMessage =
  '이 PC의 브라우저 보안 기능(Web Crypto)을 사용할 수 없습니다. 최신 Chrome/Edge로 접속하거나 HTTPS/localhost 환경에서 다시 시도해주세요.'

const getWebCrypto = () => {
  const webCrypto = globalThis.crypto
  if (!webCrypto?.getRandomValues || !webCrypto?.subtle) {
    throw new Error(cryptoErrorMessage)
  }
  return webCrypto
}

const hexToU8 = h => new Uint8Array(h.match(/.{2}/g).map(b => parseInt(b, 16)))
const u8ToHex = u => Array.from(u).map(b => b.toString(16).padStart(2, '0')).join('')

/** 암호학적으로 안전한 난수 솔트 생성 (CSPRNG) */
export const generateSalt = () =>
  u8ToHex(getWebCrypto().getRandomValues(new Uint8Array(SALT_BYTES)))

/**
 * PBKDF2-SHA256으로 패스워드 해시 생성
 * @param {string} password
 * @param {string} salt - hex 문자열
 * @returns {Promise<string>} hex 해시
 */
export const hashPwd = async (password, salt) => {
  const enc  = new TextEncoder()
  const subtle = getWebCrypto().subtle
  const key  = await subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']
  )
  const bits = await subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: hexToU8(salt), iterations: PBKDF2_ITER },
    key, HASH_BITS
  )
  return u8ToHex(new Uint8Array(bits))
}

/**
 * 타이밍 안전 해시 비교 (Timing-safe comparison)
 * 일반 === 비교는 문자열 길이가 다르면 즉시 false 반환 → 타이밍 공격 취약
 */
const timingSafeEqual = (a, b) => {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export const secureTextEqual = (a, b) => timingSafeEqual(String(a ?? ''), String(b ?? ''))

/** 패스워드 검증 */
export const verifyPwd = async (password, storedHash, storedSalt) => {
  const hash = await hashPwd(password, storedSalt)
  return timingSafeEqual(hash, storedHash)
}

// ── 2. 구버전 해시 하위 호환 마이그레이션 ─────────────────────────────────────

/** 구버전 simpleHash (마이그레이션 전용, 신규 사용 금지) */
const _legacyHash = s => {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return h.toString(16)
}

/**
 * 구/신 버전 모두 검증 (마이그레이션 기간 동안 사용)
 * pwSalt가 없으면 구버전 해시로 비교
 */
export const verifyPwdCompat = async (password, emp) => {
  if (emp.pwSalt) return verifyPwd(password, emp.pwHash, emp.pwSalt)
  return timingSafeEqual(_legacyHash(password), emp.pwHash)
}

/** 구버전 해시 여부 확인 (업그레이드 필요) */
export const needsUpgrade = emp => !emp.pwSalt

// ── 3. 입력 검증 ─────────────────────────────────────────────────────────────

export const validate = {
  /** 사번: 영문/숫자/하이픈/언더스코어, 1~30자 */
  empId:    v => /^[A-Za-z0-9\-_]{1,30}$/.test((v ?? '').trim()),
  /** 비밀번호: 4~128자 */
  password: v => typeof v === 'string' && v.length >= 4 && v.length <= 128,
  /** 전화번호: 숫자/하이픈/+/공백, 7~20자 */
  phone:    v => /^[0-9\-\+\s]{7,20}$/.test((v ?? '').trim()),
  /** 일반 텍스트: 1~50자 */
  text50:   v => typeof v === 'string' && v.trim().length >= 1 && v.trim().length <= 50,
  /** 선택 입력 텍스트: 0~100자 */
  text100:  v => typeof v === 'string' && v.trim().length <= 100,
}

// ── 4. 입력 새니타이징 (XSS 방지) ────────────────────────────────────────────

const HTML_ESCAPES = { '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#x27;', '&':'&amp;' }
const escapeHtml   = s => String(s ?? '').replace(/[<>"'&]/g, c => HTML_ESCAPES[c])

export const sanitize = {
  /** 사번: 허용 문자만 추출 */
  empId: v => escapeHtml(String(v ?? '').trim().slice(0, 30).replace(/[^A-Za-z0-9\-_]/g, '')),
  /** 일반 텍스트: HTML 이스케이프 + 최대 길이 */
  text:  v => escapeHtml(String(v ?? '').trim().slice(0, 100)),
  /** 전화번호: 허용 문자만 추출 */
  phone: v => String(v ?? '').trim().slice(0, 20).replace(/[^0-9\-\+\s]/g, ''),
}

/** 사번은 저장/로그인 비교 시 대소문자 차이로 갈라지지 않도록 대문자로 통일 */
export const normalizeEmpId = v => sanitize.empId(v).toUpperCase()

// ── 5. 런타임/브라우저 호환성 ───────────────────────────────────────────────

const storageAvailable = type => {
  try {
    const store = globalThis[type]
    const probe = '__kosha_probe__'
    store.setItem(probe, probe)
    store.removeItem(probe)
    return true
  } catch {
    return false
  }
}

export const getRuntimeCompatibility = () => {
  const issues = []
  if (!globalThis.crypto?.getRandomValues || !globalThis.crypto?.subtle) {
    issues.push('브라우저 보안 기능(Web Crypto)을 사용할 수 없습니다. 최신 Chrome/Edge 또는 HTTPS 환경이 필요합니다.')
  }
  if (typeof TextEncoder === 'undefined') {
    issues.push('문자 인코딩 기능(TextEncoder)을 사용할 수 없습니다. 브라우저 업데이트가 필요합니다.')
  }
  if (!storageAvailable('localStorage')) {
    issues.push('localStorage를 사용할 수 없어 계정/신청 데이터가 이 브라우저에 저장되지 않을 수 있습니다.')
  }
  if (!storageAvailable('sessionStorage')) {
    issues.push('sessionStorage를 사용할 수 없어 로그인 세션이 새로고침 후 유지되지 않을 수 있습니다.')
  }
  return { ok: issues.length === 0, issues }
}

// ── 6. 로그인 시도 제한 (Brute-force 방지) ────────────────────────────────────

export const MAX_ATTEMPTS = 5
const LOCKOUT_MS          = 15 * 60 * 1000   // 15분
const _lockKey            = id => `_llk_${btoa(id).replace(/=/g, '')}`
const memoryLocks         = new Map()

/** 현재 잠금 상태 확인 */
export const checkLock = id => {
  const k = _lockKey(id)
  try {
    const raw = localStorage.getItem(k) || memoryLocks.get(k)
    if (!raw) return { locked: false }
    const d = JSON.parse(raw)
    if (Date.now() > d.until) {
      localStorage.removeItem(k)
      memoryLocks.delete(k)
      return { locked: false }
    }
    return { locked: true, remainMin: Math.ceil((d.until - Date.now()) / 60000) }
  } catch {
    const raw = memoryLocks.get(k)
    if (!raw) return { locked: false }
    try {
      const d = JSON.parse(raw)
      if (Date.now() > d.until) { memoryLocks.delete(k); return { locked: false } }
      return { locked: true, remainMin: Math.ceil((d.until - Date.now()) / 60000) }
    } catch {
      return { locked: false }
    }
  }
}

/** 로그인 실패 기록 */
export const recordFail = id => {
  const k = _lockKey(id)
  try {
    const raw = localStorage.getItem(k) || memoryLocks.get(k)
    const d   = raw ? JSON.parse(raw) : { attempts: 0, until: 0 }
    d.attempts += 1
    if (d.attempts >= MAX_ATTEMPTS) d.until = Date.now() + LOCKOUT_MS
    const next = JSON.stringify(d)
    localStorage.setItem(k, next)
    memoryLocks.set(k, next)
    return { attempts: d.attempts, max: MAX_ATTEMPTS, locked: d.attempts >= MAX_ATTEMPTS }
  } catch {
    const raw = memoryLocks.get(k)
    const d = raw ? JSON.parse(raw) : { attempts: 0, until: 0 }
    d.attempts += 1
    if (d.attempts >= MAX_ATTEMPTS) d.until = Date.now() + LOCKOUT_MS
    memoryLocks.set(k, JSON.stringify(d))
    return { attempts: d.attempts, max: MAX_ATTEMPTS, locked: d.attempts >= MAX_ATTEMPTS }
  }
}

/** 잠금 해제 (로그인 성공 시) */
export const clearLock = id => {
  const k = _lockKey(id)
  memoryLocks.delete(k)
  try { localStorage.removeItem(k) } catch {}
}

// ── 7. 세션 관리 (30분 비활동 시 자동 만료) ───────────────────────────────────

const SESSION_KEY        = '_sess_ts'
export const SESSION_MS  = 30 * 60 * 1000   // 30분
let memorySessionTs = ''

/** 세션 활동 시각 갱신 */
export const touchSession = () => {
  memorySessionTs = String(Date.now())
  try { sessionStorage.setItem(SESSION_KEY, memorySessionTs) } catch {}
}

/** 세션 유효 여부 확인 */
export const isSessionValid = () => {
  try {
    const t = sessionStorage.getItem(SESSION_KEY) || memorySessionTs
    return !!t && (Date.now() - parseInt(t)) < SESSION_MS
  } catch {
    return !!memorySessionTs && (Date.now() - parseInt(memorySessionTs)) < SESSION_MS
  }
}

/** 세션 제거 */
export const clearSession = () => {
  memorySessionTs = ''
  try { sessionStorage.removeItem(SESSION_KEY) } catch {}
}
