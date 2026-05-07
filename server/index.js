/**
 * server/index.js — Express REST API 서버
 *
 * 역할:
 *   - 프론트엔드(React)와 Oracle/Tibero DB 사이의 중간 계층
 *   - JWT 기반 인증 (30분 세션 — 기존 sessionStorage 방식과 동일한 만료 시간)
 *   - 비밀번호 해싱을 서버에서 처리 (PBKDF2-SHA256, Node.js crypto 모듈)
 *
 * 패키지 설치:
 *   npm install express dotenv jsonwebtoken helmet cors nodemailer
 *
 * 실행:
 *   node server/index.js
 *   또는 package.json scripts에 추가:
 *   "server": "node server/index.js"
 *
 * 환경 변수 (.env 파일):
 *   DB_TYPE       = oracle | tibero   (기본: oracle)
 *   DB_HOST       = 192.168.1.100:1521/ORCL
 *   DB_USER       = RESORT_APP
 *   DB_PASSWORD   = 비밀번호
 *   DB_PORT       = 8629              (Tibero 기본 포트)
 *   DB_NAME       = tibero            (Tibero DB명)
 *   JWT_SECRET    = 최소32자이상의랜덤문자열  ← 반드시 변경!
 *   PORT          = 4000              (API 서버 포트)
 *   ADMIN_PW      = 관리자 비밀번호
 *   VITE_ADMIN_PW = 관리자 비밀번호 (프론트엔드 localStorage 모드에서만 사용)
 */

import 'dotenv/config'
import express        from 'express'
import helmet         from 'helmet'
import cors           from 'cors'
import jwt            from 'jsonwebtoken'
import { randomBytes, pbkdf2 as _pbkdf2, timingSafeEqual } from 'crypto'
import { promisify }  from 'util'
import { initDB, execute, transaction } from './db.js'
import { mailLotteryResult, internalEmailFor, verifyMailer } from './mailer.js'

const app       = express()
const PORT      = process.env.PORT       || 4000
const JWT_SECRET= process.env.JWT_SECRET || 'CHANGE_ME_TO_RANDOM_64_CHARS'
const ADMIN_PW  = process.env.ADMIN_PW   || ''

if (process.env.NODE_ENV === 'production') {
    if (!process.env.JWT_SECRET || JWT_SECRET === 'CHANGE_ME_TO_RANDOM_64_CHARS' || JWT_SECRET.length < 32) {
        throw new Error('운영 환경에서는 32자 이상의 JWT_SECRET 환경변수를 설정해야 합니다.')
    }
    if (!ADMIN_PW || ADMIN_PW.length < 8) {
        throw new Error('운영 환경에서는 8자 이상의 ADMIN_PW 환경변수를 설정해야 합니다.')
    }
}

// JWT 만료 시간 = 30분 (기존 세션 정책과 동일)
const JWT_EXPIRES = '30m'

// ──────────────────────────────────────────────────────────────────────────────
// 미들웨어 설정
// ──────────────────────────────────────────────────────────────────────────────

// 보안 헤더 자동 설정 (XSS, Clickjacking 등 방어)
app.use(helmet())

// 개발 환경에서만 CORS 허용 (프로덕션에서는 Vite와 같은 서버에서 실행하므로 불필요)
// 폐쇄망에서는 프론트와 동일 출처(same-origin)로 서비스하므로 CORS 설정 불필요할 수 있음
if (process.env.NODE_ENV !== 'production') {
    app.use(cors({ origin: 'http://localhost:3000' }))
}

// JSON 요청 본문 파싱 (최대 1MB)
app.use(express.json({ limit: '1mb' }))


// ──────────────────────────────────────────────────────────────────────────────
// 비밀번호 유틸리티 (서버 사이드 PBKDF2)
// ──────────────────────────────────────────────────────────────────────────────

const pbkdf2Async = promisify(_pbkdf2)

/** 암호학적으로 안전한 솔트 생성 (16바이트 hex) */
const generateSalt = () => randomBytes(16).toString('hex')

/**
 * PBKDF2-SHA256 해시 생성
 * 프론트엔드(security.js)와 동일한 파라미터를 사용합니다.
 * (iterations: 100,000 / keylen: 32bytes = 256bits)
 */
const hashPwd = async (password, salt) => {
    const buf = await pbkdf2Async(
        password,
        Buffer.from(salt, 'hex'),
        100_000,  // iterations (OWASP 권장 최솟값)
        32,       // 키 길이 (바이트) — 256비트
        'sha256'
    )
    return buf.toString('hex')
}

/**
 * 비밀번호 검증 (타이밍 공격 방어 포함)
 * timingSafeEqual: 두 버퍼를 일정한 시간으로 비교 (길이 차이에 의한 조기 종료 방지)
 */
const verifyPwd = async (password, storedHash, storedSalt) => {
    // DB에 솔트가 없으면 구버전 simpleHash(프론트에서 생성) 방식
    // 신규 배포에서는 발생하지 않지만, 기존 localStorage 데이터 마이그레이션 시 필요
    if (!storedSalt) {
        // 구버전 해시: 프론트엔드 security.js의 _legacyHash 결과값과 비교
        // 폐쇄망 신규 배포라면 이 분기는 무시해도 됩니다.
        return storedHash === legacyHash(password)
    }
    const hash = await hashPwd(password, storedSalt)
    try {
        return timingSafeEqual(
            Buffer.from(hash,       'hex'),
            Buffer.from(storedHash, 'hex')
        )
    } catch {
        return false  // 해시 길이가 다르면 비교 자체가 불가 → false
    }
}

/** 구버전 해시 (마이그레이션 전용 — 신규 사용 금지) */
const legacyHash = s => {
    let h = 0
    for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
    return h.toString(16)
}

const secureTextEqual = (a = '', b = '') => {
    const left = Buffer.from(String(a))
    const right = Buffer.from(String(b))
    if (left.length !== right.length) return false
    return timingSafeEqual(left, right)
}

const MAX_LOGIN_ATTEMPTS = 5
const LOCKOUT_MS = 15 * 60 * 1000
const loginLocks = new Map()

const lockKey = (scope, id, ip) => `${scope}:${String(id || '').toUpperCase()}:${ip || ''}`
const getLock = key => {
    const lock = loginLocks.get(key)
    if (!lock) return { locked: false }
    if (Date.now() > lock.until) {
        loginLocks.delete(key)
        return { locked: false }
    }
    return { locked: true, remainMin: Math.ceil((lock.until - Date.now()) / 60000) }
}
const recordLoginFail = key => {
    const cur = loginLocks.get(key) || { attempts: 0, until: 0 }
    const attempts = cur.attempts + 1
    const next = {
        attempts,
        until: attempts >= MAX_LOGIN_ATTEMPTS ? Date.now() + LOCKOUT_MS : cur.until,
    }
    loginLocks.set(key, next)
    return { locked: attempts >= MAX_LOGIN_ATTEMPTS, remain: Math.max(0, MAX_LOGIN_ATTEMPTS - attempts) }
}
const clearLoginFail = key => loginLocks.delete(key)


// ──────────────────────────────────────────────────────────────────────────────
// JWT 인증 미들웨어
// ──────────────────────────────────────────────────────────────────────────────

/**
 * 요청 헤더의 Bearer 토큰을 검증하고 req.user에 페이로드를 주입합니다.
 * 사용 예: router.get('/protected', auth, handler)
 */
const auth = (req, res, next) => {
    const header = req.headers['authorization']
    if (!header?.startsWith('Bearer ')) {
        return res.status(401).json({ message: '인증 토큰이 없습니다.' })
    }
    const token = header.slice(7)
    try {
        req.user = jwt.verify(token, JWT_SECRET)
        next()
    } catch {
        return res.status(401).json({ message: '토큰이 만료되었거나 유효하지 않습니다.' })
    }
}

/** 관리자 전용 엔드포인트 보호 미들웨어 */
const adminOnly = (req, res, next) => {
    if (!req.user?.isAdmin) {
        return res.status(403).json({ message: '관리자 권한이 필요합니다.' })
    }
    next()
}


// ──────────────────────────────────────────────────────────────────────────────
// 라우터 — 인증 (Auth)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/auth/login
 * Body: { empId: string, password: string }
 *
 * 성공: { token: string, empId: string }
 * 실패: 401 (사번/비밀번호 불일치), 403 (미승인 계정)
 *
 * 브루트포스 방어:
 *   사번+IP 기준 5회 실패 시 15분 잠금
 */
app.post('/api/auth/login', async (req, res) => {
    const { empId, password } = req.body
    if (!empId || !password) {
        return res.status(400).json({ message: '사번과 비밀번호를 입력해주세요.' })
    }

    const id = empId.trim().toUpperCase()
    const lk = lockKey('user', id, req.ip)
    const lock = getLock(lk)
    if (lock.locked) {
        return res.status(429).json({ message: `로그인 시도 횟수 초과. ${lock.remainMin}분 후 다시 시도해주세요.` })
    }

    try {
        const { rows } = await execute(
            `SELECT EMP_ID, PW_HASH, PW_SALT, STATUS
               FROM KOSHA_EMPLOYEES
              WHERE EMP_ID = :1`,
            [id]
        )

        const emp = rows[0]

        // 존재하지 않거나 거절된 계정 — 동일한 메시지로 사용자 열거 공격 방지
        if (!emp || emp.STATUS === 'rejected') {
            recordLoginFail(lk)
            return res.status(401).json({ message: '사번 또는 비밀번호가 올바르지 않습니다.' })
        }

        if (emp.STATUS === 'pending') {
            return res.status(403).json({ message: '관리자 승인 대기 중입니다.' })
        }

        const ok = await verifyPwd(password, emp.PW_HASH, emp.PW_SALT)
        if (!ok) {
            recordLoginFail(lk)
            return res.status(401).json({ message: '사번 또는 비밀번호가 올바르지 않습니다.' })
        }

        clearLoginFail(lk)

        // JWT 발급 (30분 만료)
        const token = jwt.sign(
            { empId: emp.EMP_ID, isAdmin: false },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES }
        )
        return res.json({ token, empId: emp.EMP_ID })

    } catch (err) {
        console.error('[login]', err)
        return res.status(500).json({ message: '서버 오류가 발생했습니다.' })
    }
})

/**
 * POST /api/auth/admin-login
 * Body: { password: string }
 *
 * 관리자 비밀번호 검증 후 관리자용 JWT 발급
 */
app.post('/api/auth/admin-login', (req, res) => {
    const { password } = req.body
    const lk = lockKey('admin', 'admin', req.ip)
    const lock = getLock(lk)
    if (lock.locked) {
        return res.status(429).json({ message: `관리자 로그인 시도 횟수 초과. ${lock.remainMin}분 후 다시 시도해주세요.` })
    }
    if (!ADMIN_PW || !secureTextEqual(password, ADMIN_PW)) {
        recordLoginFail(lk)
        return res.status(401).json({ message: '관리자 비밀번호가 올바르지 않습니다.' })
    }
    clearLoginFail(lk)
    const token = jwt.sign(
        { isAdmin: true },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES }
    )
    return res.json({ token })
})

/**
 * POST /api/auth/refresh
 * 현재 토큰이 유효하면 새 토큰을 발급합니다 (세션 연장).
 * 프론트엔드에서 사용자 활동 감지 시 호출합니다.
 */
app.post('/api/auth/refresh', auth, (req, res) => {
    const { empId, isAdmin } = req.user
    const token = jwt.sign({ empId, isAdmin }, JWT_SECRET, { expiresIn: JWT_EXPIRES })
    return res.json({ token })
})


// ──────────────────────────────────────────────────────────────────────────────
// 라우터 — 직원 (Employees)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/employees
 * 전체 직원 목록 반환 (관리자 전용)
 * 반환 형태: { [empId]: { empId, status, organization, department, phone, createdAt, approvedAt } }
 * (비밀번호 해시/솔트는 절대 포함하지 않습니다)
 */
app.get('/api/employees', auth, adminOnly, async (req, res) => {
    const { status } = req.query
    const ALLOWED = ['pending', 'approved', 'rejected']
    if (status && !ALLOWED.includes(status)) {
        return res.status(400).json({ message: '잘못된 status 값입니다.' })
    }
    try {
        const { rows } = await execute(
            `SELECT EMP_ID, STATUS, ORGANIZATION, DEPARTMENT, PHONE,
                    TO_CHAR(CREATED_AT,  'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS CREATED_AT,
                    TO_CHAR(APPROVED_AT, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS APPROVED_AT
               FROM KOSHA_EMPLOYEES
              ${status ? 'WHERE STATUS = :1' : ''}
              ORDER BY CASE STATUS WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END,
                       CREATED_AT DESC`,
            status ? [status] : []
        )

        // localStorage 구조({ [empId]: record })와 동일한 형태로 변환
        const result = {}
        for (const row of rows) {
            result[row.EMP_ID] = {
                empId:        row.EMP_ID,
                status:       row.STATUS,
                organization: row.ORGANIZATION,
                department:   row.DEPARTMENT,
                phone:        row.PHONE,
                createdAt:    row.CREATED_AT,
                approvedAt:   row.APPROVED_AT,
            }
        }
        return res.json(result)

    } catch (err) {
        console.error('[GET /employees]', err)
        return res.status(500).json({ message: '서버 오류' })
    }
})

/**
 * POST /api/employees/register
 * 가입 신청 (인증 불필요 — 미가입자 접근)
 * Body: { empId, password, organization, department, phone }
 */
app.post('/api/employees/register', async (req, res) => {
    const { empId, password, organization, department, phone } = req.body

    // 입력 검증
    if (!empId || !/^[A-Za-z0-9\-_]{1,30}$/.test(empId.trim())) {
        return res.status(400).json({ message: '사번 형식이 올바르지 않습니다.' })
    }
    if (!password || password.length < 4 || password.length > 128) {
        return res.status(400).json({ message: '비밀번호는 4~128자이어야 합니다.' })
    }

    const id = empId.trim()

    try {
        // 중복 사번 확인
        const { rows } = await execute(
            `SELECT EMP_ID FROM KOSHA_EMPLOYEES WHERE EMP_ID = :1`, [id]
        )
        if (rows.length > 0) {
            return res.status(409).json({ message: '이미 존재하는 사번입니다.' })
        }

        // 비밀번호 해싱 (서버에서 처리)
        const salt = generateSalt()
        const hash = await hashPwd(password, salt)

        await execute(
            `INSERT INTO KOSHA_EMPLOYEES
                (EMP_ID, PW_HASH, PW_SALT, STATUS, ORGANIZATION, DEPARTMENT, PHONE, CREATED_AT)
             VALUES (:1, :2, :3, 'pending', :4, :5, :6, SYSTIMESTAMP)`,
            [id, hash, salt, organization || null, department || null, phone || null]
        )

        return res.status(201).json({ message: '가입 신청이 완료되었습니다. 관리자 승인 후 로그인할 수 있습니다.' })

    } catch (err) {
        console.error('[POST /employees/register]', err)
        return res.status(500).json({ message: '서버 오류' })
    }
})

/**
 * PUT /api/employees/:empId
 * 직원 정보 수정 — 상태 변경(승인/거절) 또는 비밀번호 초기화
 * Body: { status? } | { password? }  (관리자 전용)
 */
app.put('/api/employees/:empId', auth, adminOnly, async (req, res) => {
    const { empId } = req.params
    const { status, password, organization, department, phone } = req.body

    try {
        if (password !== undefined) {
            // 비밀번호 초기화
            const salt = generateSalt()
            const hash = await hashPwd(password, salt)
            await execute(
                `UPDATE KOSHA_EMPLOYEES SET PW_HASH = :1, PW_SALT = :2 WHERE EMP_ID = :3`,
                [hash, salt, empId]
            )

        } else if (status !== undefined) {
            // 상태 변경 (승인/거절)
            await execute(
                `UPDATE KOSHA_EMPLOYEES
                    SET STATUS = :1,
                        APPROVED_AT = ${status === 'approved' ? 'SYSTIMESTAMP' : 'NULL'}
                  WHERE EMP_ID = :2`,
                [status, empId]
            )

        } else {
            // 기본 정보 수정
            await execute(
                `UPDATE KOSHA_EMPLOYEES
                    SET ORGANIZATION = :1, DEPARTMENT = :2, PHONE = :3
                  WHERE EMP_ID = :4`,
                [organization || null, department || null, phone || null, empId]
            )
        }

        return res.json({ message: '수정 완료' })

    } catch (err) {
        console.error('[PUT /employees/:empId]', err)
        return res.status(500).json({ message: '서버 오류' })
    }
})

/**
 * POST /api/employees (직접 추가 — 즉시 승인)
 * 관리자가 계정을 즉시 생성합니다 (status: approved)
 */
app.post('/api/employees', auth, adminOnly, async (req, res) => {
    const { empId, password, organization, department, phone } = req.body

    if (!empId || !/^[A-Za-z0-9\-_]{1,30}$/.test(empId.trim())) {
        return res.status(400).json({ message: '사번 형식이 올바르지 않습니다.' })
    }
    if (!password || password.length < 4) {
        return res.status(400).json({ message: '비밀번호는 4자 이상이어야 합니다.' })
    }

    const id = empId.trim()

    try {
        const { rows } = await execute(
            `SELECT EMP_ID FROM KOSHA_EMPLOYEES WHERE EMP_ID = :1`, [id]
        )
        if (rows.length > 0) return res.status(409).json({ message: '이미 존재하는 사번입니다.' })

        const salt = generateSalt()
        const hash = await hashPwd(password, salt)

        await execute(
            `INSERT INTO KOSHA_EMPLOYEES
                (EMP_ID, PW_HASH, PW_SALT, STATUS, ORGANIZATION, DEPARTMENT, PHONE, CREATED_AT, APPROVED_AT)
             VALUES (:1, :2, :3, 'approved', :4, :5, :6, SYSTIMESTAMP, SYSTIMESTAMP)`,
            [id, hash, salt, organization || null, department || null, phone || null]
        )

        return res.status(201).json({ message: `${id} 계정 추가 완료` })

    } catch (err) {
        console.error('[POST /employees]', err)
        return res.status(500).json({ message: '서버 오류' })
    }
})

/**
 * DELETE /api/employees/:empId
 * 계정 삭제 (관리자 전용)
 * ON DELETE CASCADE로 신청 기록도 함께 삭제됩니다.
 */
app.delete('/api/employees/:empId', auth, adminOnly, async (req, res) => {
    try {
        await execute(
            `DELETE FROM KOSHA_EMPLOYEES WHERE EMP_ID = :1`,
            [req.params.empId]
        )
        return res.json({ message: '삭제 완료' })
    } catch (err) {
        console.error('[DELETE /employees/:empId]', err)
        return res.status(500).json({ message: '서버 오류' })
    }
})


// ──────────────────────────────────────────────────────────────────────────────
// 라우터 — 신청 (Apps)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/apps
 * 신청 목록 반환
 *   - 관리자: 전체 목록
 *   - 일반 직원: 본인 신청만
 * 반환 형태: ApplicationRecord[] (localStorage 구조와 동일)
 */
app.get('/api/apps', auth, async (req, res) => {
    try {
        const isAdmin = req.user.isAdmin
        const empId   = req.user.empId

        const { rows } = await execute(
            `SELECT APP_ID, EMP_ID, APP_YEAR, APP_MONTH, ROOM_TYPE, NIGHTS,
                    TOTAL, SUBSIDY, STATUS,
                    TO_CHAR(CREATED_AT, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS CREATED_AT
               FROM KOSHA_APPS
              ${isAdmin ? '' : 'WHERE EMP_ID = :1'}
              ORDER BY CREATED_AT DESC`,
            isAdmin ? [] : [empId]
        )

        // localStorage 구조(ApplicationRecord[])와 동일한 형태로 변환
        const result = rows.map(r => ({
            id:       r.APP_ID,
            empId:    r.EMP_ID,
            year:     r.APP_YEAR,
            month:    r.APP_MONTH,
            roomType: r.ROOM_TYPE,
            nights:   r.NIGHTS,
            total:    r.TOTAL,
            subsidy:  r.SUBSIDY,
            status:   r.STATUS,
            createdAt:r.CREATED_AT,
        }))

        return res.json(result)

    } catch (err) {
        console.error('[GET /apps]', err)
        return res.status(500).json({ message: '서버 오류' })
    }
})

const MAX_NIGHTS = 2  // 1회 신청당 최대 숙박 일수 (프론트엔드 constants.js와 동일하게 유지)

/**
 * POST /api/apps
 * 예약 신청 (일반 직원)
 * Body: { month, roomType, nights, total, subsidy }
 */
app.post('/api/apps', auth, async (req, res) => {
    const { month, roomType, nights, total, subsidy } = req.body

    // 입력 검증
    const parsedMonth  = parseInt(month)
    const parsedNights = parseInt(nights)
    if (!parsedMonth || parsedMonth < 1 || parsedMonth > 12) {
        return res.status(400).json({ message: '올바른 신청 월을 입력해주세요.' })
    }
    if (!parsedNights || parsedNights < 1) {
        return res.status(400).json({ message: '숙박 일수는 1박 이상이어야 합니다.' })
    }
    if (parsedNights > MAX_NIGHTS) {
        return res.status(400).json({ message: `최대 ${MAX_NIGHTS}박까지만 신청 가능합니다.` })
    }
    if (!roomType) {
        return res.status(400).json({ message: '객실 타입을 선택해주세요.' })
    }

    const empId = req.user.empId
    const year  = new Date().getFullYear()
    const appId = crypto.randomUUID()  // Node.js 14.17+ 내장

    try {
        await execute(
            `INSERT INTO KOSHA_APPS
                (APP_ID, EMP_ID, APP_YEAR, APP_MONTH, ROOM_TYPE, NIGHTS, TOTAL, SUBSIDY, STATUS, CREATED_AT)
             VALUES (:1, :2, :3, :4, :5, :6, :7, :8, 'pending', SYSTIMESTAMP)`,
            [appId, empId, year, month, roomType, nights, total, subsidy]
        )
        return res.status(201).json({ id: appId, message: '신청 완료' })

    } catch (err) {
        console.error('[POST /apps]', err)
        return res.status(500).json({ message: '서버 오류' })
    }
})

/**
 * PUT /api/apps (일괄 업데이트 — 추첨 결과 반영)
 * Body: { apps: ApplicationRecord[] }
 * 관리자 전용 — 추첨 실행 후 전체 상태를 한 번에 업데이트합니다.
 *
 * 트랜잭션으로 처리하여 일부만 변경되는 상황을 방지합니다.
 */
app.put('/api/apps', auth, adminOnly, async (req, res) => {
    const { apps } = req.body
    if (!Array.isArray(apps)) return res.status(400).json({ message: '잘못된 요청 형식' })

    try {
        const appIds = apps.map(app => app.id).filter(Boolean)
        const previousStatus = new Map()
        if (appIds.length > 0) {
            for (const app of apps) {
                const { rows } = await execute(
                    `SELECT STATUS FROM KOSHA_APPS WHERE APP_ID = :1`,
                    [app.id]
                )
                if (rows[0]) previousStatus.set(app.id, rows[0].STATUS)
            }
        }

        await transaction(async (conn) => {
            for (const app of apps) {
                // Oracle: conn.execute, Tibero: 별도 처리 필요
                await conn.execute(
                    `UPDATE KOSHA_APPS SET STATUS = :1 WHERE APP_ID = :2`,
                    [app.status, app.id],
                    { autoCommit: false }  // 트랜잭션 내에서는 autoCommit 끄기
                )
            }
        })

        const resultStatuses = new Set(['selected', 'manual', 'rejected'])
        const resultChangedMonths = new Set(
            apps
                .filter(app => resultStatuses.has(app.status) && previousStatus.get(app.id) !== app.status)
                .map(app => `${app.year}:${app.month}`)
        )
        const notificationTargets = apps.filter(app =>
            resultStatuses.has(app.status) && resultChangedMonths.has(`${app.year}:${app.month}`)
        )

        if (notificationTargets.length > 0) {
            const notifications = notificationTargets.map(app =>
                mailLotteryResult({
                    empId:    app.empId,
                    empEmail: internalEmailFor(app.empId),
                    month:    app.month,
                    roomType: app.roomType,
                    nights:   app.nights,
                    status:   app.status,
                })
            )
            await Promise.allSettled(notifications)
        }

        return res.json({
            message: '일괄 업데이트 완료',
            mailNotified: notificationTargets.length,
        })

    } catch (err) {
        console.error('[PUT /apps]', err)
        return res.status(500).json({ message: '서버 오류' })
    }
})

/**
 * PUT /api/apps/:id
 * 단건 신청 상태 변경 (관리자 전용)
 * Body: { status: 'pending' | 'selected' | 'rejected' | 'manual' }
 */
app.put('/api/apps/:id', auth, adminOnly, async (req, res) => {
    const { status } = req.body
    try {
        await execute(
            `UPDATE KOSHA_APPS SET STATUS = :1 WHERE APP_ID = :2`,
            [status, req.params.id]
        )
        return res.json({ message: '상태 변경 완료' })
    } catch (err) {
        console.error('[PUT /apps/:id]', err)
        return res.status(500).json({ message: '서버 오류' })
    }
})

/**
 * PATCH /api/apps/:id/cancel
 * 신청 취소 — 일반 사용자: 본인의 pending 상태만 취소 가능 / 관리자: 모든 상태 취소 가능
 */
app.patch('/api/apps/:id/cancel', auth, async (req, res) => {
    const empId   = req.user.empId
    const isAdmin = req.user.isAdmin
    const { id }  = req.params
    try {
        const sql = isAdmin
            ? `UPDATE KOSHA_APPS SET STATUS = 'cancelled' WHERE APP_ID = :1`
            : `UPDATE KOSHA_APPS SET STATUS = 'cancelled' WHERE APP_ID = :1 AND EMP_ID = :2 AND STATUS = 'pending'`
        const binds = isAdmin ? [id] : [id, empId]
        const { rowsAffected } = await execute(sql, binds)
        if (!isAdmin && rowsAffected === 0) {
            return res.status(404).json({ message: '취소할 수 있는 신청이 없습니다. 이미 추첨이 진행되었거나 본인 신청이 아닙니다.' })
        }
        return res.json({ message: '신청이 취소되었습니다.' })
    } catch (err) {
        console.error('[PATCH /apps/:id/cancel]', err)
        return res.status(500).json({ message: '서버 오류' })
    }
})

/**
 * DELETE /api/apps/:id
 * 신청 취소 (본인 또는 관리자)
 */
app.delete('/api/apps/:id', auth, async (req, res) => {
    try {
        const empId   = req.user.empId
        const isAdmin = req.user.isAdmin

        // 관리자가 아니면 본인 신청만 삭제 가능
        const sql = isAdmin
            ? `DELETE FROM KOSHA_APPS WHERE APP_ID = :1`
            : `DELETE FROM KOSHA_APPS WHERE APP_ID = :1 AND EMP_ID = :2`
        const binds = isAdmin ? [req.params.id] : [req.params.id, empId]

        await execute(sql, binds)
        return res.json({ message: '삭제 완료' })

    } catch (err) {
        console.error('[DELETE /apps/:id]', err)
        return res.status(500).json({ message: '서버 오류' })
    }
})


// ──────────────────────────────────────────────────────────────────────────────
// 라우터 — 설정 & 발전기금 (Settings / Fund)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/settings
 * 시스템 설정 전체 반환 (인증 필요)
 * 반환 형태: AppSettings 객체 (localStorage settings 구조와 동일)
 */
app.get('/api/settings', auth, async (_req, res) => {
    try {
        const { rows } = await execute(
            `SELECT SETTING_KEY, SETTING_VAL FROM KOSHA_SETTINGS WHERE SETTING_KEY = 'settings'`
        )
        if (rows.length === 0) return res.status(404).json({ message: '설정 없음' })

        // CLOB → JSON 파싱
        // Oracle: SETTING_VAL은 Lob 객체일 수 있음 — toString()으로 변환
        const raw = typeof rows[0].SETTING_VAL === 'string'
            ? rows[0].SETTING_VAL
            : await rows[0].SETTING_VAL.getData()  // Oracle Lob 처리

        return res.json(JSON.parse(raw))

    } catch (err) {
        console.error('[GET /settings]', err)
        return res.status(500).json({ message: '서버 오류' })
    }
})

/**
 * PUT /api/settings
 * 설정 저장 (관리자 전용)
 * Body: AppSettings 객체
 */
app.put('/api/settings', auth, adminOnly, async (req, res) => {
    try {
        const val = JSON.stringify(req.body)
        await execute(
            `UPDATE KOSHA_SETTINGS SET SETTING_VAL = :1, UPDATED_AT = SYSTIMESTAMP
              WHERE SETTING_KEY = 'settings'`,
            [val]
        )
        return res.json({ message: '설정 저장 완료' })
    } catch (err) {
        console.error('[PUT /settings]', err)
        return res.status(500).json({ message: '서버 오류' })
    }
})

// ── 설정 부분 업데이트 헬퍼 ──────────────────────────────────────────────────
/** KOSHA_SETTINGS에서 settings JSON을 읽어 파싱 */
const loadSettings = async () => {
    const { rows } = await execute(
        `SELECT SETTING_VAL FROM KOSHA_SETTINGS WHERE SETTING_KEY = 'settings'`
    )
    if (!rows.length) throw new Error('설정 없음')
    const raw = typeof rows[0].SETTING_VAL === 'string'
        ? rows[0].SETTING_VAL
        : await rows[0].SETTING_VAL.getData()
    return JSON.parse(raw)
}
/** 변경된 settings 객체를 DB에 저장 */
const saveSettingsToDB = async s => {
    await execute(
        `UPDATE KOSHA_SETTINGS SET SETTING_VAL = :1, UPDATED_AT = SYSTIMESTAMP WHERE SETTING_KEY = 'settings'`,
        [JSON.stringify(s)]
    )
}

/**
 * PATCH /api/settings/periods
 * 월별 신청 기간 + 선발 인원 일괄 업데이트 (관리자 전용)
 * Body: {
 *   periods: { [month]: { start: 'YYYY-MM-DD', end: 'YYYY-MM-DD' } },
 *   quotas:  { [month]: number }
 * }
 */
app.patch('/api/settings/periods', auth, adminOnly, async (req, res) => {
    try {
        const { periods, quotas } = req.body
        if (!periods && !quotas) return res.status(400).json({ message: 'periods 또는 quotas 필요' })
        const s = await loadSettings()
        if (periods) s.applicationPeriods = { ...s.applicationPeriods, ...periods }
        if (quotas)  s.quotas             = { ...s.quotas, ...quotas }
        await saveSettingsToDB(s)
        return res.json({ message: '신청 기간 저장 완료' })
    } catch (err) {
        console.error('[PATCH /settings/periods]', err)
        return res.status(500).json({ message: '서버 오류' })
    }
})

/**
 * PATCH /api/settings/holidays
 * 공휴일 일괄 추가·삭제 (관리자 전용)
 * Body: {
 *   add:    [{ id, date: 'YYYY-MM-DD', name }],
 *   remove: ['YYYY-MM-DD', ...]
 * }
 */
app.patch('/api/settings/holidays', auth, adminOnly, async (req, res) => {
    try {
        const { add = [], remove = [] } = req.body
        if (!Array.isArray(add) || !Array.isArray(remove))
            return res.status(400).json({ message: 'add·remove 배열 필요' })
        const s = await loadSettings()
        let hols = Array.isArray(s.holidays) ? [...s.holidays] : []
        // 삭제
        hols = hols.filter(h => !remove.includes(h.date))
        // 추가 (중복 방지)
        add.forEach(h => { if (!hols.some(x => x.date === h.date)) hols.push(h) })
        s.holidays = hols
        await saveSettingsToDB(s)
        return res.json({ message: '공휴일 저장 완료', count: hols.length })
    } catch (err) {
        console.error('[PATCH /settings/holidays]', err)
        return res.status(500).json({ message: '서버 오류' })
    }
})

/**
 * PATCH /api/settings/peak-quotas
 * 성수기 일별 체크인 제한 인원 일괄 업데이트 (관리자 전용)
 * Body: {
 *   month:  7 | 8,
 *   quotas: { [day]: number }
 * }
 */
app.patch('/api/settings/peak-quotas', auth, adminOnly, async (req, res) => {
    try {
        const { month, quotas: dayQuotas } = req.body
        if (![7, 8].includes(Number(month)) || !dayQuotas)
            return res.status(400).json({ message: 'month(7|8)과 quotas 필요' })
        const s = await loadSettings()
        s.peakDayQuotas = s.peakDayQuotas ?? {}
        s.peakDayQuotas[month] = { ...(s.peakDayQuotas[month] ?? {}), ...dayQuotas }
        await saveSettingsToDB(s)
        return res.json({ message: `${month}월 성수기 제한 저장 완료` })
    } catch (err) {
        console.error('[PATCH /settings/peak-quotas]', err)
        return res.status(500).json({ message: '서버 오류' })
    }
})

/**
 * GET /api/fund
 * 발전기금 사용액 반환
 */
app.get('/api/fund', auth, async (_req, res) => {
    try {
        const { rows } = await execute(
            `SELECT SETTING_VAL FROM KOSHA_SETTINGS WHERE SETTING_KEY = 'fundUsed'`
        )
        const raw = rows[0]?.SETTING_VAL ?? '0'
        const val = typeof raw === 'string' ? raw : await raw.getData()
        return res.json(Number(val))
    } catch (err) {
        console.error('[GET /fund]', err)
        return res.status(500).json({ message: '서버 오류' })
    }
})

/**
 * PUT /api/fund
 * 발전기금 사용액 갱신 (관리자 전용)
 * Body: { value: number }
 */
app.put('/api/fund', auth, adminOnly, async (req, res) => {
    try {
        await execute(
            `UPDATE KOSHA_SETTINGS SET SETTING_VAL = :1, UPDATED_AT = SYSTIMESTAMP
              WHERE SETTING_KEY = 'fundUsed'`,
            [String(req.body.value ?? 0)]
        )
        return res.json({ message: '발전기금 갱신 완료' })
    } catch (err) {
        console.error('[PUT /fund]', err)
        return res.status(500).json({ message: '서버 오류' })
    }
})


// ──────────────────────────────────────────────────────────────────────────────
// 라우터 — 날짜별 객실 특별 요금 (Room Date Prices)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/room-prices
 * 전체 날짜별 특별 요금 규칙 반환 (인증 필요)
 * 반환 형태: [{ id, roomId, from, to, price, label }]
 */
app.get('/api/room-prices', auth, async (_req, res) => {
    try {
        const { rows } = await execute(
            `SELECT PRICE_ID, ROOM_ID,
                    TO_CHAR(DATE_FROM, 'YYYY-MM-DD') AS DATE_FROM,
                    TO_CHAR(DATE_TO,   'YYYY-MM-DD') AS DATE_TO,
                    PRICE, LABEL
               FROM KOSHA_ROOM_PRICES
              ORDER BY ROOM_ID, DATE_FROM`
        )
        const result = rows.map(r => ({
            id:     r.PRICE_ID,
            roomId: r.ROOM_ID,
            from:   r.DATE_FROM,
            to:     r.DATE_TO,
            price:  r.PRICE,
            label:  r.LABEL ?? '',
        }))
        return res.json(result)
    } catch (err) {
        console.error('[GET /room-prices]', err)
        return res.status(500).json({ message: '서버 오류' })
    }
})

/**
 * POST /api/room-prices
 * 날짜별 특별 요금 규칙 생성 (관리자 전용)
 * Body: { roomId, from, to, price, label? }
 */
app.post('/api/room-prices', auth, adminOnly, async (req, res) => {
    const { roomId, from, to, price, label } = req.body
    if (!roomId || !from || !to || price == null) {
        return res.status(400).json({ message: 'roomId, from, to, price 는 필수 항목입니다.' })
    }
    if (new Date(to) < new Date(from)) {
        return res.status(400).json({ message: '종료일은 시작일보다 같거나 이후여야 합니다.' })
    }
    if (Number(price) < 0) {
        return res.status(400).json({ message: '요금은 0 이상이어야 합니다.' })
    }

    const id = crypto.randomUUID()
    try {
        await execute(
            `INSERT INTO KOSHA_ROOM_PRICES (PRICE_ID, ROOM_ID, DATE_FROM, DATE_TO, PRICE, LABEL, CREATED_AT)
             VALUES (:1, :2, TO_DATE(:3,'YYYY-MM-DD'), TO_DATE(:4,'YYYY-MM-DD'), :5, :6, SYSTIMESTAMP)`,
            [id, roomId, from, to, Number(price), label || null]
        )
        return res.status(201).json({ id, message: '특별 요금 생성 완료' })
    } catch (err) {
        console.error('[POST /room-prices]', err)
        return res.status(500).json({ message: '서버 오류' })
    }
})

/**
 * PUT /api/room-prices/:id
 * 날짜별 특별 요금 규칙 수정 (관리자 전용)
 * Body: { roomId?, from?, to?, price?, label? }
 */
app.put('/api/room-prices/:id', auth, adminOnly, async (req, res) => {
    const { roomId, from, to, price, label } = req.body
    try {
        await execute(
            `UPDATE KOSHA_ROOM_PRICES
                SET ROOM_ID   = NVL(:1, ROOM_ID),
                    DATE_FROM = NVL(TO_DATE(:2,'YYYY-MM-DD'), DATE_FROM),
                    DATE_TO   = NVL(TO_DATE(:3,'YYYY-MM-DD'), DATE_TO),
                    PRICE     = NVL(:4, PRICE),
                    LABEL     = :5
              WHERE PRICE_ID = :6`,
            [roomId || null, from || null, to || null, price != null ? Number(price) : null, label ?? null, req.params.id]
        )
        return res.json({ message: '특별 요금 수정 완료' })
    } catch (err) {
        console.error('[PUT /room-prices/:id]', err)
        return res.status(500).json({ message: '서버 오류' })
    }
})

/**
 * DELETE /api/room-prices/:id
 * 날짜별 특별 요금 규칙 삭제 (관리자 전용)
 */
app.delete('/api/room-prices/:id', auth, adminOnly, async (req, res) => {
    try {
        await execute(
            `DELETE FROM KOSHA_ROOM_PRICES WHERE PRICE_ID = :1`,
            [req.params.id]
        )
        return res.json({ message: '특별 요금 삭제 완료' })
    } catch (err) {
        console.error('[DELETE /room-prices/:id]', err)
        return res.status(500).json({ message: '서버 오류' })
    }
})

/**
 * POST /api/room-prices/bulk
 * 선택 기간에 대한 요금 일괄 설정 (관리자 전용)
 *
 * Body: {
 *   rules: [{ roomId, from, to, price, label }],   ← 적용할 규칙 배열
 *   clearInner: boolean                             ← true이면 기간 내 기존 규칙 삭제 후 삽입
 * }
 *
 * clearInner=true 동작:
 *   각 rule에 대해 DATE_FROM >= rule.from AND DATE_TO <= rule.to 인 같은 ROOM_ID의
 *   기존 규칙을 먼저 삭제하고 새 규칙을 삽입합니다.
 *   기간을 벗어나는 규칙(더 넓은 범위)은 그대로 유지됩니다.
 */
app.post('/api/room-prices/bulk', auth, adminOnly, async (req, res) => {
    const { rules, clearInner } = req.body
    if (!Array.isArray(rules) || rules.length === 0) {
        return res.status(400).json({ message: 'rules 배열이 필요합니다.' })
    }

    // 유효성 검사
    for (const r of rules) {
        if (!r.roomId || !r.from || !r.to || r.price == null) {
            return res.status(400).json({ message: 'roomId, from, to, price 는 각 규칙의 필수 항목입니다.' })
        }
        if (new Date(r.to) < new Date(r.from)) {
            return res.status(400).json({ message: `종료일이 시작일보다 빠릅니다: ${r.from} ~ ${r.to}` })
        }
        if (Number(r.price) < 0) {
            return res.status(400).json({ message: '요금은 0 이상이어야 합니다.' })
        }
    }

    try {
        await transaction(async (conn) => {
            for (const rule of rules) {
                const { roomId, from, to, price, label } = rule

                if (clearInner) {
                    // 선택 기간 내부에 완전히 포함되는 기존 규칙 삭제
                    await conn.execute(
                        `DELETE FROM KOSHA_ROOM_PRICES
                          WHERE ROOM_ID = :1
                            AND DATE_FROM >= TO_DATE(:2, 'YYYY-MM-DD')
                            AND DATE_TO   <= TO_DATE(:3, 'YYYY-MM-DD')`,
                        [roomId, from, to],
                        { autoCommit: false }
                    )
                }

                const id = crypto.randomUUID()
                await conn.execute(
                    `INSERT INTO KOSHA_ROOM_PRICES
                        (PRICE_ID, ROOM_ID, DATE_FROM, DATE_TO, PRICE, LABEL, CREATED_AT)
                     VALUES (:1, :2, TO_DATE(:3,'YYYY-MM-DD'), TO_DATE(:4,'YYYY-MM-DD'), :5, :6, SYSTIMESTAMP)`,
                    [id, roomId, from, to, Number(price), label || null],
                    { autoCommit: false }
                )
            }
        })
        return res.status(201).json({ count: rules.length, message: `${rules.length}개 규칙 일괄 적용 완료` })

    } catch (err) {
        console.error('[POST /room-prices/bulk]', err)
        return res.status(500).json({ message: '서버 오류' })
    }
})

/**
 * DELETE /api/room-prices/bulk
 * 선택 기간 내 요금 규칙 일괄 삭제 (관리자 전용)
 *
 * Body: { roomIds: string[], from: string, to: string }
 *   → roomIds 내 각 객실에 대해 DATE_FROM >= from AND DATE_TO <= to 인 규칙 삭제
 */
app.delete('/api/room-prices/bulk', auth, adminOnly, async (req, res) => {
    const { roomIds, from, to } = req.body
    if (!Array.isArray(roomIds) || !from || !to) {
        return res.status(400).json({ message: 'roomIds, from, to 는 필수 항목입니다.' })
    }

    try {
        let totalDeleted = 0
        for (const roomId of roomIds) {
            const result = await execute(
                `DELETE FROM KOSHA_ROOM_PRICES
                  WHERE ROOM_ID = :1
                    AND DATE_FROM >= TO_DATE(:2, 'YYYY-MM-DD')
                    AND DATE_TO   <= TO_DATE(:3, 'YYYY-MM-DD')`,
                [roomId, from, to]
            )
            totalDeleted += result.rowsAffected ?? 0
        }
        return res.json({ deleted: totalDeleted, message: `${totalDeleted}개 규칙 삭제 완료` })
    } catch (err) {
        console.error('[DELETE /room-prices/bulk]', err)
        return res.status(500).json({ message: '서버 오류' })
    }
})

// ──────────────────────────────────────────────────────────────────────────────
// DB 초기화 및 서버 시작
// ──────────────────────────────────────────────────────────────────────────────

/**
 * KOSHA_SETTINGS에 초기 데이터가 없으면 삽입합니다.
 * schema.sql의 INSERT와 동일한 역할 — 서버 코드만 실행하는 경우를 위한 안전망.
 */
async function initDefaults() {
    const { rows } = await execute(
        `SELECT COUNT(*) AS CNT FROM KOSHA_SETTINGS WHERE SETTING_KEY = 'settings'`
    )
    const cnt = rows[0]?.CNT ?? rows[0]?.cnt ?? 0
    if (Number(cnt) === 0) {
        console.log('[DB] 초기 설정 데이터 삽입 중...')
        // schema.sql의 INSERT 구문과 동일 (생략 — 실제 배포 시 schema.sql 먼저 실행할 것)
        console.log('[DB] schema.sql을 먼저 실행하거나 초기 INSERT를 수동으로 진행하세요.')
    }
}

async function start() {
    try {
        await initDB()         // DB 연결 풀 초기화
        await initDefaults()   // 초기 데이터 확인
        await verifyMailer()   // 메일 서버 연결 상태 확인

        app.listen(PORT, () => {
            console.log(`[SERVER] API 서버 기동: http://localhost:${PORT}`)
            console.log(`[SERVER] DB 타입: ${process.env.DB_TYPE || 'oracle'}`)
        })
    } catch (err) {
        console.error('[SERVER] 서버 기동 실패:', err)
        process.exit(1)
    }
}

start()
