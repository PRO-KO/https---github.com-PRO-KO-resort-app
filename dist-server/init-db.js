"use strict";

/**
 * dist-server/init-db.js - Node.js v10 compatible DB initialization script.
 */

var oracledb = require('oracledb');
var path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

function buildOracleConnectString() {
  var host    = (process.env.DB_HOST         || '172.16.4.101').trim();
  var port    = (process.env.DB_PORT         || '1521').trim();
  var svcName = (process.env.DB_SERVICE_NAME || process.env.DB_NAME || 'OASHIS').trim();
  
  return '(DESCRIPTION=' +
           '(ADDRESS=(PROTOCOL=TCP)(HOST=' + host + ')(PORT=' + port + '))' +
           '(CONNECT_DATA=(SERVICE_NAME=' + svcName + ')))';
}

async function init() {
  var conn;
  try {
    var connectString = buildOracleConnectString();
    
    var dbConfig = {
      user: process.env.DB_USER,
      password: process.env.DB_PASS || process.env.DB_PASSWORD,
      connectString: connectString
    };

    console.log("[DB] Connecting to Oracle...");
    conn = await oracledb.getConnection(dbConfig);
    console.log("[DB] Connection successful! Initializing tables...");

    // 1. KOSHA_EMPLOYEES
    try {
      await conn.execute("DROP TABLE KOSHA_EMPLOYEES");
    } catch (e) {}
    await conn.execute("CREATE TABLE KOSHA_EMPLOYEES (" +
      " EMP_ID VARCHAR2(50) PRIMARY KEY," +
      " PW_HASH VARCHAR2(255)," +
      " PW_SALT VARCHAR2(255)," +
      " STATUS VARCHAR2(20)," +
      " ORGANIZATION VARCHAR2(100)," +
      " DEPARTMENT VARCHAR2(100)," +
      " PHONE VARCHAR2(50)," +
      " CREATED_AT TIMESTAMP DEFAULT SYSTIMESTAMP," +
      " APPROVED_AT TIMESTAMP" +
      ")");
    console.log("[DB] KOSHA_EMPLOYEES table created.");

    // 2. KOSHA_APPS
    try {
      await conn.execute("DROP TABLE KOSHA_APPS");
    } catch (e) {}
    await conn.execute("CREATE TABLE KOSHA_APPS (" +
      " APP_ID VARCHAR2(50) PRIMARY KEY," +
      " EMP_ID VARCHAR2(50)," +
      " APP_YEAR NUMBER," +
      " APP_MONTH NUMBER," +
      " ROOM_TYPE VARCHAR2(50)," +
      " NIGHTS NUMBER," +
      " TOTAL NUMBER," +
      " SUBSIDY NUMBER," +
      " STATUS VARCHAR2(20)," +
      " CREATED_AT TIMESTAMP DEFAULT SYSTIMESTAMP" +
      ")");
    console.log("[DB] KOSHA_APPS table created.");

    // 3. KOSHA_SETTINGS
    try {
      await conn.execute("DROP TABLE KOSHA_SETTINGS");
    } catch (e) {}
    await conn.execute("CREATE TABLE KOSHA_SETTINGS (" +
      " SETTING_KEY VARCHAR2(50) PRIMARY KEY," +
      " SETTING_VAL CLOB" +
      ")");
    console.log("[DB] KOSHA_SETTINGS table created.");

    await conn.commit();
    console.log("[DB] All changes committed successfully.");

  } catch (err) {
    console.error("[DB] Initialization error:", err.message);
  } finally {
    if (conn) {
      try {
        await conn.close();
        console.log("[DB] Connection closed.");
      } catch (err) {
        console.error("[DB] Error closing connection:", err.message);
      }
    }
  }
}

init();