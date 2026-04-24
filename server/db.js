/**
 * server/db.js — 데이터베이스 연결 관리
 *
 * Oracle / Tibero 두 가지 드라이버를 지원합니다.
 * 환경변수 DB_TYPE 으로 선택합니다 (기본값: oracle).
 *
 * ┌────────────────────────────────────────────────────────┐
 * │  패키지 설치 명령                                       │
 * │                                                        │
 * │  Oracle 사용 시:                                        │
 * │    npm install oracledb                                │
 * │    → Oracle Instant Client 별도 설치 필요              │
 * │      https://www.oracle.com/database/technologies/     │
 * │              instant-client.html                       │
 * │                                                        │
 * │  Tibero 사용 시:                                        │
 * │    npm install odbc                                    │
 * │    → Tibero ODBC 드라이버 설치 후 DSN 등록 필요         │
 * │      (Tibero 설치 패키지에 포함된 tbODBC.so/tbODBC.dll) │
 * └────────────────────────────────────────────────────────┘
 */

import 'dotenv/config'

// ── DB 타입 선택 ──────────────────────────────────────────────────────────────
// .env 파일에서 DB_TYPE=oracle 또는 DB_TYPE=tibero 를 설정합니다.
const DB_TYPE = process.env.DB_TYPE || 'oracle'

// ──────────────────────────────────────────────────────────────────────────────
// Oracle 연결 풀 (oracledb)
// ──────────────────────────────────────────────────────────────────────────────

let oraclePool = null

/**
 * Oracle 연결 풀 초기화
 * 서버 시작 시 한 번 호출합니다.
 */
async function initOracle() {
    // oracledb는 동적 import로 로드 (Oracle 미설치 환경에서 에러 방지)
    const oracledb = (await import('oracledb')).default

    // Thin 모드: Oracle Instant Client 없이 순수 JS로 연결 (Oracle 21c DB 이상)
    // Thick 모드(기본): Instant Client 필요, 더 많은 기능 지원
    // 폐쇄망에 Instant Client 설치가 어려우면 Thin 모드 사용을 권장합니다.
    oracledb.initOracleClient()  // Thick 모드 — Instant Client 경로가 PATH에 있어야 함
    // oracledb.thin = true       // Thin 모드 사용 시 위 줄 대신 이 줄 활성화

    // 연결 결과를 JS 객체로 자동 변환 (컬럼명 → 소문자 camelCase 아님, 그냥 소문자)
    oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT

    oraclePool = await oracledb.createPool({
        user:             process.env.DB_USER,      // 예: RESORT_APP
        password:         process.env.DB_PASSWORD,  // 예: 비밀번호
        connectString:    process.env.DB_HOST,      // 예: 192.168.1.100:1521/ORCL
        // connectString 형식:
        //   호스트:포트/서비스명   →  192.168.1.100:1521/ORCL
        //   TNS 별칭              →  ORCL  (tnsnames.ora 필요)
        //   Easy Connect 플러스  →  192.168.1.100:1521/ORCL?connect_timeout=10

        poolMin:    2,   // 최소 유지 연결 수
        poolMax:   10,   // 최대 연결 수 (동시 요청 처리 한계)
        poolIncrement: 1, // 연결 부족 시 한 번에 추가할 연결 수
        poolTimeout:  60, // 유휴 연결 유지 시간(초) — 이후 자동 해제
    })

    console.log('[DB] Oracle 연결 풀 초기화 완료')
}

/**
 * Oracle 연결 획득 — 사용 후 반드시 conn.close() 호출
 * @returns {Promise<import('oracledb').Connection>}
 */
async function getOracleConn() {
    if (!oraclePool) throw new Error('[DB] Oracle 풀이 초기화되지 않았습니다.')
    return oraclePool.getConnection()
}

/**
 * Oracle 쿼리 실행 유틸리티 — 연결 자동 반환
 * @param {string} sql      - SQL 문 (바인드 변수: :1, :2 또는 :name)
 * @param {Array|Object} binds - 바인드 값 배열 또는 객체
 * @param {Object} opts     - oracledb 실행 옵션
 */
export async function oraQuery(sql, binds = [], opts = {}) {
    const conn = await getOracleConn()
    try {
        const result = await conn.execute(sql, binds, {
            autoCommit: true,  // 기본적으로 자동 커밋
            ...opts,
        })
        return result
    } finally {
        await conn.close()  // 풀에 반환 (절대 빠뜨리지 말 것)
    }
}


// ──────────────────────────────────────────────────────────────────────────────
// Tibero 연결 (ODBC 방식)
// ──────────────────────────────────────────────────────────────────────────────

let tiberoPool = null

/**
 * Tibero ODBC 연결 풀 초기화
 *
 * 사전 준비:
 *   1. Tibero 서버 설치 및 실행
 *   2. 클라이언트 PC에 Tibero ODBC 드라이버 설치
 *      (Tibero 설치 패키지 → client/lib/libtbodbc.so 또는 tbODBC.dll)
 *   3. ODBC 데이터 소스 등록
 *      Linux:   /etc/odbc.ini 또는 ~/.odbc.ini 에 DSN 설정
 *      Windows: ODBC 데이터 원본 관리자에서 시스템 DSN 추가
 *
 *   odbc.ini 예시 (Linux):
 *   ┌─────────────────────────────────────────────┐
 *   │ [TIBERO_DSN]                                │
 *   │ Description = Tibero6                       │
 *   │ Driver      = /opt/tibero6/client/lib/      │
 *   │               libtbodbc.so                  │
 *   │ Server      = 192.168.1.100                 │
 *   │ Port        = 8629                          │  ← Tibero 기본 포트
 *   │ Database    = tibero                        │
 *   └─────────────────────────────────────────────┘
 */
async function initTibero() {
    const odbc = (await import('odbc')).default

    tiberoPool = await odbc.pool({
        connectionString: process.env.DB_TIBERO_DSN ||
            // 인라인 연결 문자열 (DSN 없이 직접 지정)
            `DRIVER={Tibero6 ODBC Driver};` +
            `SERVER=${process.env.DB_HOST};` +
            `PORT=${process.env.DB_PORT || 8629};` +
            `DATABASE=${process.env.DB_NAME};` +
            `UID=${process.env.DB_USER};` +
            `PWD=${process.env.DB_PASSWORD};`,

        initialSize:  2,   // 초기 연결 수
        maxSize:     10,   // 최대 연결 수
        shrink:      true, // 유휴 연결 자동 해제
    })

    console.log('[DB] Tibero ODBC 연결 풀 초기화 완료')
}

/**
 * Tibero 쿼리 실행 유틸리티
 * @param {string} sql     - SQL 문 (바인드 변수: ? 사용, ODBC 표준)
 * @param {Array}  params  - 바인드 값 배열
 *
 * 주의: Oracle의 :1, :name 방식과 달리 ODBC는 ? 를 사용합니다.
 *       SQL 작성 시 DB_TYPE에 따라 다른 SQL을 작성하거나,
 *       아래의 공통 execute() 함수를 통해 자동 변환합니다.
 */
export async function tibQuery(sql, params = []) {
    if (!tiberoPool) throw new Error('[DB] Tibero 풀이 초기화되지 않았습니다.')
    const conn = await tiberoPool.connect()
    try {
        const result = await conn.query(sql, params)
        return result
    } finally {
        await conn.close()
    }
}


// ──────────────────────────────────────────────────────────────────────────────
// 통합 인터페이스 — DB_TYPE에 따라 Oracle 또는 Tibero를 투명하게 선택
// ──────────────────────────────────────────────────────────────────────────────

/**
 * DB 초기화 — 서버 시작 시 호출
 */
export async function initDB() {
    if (DB_TYPE === 'tibero') {
        await initTibero()
    } else {
        await initOracle()
    }
}

/**
 * SQL 쿼리 실행 (공통 인터페이스)
 *
 * Oracle : 바인드 변수를 :1, :2 또는 { name: value } 형식으로 전달
 * Tibero : 바인드 변수를 ? 형식으로 전달 (배열)
 *
 * 이 함수는 두 방식을 모두 처리할 수 있도록
 * Oracle 스타일(:1)을 Tibero 스타일(?)로 자동 변환합니다.
 *
 * @param {string}       sql    - Oracle 스타일 SQL (:1, :2 형식)
 * @param {Array|Object} binds  - 바인드 값
 * @returns {Promise<{ rows: object[], rowsAffected: number }>}
 */
export async function execute(sql, binds = []) {
    if (DB_TYPE === 'tibero') {
        // Oracle 바인드 변수(:1, :name)를 ODBC 방식(?)으로 변환
        const convertedSql = sql.replace(/:[a-zA-Z0-9_]+/g, '?')
        const params = Array.isArray(binds) ? binds : Object.values(binds)
        const result = await tibQuery(convertedSql, params)
        return {
            rows:         Array.from(result),   // iterable → array
            rowsAffected: result.count ?? 0,
        }
    } else {
        // Oracle
        const result = await oraQuery(sql, binds)
        return {
            rows:         result.rows ?? [],
            rowsAffected: result.rowsAffected ?? 0,
        }
    }
}

/**
 * 트랜잭션 실행 유틸리티 (Oracle 전용)
 * 여러 쿼리를 하나의 트랜잭션으로 묶을 때 사용합니다.
 *
 * 사용 예:
 *   await transaction(async (conn) => {
 *     await conn.execute("UPDATE KOSHA_APPS SET STATUS=:1 WHERE APP_ID=:2", ['selected', id])
 *     await conn.execute("UPDATE KOSHA_SETTINGS SET SETTING_VAL=:1 ...", [newFund])
 *   })
 *
 * Tibero에서는 tiberoPool.connect() 후 conn.beginTransaction() 사용
 */
export async function transaction(fn) {
    if (DB_TYPE === 'tibero') {
        const odbc = (await import('odbc')).default
        const conn = await tiberoPool.connect()
        try {
            await conn.beginTransaction()
            await fn(conn)
            await conn.commit()
        } catch (err) {
            await conn.rollback()
            throw err
        } finally {
            await conn.close()
        }
        return
    }

    // Oracle
    const oracledb = (await import('oracledb')).default
    const conn = await getOracleConn()
    try {
        await fn(conn)
        await conn.commit()
    } catch (err) {
        await conn.rollback()
        throw err
    } finally {
        await conn.close()
    }
}
