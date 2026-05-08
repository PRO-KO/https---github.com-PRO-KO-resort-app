/**
 * server/db.js - Node.js v10 compatible DB connection helper.
 *
 * Supports Oracle through `oracledb` and Tibero through `odbc`.
 * Public API: initDB, execute, transaction.
 */

require('dotenv').config();

var DB_TYPE = process.env.DB_TYPE || 'oracle';
var oraclePool = null;
var tiberoPool = null;
var oracleDriver = null;

function normalizeRows(rows) {
    return Array.isArray(rows) ? rows : [];
}

function getRowsAffected(result) {
    if (!result) return 0;
    if (typeof result.rowsAffected === 'number') return result.rowsAffected;
    if (typeof result.count === 'number') return result.count;
    return 0;
}

function buildOracleConnectString() {
    var host    = process.env.DB_HOST || 'localhost';
    var port    = process.env.DB_PORT || '1521';
    // DB_SERVICE_NAME 우선, 없으면 DB_NAME 사용 (하위 호환)
    var svcName = process.env.DB_SERVICE_NAME || process.env.DB_NAME || 'ORCL';
    // 전체 DESCRIPTION 형식 — ORA-12504 (SERVICE_NAME 누락) 방지
    return '(DESCRIPTION=(ADDRESS=(PROTOCOL=TCP)(HOST=' + host + ')(PORT=' + port + '))(CONNECT_DATA=(SERVICE_NAME=' + svcName + ')))';
}

async function initOracle() {
    var oracledb = require('oracledb');
    oracleDriver = oracledb;

    if (process.env.ORACLE_CLIENT_LIB_DIR) {
        try {
            oracledb.initOracleClient({ libDir: process.env.ORACLE_CLIENT_LIB_DIR });
        } catch (err) {
            var msg = String(err.message || '');
            if (msg.indexOf('DPI-1047') >= 0) throw err;
            if (msg.indexOf('Oracle Client library has already been initialized') < 0) throw err;
        }
    }

    oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;

    var connectString = buildOracleConnectString();
    // DB_PASS (현재 .env 형식) 와 DB_PASSWORD (이전 형식) 모두 지원
    var password = process.env.DB_PASS || process.env.DB_PASSWORD || '';

    oraclePool = await oracledb.createPool({
        user:          process.env.DB_USER,
        password:      password,
        connectString: connectString,
        poolMin:       Number(process.env.DB_POOL_MIN || 1),
        poolMax:       Number(process.env.DB_POOL_MAX || 10),
        poolIncrement: 1,
        poolTimeout:   60
    });

    var svcName = process.env.DB_SERVICE_NAME || process.env.DB_NAME || 'ORCL';
    console.log('[DB] Oracle connection pool initialized: ' + (process.env.DB_HOST || 'localhost') + ':' + (process.env.DB_PORT || '1521') + '/' + svcName);
}

async function getOracleConn() {
    if (!oraclePool) throw new Error('[DB] Oracle pool is not initialized.');
    return oraclePool.getConnection();
}

async function oraQuery(sql, binds, opts) {
    var conn = await getOracleConn();
    try {
        var options = Object.assign({ autoCommit: true }, opts || {});
        return await conn.execute(sql, binds || [], options);
    } finally {
        await conn.close();
    }
}

async function initTibero() {
    var odbc = require('odbc');
    var connectionString = process.env.DB_TIBERO_DSN ||
        'DRIVER={Tibero6 ODBC Driver};' +
        'SERVER=' + process.env.DB_HOST + ';' +
        'PORT=' + (process.env.DB_PORT || 8629) + ';' +
        'DATABASE=' + (process.env.DB_NAME || 'tibero') + ';' +
        'UID=' + process.env.DB_USER + ';' +
        'PWD=' + process.env.DB_PASSWORD + ';';

    tiberoPool = await odbc.pool({
        connectionString: connectionString,
        initialSize: Number(process.env.DB_POOL_MIN || 1),
        maxSize: Number(process.env.DB_POOL_MAX || 10),
        shrink: true
    });

    console.log('[DB] Tibero ODBC connection pool initialized');
}

async function tibQuery(sql, params) {
    if (!tiberoPool) throw new Error('[DB] Tibero pool is not initialized.');
    var conn = await tiberoPool.connect();
    try {
        return await conn.query(sql, params || []);
    } finally {
        await conn.close();
    }
}

async function initDB() {
    if (DB_TYPE === 'tibero') return initTibero();
    return initOracle();
}

function convertOracleBindsToOdbc(sql) {
    return sql.replace(/:[a-zA-Z0-9_]+/g, '?');
}

async function execute(sql, binds, opts) {
    binds = binds || [];
    if (DB_TYPE === 'tibero') {
        var convertedSql = convertOracleBindsToOdbc(sql);
        var params = Array.isArray(binds) ? binds : Object.keys(binds).map(function(k) { return binds[k]; });
        var tibResult = await tibQuery(convertedSql, params);
        return {
            rows: normalizeRows(Array.from(tibResult || [])),
            rowsAffected: getRowsAffected(tibResult)
        };
    }

    var oraResult = await oraQuery(sql, binds, opts);
    return {
        rows: normalizeRows(oraResult.rows),
        rowsAffected: getRowsAffected(oraResult)
    };
}

async function transaction(fn) {
    if (DB_TYPE === 'tibero') {
        if (!tiberoPool) throw new Error('[DB] Tibero pool is not initialized.');
        var tibConn = await tiberoPool.connect();
        try {
            await tibConn.beginTransaction();
            await fn(tibConn);
            await tibConn.commit();
        } catch (err) {
            try { await tibConn.rollback(); } catch (rollbackErr) {}
            throw err;
        } finally {
            await tibConn.close();
        }
        return;
    }

    var conn = await getOracleConn();
    try {
        await fn(conn);
        await conn.commit();
    } catch (err) {
        try { await conn.rollback(); } catch (rollbackErr) {}
        throw err;
    } finally {
        await conn.close();
    }
}

module.exports = {
    initDB: initDB,
    execute: execute,
    transaction: transaction,
    oraQuery: oraQuery,
    tibQuery: tibQuery
};
