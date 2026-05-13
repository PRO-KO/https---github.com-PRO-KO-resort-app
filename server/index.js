/**
 * server/index.js — Express REST API 서버 (Node.js v10 호환 버전)
 */

require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const util = require('util');
const path = require('path');

// 프로젝트 내부 모듈
const db = require('./db.js');
const initDB = db.initDB;
const execute = db.execute;
const transaction = db.transaction;

const mailer = require('./mailer.js');
const mailLotteryResult = mailer.mailLotteryResult;
const mailCancellation = mailer.mailCancellation;
const internalEmailFor = mailer.internalEmailFor;
const verifyMailer = mailer.verifyMailer;

const app = express();
const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || 'CHANGE_ME_TO_RANDOM_64_CHARS';
const ADMIN_PW = process.env.ADMIN_PW || '';

// v10용 UUID 생성 함수 (v14 미만 대응)
function generateUUID() {
    return crypto.randomBytes(16).toString('hex').replace(/^(........)(....)(....)(....)(............)$/, "$1-$2-$3-$4-$5");
}

if (process.env.NODE_ENV === 'production') {
    if (!process.env.JWT_SECRET || JWT_SECRET === 'CHANGE_ME_TO_RANDOM_64_CHARS' || JWT_SECRET.length < 32) {
        throw new Error('운영 환경에서는 32자 이상의 JWT_SECRET 환경변수를 설정해야 합니다.');
    }
    if (!ADMIN_PW || ADMIN_PW.length < 8) {
        throw new Error('운영 환경에서는 8자 이상의 ADMIN_PW 환경변수를 설정해야 합니다.');
    }
}

const JWT_EXPIRES = '30m';

// 미들웨어
app.use(helmet());
if (process.env.NODE_ENV !== 'production') {
    app.use(cors({ origin: 'http://localhost:3000' }));
}
app.use(express.json({ limit: '1mb' }));

// 비밀번호 유틸리티
const pbkdf2Async = util.promisify(crypto.pbkdf2);
const generateSalt = function() { return crypto.randomBytes(16).toString('hex'); };

const hashPwd = async function(password, salt) {
    const buf = await pbkdf2Async(
        password,
        Buffer.from(salt, 'hex'),
        100000,
        32,
        'sha256'
    );
    return buf.toString('hex');
};

const verifyPwd = async function(password, storedHash, storedSalt) {
    if (!storedSalt) return storedHash === legacyHash(password);
    const hash = await hashPwd(password, storedSalt);
    try {
        return crypto.timingSafeEqual(
            Buffer.from(hash, 'hex'),
            Buffer.from(storedHash, 'hex')
        );
    } catch (e) {
        return false;
    }
};

const legacyHash = function(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
    return h.toString(16);
};

const secureTextEqual = function(a, b) {
    const strA = a || '';
    const strB = b || '';
    const left = Buffer.from(String(strA));
    const right = Buffer.from(String(strB));
    if (left.length !== right.length) return false;
    return crypto.timingSafeEqual(left, right);
};

const loginLocks = new Map();
const lockKey = function(scope, id, ip) { return scope + ":" + String(id || '').toUpperCase() + ":" + (ip || ''); };
const getLock = function(key) {
    const lock = loginLocks.get(key);
    if (!lock) return { locked: false };
    if (Date.now() > lock.until) {
        loginLocks.delete(key);
        return { locked: false };
    }
    return { locked: true, remainMin: Math.ceil((lock.until - Date.now()) / 60000) };
};
const recordLoginFail = function(key) {
    const cur = loginLocks.get(key) || { attempts: 0, until: 0 };
    const attempts = cur.attempts + 1;
    const next = {
        attempts: attempts,
        until: attempts >= 5 ? Date.now() + (15 * 60 * 1000) : cur.until
    };
    loginLocks.set(key, next);
    return { locked: attempts >= 5, remain: Math.max(0, 5 - attempts) };
};

// JWT 인증 미들웨어
const auth = function(req, res, next) {
    const header = req.headers['authorization'];
    if (!header || header.indexOf('Bearer ') !== 0) {
        return res.status(401).json({ message: '인증 토큰이 없습니다.' });
    }
    const token = header.slice(7);
    try {
        req.user = jwt.verify(token, JWT_SECRET);
        next();
    } catch (e) {
        return res.status(401).json({ message: '토큰이 만료되었거나 유효하지 않습니다.' });
    }
};

const adminOnly = function(req, res, next) {
    if (!req.user || !req.user.isAdmin) {
        return res.status(403).json({ message: '관리자 권한이 필요합니다.' });
    }
    next();
};

// ── 라우터: 인증 ──────────────────────────────────────────────────────────────
app.post('/api/auth/login', async function(req, res) {
    const empId = req.body.empId;
    const password = req.body.password;
    if (!empId || !password) return res.status(400).json({ message: '사번과 비밀번호를 입력해주세요.' });

    const id = empId.trim().toUpperCase();
    const lk = lockKey('user', id, req.ip);
    const lock = getLock(lk);
    if (lock.locked) return res.status(429).json({ message: '로그인 시도 초과. ' + lock.remainMin + '분 후 다시 시도해주세요.' });

    try {
        const result = await execute("SELECT EMP_ID, PW_HASH, PW_SALT, STATUS FROM KOSHA_EMPLOYEES WHERE EMP_ID = :1", [id]);
        const emp = result.rows[0];

        if (!emp || emp.STATUS === 'rejected') {
            recordLoginFail(lk);
            return res.status(401).json({ message: '사번 또는 비밀번호가 올바르지 않습니다.' });
        }
        if (emp.STATUS === 'pending') return res.status(403).json({ message: '관리자 승인 대기 중입니다.' });

        const ok = await verifyPwd(password, emp.PW_HASH, emp.PW_SALT);
        if (!ok) {
            recordLoginFail(lk);
            return res.status(401).json({ message: '사번 또는 비밀번호가 올바르지 않습니다.' });
        }

        loginLocks.delete(lk);
        const token = jwt.sign({ empId: emp.EMP_ID, isAdmin: false }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
        return res.json({ token: token, empId: emp.EMP_ID });
    } catch (err) {
        console.error('[API /api/auth/login] Error:', err);
        return res.status(500).json({ message: '서버 오류' });
    }
});

app.post('/api/auth/admin-login', function(req, res) {
    const password = req.body.password;
    const lk = lockKey('admin', 'admin', req.ip);
    const lock = getLock(lk);
    if (lock.locked) return res.status(429).json({ message: '시도 횟수 초과.' });
    
    if (!ADMIN_PW || !secureTextEqual(password, ADMIN_PW)) {
        recordLoginFail(lk);
        return res.status(401).json({ message: '비밀번호가 올바르지 않습니다.' });
    }
    loginLocks.delete(lk);
    const token = jwt.sign({ isAdmin: true }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
    return res.json({ token: token });
});

app.post('/api/auth/refresh', auth, function(req, res) {
    const token = jwt.sign({ empId: req.user.empId, isAdmin: req.user.isAdmin }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
    return res.json({ token: token });
});

// ── 라우터: 직원 관리 ─────────────────────────────────────────────────────────
app.get('/api/employees', auth, adminOnly, async function(req, res) {
    const status = req.query.status;
    try {
        const sql = "SELECT EMP_ID, EMP_NAME, STATUS, ORGANIZATION, DEPARTMENT, PHONE, TO_CHAR(CREATED_AT, 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"') AS CREATED_AT, TO_CHAR(APPROVED_AT, 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"') AS APPROVED_AT FROM KOSHA_EMPLOYEES " + (status ? "WHERE STATUS = :1" : "") + " ORDER BY CREATED_AT DESC";
        const result = await execute(sql, status ? [status] : []);
        const map = {};
        result.rows.forEach(function(row) {
            map[row.EMP_ID] = { empId: row.EMP_ID, empName: row.EMP_NAME, status: row.STATUS, organization: row.ORGANIZATION, department: row.DEPARTMENT, phone: row.PHONE, createdAt: row.CREATED_AT, approvedAt: row.APPROVED_AT };
        });
        return res.json(map);
    } catch (err) { return res.status(500).json({ message: '오류' }); }
});

app.post('/api/employees/register', async function(req, res) {
    const b = req.body;
    const salt = generateSalt();
    try {
        const hash = await hashPwd(b.password, salt);
        await execute("INSERT INTO KOSHA_EMPLOYEES (EMP_ID, PW_HASH, PW_SALT, EMP_NAME, STATUS, ORGANIZATION, DEPARTMENT, PHONE, CREATED_AT) VALUES (:1, :2, :3, :4, 'pending', :5, :6, :7, SYSTIMESTAMP)", 
            [b.empId, hash, salt, b.empName, b.organization, b.department, b.phone]);
        return res.status(201).json({ message: '신청 완료' });
    } catch (err) { return res.status(500).json({ message: '이미 존재하는 사번이거나 오류입니다.' }); }
});

app.put('/api/employees/:empId', auth, adminOnly, async function(req, res) {
    const empId = (req.params.empId || '').trim().toUpperCase();
    const b = req.body;
    try {
        if (b.status === 'rejected') {
            const r = await execute("DELETE FROM KOSHA_EMPLOYEES WHERE EMP_ID = :1", [empId]);
            if (r.rowsAffected === 0) return res.status(404).json({ message: '직원을 찾을 수 없습니다.' });
            return res.json({ message: '거절 및 삭제 완료' });
        }

        // 상태 또는 비밀번호 업데이트
        let sql = "UPDATE KOSHA_EMPLOYEES SET ";
        const sets = [];
        const params = [];
        
        if (b.status) {
            sets.push("STATUS = :" + (params.length + 1));
            params.push(b.status);
            sets.push("APPROVED_AT = (CASE WHEN :" + (params.length + 1) + " = 'approved' THEN SYSTIMESTAMP ELSE NULL END)");
            params.push(b.status);
        }
        if (b.pwHash && b.pwSalt) {
            sets.push("PW_HASH = :" + (params.length + 1));
            params.push(b.pwHash);
            sets.push("PW_SALT = :" + (params.length + 1));
            params.push(b.pwSalt);
        }

        if (sets.length === 0) return res.status(400).json({ message: '수정할 내용이 없습니다.' });

        sql += sets.join(", ");
        sql += " WHERE EMP_ID = :" + (params.length + 1);
        params.push(empId);

        const r = await execute(sql, params);
        if (r.rowsAffected === 0) return res.status(404).json({ message: '직원을 찾을 수 없습니다. (ID: ' + empId + ')' });

        return res.json({ message: '수정 완료' });
    } catch (err) { 
        console.error('[API PUT /api/employees/:empId] Error:', err);
        return res.status(500).json({ message: '서버 오류' }); 
    }
});

app.delete('/api/employees/:empId', auth, adminOnly, async function(req, res) {
    const empId = req.params.empId;
    try {
        await execute("DELETE FROM KOSHA_EMPLOYEES WHERE EMP_ID = :1", [empId]);
        return res.json({ message: '삭제 완료' });
    } catch (err) {
        console.error('[API DELETE /api/employees/:empId] Error:', err);
        return res.status(500).json({ message: '오류' });
    }
});

app.post('/api/employees', auth, adminOnly, async function(req, res) {
    const b = req.body;
    try {
        await execute("INSERT INTO KOSHA_EMPLOYEES (EMP_ID, PW_HASH, PW_SALT, EMP_NAME, STATUS, ORGANIZATION, DEPARTMENT, PHONE, CREATED_AT, APPROVED_AT) VALUES (:1, :2, :3, :4, :5, :6, :7, :8, SYSTIMESTAMP, SYSTIMESTAMP)", 
            [b.empId, b.pwHash, b.pwSalt, b.empName, b.status || 'approved', b.organization, b.department, b.phone]);
        return res.status(201).json({ message: '추가 완료' });
    } catch (err) { 
        console.error('[API POST /api/employees] Error:', err);
        return res.status(500).json({ message: '이미 존재하는 사번이거나 오류입니다.' }); 
    }
});

// ── 라우터: 신청 관리 ─────────────────────────────────────────────────────────
app.get('/api/apps', auth, async function(req, res) {
    try {
        const sql = "SELECT APP_ID, EMP_ID, APP_YEAR, APP_MONTH, ROOM_TYPE, NIGHTS, TOTAL, SUBSIDY, STATUS, REMARKS, CANCEL_REASON, TO_CHAR(CREATED_AT, 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"') AS CREATED_AT FROM KOSHA_APPS " + (req.user.isAdmin ? "" : "WHERE EMP_ID = :1") + " ORDER BY CREATED_AT DESC";
        const result = await execute(sql, req.user.isAdmin ? [] : [req.user.empId]);
        return res.json(result.rows.map(function(r) {
            return { 
                id: r.APP_ID, empId: r.EMP_ID, year: r.APP_YEAR, month: r.APP_MONTH, roomType: r.ROOM_TYPE, 
                nights: r.NIGHTS, total: r.TOTAL, subsidy: r.SUBSIDY, status: r.STATUS, 
                remarks: r.REMARKS, cancelReason: r.CANCEL_REASON, createdAt: r.CREATED_AT 
            };
        }));
    } catch (err) { return res.status(500).json({ message: '오류' }); }
});

// 서버 사이드 무작위 추첨
app.post('/api/apps/lottery', auth, adminOnly, async function(req, res) {
    const month = req.body.month;
    const year = new Date().getFullYear();
    try {
        const settingsRes = await execute("SELECT SETTING_VAL FROM KOSHA_SETTINGS WHERE SETTING_KEY = 'settings'");
        const settings = JSON.parse(settingsRes.rows[0].SETTING_VAL);
        const quota = settings.quotas[month] || 20;

        await transaction(async (conn) => {
            // 1. 현재 해당 월의 별도배정(manual) 인원 확인
            const manualRes = await conn.execute("SELECT COUNT(*) AS CNT FROM KOSHA_APPS WHERE APP_YEAR = :1 AND APP_MONTH = :2 AND STATUS = 'manual'", [year, month]);
            const manualCnt = manualRes.rows[0].CNT || 0;
            const effectiveQuota = Math.max(0, quota - manualCnt);

            // 2. 기존 'selected' 또는 'rejected' 인원을 'pending'으로 초기화 (재추첨 가능하도록)
            await conn.execute("UPDATE KOSHA_APPS SET STATUS = 'pending' WHERE APP_YEAR = :1 AND APP_MONTH = :2 AND (STATUS = 'selected' OR STATUS = 'rejected')", [year, month]);

            if (effectiveQuota > 0) {
                // 3. 대기자 풀 가져오기
                const poolRes = await conn.execute("SELECT APP_ID FROM KOSHA_APPS WHERE APP_YEAR = :1 AND APP_MONTH = :2 AND STATUS = 'pending'", [year, month]);
                const pool = poolRes.rows;
                
                if (pool.length > 0) {
                    // 무작위 셔플
                    for (let i = pool.length - 1; i > 0; i--) {
                        const j = Math.floor(Math.random() * (i + 1));
                        [pool[i], pool[j]] = [pool[j], pool[i]];
                    }
                    
                    const winners = pool.slice(0, effectiveQuota);
                    const losers = pool.slice(effectiveQuota);
                    
                    // 4. 당첨 처리
                    for (const w of winners) {
                        await conn.execute("UPDATE KOSHA_APPS SET STATUS = 'selected' WHERE APP_ID = :1", [w.APP_ID]);
                    }
                    // 5. 낙첨 처리
                    for (const l of losers) {
                        await conn.execute("UPDATE KOSHA_APPS SET STATUS = 'rejected' WHERE APP_ID = :1", [l.APP_ID]);
                    }
                }
            }
        });

        await recalculateFundUsed();
        return res.json({ message: '추첨이 완료되었습니다.' });
    } catch (err) {
        console.error('[API POST /api/apps/lottery] Error:', err);
        return res.status(500).json({ message: '추첨 중 오류 발생' });
    }
});

// 특정 월 신청 상태 초기화 (발전기금 관리용)
app.post('/api/apps/reset', auth, adminOnly, async function(req, res) {
    const month = req.body.month; // undefined이면 전체
    const year = new Date().getFullYear();
    try {
        let sql = "UPDATE KOSHA_APPS SET STATUS = 'pending' WHERE APP_YEAR = :1 AND (STATUS = 'selected' OR STATUS = 'manual')";
        const params = [year];
        if (month) {
            sql += " AND APP_MONTH = :2";
            params.push(month);
        }
        await execute(sql, params);
        await recalculateFundUsed();
        return res.json({ message: '초기화 완료' });
    } catch (err) { return res.status(500).json({ message: '오류' }); }
});

app.post('/api/apps', auth, async function(req, res) {
    const b = req.body;
    const year = new Date().getFullYear();
    try {
        // 이미 해당 월에 신청 내역이 있는지 확인 (cancelled 상태 제외)
        const dupCheck = await execute("SELECT COUNT(*) AS CNT FROM KOSHA_APPS WHERE EMP_ID = :1 AND APP_YEAR = :2 AND APP_MONTH = :3 AND STATUS != 'cancelled'", [req.user.empId, year, b.month]);
        if (dupCheck.rows[0].CNT > 0) {
            return res.status(400).json({ message: '이미 해당 월에 신청 내역이 있습니다.' });
        }

        const appId = generateUUID();
        await execute("INSERT INTO KOSHA_APPS (APP_ID, EMP_ID, APP_YEAR, APP_MONTH, ROOM_TYPE, NIGHTS, TOTAL, SUBSIDY, STATUS, CREATED_AT) VALUES (:1, :2, :3, :4, :5, :6, :7, :8, 'pending', SYSTIMESTAMP)",
            [appId, req.user.empId, year, b.month, b.roomType, b.nights, b.total, b.subsidy]);
        return res.status(201).json({ id: appId });
    } catch (err) { return res.status(500).json({ message: '오류' }); }
});

// 신청 상태 및 정보 변경 (관리자용)
app.put('/api/apps/:id', auth, adminOnly, async function(req, res) {
    const id = req.params.id;
    const b = req.body;
    try {
        // 동적으로 쿼리 생성 (status, subsidy, remarks 중 전달된 것만 업데이트)
        let sql = "UPDATE KOSHA_APPS SET ";
        const sets = [];
        const params = [];

        if (b.status) {
            sets.push("STATUS = :" + (params.length + 1));
            params.push(b.status);
        }
        if (b.subsidy !== undefined) {
            sets.push("SUBSIDY = :" + (params.length + 1));
            params.push(b.subsidy);
        }
        if (b.remarks !== undefined) {
            sets.push("REMARKS = :" + (params.length + 1));
            params.push(b.remarks);
        }

        if (sets.length === 0) return res.status(400).json({ message: '수정할 내용이 없습니다.' });

        sql += sets.join(", ");
        sql += " WHERE APP_ID = :" + (params.length + 1);
        params.push(id);

        const r = await execute(sql, params);
        if (r.rowsAffected === 0) return res.status(404).json({ message: '신청 내역을 찾을 수 없습니다.' });

        await recalculateFundUsed();
        return res.json({ message: '수정 완료' });
    } catch (err) { 
        console.error('[API PUT /api/apps/:id] Error:', err);
        return res.status(500).json({ message: '오류' }); 
    }
});

// 신청 취소 (사용자용)
app.post('/api/apps/:id/cancel', auth, async function(req, res) {
    const id = req.params.id;
    try {
        const result = await execute("SELECT STATUS, EMP_ID, APP_MONTH FROM KOSHA_APPS WHERE APP_ID = :1", [id]);
        const appRecord = result.rows[0];
        if (!appRecord) return res.status(404).json({ message: '내역을 찾을 수 없습니다.' });
        if (appRecord.EMP_ID !== req.user.empId) return res.status(403).json({ message: '권한이 없습니다.' });

        if (appRecord.STATUS === 'pending') {
            // 대기 상태는 즉시 취소
            await execute("UPDATE KOSHA_APPS SET STATUS = 'cancelled' WHERE APP_ID = :1", [id]);
            return res.json({ message: '취소되었습니다.' });
        } else if (appRecord.STATUS === 'selected' || appRecord.STATUS === 'manual') {
            // 당첨 상태는 취소 요청
            await execute("UPDATE KOSHA_APPS SET STATUS = 'cancel_requested', CANCEL_REASON = :1 WHERE APP_ID = :2", [req.body.reason || '사유 미기재', id]);
            return res.json({ message: '취소 요청이 접수되었습니다. 관리자 승인 후 최종 취소됩니다.' });
        } else {
            return res.status(400).json({ message: '취소할 수 없는 상태입니다.' });
        }
    } catch (err) { return res.status(500).json({ message: '오류' }); }
});

// 취소 요청 승인 (관리자용)
app.post('/api/apps/:id/approve-cancel', auth, adminOnly, async function(req, res) {
    const id = req.params.id;
    try {
        const result = await execute("SELECT STATUS, APP_YEAR, APP_MONTH, EMP_ID FROM KOSHA_APPS WHERE APP_ID = :1", [id]);
        const appRecord = result.rows[0];
        if (!appRecord) return res.status(404).json({ message: '내역을 찾을 수 없습니다.' });

        await transaction(async (conn) => {
            await conn.execute("UPDATE KOSHA_APPS SET STATUS = 'cancelled' WHERE APP_ID = :1", [id]);
            
            // 재추첨 로직
            const quotaResult = await conn.execute("SELECT SETTING_VAL FROM KOSHA_SETTINGS WHERE SETTING_KEY = 'settings'");
            const settings = JSON.parse(quotaResult.rows[0].SETTING_VAL);
            const monthQuota = settings.quotas[appRecord.APP_MONTH] || 20;
            
            const currentWinners = await conn.execute("SELECT COUNT(*) AS CNT FROM KOSHA_APPS WHERE APP_YEAR = :1 AND APP_MONTH = :2 AND (STATUS = 'selected' OR STATUS = 'manual')", [appRecord.APP_YEAR, appRecord.APP_MONTH]);
            
            if (currentWinners.rows[0].CNT < monthQuota) {
                // 낙첨자 중 무작위 1명 선발
                const rejectedPool = await conn.execute("SELECT APP_ID, EMP_ID, ROOM_TYPE, NIGHTS FROM KOSHA_APPS WHERE APP_YEAR = :1 AND APP_MONTH = :2 AND STATUS = 'rejected'", [appRecord.APP_YEAR, appRecord.APP_MONTH]);
                if (rejectedPool.rows.length > 0) {
                    const newWinner = rejectedPool.rows[Math.floor(Math.random() * rejectedPool.rows.length)];
                    await conn.execute("UPDATE KOSHA_APPS SET STATUS = 'selected' WHERE APP_ID = :1", [newWinner.APP_ID]);
                    
                    // 메일 발송 (트랜잭션 밖에서 실행 권장이나 편의상 준비)
                    await mailLotteryResult({
                        empId: newWinner.EMP_ID,
                        month: appRecord.APP_MONTH,
                        status: 'selected',
                        roomType: newWinner.ROOM_TYPE,
                        nights: newWinner.NIGHTS
                    });
                }
            }
        });
        
        await recalculateFundUsed();
        return res.json({ message: '취소 승인 및 재추첨 완료' });
    } catch (err) { 
        console.error(err);
        return res.status(500).json({ message: '오류' }); 
    }
});

// ── 라우터: 설정 및 발전기금 ──────────────────────────────────────────────────
app.get('/api/settings', auth, async function(req, res) {
    try {
        const result = await execute("SELECT SETTING_VAL FROM KOSHA_SETTINGS WHERE SETTING_KEY = 'settings'");
        if (result.rows.length === 0) return res.status(404).send();
        const raw = result.rows[0].SETTING_VAL;
        return res.json(JSON.parse(raw));
    } catch (err) {
        console.error('[API /api/settings] Error:', err);
        return res.status(500).send();
    }
});

app.put('/api/settings', auth, adminOnly, async function(req, res) {
    try {
        const json = JSON.stringify(req.body);
        const r = await execute("UPDATE KOSHA_SETTINGS SET SETTING_VAL = :1 WHERE SETTING_KEY = 'settings'", [json]);
        if (r.rowsAffected === 0) {
            await execute("INSERT INTO KOSHA_SETTINGS (SETTING_KEY, SETTING_VAL) VALUES ('settings', :1)", [json]);
        }
        return res.json({ message: '저장 완료' });
    } catch (err) { return res.status(500).json({ message: '오류' }); }
});

app.get('/api/fund', auth, async function(req, res) {
    try {
        const result = await execute("SELECT SETTING_VAL FROM KOSHA_SETTINGS WHERE SETTING_KEY = 'fundUsed'");
        if (result.rows.length === 0) return res.json({ value: 0 });
        const raw = result.rows[0].SETTING_VAL;
        return res.json({ value: parseInt(raw) || 0 });
    } catch (err) {
        console.error('[API /api/fund] Error:', err);
        return res.status(500).send();
    }
});

async function recalculateFundUsed() {
    try {
        const year = new Date().getFullYear();
        const result = await execute("SELECT SUM(SUBSIDY) AS TOTAL FROM KOSHA_APPS WHERE APP_YEAR = :1 AND (STATUS = 'selected' OR STATUS = 'manual')", [year]);
        const total = result.rows[0].TOTAL || 0;
        const r = await execute("UPDATE KOSHA_SETTINGS SET SETTING_VAL = :1 WHERE SETTING_KEY = 'fundUsed'", [String(total)]);
        if (r.rowsAffected === 0) {
            await execute("INSERT INTO KOSHA_SETTINGS (SETTING_KEY, SETTING_VAL) VALUES ('fundUsed', :1)", [String(total)]);
        }
    } catch (err) { console.error("Fund recalculation failed", err); }
}

// ── 서버 시작 ─────────────────────────────────────────────────────────────────
async function start() {
    try {
        await initDB();
        await verifyMailer();
        app.listen(PORT, function() {
            console.log("[SERVER] v10 호환 서버 기동: http://localhost:" + PORT);
        });
    } catch (err) {
        console.error("기동 실패:", err);
    }
}
start();