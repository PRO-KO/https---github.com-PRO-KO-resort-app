var oracledb = require('oracledb');
require('dotenv').config();

/**
 * server/init-db.js - ES5 호환 버전 (구버전 Node.js 대응)
 */

function buildConnectString() {
  var host    = process.env.DB_HOST || 'localhost';
  var port    = process.env.DB_PORT || '1521';
  var svcName = process.env.DB_SERVICE_NAME || process.env.DB_NAME || 'ORCL';
  return '(DESCRIPTION=(ADDRESS=(PROTOCOL=TCP)(HOST=' + host + ')(PORT=' + port + '))(CONNECT_DATA=(SERVICE_NAME=' + svcName + ')))';
}

function init() {
  var conn;
  var dbConfig = {
    user:          process.env.DB_USER,
    password:      process.env.DB_PASS || process.env.DB_PASSWORD || '',
    connectString: buildConnectString()
  };

  oracledb.getConnection(dbConfig)
    .then(function(c) {
      conn = c;
      console.log("[INIT] DB 접속 성공! 테이블 생성을 시작합니다.");
      
      // 1. 기존 테이블 삭제
      return conn.execute("DROP TABLE KOSHA_APPS CASCADE CONSTRAINTS").catch(function(){})
        .then(function() { return conn.execute("DROP TABLE KOSHA_EMPLOYEES CASCADE CONSTRAINTS").catch(function(){}); })
        .then(function() { return conn.execute("DROP TABLE KOSHA_SETTINGS CASCADE CONSTRAINTS").catch(function(){}); })
        .then(function() { return conn.execute("DROP TABLE Applications CASCADE CONSTRAINTS").catch(function(){}); })
        .then(function() { return conn.execute("DROP TABLE Employees CASCADE CONSTRAINTS").catch(function(){}); });
    })
    .then(function() {
      console.log("[INIT] KOSHA_EMPLOYEES 생성 중...");
      return conn.execute(
        "CREATE TABLE KOSHA_EMPLOYEES (" +
        "  EMP_ID        VARCHAR2(30)    NOT NULL, " +
        "  PW_HASH       VARCHAR2(64)    NOT NULL, " +
        "  PW_SALT       VARCHAR2(32)    NOT NULL, " +
        "  EMP_NAME      VARCHAR2(50), " +
        "  STATUS        VARCHAR2(10)    NOT NULL, " +
        "  ORGANIZATION  VARCHAR2(100), " +
        "  DEPARTMENT    VARCHAR2(100), " +
        "  PHONE         VARCHAR2(20), " +
        "  CREATED_AT    TIMESTAMP       DEFAULT SYSTIMESTAMP NOT NULL, " +
        "  APPROVED_AT   TIMESTAMP, " +
        "  CONSTRAINT PK_EMPLOYEES PRIMARY KEY (EMP_ID), " +
        "  CONSTRAINT CHK_EMP_STATUS CHECK (STATUS IN ('pending', 'approved', 'rejected'))" +
        ")"
      );
    })
    .then(function() {
      console.log("[INIT] KOSHA_APPS 생성 중...");
      return conn.execute(
        "CREATE TABLE KOSHA_APPS (" +
        "  APP_ID        VARCHAR2(36)    NOT NULL, " +
        "  EMP_ID        VARCHAR2(30)    NOT NULL, " +
        "  APP_YEAR      NUMBER(4)       NOT NULL, " +
        "  APP_MONTH     NUMBER(2)       NOT NULL, " +
        "  ROOM_TYPE     VARCHAR2(100)   NOT NULL, " +
        "  NIGHTS        NUMBER(1)       NOT NULL, " +
        "  TOTAL         NUMBER(12)      NOT NULL, " +
        "  SUBSIDY       NUMBER(12)      NOT NULL, " +
        "  STATUS        VARCHAR2(20)    NOT NULL, " +
        "  REMARKS       VARCHAR2(500), " +
        "  CANCEL_REASON VARCHAR2(500), " +
        "  CREATED_AT    TIMESTAMP       DEFAULT SYSTIMESTAMP NOT NULL, " +
        "  CONSTRAINT PK_APPS          PRIMARY KEY (APP_ID), " +
        "  CONSTRAINT FK_APPS_EMP      FOREIGN KEY (EMP_ID) REFERENCES KOSHA_EMPLOYEES(EMP_ID) ON DELETE CASCADE, " +
        "  CONSTRAINT CHK_APP_STATUS   CHECK (STATUS IN ('pending', 'selected', 'rejected', 'manual', 'cancelled', 'cancel_requested')), " +
        "  CONSTRAINT CHK_APP_MONTH    CHECK (APP_MONTH BETWEEN 1 AND 12), " +
        "  CONSTRAINT CHK_APP_NIGHTS   CHECK (NIGHTS BETWEEN 1 AND 7)" +
        ")"
      );
    })
    .then(function() {
      console.log("[INIT] KOSHA_SETTINGS 생성 중...");
      return conn.execute(
        "CREATE TABLE KOSHA_SETTINGS (" +
        "  SETTING_KEY   VARCHAR2(50)    NOT NULL, " +
        "  SETTING_VAL   CLOB            NOT NULL, " +
        "  UPDATED_AT    TIMESTAMP       DEFAULT SYSTIMESTAMP NOT NULL, " +
        "  CONSTRAINT PK_SETTINGS PRIMARY KEY (SETTING_KEY)" +
        ")"
      );
    })
    .then(function() {
      console.log("[INIT] 초기 데이터 삽입 중...");
      var settings = {
        rooms: [
          { id: "r1", name: "호텔형 스텐다드", desc: "2인 기준", capacity: 2, maxNights: 2, supportRate: 50, prices: { "비수기": 80000, "준성수기": 120000, "성수기": 180000 } },
          { id: "r2", name: "리조트형 트윈 오션", desc: "바다 전망", capacity: 2, maxNights: 2, supportRate: 50, prices: { "비수기": 120000, "준성수기": 180000, "성수기": 250000 } }
        ],
        quotas: { "1":20,"2":20,"3":20,"4":20,"5":20,"6":20,"7":20,"8":20,"9":20,"10":20,"11":20,"12":20 },
        fundBudget: 20000000
      };
      return conn.execute("INSERT INTO KOSHA_SETTINGS (SETTING_KEY, SETTING_VAL) VALUES (:1, :2)", ['settings', JSON.stringify(settings)])
        .then(function() { return conn.execute("INSERT INTO KOSHA_SETTINGS (SETTING_KEY, SETTING_VAL) VALUES (:1, :2)", ['fundUsed', '0']); });
    })
    .then(function() {
      return conn.commit();
    })
    .then(function() {
      console.log("[INIT] 모든 작업 완료!");
    })
    .catch(function(err) {
      console.error("[INIT] 오류 발생:", err.message);
    })
    .then(function() {
      if (conn) return conn.close();
    });
}

init();
