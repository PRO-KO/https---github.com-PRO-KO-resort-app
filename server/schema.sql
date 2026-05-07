-- =============================================================================
-- 안전보건공단 발전기금 휴양소 예약 시스템 — DB 스키마
-- 대상 DBMS : Oracle 12c 이상 / Tibero 6 이상
--
-- 실행 순서 :
--   1. KOSHA_EMPLOYEES 테이블 생성
--   2. KOSHA_APPS       테이블 생성 (EMPLOYEES 외래키)
--   3. KOSHA_SETTINGS   테이블 생성
--   4. 초기 설정값 INSERT
--
-- Tibero 호환 :
--   Oracle과 DDL 문법이 거의 동일합니다.
--   VARCHAR2, NUMBER, TIMESTAMP, CLOB, CONSTRAINT 모두 그대로 사용 가능합니다.
--   SYS_GUID() 대신 Tibero에서도 동일하게 사용 가능합니다.
-- =============================================================================


-- ── 1. 직원 테이블 ────────────────────────────────────────────────────────────
-- 현재 localStorage 구조: { [empId]: EmployeeRecord }
-- empId를 PK로 사용하여 동일한 구조를 관계형으로 표현합니다.

CREATE TABLE KOSHA_EMPLOYEES (
    EMP_ID        VARCHAR2(30)    NOT NULL,         -- 사번 (예: EMP-0001)
    PW_HASH       VARCHAR2(64)    NOT NULL,         -- PBKDF2-SHA256 해시 (hex 64자)
    PW_SALT       VARCHAR2(32)    NOT NULL,         -- 랜덤 솔트 (hex 32자)
    STATUS        VARCHAR2(10)    NOT NULL,         -- 계정 상태: pending / approved / rejected
    ORGANIZATION  VARCHAR2(100),                    -- 기관명
    DEPARTMENT    VARCHAR2(100),                    -- 부서명
    PHONE         VARCHAR2(20),                     -- 휴대폰 번호
    CREATED_AT    TIMESTAMP       DEFAULT SYSTIMESTAMP NOT NULL,  -- 가입 신청일시
    APPROVED_AT   TIMESTAMP,                        -- 승인일시 (미승인 시 NULL)

    CONSTRAINT PK_EMPLOYEES PRIMARY KEY (EMP_ID),
    -- STATUS 값은 반드시 세 가지 중 하나여야 합니다
    CONSTRAINT CHK_EMP_STATUS CHECK (STATUS IN ('pending', 'approved', 'rejected'))
);

-- 인덱스: 상태별 조회 빈도가 높으므로 STATUS에 인덱스 추가
CREATE INDEX IDX_EMP_STATUS ON KOSHA_EMPLOYEES (STATUS);

COMMENT ON TABLE  KOSHA_EMPLOYEES           IS '직원 계정 정보';
COMMENT ON COLUMN KOSHA_EMPLOYEES.EMP_ID    IS '사번 — 로그인 ID로 사용';
COMMENT ON COLUMN KOSHA_EMPLOYEES.PW_HASH   IS 'PBKDF2-SHA256 해시값 (서버에서 생성)';
COMMENT ON COLUMN KOSHA_EMPLOYEES.PW_SALT   IS '비밀번호 솔트 (16바이트 hex)';
COMMENT ON COLUMN KOSHA_EMPLOYEES.STATUS    IS 'pending(대기) / approved(승인) / rejected(거절)';


-- ── 2. 신청 테이블 ────────────────────────────────────────────────────────────
-- 현재 localStorage 구조: ApplicationRecord[]
-- 신청 ID는 UUID(SYS_GUID)를 사용합니다.

CREATE TABLE KOSHA_APPS (
    APP_ID        VARCHAR2(36)    NOT NULL,         -- UUID (예: 550e8400-e29b-41d4-a716-446655440000)
    EMP_ID        VARCHAR2(30)    NOT NULL,         -- 신청한 직원의 사번
    APP_YEAR      NUMBER(4)       NOT NULL,         -- 신청 연도 (예: 2026)
    APP_MONTH     NUMBER(2)       NOT NULL,         -- 신청 월 (1~12)
    ROOM_TYPE     VARCHAR2(100)   NOT NULL,         -- 객실 유형명 (예: 호텔형 스텐다드)
    NIGHTS        NUMBER(1)       NOT NULL,         -- 박수 (1~7)
    TOTAL         NUMBER(12)      NOT NULL,         -- 총 숙박료 (원)
    SUBSIDY       NUMBER(12)      NOT NULL,         -- 지원금액 (원)
    STATUS        VARCHAR2(10)    NOT NULL,         -- 신청 상태
    CREATED_AT    TIMESTAMP       DEFAULT SYSTIMESTAMP NOT NULL,  -- 신청일시

    CONSTRAINT PK_APPS          PRIMARY KEY (APP_ID),
    CONSTRAINT FK_APPS_EMP      FOREIGN KEY (EMP_ID) REFERENCES KOSHA_EMPLOYEES(EMP_ID)
                                ON DELETE CASCADE,  -- 직원 삭제 시 신청 기록도 함께 삭제
    CONSTRAINT CHK_APP_STATUS   CHECK (STATUS IN ('pending', 'selected', 'rejected', 'manual')),
    CONSTRAINT CHK_APP_MONTH    CHECK (APP_MONTH BETWEEN 1 AND 12),
    CONSTRAINT CHK_APP_NIGHTS   CHECK (NIGHTS BETWEEN 1 AND 7)
);

-- 인덱스: 연도+월 조합 조회, 직원별 조회가 빈번
CREATE INDEX IDX_APPS_YEAR_MONTH ON KOSHA_APPS (APP_YEAR, APP_MONTH);
CREATE INDEX IDX_APPS_EMP_ID     ON KOSHA_APPS (EMP_ID);
CREATE INDEX IDX_APPS_STATUS     ON KOSHA_APPS (STATUS);

COMMENT ON TABLE  KOSHA_APPS             IS '휴양소 예약 신청 내역';
COMMENT ON COLUMN KOSHA_APPS.APP_ID      IS 'UUID 형태의 신청 고유 ID';
COMMENT ON COLUMN KOSHA_APPS.STATUS      IS 'pending(대기) / selected(당첨) / rejected(낙첨) / manual(별도배정)';
COMMENT ON COLUMN KOSHA_APPS.TOTAL       IS '총 숙박요금 (지원금 포함)';
COMMENT ON COLUMN KOSHA_APPS.SUBSIDY     IS '발전기금 지원금액';


-- ── 3. 설정 테이블 ────────────────────────────────────────────────────────────
-- 현재 localStorage 구조:
--   settings  = { rooms, quotas, applicationPeriods, fundBudget }  (JSON)
--   fundUsed  = number
--
-- 복잡한 중첩 구조이므로 JSON을 CLOB에 저장합니다.
-- Oracle 12c 이상: JSON 컬럼 제약으로 유효성 검사 가능
-- Tibero        : CLOB 사용 (IS JSON 제약 미지원 시 CHECK 제약 제거)

CREATE TABLE KOSHA_SETTINGS (
    SETTING_KEY   VARCHAR2(50)    NOT NULL,         -- 설정 키 (예: settings, fundUsed)
    SETTING_VAL   CLOB            NOT NULL,         -- JSON 형태의 설정값
    UPDATED_AT    TIMESTAMP       DEFAULT SYSTIMESTAMP NOT NULL,

    CONSTRAINT PK_SETTINGS PRIMARY KEY (SETTING_KEY),

    -- Oracle 12c 이상에서 JSON 형식 유효성 검사 (Tibero에서 지원하지 않으면 이 줄 제거)
    CONSTRAINT CHK_SETTINGS_JSON CHECK (SETTING_VAL IS JSON)
);

COMMENT ON TABLE  KOSHA_SETTINGS              IS '시스템 전역 설정 (JSON 직렬화 저장)';
COMMENT ON COLUMN KOSHA_SETTINGS.SETTING_KEY  IS 'settings(전체설정) 또는 fundUsed(발전기금사용액)';
COMMENT ON COLUMN KOSHA_SETTINGS.SETTING_VAL  IS 'JSON 직렬화된 설정값 (CLOB)';


-- ── 4. 초기 설정값 INSERT ────────────────────────────────────────────────────
-- 서버 최초 기동 시 설정이 없으면 이 값을 사용합니다.
-- 실제 배포 시에는 서버 코드(index.js)의 initDefaults() 함수로 자동 삽입됩니다.

INSERT INTO KOSHA_SETTINGS (SETTING_KEY, SETTING_VAL) VALUES (
    'settings',
    '{
        "rooms": [
            {
                "id": "r1",
                "name": "호텔형 스텐다드",
                "desc": "호텔 수준의 편의시설, 2인 기준",
                "capacity": 2,
                "maxNights": 2,
                "supportRate": 50,
                "availableFrom": "",
                "availableTo": "",
                "prices": { "비수기": 80000, "준성수기": 120000, "성수기": 180000 }
            },
            {
                "id": "r2",
                "name": "리조트형 트윈 오션",
                "desc": "오션뷰 트윈 베드, 테라스 & 바다 전망",
                "capacity": 2,
                "maxNights": 2,
                "supportRate": 50,
                "availableFrom": "",
                "availableTo": "",
                "prices": { "비수기": 120000, "준성수기": 180000, "성수기": 250000 }
            }
        ],
        "quotas": {
            "1":20,"2":20,"3":20,"4":20,"5":20,"6":20,
            "7":20,"8":20,"9":20,"10":20,"11":20,"12":20
        },
        "applicationPeriods": {
            "1":{"start":"","end":""},"2":{"start":"","end":""},
            "3":{"start":"","end":""},"4":{"start":"","end":""},
            "5":{"start":"","end":""},"6":{"start":"","end":""},
            "7":{"start":"","end":""},"8":{"start":"","end":""},
            "9":{"start":"","end":""},"10":{"start":"","end":""},
            "11":{"start":"","end":""},"12":{"start":"","end":""}
        },
        "fundBudget": 20000000
    }'
);

INSERT INTO KOSHA_SETTINGS (SETTING_KEY, SETTING_VAL) VALUES ('fundUsed', '0');

COMMIT;


-- ── 5. 운영 계정에 권한 부여 (필요 시) ──────────────────────────────────────
-- 실제 운영 시 전용 계정을 만들어 최소 권한만 부여합니다.
-- DBA 계정으로 아래 명령 실행:
--
-- CREATE USER RESORT_APP IDENTIFIED BY "비밀번호";
-- GRANT CONNECT, RESOURCE TO RESORT_APP;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON KOSHA_EMPLOYEES TO RESORT_APP;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON KOSHA_APPS      TO RESORT_APP;
-- GRANT SELECT, INSERT, UPDATE         ON KOSHA_SETTINGS  TO RESORT_APP;
-- GRANT CREATE SESSION TO RESORT_APP;


-- ── 5. 날짜별 객실 특별 요금 ───────────────────────────────────────────────────
-- 특정 날짜 또는 기간에 대한 객실 요금 오버라이드
-- 우선순위: 적용 기간이 짧은(구체적인) 항목이 높은 우선순위를 가집니다.
-- 같은 날짜에 여러 규칙이 적용될 경우 DATE_TO - DATE_FROM 이 가장 작은 규칙이 선택됩니다.

CREATE TABLE KOSHA_ROOM_PRICES (
    PRICE_ID    VARCHAR2(36)    NOT NULL,         -- UUID (SYS_GUID 또는 애플리케이션에서 생성)
    ROOM_ID     VARCHAR2(50)    NOT NULL,         -- 객실 ID (settings rooms 배열의 id 값)
    DATE_FROM   DATE            NOT NULL,         -- 적용 시작일 (해당 일 포함)
    DATE_TO     DATE            NOT NULL,         -- 적용 종료일 (해당 일 포함)
    PRICE       NUMBER(12)      NOT NULL,         -- 1박 요금 (원, 0 이상)
    LABEL       VARCHAR2(200),                    -- 용도 메모 (예: 추석 연휴, 광복절 특별)
    CREATED_AT  TIMESTAMP       DEFAULT SYSTIMESTAMP NOT NULL,

    CONSTRAINT PK_ROOM_PRICES       PRIMARY KEY (PRICE_ID),
    CONSTRAINT CHK_PRICE_DATE_RANGE CHECK (DATE_TO >= DATE_FROM),
    CONSTRAINT CHK_PRICE_POSITIVE   CHECK (PRICE >= 0)
);

-- 객실+날짜 범위로 조회가 빈번하므로 복합 인덱스 추가
CREATE INDEX IDX_ROOM_PRICES_ROOM ON KOSHA_ROOM_PRICES (ROOM_ID, DATE_FROM, DATE_TO);

COMMENT ON TABLE  KOSHA_ROOM_PRICES           IS '날짜별 객실 특별 요금 — 시즌 기본 요금을 날짜·기간 단위로 오버라이드';
COMMENT ON COLUMN KOSHA_ROOM_PRICES.PRICE_ID  IS 'UUID 형태의 규칙 고유 ID';
COMMENT ON COLUMN KOSHA_ROOM_PRICES.ROOM_ID   IS 'settings.rooms[].id 와 일치 (예: r1, r2)';
COMMENT ON COLUMN KOSHA_ROOM_PRICES.DATE_FROM IS '적용 시작일 (포함, YYYY-MM-DD 형식으로 저장)';
COMMENT ON COLUMN KOSHA_ROOM_PRICES.DATE_TO   IS '적용 종료일 (포함, YYYY-MM-DD 형식으로 저장)';
COMMENT ON COLUMN KOSHA_ROOM_PRICES.PRICE     IS '1박 기준 요금 (원)';
COMMENT ON COLUMN KOSHA_ROOM_PRICES.LABEL     IS '관리자 메모 — 화면에 표시되지 않음 (내부용)';
