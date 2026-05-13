#!/bin/bash

# =================================================================
# setup_db.sh - DB 테이블 생성 및 초기 데이터 삽입 자동화 스크립트
# =================================================================

# 1. SQL 파일 생성 (/opt/resort-app/setup_db.sql)
# 이 부분은 SQLPlus에서 실행할 명령어들을 파일로 저장합니다.
cat << 'SQL_EOF' > /opt/resort-app/setup_db.sql
-- 기존 테이블 삭제 (존재하지 않아도 오류 무시하고 진행)
DROP TABLE KOSHA_APPS CASCADE CONSTRAINTS;
DROP TABLE KOSHA_EMPLOYEES CASCADE CONSTRAINTS;
DROP TABLE KOSHA_SETTINGS CASCADE CONSTRAINTS;

-- 1. 직원 정보 테이블 생성
CREATE TABLE KOSHA_EMPLOYEES (
    EMP_ID        VARCHAR2(30)    NOT NULL,
    PW_HASH       VARCHAR2(64)    NOT NULL,
    PW_SALT       VARCHAR2(32)    NOT NULL,
    STATUS        VARCHAR2(10)    NOT NULL,
    ORGANIZATION  VARCHAR2(100),
    DEPARTMENT    VARCHAR2(100),
    PHONE         VARCHAR2(20),
    CREATED_AT    TIMESTAMP       DEFAULT SYSTIMESTAMP NOT NULL,
    APPROVED_AT   TIMESTAMP,
    CONSTRAINT PK_EMPLOYEES PRIMARY KEY (EMP_ID),
    CONSTRAINT CHK_EMP_STATUS CHECK (STATUS IN ('pending', 'approved', 'rejected'))
);

-- 2. 예약 신청 내역 테이블 생성
CREATE TABLE KOSHA_APPS (
    APP_ID        VARCHAR2(36)    NOT NULL,
    EMP_ID        VARCHAR2(30)    NOT NULL,
    APP_YEAR      NUMBER(4)       NOT NULL,
    APP_MONTH     NUMBER(2)       NOT NULL,
    ROOM_TYPE     VARCHAR2(100)   NOT NULL,
    NIGHTS        NUMBER(1)       NOT NULL,
    TOTAL         NUMBER(12)      NOT NULL,
    SUBSIDY       NUMBER(12)      NOT NULL,
    STATUS        VARCHAR2(20)    NOT NULL,
    REMARKS       VARCHAR2(500),
    CANCEL_REASON VARCHAR2(500),
    CREATED_AT    TIMESTAMP       DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT PK_APPS          PRIMARY KEY (APP_ID),
    CONSTRAINT FK_APPS_EMP      FOREIGN KEY (EMP_ID) REFERENCES KOSHA_EMPLOYEES(EMP_ID) ON DELETE CASCADE,
    CONSTRAINT CHK_APP_STATUS   CHECK (STATUS IN ('pending', 'selected', 'rejected', 'manual', 'cancelled', 'cancel_requested')),
    CONSTRAINT CHK_APP_MONTH    CHECK (APP_MONTH BETWEEN 1 AND 12),
    CONSTRAINT CHK_APP_NIGHTS   CHECK (NIGHTS BETWEEN 1 AND 7)
);

-- 3. 시스템 설정 테이블 생성
CREATE TABLE KOSHA_SETTINGS (
    SETTING_KEY   VARCHAR2(50)    NOT NULL,
    SETTING_VAL   CLOB            NOT NULL,
    UPDATED_AT    TIMESTAMP       DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT PK_SETTINGS PRIMARY KEY (SETTING_KEY)
);

-- 4. 초기 필수 데이터 삽입
INSERT INTO KOSHA_SETTINGS (SETTING_KEY, SETTING_VAL) VALUES ('fundUsed', '0');
INSERT INTO KOSHA_SETTINGS (SETTING_KEY, SETTING_VAL) VALUES ('settings', '{"rooms":[{"id":"r1","name":"호텔형 스텐다드","desc":"2인 기준","capacity":2,"maxNights":2,"supportRate":50,"prices":{"비수기":80000,"준성수기":120000,"성수기":180000}},{"id":"r2","name":"리조트형 트윈 오션","desc":"바다 전망","capacity":2,"maxNights":2,"supportRate":50,"prices":{"비수기":120000,"준성수기":180000,"성수기":250000}}],"quotas":{"1":20,"2":20,"3":20,"4":20,"5":20,"6":20,"7":20,"8":20,"9":20,"10":20,"11":20,"12":20},"fundBudget":20000000}');

COMMIT;
EXIT;
SQL_EOF

echo "[1/2] SQL 파일 생성 완료: /opt/resort-app/setup_db.sql"

# 2. SQLPlus를 이용한 실제 DB 반영
# 주의: 아래의 아이디, 비밀번호, IP, 포트, 서비스명을 실제 환경에 맞게 수정하세요.
# 형식: sqlplus 아이디/비밀번호@IP:포트/서비스명 @파일경로
echo "[2/2] DB 반영 시작..."
sqlplus RESORT_APP/비밀번호@10.10.10.101:1521/ORCL @/opt/resort-app/setup_db.sql

echo "================================================="
echo "DB 초기화 및 테이블 생성이 완료되었습니다."
echo "================================================="
