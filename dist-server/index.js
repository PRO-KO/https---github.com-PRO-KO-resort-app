"use strict";

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
  app.use(cors({
    origin: 'http://localhost:3000'
  }));
}
app.use(express.json({
  limit: '1mb'
}));

// 비밀번호 유틸리티
const pbkdf2Async = util.promisify(crypto.pbkdf2);
const generateSalt = function () {
  return crypto.randomBytes(16).toString('hex');
};
const hashPwd = async function (password, salt) {
  const buf = await pbkdf2Async(password, Buffer.from(salt, 'hex'), 100000,
  // _ 제거
  32, 'sha256');
  return buf.toString('hex');
};
const verifyPwd = async function (password, storedHash, storedSalt) {
  if (!storedSalt) return storedHash === legacyHash(password);
  const hash = await hashPwd(password, storedSalt);
  try {
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(storedHash, 'hex'));
  } catch (e) {
    return false;
  }
};
const legacyHash = function (s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = Math.imul(31, h) + s.charCodeAt(i) | 0;
  return h.toString(16);
};
const secureTextEqual = function (a, b) {
  const strA = a || '';
  const strB = b || '';
  const left = Buffer.from(String(strA));
  const right = Buffer.from(String(strB));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
};
const loginLocks = new Map();
const lockKey = function (scope, id, ip) {
  return scope + ":" + String(id || '').toUpperCase() + ":" + (ip || '');
};
const getLock = function (key) {
  const lock = loginLocks.get(key);
  if (!lock) return {
    locked: false
  };
  if (Date.now() > lock.until) {
    loginLocks.delete(key);
    return {
      locked: false
    };
  }
  return {
    locked: true,
    remainMin: Math.ceil((lock.until - Date.now()) / 60000)
  };
};
const recordLoginFail = function (key) {
  const cur = loginLocks.get(key) || {
    attempts: 0,
    until: 0
  };
  const attempts = cur.attempts + 1;
  const next = {
    attempts: attempts,
    until: attempts >= 5 ? Date.now() + 15 * 60 * 1000 : cur.until
  };
  loginLocks.set(key, next);
  return {
    locked: attempts >= 5,
    remain: Math.max(0, 5 - attempts)
  };
};

// JWT 인증 미들웨어 (?. 제거)
const auth = function (req, res, next) {
  const header = req.headers['authorization'];
  if (!header || header.indexOf('Bearer ') !== 0) {
    return res.status(401).json({
      message: '인증 토큰이 없습니다.'
    });
  }
  const token = header.slice(7);
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({
      message: '토큰이 만료되었거나 유효하지 않습니다.'
    });
  }
};
const adminOnly = function (req, res, next) {
  if (!req.user || !req.user.isAdmin) {
    return res.status(403).json({
      message: '관리자 권한이 필요합니다.'
    });
  }
  next();
};

// 라우터 - 로그인
app.post('/api/auth/login', async function (req, res) {
  const empId = req.body.empId;
  const password = req.body.password;
  if (!empId || !password) return res.status(400).json({
    message: '사번과 비밀번호를 입력해주세요.'
  });
  const id = empId.trim().toUpperCase();
  const lk = lockKey('user', id, req.ip);
  const lock = getLock(lk);
  if (lock.locked) return res.status(429).json({
    message: '로그인 시도 초과. ' + lock.remainMin + '분 후 다시 시도해주세요.'
  });
  try {
    const result = await execute("SELECT EMP_ID, PW_HASH, PW_SALT, STATUS FROM KOSHA_EMPLOYEES WHERE EMP_ID = :1", [id]);
    const emp = result.rows[0];
    if (!emp || emp.STATUS === 'rejected') {
      recordLoginFail(lk);
      return res.status(401).json({
        message: '사번 또는 비밀번호가 올바르지 않습니다.'
      });
    }
    if (emp.STATUS === 'pending') return res.status(403).json({
      message: '관리자 승인 대기 중입니다.'
    });
    const ok = await verifyPwd(password, emp.PW_HASH, emp.PW_SALT);
    if (!ok) {
      recordLoginFail(lk);
      return res.status(401).json({
        message: '사번 또는 비밀번호가 올바르지 않습니다.'
      });
    }
    loginLocks.delete(lk);
    const token = jwt.sign({
      empId: emp.EMP_ID,
      isAdmin: false
    }, JWT_SECRET, {
      expiresIn: JWT_EXPIRES
    });
    return res.json({
      token: token,
      empId: emp.EMP_ID
    });
  } catch (err) {
    return res.status(500).json({
      message: '서버 오류'
    });
  }
});

// 관리자 로그인
app.post('/api/auth/admin-login', function (req, res) {
  const password = req.body.password;
  const lk = lockKey('admin', 'admin', req.ip);
  const lock = getLock(lk);
  if (lock.locked) return res.status(429).json({
    message: '시도 횟수 초과.'
  });
  if (!ADMIN_PW || !secureTextEqual(password, ADMIN_PW)) {
    recordLoginFail(lk);
    return res.status(401).json({
      message: '비밀번호가 올바르지 않습니다.'
    });
  }
  loginLocks.delete(lk);
  const token = jwt.sign({
    isAdmin: true
  }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES
  });
  return res.json({
    token: token
  });
});
app.post('/api/auth/refresh', auth, function (req, res) {
  const token = jwt.sign({
    empId: req.user.empId,
    isAdmin: req.user.isAdmin
  }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES
  });
  return res.json({
    token: token
  });
});

// 직원 관리
app.get('/api/employees', auth, adminOnly, async function (req, res) {
  const status = req.query.status;
  try {
    const sql = "SELECT EMP_ID, STATUS, ORGANIZATION, DEPARTMENT, PHONE, TO_CHAR(CREATED_AT, 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"') AS CREATED_AT FROM KOSHA_EMPLOYEES " + (status ? "WHERE STATUS = :1" : "") + " ORDER BY CREATED_AT DESC";
    const result = await execute(sql, status ? [status] : []);
    const map = {};
    result.rows.forEach(function (row) {
      map[row.EMP_ID] = {
        empId: row.EMP_ID,
        status: row.STATUS,
        organization: row.ORGANIZATION,
        department: row.DEPARTMENT,
        phone: row.PHONE,
        createdAt: row.CREATED_AT
      };
    });
    return res.json(map);
  } catch (err) {
    return res.status(500).json({
      message: '오류'
    });
  }
});
app.post('/api/employees/register', async function (req, res) {
  const b = req.body;
  const salt = generateSalt();
  const hash = await hashPwd(b.password, salt);
  try {
    await execute("INSERT INTO KOSHA_EMPLOYEES (EMP_ID, PW_HASH, PW_SALT, STATUS, ORGANIZATION, DEPARTMENT, PHONE, CREATED_AT) VALUES (:1, :2, :3, 'pending', :4, :5, :6, SYSTIMESTAMP)", [b.empId, hash, salt, b.organization, b.department, b.phone]);
    return res.status(201).json({
      message: '신청 완료'
    });
  } catch (err) {
    return res.status(500).json({
      message: '이미 존재하는 사번이거나 오류입니다.'
    });
  }
});

// 신청 관리
app.get('/api/apps', auth, async function (req, res) {
  try {
    const sql = "SELECT APP_ID, EMP_ID, APP_YEAR, APP_MONTH, ROOM_TYPE, NIGHTS, TOTAL, SUBSIDY, STATUS, TO_CHAR(CREATED_AT, 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"') AS CREATED_AT FROM KOSHA_APPS " + (req.user.isAdmin ? "" : "WHERE EMP_ID = :1") + " ORDER BY CREATED_AT DESC";
    const result = await execute(sql, req.user.isAdmin ? [] : [req.user.empId]);
    return res.json(result.rows.map(function (r) {
      return {
        id: r.APP_ID,
        empId: r.EMP_ID,
        year: r.APP_YEAR,
        month: r.APP_MONTH,
        roomType: r.ROOM_TYPE,
        nights: r.NIGHTS,
        total: r.TOTAL,
        subsidy: r.SUBSIDY,
        status: r.STATUS,
        createdAt: r.CREATED_AT
      };
    }));
  } catch (err) {
    return res.status(500).json({
      message: '오류'
    });
  }
});
app.post('/api/apps', auth, async function (req, res) {
  const b = req.body;
  const appId = generateUUID(); // v10 호환 UUID
  try {
    await execute("INSERT INTO KOSHA_APPS (APP_ID, EMP_ID, APP_YEAR, APP_MONTH, ROOM_TYPE, NIGHTS, TOTAL, SUBSIDY, STATUS, CREATED_AT) VALUES (:1, :2, :3, :4, :5, :6, :7, :8, 'pending', SYSTIMESTAMP)", [appId, req.user.empId, new Date().getFullYear(), b.month, b.roomType, b.nights, b.total, b.subsidy]);
    return res.status(201).json({
      id: appId
    });
  } catch (err) {
    return res.status(500).json({
      message: '오류'
    });
  }
});

// 설정 및 기타 라우터 (생략된 부분도 동일한 방식으로 require/function/&& 사용)
app.get('/api/settings', auth, async function (req, res) {
  try {
    const result = await execute("SELECT SETTING_VAL FROM KOSHA_SETTINGS WHERE SETTING_KEY = 'settings'");
    if (result.rows.length === 0) return res.status(404).send();
    const raw = typeof result.rows[0].SETTING_VAL === 'string' ? result.rows[0].SETTING_VAL : await result.rows[0].SETTING_VAL.getData();
    return res.json(JSON.parse(raw));
  } catch (err) {
    return res.status(500).send();
  }
});

// 서버 시작
async function start() {
  try {
    await initDB();
    await verifyMailer();
    app.listen(PORT, function () {
      console.log("[SERVER] v10 호환 서버 기동: http://localhost:" + PORT);
    });
  } catch (err) {
    console.error("기동 실패:", err);
  }
}
start();