"use strict";

/**
 * dist-server/index.js — Express REST API (Node.js v10.x 호환)
 *
 * 실행 위치와 무관하게 동작하도록 모든 경로는 __dirname 기준으로 처리합니다.
 */

// ── 기본 내장 모듈 (require 실패 없음) ────────────────────────────────────────
var crypto = require('crypto');
var util   = require('util');
var path   = require('path');

// ── dotenv: 실행 위치와 무관하게 프로젝트 루트의 .env 를 로드 ─────────────────
// __dirname = dist-server/, 따라서 ../ 가 프로젝트 루트
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// ── 외부 패키지 ───────────────────────────────────────────────────────────────
var express = require('express');
var helmet  = require('helmet');
var cors    = require('cors');
var jwt     = require('jsonwebtoken');

// ── 로컬 모듈 (dist-server/ 디렉터리 기준 절대 경로) ─────────────────────────
var db              = require(path.join(__dirname, 'db.js'));
var initDB          = db.initDB;
var execute         = db.execute;
var transaction     = db.transaction;

var mailer          = require(path.join(__dirname, 'mailer.js'));
var mailLotteryResult = mailer.mailLotteryResult;
var internalEmailFor  = mailer.internalEmailFor;
var verifyMailer      = mailer.verifyMailer;

// ── DB 연결 변수 검증 (기동 전 조기 경고) ─────────────────────────────────────
(function validateDBConfig() {
  var missing = [];
  if (!process.env.DB_HOST)         missing.push('DB_HOST');
  if (!process.env.DB_PORT)         missing.push('DB_PORT');
  if (!process.env.DB_SERVICE_NAME && !process.env.DB_NAME) missing.push('DB_SERVICE_NAME');
  if (!process.env.DB_USER)         missing.push('DB_USER');
  if (!process.env.DB_PASS && !process.env.DB_PASSWORD) missing.push('DB_PASS');

  if (missing.length > 0) {
    console.warn('[WARN] .env 에 다음 DB 환경 변수가 설정되지 않았습니다: ' + missing.join(', '));
    console.warn('       .env 파일 경로: ' + path.resolve(__dirname, '../.env'));
  }

  var svcName = process.env.DB_SERVICE_NAME || process.env.DB_NAME || '(미설정)';
  console.log('[CONFIG] Oracle 연결 대상: ' +
    (process.env.DB_HOST || '?') + ':' +
    (process.env.DB_PORT || '?') + '/' + svcName);
})();

// ── 앱 설정 ───────────────────────────────────────────────────────────────────
var app        = express();
var PORT       = process.env.PORT       || 4000;
var JWT_SECRET = process.env.JWT_SECRET || 'CHANGE_ME_TO_RANDOM_64_CHARS';
var ADMIN_PW   = process.env.ADMIN_PW   || '';

if (process.env.NODE_ENV === 'production') {
  if (!process.env.JWT_SECRET || JWT_SECRET === 'CHANGE_ME_TO_RANDOM_64_CHARS' || JWT_SECRET.length < 32) {
    throw new Error('운영 환경에서는 32자 이상의 JWT_SECRET 환경변수를 설정해야 합니다.');
  }
  if (!ADMIN_PW || ADMIN_PW.length < 8) {
    throw new Error('운영 환경에서는 8자 이상의 ADMIN_PW 환경변수를 설정해야 합니다.');
  }
}

var JWT_EXPIRES = '30m';

app.use(helmet());
if (process.env.NODE_ENV !== 'production') {
  app.use(cors({ origin: 'http://localhost:3000' }));
}
app.use(express.json({ limit: '1mb' }));

// ── 비밀번호 유틸리티 ─────────────────────────────────────────────────────────
var pbkdf2Async = util.promisify(crypto.pbkdf2);

var generateSalt = function () {
  return crypto.randomBytes(16).toString('hex');
};

var hashPwd = async function (password, salt) {
  var buf = await pbkdf2Async(
    password,
    Buffer.from(salt, 'hex'),
    100000,
    32,
    'sha256'
  );
  return buf.toString('hex');
};

var verifyPwd = async function (password, storedHash, storedSalt) {
  if (!storedSalt) return storedHash === legacyHash(password);
  var hash = await hashPwd(password, storedSalt);
  try {
    return crypto.timingSafeEqual(
      Buffer.from(hash,       'hex'),
      Buffer.from(storedHash, 'hex')
    );
  } catch (e) {
    return false;
  }
};

var legacyHash = function (s) {
  var h = 0;
  for (var i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return h.toString(16);
};

var secureTextEqual = function (a, b) {
  var left  = Buffer.from(String(a || ''));
  var right = Buffer.from(String(b || ''));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
};

// ── v10용 UUID 생성 (crypto.randomUUID 는 v14.17+ 전용) ──────────────────────
function generateUUID() {
  return crypto.randomBytes(16).toString('hex')
    .replace(/^(........)(....)(....)(....)(............)$/, '$1-$2-$3-$4-$5');
}

// ── 브루트포스 방어 ───────────────────────────────────────────────────────────
var loginLocks = new Map();

var lockKey = function (scope, id, ip) {
  return scope + ':' + String(id || '').toUpperCase() + ':' + (ip || '');
};

var getLock = function (key) {
  var lock = loginLocks.get(key);
  if (!lock) return { locked: false };
  if (Date.now() > lock.until) { loginLocks.delete(key); return { locked: false }; }
  return { locked: true, remainMin: Math.ceil((lock.until - Date.now()) / 60000) };
};

var recordLoginFail = function (key) {
  var cur      = loginLocks.get(key) || { attempts: 0, until: 0 };
  var attempts = cur.attempts + 1;
  loginLocks.set(key, {
    attempts: attempts,
    until: attempts >= 5 ? Date.now() + 15 * 60 * 1000 : cur.until
  });
  return { locked: attempts >= 5, remain: Math.max(0, 5 - attempts) };
};

// ── JWT 미들웨어 ──────────────────────────────────────────────────────────────
var auth = function (req, res, next) {
  var header = req.headers['authorization'];
  if (!header || header.indexOf('Bearer ') !== 0) {
    return res.status(401).json({ message: '인증 토큰이 없습니다.' });
  }
  try {
    req.user = jwt.verify(header.slice(7), JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ message: '토큰이 만료되었거나 유효하지 않습니다.' });
  }
};

var adminOnly = function (req, res, next) {
  if (!req.user || !req.user.isAdmin) {
    return res.status(403).json({ message: '관리자 권한이 필요합니다.' });
  }
  next();
};

// ── 라우터: 인증 ──────────────────────────────────────────────────────────────
app.post('/api/auth/login', async function (req, res) {
  var empId    = req.body.empId;
  var password = req.body.password;
  if (!empId || !password) {
    return res.status(400).json({ message: '사번과 비밀번호를 입력해주세요.' });
  }
  var id   = empId.trim().toUpperCase();
  var lk   = lockKey('user', id, req.ip);
  var lock = getLock(lk);
  if (lock.locked) {
    return res.status(429).json({ message: '로그인 시도 초과. ' + lock.remainMin + '분 후 다시 시도해주세요.' });
  }
  try {
    var result = await execute(
      'SELECT EMP_ID, PW_HASH, PW_SALT, STATUS FROM KOSHA_EMPLOYEES WHERE EMP_ID = :1', [id]
    );
    var emp = result.rows[0];
    if (!emp || emp.STATUS === 'rejected') {
      recordLoginFail(lk);
      return res.status(401).json({ message: '사번 또는 비밀번호가 올바르지 않습니다.' });
    }
    if (emp.STATUS === 'pending') {
      return res.status(403).json({ message: '관리자 승인 대기 중입니다.' });
    }
    var ok = await verifyPwd(password, emp.PW_HASH, emp.PW_SALT);
    if (!ok) {
      recordLoginFail(lk);
      return res.status(401).json({ message: '사번 또는 비밀번호가 올바르지 않습니다.' });
    }
    loginLocks.delete(lk);
    var token = jwt.sign({ empId: emp.EMP_ID, isAdmin: false }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
    return res.json({ token: token, empId: emp.EMP_ID });
  } catch (err) {
    console.error('[POST /api/auth/login]', err.message);
    return res.status(500).json({ message: '서버 오류' });
  }
});

app.post('/api/auth/admin-login', function (req, res) {
  var password = req.body.password;
  var lk       = lockKey('admin', 'admin', req.ip);
  var lock     = getLock(lk);
  if (lock.locked) {
    return res.status(429).json({ message: '시도 횟수 초과. ' + lock.remainMin + '분 후 다시 시도해주세요.' });
  }
  if (!ADMIN_PW || !secureTextEqual(password, ADMIN_PW)) {
    recordLoginFail(lk);
    return res.status(401).json({ message: '비밀번호가 올바르지 않습니다.' });
  }
  loginLocks.delete(lk);
  var token = jwt.sign({ isAdmin: true }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
  return res.json({ token: token });
});

app.post('/api/auth/refresh', auth, function (req, res) {
  var token = jwt.sign(
    { empId: req.user.empId, isAdmin: req.user.isAdmin },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );
  return res.json({ token: token });
});

// ── 라우터: 직원 관리 ─────────────────────────────────────────────────────────
app.get('/api/employees', auth, adminOnly, async function (req, res) {
  var status = req.query.status;
  try {
    var sql = 'SELECT EMP_ID, STATUS, ORGANIZATION, DEPARTMENT, PHONE,' +
              " TO_CHAR(CREATED_AT, 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"') AS CREATED_AT" +
              ' FROM KOSHA_EMPLOYEES' +
              (status ? ' WHERE STATUS = :1' : '') +
              ' ORDER BY CASE STATUS WHEN \'pending\' THEN 0 WHEN \'approved\' THEN 1 ELSE 2 END, CREATED_AT DESC';
    var result = await execute(sql, status ? [status] : []);
    var map = {};
    result.rows.forEach(function (row) {
      map[row.EMP_ID] = {
        empId:        row.EMP_ID,
        status:       row.STATUS,
        organization: row.ORGANIZATION,
        department:   row.DEPARTMENT,
        phone:        row.PHONE,
        createdAt:    row.CREATED_AT
      };
    });
    return res.json(map);
  } catch (err) {
    console.error('[GET /api/employees]', err.message);
    return res.status(500).json({ message: '서버 오류' });
  }
});

app.post('/api/employees/register', async function (req, res) {
  var b    = req.body;
  var salt = generateSalt();
  try {
    var hash = await hashPwd(b.password, salt);
    await execute(
      "INSERT INTO KOSHA_EMPLOYEES (EMP_ID, PW_HASH, PW_SALT, STATUS, ORGANIZATION, DEPARTMENT, PHONE, CREATED_AT)" +
      " VALUES (:1, :2, :3, 'pending', :4, :5, :6, SYSTIMESTAMP)",
      [b.empId, hash, salt, b.organization || null, b.department || null, b.phone || null]
    );
    return res.status(201).json({ message: '가입 신청이 완료되었습니다.' });
  } catch (err) {
    console.error('[POST /api/employees/register]', err.message);
    return res.status(500).json({ message: '이미 존재하는 사번이거나 서버 오류입니다.' });
  }
});

app.put('/api/employees/:empId', auth, adminOnly, async function (req, res) {
  var empId  = req.params.empId;
  var status = req.body.status;
  try {
    var approvedAt = status === 'approved' ? 'SYSTIMESTAMP' : 'NULL';
    await execute(
      'UPDATE KOSHA_EMPLOYEES SET STATUS = :1, APPROVED_AT = ' + approvedAt + ' WHERE EMP_ID = :2',
      [status, empId]
    );
    return res.json({ message: '상태 변경 완료' });
  } catch (err) {
    console.error('[PUT /api/employees/:empId]', err.message);
    return res.status(500).json({ message: '서버 오류' });
  }
});

// ── 라우터: 신청 관리 ─────────────────────────────────────────────────────────
var MAX_NIGHTS = 2;

app.get('/api/apps', auth, async function (req, res) {
  try {
    var sql = 'SELECT APP_ID, EMP_ID, APP_YEAR, APP_MONTH, ROOM_TYPE, NIGHTS, TOTAL, SUBSIDY, STATUS,' +
              " TO_CHAR(CREATED_AT, 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"') AS CREATED_AT" +
              ' FROM KOSHA_APPS' +
              (req.user.isAdmin ? '' : ' WHERE EMP_ID = :1') +
              ' ORDER BY CREATED_AT DESC';
    var result = await execute(sql, req.user.isAdmin ? [] : [req.user.empId]);
    return res.json(result.rows.map(function (r) {
      return {
        id:        r.APP_ID,
        empId:     r.EMP_ID,
        year:      r.APP_YEAR,
        month:     r.APP_MONTH,
        roomType:  r.ROOM_TYPE,
        nights:    r.NIGHTS,
        total:     r.TOTAL,
        subsidy:   r.SUBSIDY,
        status:    r.STATUS,
        createdAt: r.CREATED_AT
      };
    }));
  } catch (err) {
    console.error('[GET /api/apps]', err.message);
    return res.status(500).json({ message: '서버 오류' });
  }
});

app.post('/api/apps', auth, async function (req, res) {
  var b            = req.body;
  var parsedMonth  = parseInt(b.month, 10);
  var parsedNights = parseInt(b.nights, 10);

  if (!parsedMonth || parsedMonth < 1 || parsedMonth > 12) {
    return res.status(400).json({ message: '올바른 신청 월을 입력해주세요.' });
  }
  if (!parsedNights || parsedNights < 1) {
    return res.status(400).json({ message: '숙박 일수는 1박 이상이어야 합니다.' });
  }
  if (parsedNights > MAX_NIGHTS) {
    return res.status(400).json({ message: '최대 ' + MAX_NIGHTS + '박까지만 신청 가능합니다.' });
  }
  if (!b.roomType) {
    return res.status(400).json({ message: '객실 타입을 선택해주세요.' });
  }

  var appId = generateUUID();
  try {
    await execute(
      'INSERT INTO KOSHA_APPS (APP_ID, EMP_ID, APP_YEAR, APP_MONTH, ROOM_TYPE, NIGHTS, TOTAL, SUBSIDY, STATUS, CREATED_AT)' +
      " VALUES (:1, :2, :3, :4, :5, :6, :7, :8, 'pending', SYSTIMESTAMP)",
      [appId, req.user.empId, new Date().getFullYear(), parsedMonth, b.roomType, parsedNights, b.total || 0, b.subsidy || 0]
    );
    return res.status(201).json({ id: appId, message: '신청 완료' });
  } catch (err) {
    console.error('[POST /api/apps]', err.message);
    return res.status(500).json({ message: '서버 오류' });
  }
});

app.patch('/api/apps/:id/cancel', auth, async function (req, res) {
  var id      = req.params.id;
  var empId   = req.user.empId;
  var isAdmin = req.user.isAdmin;
  try {
    var sql   = isAdmin
      ? "UPDATE KOSHA_APPS SET STATUS = 'cancelled' WHERE APP_ID = :1"
      : "UPDATE KOSHA_APPS SET STATUS = 'cancelled' WHERE APP_ID = :1 AND EMP_ID = :2 AND STATUS = 'pending'";
    var binds = isAdmin ? [id] : [id, empId];
    var r     = await execute(sql, binds);
    if (!isAdmin && r.rowsAffected === 0) {
      return res.status(404).json({ message: '취소할 수 있는 신청이 없습니다.' });
    }
    return res.json({ message: '신청이 취소되었습니다.' });
  } catch (err) {
    console.error('[PATCH /api/apps/:id/cancel]', err.message);
    return res.status(500).json({ message: '서버 오류' });
  }
});

// ── 라우터: 설정 ──────────────────────────────────────────────────────────────
app.get('/api/settings', auth, async function (req, res) {
  try {
    var result = await execute("SELECT SETTING_VAL FROM KOSHA_SETTINGS WHERE SETTING_KEY = 'settings'");
    if (result.rows.length === 0) return res.status(404).send();
    var val = result.rows[0].SETTING_VAL;
    var raw = (typeof val === 'string') ? val : await val.getData();
    return res.json(JSON.parse(raw));
  } catch (err) {
    console.error('[GET /api/settings]', err.message);
    return res.status(500).send();
  }
});

app.put('/api/settings', auth, adminOnly, async function (req, res) {
  try {
    var json = JSON.stringify(req.body);
    var r    = await execute(
      "UPDATE KOSHA_SETTINGS SET SETTING_VAL = :1 WHERE SETTING_KEY = 'settings'",
      [json]
    );
    if (r.rowsAffected === 0) {
      await execute(
        "INSERT INTO KOSHA_SETTINGS (SETTING_KEY, SETTING_VAL) VALUES ('settings', :1)",
        [json]
      );
    }
    return res.json({ message: '설정 저장 완료' });
  } catch (err) {
    console.error('[PUT /api/settings]', err.message);
    return res.status(500).json({ message: '서버 오류' });
  }
});

// ── 서버 기동 ─────────────────────────────────────────────────────────────────
async function start() {
  try {
    await initDB();
    await verifyMailer();
    app.listen(PORT, function () {
      console.log('[SERVER] 기동 완료: http://localhost:' + PORT);
    });
  } catch (err) {
    console.error('[SERVER] 기동 실패:', err.message || err);
    console.error('[SERVER] 스택:', err.stack || '(스택 없음)');
    process.exit(1);
  }
}

start();
