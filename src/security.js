/**
 * security.js — 시큐어 코딩 유틸리티
 *
 * 폐쇄망 환경(HTTP 등 non-secure context) 및 구형 브라우저에서도 동작하도록
 * Web Crypto API가 없을 경우 순수 JS Fallback을 제공합니다.
 */

// ── 1. 패스워드 해싱 (PBKDF2-SHA256) ─────────────────────────────────────────

const PBKDF2_ITER  = 100_000   // OWASP 권장 최솟값
const HASH_BITS    = 256
const SALT_BYTES   = 16

const hexToU8 = function(h) {
  var matches = h.match(/.{2}/g);
  if (!matches) return new Uint8Array(0);
  return new Uint8Array(matches.map(function(b) { return parseInt(b, 16); }));
};
const u8ToHex = function(u) {
  return Array.prototype.map.call(u, function(b) { return b.toString(16).padStart(2, '0'); }).join('');
};

/** 
 * 암호학적으로 안전한 난수 솔트 생성
 */
export const generateSalt = function() {
  var out = new Uint8Array(SALT_BYTES);
  var cryptoObj = typeof window !== 'undefined' ? (window.crypto || window.msCrypto) : null;
  
  if (cryptoObj && cryptoObj.getRandomValues) {
    cryptoObj.getRandomValues(out);
  } else {
    // Fallback: Math.random (폐쇄망 환경 호환성 최우선)
    var seed = Date.now() ^ Math.floor(Math.random() * 0xffffffff);
    for (var i = 0; i < out.length; i++) {
      seed = (Math.imul(1664525, seed) + 1013904223) | 0;
      out[i] = (seed >>> ((i % 4) * 8)) & 0xff;
    }
  }
  return u8ToHex(out);
};

const utf8ToU8 = function(s) {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s);
  var bytes = [];
  for (var i = 0; i < s.length; i++) {
    var cp = s.codePointAt(i);
    if (cp > 0xffff) i++;
    if (cp <= 0x7f) bytes.push(cp);
    else if (cp <= 0x7ff) bytes.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
    else if (cp <= 0xffff) bytes.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    else bytes.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
  }
  return new Uint8Array(bytes);
};

const concatU8 = function() {
  var chunks = arguments;
  var len = 0;
  for (var i = 0; i < chunks.length; i++) len += (chunks[i] ? chunks[i].length : 0);
  var out = new Uint8Array(len);
  var off = 0;
  for (var i = 0; i < chunks.length; i++) {
    if (chunks[i]) { out.set(chunks[i], off); off += chunks[i].length; }
  }
  return out;
};

const SHA256_K = new Uint32Array([
  0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
  0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
  0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
  0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
  0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
  0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
  0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
  0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2,
]);

const rotr = function(x, n) { return (x >>> n) | (x << (32 - n)); };

const sha256 = function(bytes) {
  var bitLenHi = Math.floor(bytes.length / 0x20000000);
  var bitLenLo = (bytes.length << 3) >>> 0;
  var paddedLen = Math.ceil((bytes.length + 9) / 64) * 64;
  var msg = new Uint8Array(paddedLen);
  msg.set(bytes);
  msg[bytes.length] = 0x80;
  msg[paddedLen - 8] = (bitLenHi >>> 24) & 0xff;
  msg[paddedLen - 7] = (bitLenHi >>> 16) & 0xff;
  msg[paddedLen - 6] = (bitLenHi >>> 8) & 0xff;
  msg[paddedLen - 5] = bitLenHi & 0xff;
  msg[paddedLen - 4] = (bitLenLo >>> 24) & 0xff;
  msg[paddedLen - 3] = (bitLenLo >>> 16) & 0xff;
  msg[paddedLen - 2] = (bitLenLo >>> 8) & 0xff;
  msg[paddedLen - 1] = bitLenLo & 0xff;

  var h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  var h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
  var w = new Uint32Array(64);

  for (var i = 0; i < msg.length; i += 64) {
    for (var t = 0; t < 16; t++) {
      var j = i + t * 4;
      w[t] = ((msg[j] << 24) | (msg[j + 1] << 16) | (msg[j + 2] << 8) | msg[j + 3]) >>> 0;
    }
    for (var t = 16; t < 64; t++) {
      var s0 = (rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3)) >>> 0;
      var s1 = (rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10)) >>> 0;
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0;
    }
    var a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (var t = 0; t < 64; t++) {
      var s1_e = (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) >>> 0;
      var ch = ((e & f) ^ (~e & g)) >>> 0;
      var temp1 = (h + s1_e + ch + SHA256_K[t] + w[t]) >>> 0;
      var s0_a = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) >>> 0;
      var maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      var temp2 = (s0_a + maj) >>> 0;
      h = g; g = f; f = e; e = (d + temp1) >>> 0;
      d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
  }
  var out = new Uint8Array(32);
  var hs = [h0,h1,h2,h3,h4,h5,h6,h7];
  for (var i = 0; i < 8; i++) {
    out[i * 4] = (hs[i] >>> 24) & 0xff;
    out[i * 4 + 1] = (hs[i] >>> 16) & 0xff;
    out[i * 4 + 2] = (hs[i] >>> 8) & 0xff;
    out[i * 4 + 3] = hs[i] & 0xff;
  }
  return out;
};

const hmacSha256 = function(key, msg) {
  var k = key.length > 64 ? sha256(key) : key;
  var block = new Uint8Array(64);
  block.set(k);
  var oKey = new Uint8Array(64), iKey = new Uint8Array(64);
  for (var i = 0; i < 64; i++) {
    oKey[i] = block[i] ^ 0x5c; iKey[i] = block[i] ^ 0x36;
  }
  return sha256(concatU8(oKey, sha256(concatU8(iKey, msg))));
};

const pbkdf2Sha256Fallback = async function(password, salt) {
  var pw = utf8ToU8(password);
  var blockIndex = new Uint8Array([0, 0, 0, 1]);
  var u = hmacSha256(pw, concatU8(salt, blockIndex));
  var t = new Uint8Array(u);
  for (var i = 2; i <= PBKDF2_ITER; i++) {
    u = hmacSha256(pw, u);
    for (var j = 0; j < t.length; j++) t[j] ^= u[j];
    if (i % 2000 === 0) await new Promise(function(r) { setTimeout(r, 0); });
  }
  return t;
};

export const hashPwd = async function(password, salt) {
  var saltBytes = hexToU8(salt);
  try {
    var cryptoObj = typeof window !== 'undefined' ? (window.crypto || window.msCrypto) : null;
    var subtle = cryptoObj ? (cryptoObj.subtle || cryptoObj.webkitSubtle) : null;
    if (subtle && typeof TextEncoder !== 'undefined') {
      var enc = new TextEncoder();
      var key = await subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
      var bits = await subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: saltBytes, iterations: PBKDF2_ITER }, key, HASH_BITS);
      return u8ToHex(new Uint8Array(bits));
    }
  } catch (e) {
    console.warn('[Security] Web Crypto failed, falling back to JS:', e.message);
  }
  return u8ToHex(await pbkdf2Sha256Fallback(password, saltBytes));
};

const timingSafeEqual = function(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

export const secureTextEqual = function(a, b) { return timingSafeEqual(String(a || ''), String(b || '')); };

export const verifyPwd = async function(password, storedHash, storedSalt) {
  var hash = await hashPwd(password, storedSalt);
  return timingSafeEqual(hash, storedHash);
};

const _legacyHash = function(s) {
  var h = 0;
  for (var i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h.toString(16);
};

export const verifyPwdCompat = async function(password, emp) {
  if (emp.pwSalt) return verifyPwd(password, emp.pwHash, emp.pwSalt);
  return timingSafeEqual(_legacyHash(password), emp.pwHash);
};

export const needsUpgrade = function(emp) { return !emp.pwSalt; };

export const validate = {
  empId:    function(v) { return /^[A-Za-z0-9\-_]{1,30}$/.test((v || '').trim()); },
  password: function(v) { return typeof v === 'string' && v.length >= 4 && v.length <= 128; },
  phone:    function(v) { return /^[0-9\-\+\s]{7,20}$/.test((v || '').trim()); },
  text50:   function(v) { return typeof v === 'string' && v.trim().length >= 1 && v.trim().length <= 50; },
  text100:  function(v) { return typeof v === 'string' && v.trim().length <= 100; },
};

var HTML_ESCAPES = { '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#x27;', '&':'&amp;' };
var escapeHtml = function(s) { return String(s || '').replace(/[<>"'&]/g, function(c) { return HTML_ESCAPES[c]; }); };

export const sanitize = {
  empId: function(v) { return escapeHtml(String(v || '').trim().slice(0, 30).replace(/[^A-Za-z0-9\-_]/g, '')); },
  text:  function(v) { return escapeHtml(String(v || '').trim().slice(0, 100)); },
  phone: function(v) { return String(v || '').trim().slice(0, 20).replace(/[^0-9\-\+\s]/g, ''); },
};

export const normalizeEmpId = function(v) { return sanitize.empId(v).toUpperCase(); };

export const getRuntimeCompatibility = function() {
  var issues = [];
  try { localStorage.setItem('__t__', '1'); localStorage.removeItem('__t__'); } catch(e) { issues.push('localStorage 지원 안함'); }
  return { ok: issues.length === 0, issues: issues };
};

export const MAX_ATTEMPTS = 5;
var LOCKOUT_MS = 15 * 60 * 1000;
var _lockKey = function(id) { return '_llk_' + btoa(id).replace(/=/g, ''); };
var memoryLocks = new Map();

export const checkLock = function(id) {
  var k = _lockKey(id);
  try {
    var raw = localStorage.getItem(k) || memoryLocks.get(k);
    if (!raw) return { locked: false };
    var d = JSON.parse(raw);
    if (Date.now() > d.until) { localStorage.removeItem(k); memoryLocks.delete(k); return { locked: false }; }
    return { locked: true, remainMin: Math.ceil((d.until - Date.now()) / 60000) };
  } catch(e) { return { locked: false }; }
};

export const recordFail = function(id) {
  var k = _lockKey(id);
  try {
    var raw = localStorage.getItem(k) || memoryLocks.get(k);
    var d = raw ? JSON.parse(raw) : { attempts: 0, until: 0 };
    d.attempts += 1;
    if (d.attempts >= MAX_ATTEMPTS) d.until = Date.now() + LOCKOUT_MS;
    var next = JSON.stringify(d);
    localStorage.setItem(k, next); memoryLocks.set(k, next);
    return { attempts: d.attempts, max: MAX_ATTEMPTS, locked: d.attempts >= MAX_ATTEMPTS };
  } catch(e) { return { attempts: 1, max: MAX_ATTEMPTS, locked: false }; }
};

export const clearLock = function(id) {
  var k = _lockKey(id); memoryLocks.delete(k);
  try { localStorage.removeItem(k); } catch(e) {}
};

var SESSION_KEY = '_sess_ts';
export const SESSION_MS = 30 * 60 * 1000;
var memorySessionTs = '';

export const touchSession = function() {
  memorySessionTs = String(Date.now());
  try { sessionStorage.setItem(SESSION_KEY, memorySessionTs); } catch(e) {}
};

export const isSessionValid = function() {
  try {
    var t = sessionStorage.getItem(SESSION_KEY) || memorySessionTs;
    return !!t && (Date.now() - parseInt(t)) < SESSION_MS;
  } catch(e) { return !!memorySessionTs && (Date.now() - parseInt(memorySessionTs)) < SESSION_MS; }
};

export const clearSession = function() {
  memorySessionTs = '';
  try { sessionStorage.removeItem(SESSION_KEY); } catch(e) {}
};
