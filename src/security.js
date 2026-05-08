/**
 * security.js — 시큐어 코딩 유틸리티
 *
 * 적용 항목:
 *  1. PBKDF2-SHA256 패스워드 해싱 (Web Crypto 우선, 순수 JS fallback)
 *  2. 랜덤 솔트 생성 (16 bytes, CSPRNG 우선)
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

const hexToU8 = h => new Uint8Array(h.match(/.{2}/g).map(b => parseInt(b, 16)))
const u8ToHex = u => Array.from(u).map(b => b.toString(16).padStart(2, '0')).join('')

/** 암호학적으로 안전한 난수 솔트 생성 (CSPRNG) */
export const generateSalt = () => {
  const out = new Uint8Array(SALT_BYTES)
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(out)
  } else {
    let seed = Date.now() ^ Math.floor(Math.random() * 0xffffffff)
    for (let i = 0; i < out.length; i++) {
      seed = (Math.imul(1664525, seed) + 1013904223) | 0
      out[i] = (seed >>> ((i % 4) * 8)) & 0xff
    }
  }
  return u8ToHex(out)
}

const utf8ToU8 = s => {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s)
  const bytes = []
  for (let i = 0; i < s.length; i++) {
    let cp = s.codePointAt(i)
    if (cp > 0xffff) i++
    if (cp <= 0x7f) bytes.push(cp)
    else if (cp <= 0x7ff) bytes.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f))
    else if (cp <= 0xffff) bytes.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f))
    else bytes.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f))
  }
  return new Uint8Array(bytes)
}

const concatU8 = (...chunks) => {
  const len = chunks.reduce((sum, c) => sum + c.length, 0)
  const out = new Uint8Array(len)
  let off = 0
  for (const c of chunks) { out.set(c, off); off += c.length }
  return out
}

const SHA256_K = new Uint32Array([
  0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
  0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
  0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
  0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
  0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
  0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
  0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
  0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2,
])

const rotr = (x, n) => (x >>> n) | (x << (32 - n))

const sha256 = bytes => {
  const bitLenHi = Math.floor(bytes.length / 0x20000000)
  const bitLenLo = (bytes.length << 3) >>> 0
  const withOne = bytes.length + 1
  const paddedLen = Math.ceil((withOne + 8) / 64) * 64
  const msg = new Uint8Array(paddedLen)
  msg.set(bytes)
  msg[bytes.length] = 0x80
  msg[paddedLen - 8] = (bitLenHi >>> 24) & 0xff
  msg[paddedLen - 7] = (bitLenHi >>> 16) & 0xff
  msg[paddedLen - 6] = (bitLenHi >>> 8) & 0xff
  msg[paddedLen - 5] = bitLenHi & 0xff
  msg[paddedLen - 4] = (bitLenLo >>> 24) & 0xff
  msg[paddedLen - 3] = (bitLenLo >>> 16) & 0xff
  msg[paddedLen - 2] = (bitLenLo >>> 8) & 0xff
  msg[paddedLen - 1] = bitLenLo & 0xff

  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19
  const w = new Uint32Array(64)

  for (let i = 0; i < msg.length; i += 64) {
    for (let t = 0; t < 16; t++) {
      const j = i + t * 4
      w[t] = ((msg[j] << 24) | (msg[j + 1] << 16) | (msg[j + 2] << 8) | msg[j + 3]) >>> 0
    }
    for (let t = 16; t < 64; t++) {
      const s0 = (rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3)) >>> 0
      const s1 = (rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10)) >>> 0
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0
    }

    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7
    for (let t = 0; t < 64; t++) {
      const s1 = (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) >>> 0
      const ch = ((e & f) ^ (~e & g)) >>> 0
      const temp1 = (h + s1 + ch + SHA256_K[t] + w[t]) >>> 0
      const s0 = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) >>> 0
      const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0
      const temp2 = (s0 + maj) >>> 0
      h = g; g = f; f = e; e = (d + temp1) >>> 0
      d = c; c = b; b = a; a = (temp1 + temp2) >>> 0
    }

    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0
    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0
  }

  const out = new Uint8Array(32)
  ;[h0,h1,h2,h3,h4,h5,h6,h7].forEach((v, i) => {
    out[i * 4] = (v >>> 24) & 0xff
    out[i * 4 + 1] = (v >>> 16) & 0xff
    out[i * 4 + 2] = (v >>> 8) & 0xff
    out[i * 4 + 3] = v & 0xff
  })
  return out
}

const hmacSha256 = (key, msg) => {
  let k = key.length > 64 ? sha256(key) : key
  const block = new Uint8Array(64)
  block.set(k)
  const oKey = new Uint8Array(64)
  const iKey = new Uint8Array(64)
  for (let i = 0; i < 64; i++) {
    oKey[i] = block[i] ^ 0x5c
    iKey[i] = block[i] ^ 0x36
  }
  return sha256(concatU8(oKey, sha256(concatU8(iKey, msg))))
}

const pbkdf2Sha256Fallback = async (password, salt) => {
  const pw = utf8ToU8(password)
  const blockIndex = new Uint8Array([0, 0, 0, 1])
  let u = hmacSha256(pw, concatU8(salt, blockIndex))
  const t = new Uint8Array(u)
  for (let i = 2; i <= PBKDF2_ITER; i++) {
    u = hmacSha256(pw, u)
    for (let j = 0; j < t.length; j++) t[j] ^= u[j]
    if (i % 2000 === 0) await new Promise(resolve => setTimeout(resolve, 0))
  }
  return t
}

/**
 * PBKDF2-SHA256으로 패스워드 해시 생성
 * @param {string} password
 * @param {string} salt - hex 문자열
 * @returns {Promise<string>} hex 해시
 */
export const hashPwd = async (password, salt) => {
  const saltBytes = hexToU8(salt)
  const subtle = globalThis.crypto?.subtle
  if (subtle && typeof TextEncoder !== 'undefined') {
    const enc  = new TextEncoder()
    const key  = await subtle.importKey(
      'raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']
    )
    const bits = await subtle.deriveBits(
      { name: 'PBKDF2', hash: 'SHA-256', salt: saltBytes, iterations: PBKDF2_ITER },
      key, HASH_BITS
    )
    return u8ToHex(new Uint8Array(bits))
  }
  return u8ToHex(await pbkdf2Sha256Fallback(password, saltBytes))
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
