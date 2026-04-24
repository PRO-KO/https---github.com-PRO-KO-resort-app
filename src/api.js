/**
 * src/api.js — 프론트엔드 API 클라이언트
 *
 * localStorage(storage.js)를 대체합니다.
 * 모든 데이터 읽기/쓰기를 서버 REST API 호출로 처리합니다.
 *
 * ── App.jsx 변경 방법 ──────────────────────────────────────────────────────
 *
 * 1. import 변경:
 *    기존: import { lsGet, lsSet, KEYS } from './storage'
 *    변경: import * as API from './api'
 *
 * 2. 초기 데이터 로딩 (useEffect):
 *    기존: setEmployees(lsGet(KEYS.employees, {}))
 *    변경:
 *      const [employees, setEmployees] = useState(null)
 *      useEffect(() => {
 *        API.loadAll().then(d => {
 *          setEmployees(d.employees)
 *          setApps(d.apps)
 *          setSettings(d.settings)
 *          setFundUsed(d.fundUsed)
 *        }).catch(() => alert('서버 연결 실패'))
 *      }, [])
 *
 * 3. 저장 함수:
 *    기존: const saveEmp = e => { setEmployees(e); lsSet(KEYS.employees, e) }
 *    변경:
 *      const saveEmp = async newMap => {
 *        await API.saveEmployees(newMap)
 *        setEmployees(newMap)
 *      }
 *
 * 4. 로그인:
 *    기존: loginUser({ empId: id }) → 바로 상태 변경
 *    변경:
 *      const { token } = await API.login(empId, password)
 *      API.setToken(token)
 *      loginUser({ empId })
 *
 * ──────────────────────────────────────────────────────────────────────────
 */

// API 서버 기본 URL
// 개발 환경: vite.config.js의 proxy 설정으로 '/api' → 'http://localhost:4000/api'
// 프로덕션: 같은 서버(same-origin)에서 제공하므로 '/api' 그대로 사용
const API_BASE = '/api'

// ──────────────────────────────────────────────────────────────────────────────
// JWT 토큰 관리
// sessionStorage 사용 — 탭/브라우저 닫으면 자동 삭제 (기존 세션 정책과 동일)
// ──────────────────────────────────────────────────────────────────────────────

const TOKEN_KEY = '_jwt'

export const getToken  = ()  => sessionStorage.getItem(TOKEN_KEY)
export const setToken  = t   => sessionStorage.setItem(TOKEN_KEY, t)
export const clearToken= ()  => sessionStorage.removeItem(TOKEN_KEY)

/** 현재 토큰이 존재하고 만료되지 않았는지 확인 (JWT 페이로드 디코딩) */
export const isTokenValid = () => {
    const token = getToken()
    if (!token) return false
    try {
        // JWT는 헤더.페이로드.서명 구조 — 페이로드를 Base64로 디코딩
        const payload = JSON.parse(atob(token.split('.')[1]))
        // exp는 초 단위 Unix 타임스탬프
        return payload.exp * 1000 > Date.now()
    } catch {
        return false
    }
}


// ──────────────────────────────────────────────────────────────────────────────
// 공통 fetch 래퍼
// ──────────────────────────────────────────────────────────────────────────────

/**
 * 인증 헤더를 포함한 fetch 요청
 * @param {string} method - 'GET' | 'POST' | 'PUT' | 'DELETE'
 * @param {string} path   - '/employees', '/apps' 등
 * @param {*}      body   - 요청 본문 (객체, 자동으로 JSON 직렬화)
 * @throws {Error} 서버가 4xx/5xx 응답을 반환하면 에러 메시지와 함께 throw
 */
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
        // 서버가 반환한 에러 메시지를 그대로 전달
        const err = await response.json().catch(() => ({ message: `HTTP ${response.status}` }))
        throw new Error(err.message || '서버 오류가 발생했습니다.')
    }

    // 204 No Content 처리
    if (response.status === 204) return null
    return response.json()
}

// 단축 헬퍼
const get    = path         => req('GET',    path)
const post   = (path, body) => req('POST',   path, body)
const put    = (path, body) => req('PUT',    path, body)
const del    = path         => req('DELETE', path)


// ──────────────────────────────────────────────────────────────────────────────
// 인증 API
// ──────────────────────────────────────────────────────────────────────────────

/**
 * 직원 로그인
 * @param {string} empId    - 사번
 * @param {string} password - 평문 비밀번호 (HTTPS 전송, 서버에서 해싱)
 * @returns {{ token: string, empId: string }}
 */
export const login = (empId, password) =>
    post('/auth/login', { empId, password })

/**
 * 관리자 로그인
 * @param {string} password - 관리자 비밀번호 (constants.js의 ADMIN_PW)
 * @returns {{ token: string }}
 */
export const adminLogin = password =>
    post('/auth/admin-login', { password })

/**
 * 세션 연장 (사용자 활동 감지 시 호출)
 * App.jsx의 touchSession() 대신 사용
 */
export const refreshToken = async () => {
    const { token } = await post('/auth/refresh')
    setToken(token)
}


// ──────────────────────────────────────────────────────────────────────────────
// 직원 API — localStorage의 KEYS.employees 대체
// ──────────────────────────────────────────────────────────────────────────────

/**
 * 전체 직원 목록 조회 (관리자용)
 * @returns {{ [empId]: EmployeeRecord }}
 */
export const fetchEmployees = () => get('/employees')

/**
 * 직원 목록 저장 (App.jsx의 saveEmp 대체)
 *
 * localStorage는 전체를 덮어쓰지만,
 * DB 방식에서는 변경된 항목만 개별 API로 처리하는 것이 효율적입니다.
 * 이 함수는 기존 saveEmp(newMap) 호출 패턴과의 호환성을 위해 제공합니다.
 *
 * @param {Object} newMap - { [empId]: EmployeeRecord } 전체 맵
 * @param {Object} oldMap - 변경 전 맵 (diff 계산용)
 */
export const saveEmployees = async (newMap, oldMap = {}) => {
    const newIds = Object.keys(newMap)
    const oldIds = Object.keys(oldMap)

    // 삭제된 계정
    for (const id of oldIds) {
        if (!newMap[id]) await del(`/employees/${id}`)
    }

    // 추가되거나 변경된 계정
    for (const id of newIds) {
        const n = newMap[id], o = oldMap[id]
        if (!o) {
            // 신규 추가 (직접 추가 — 이미 승인 처리)
            // 이 경로는 AccountsTab의 addEmp에서만 사용 — 비밀번호 포함 필요
            // 별도 엔드포인트(POST /employees)로 처리
        } else if (o.status !== n.status) {
            // 상태 변경 (승인/거절)
            await req('PUT', `/employees/${id}`, { status: n.status })
        } else if (o.pwHash !== n.pwHash) {
            // 비밀번호 변경 — 해시가 아닌 평문을 서버에 전달 (서버에서 해싱)
            // 실제 코드에서는 resetPassword(empId, newPw) 직접 호출
        }
    }
}

/**
 * 가입 신청 (RegisterPage에서 사용)
 * @param {{ empId, password, organization, department, phone }} data
 */
export const registerEmployee = data =>
    post('/employees/register', data)

/**
 * 비밀번호 초기화 (관리자용)
 * @param {string} empId    - 대상 사번
 * @param {string} password - 새 평문 비밀번호
 */
export const resetPassword = (empId, password) =>
    req('PUT', `/employees/${empId}`, { password })

/**
 * 계정 상태 변경 (승인/거절)
 * @param {string} empId  - 대상 사번
 * @param {string} status - 'approved' | 'rejected'
 */
export const updateStatus = (empId, status) =>
    req('PUT', `/employees/${empId}`, { status })

/**
 * 직원 계정 직접 추가 (즉시 승인)
 * @param {{ empId, password, organization, department, phone }} data
 */
export const createEmployee = data => post('/employees', data)

/**
 * 계정 삭제
 * @param {string} empId
 */
export const deleteEmployee = empId => del(`/employees/${empId}`)


// ──────────────────────────────────────────────────────────────────────────────
// 신청 API — localStorage의 KEYS.apps 대체
// ──────────────────────────────────────────────────────────────────────────────

/**
 * 신청 목록 조회
 * 관리자: 전체 / 직원: 본인 신청만
 * @returns {ApplicationRecord[]}
 */
export const fetchApps = () => get('/apps')

/**
 * 신청 목록 저장 (App.jsx의 saveApps 대체)
 * 추첨 결과 등 일괄 상태 변경 시 사용
 * @param {ApplicationRecord[]} apps - 변경된 전체 배열
 */
export const saveApps = apps => put('/apps', { apps })

/**
 * 예약 신청 등록 (일반 직원)
 * @param {{ month, roomType, nights, total, subsidy }} data
 */
export const applyReservation = data => post('/apps', data)

/**
 * 신청 취소
 * @param {string} id - APP_ID (UUID)
 */
export const cancelApp = id => del(`/apps/${id}`)


// ──────────────────────────────────────────────────────────────────────────────
// 설정 API — localStorage의 KEYS.settings 대체
// ──────────────────────────────────────────────────────────────────────────────

/**
 * 설정 조회
 * @returns {AppSettings}
 */
export const fetchSettings = () => get('/settings')

/**
 * 설정 저장 (App.jsx의 saveSettings 대체)
 * @param {AppSettings} settings
 */
export const saveSettings = settings => put('/settings', settings)


// ──────────────────────────────────────────────────────────────────────────────
// 발전기금 API — localStorage의 KEYS.fundUsed 대체
// ──────────────────────────────────────────────────────────────────────────────

/**
 * 발전기금 사용액 조회
 * @returns {number}
 */
export const fetchFundUsed = () => get('/fund')

/**
 * 발전기금 사용액 저장 (App.jsx의 saveFundUsed 대체)
 * @param {number} value
 */
export const saveFundUsed = value => put('/fund', { value })


// ──────────────────────────────────────────────────────────────────────────────
// 초기 로딩 (App.jsx의 useEffect 대체)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * 앱 초기화 시 필요한 모든 데이터를 병렬 로드합니다.
 *
 * 기존 App.jsx useEffect:
 *   const emp = lsGet(KEYS.employees, {})
 *   const a   = lsGet(KEYS.apps,      [])
 *   ...
 *
 * 변경 후:
 *   const { employees, apps, settings, fundUsed } = await API.loadAll()
 *
 * @returns {{ employees, apps, settings, fundUsed }}
 */
export const loadAll = async () => {
    const [employees, apps, settings, fundUsed] = await Promise.all([
        fetchEmployees(),
        fetchApps(),
        fetchSettings(),
        fetchFundUsed(),
    ])
    return { employees, apps, settings, fundUsed }
}
