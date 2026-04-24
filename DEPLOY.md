# 안전보건공단 발전기금 휴양소 예약 시스템 — 폐쇄망 배포 가이드

> **대상 독자**: 서버 담당 개발자 / 시스템 운영자  
> **최종 수정**: 2026-04-24  
> **지원 DB**: Oracle 12c 이상 / Tibero 6 이상

---

## 목차

1. [시스템 아키텍처](#1-시스템-아키텍처)
2. [사전 요구사항](#2-사전-요구사항)
3. [폐쇄망 파일 준비 (인터넷 PC → 서버 이관)](#3-폐쇄망-파일-준비-인터넷-pc--서버-이관)
4. [Node.js 설치 (오프라인)](#4-nodejs-설치-오프라인)
5. [데이터베이스 스키마 생성](#5-데이터베이스-스키마-생성)
6. [Oracle Instant Client 설치 (Oracle 사용 시)](#6-oracle-instant-client-설치-oracle-사용-시)
7. [Tibero ODBC 드라이버 설치 (Tibero 사용 시)](#7-tibero-odbc-드라이버-설치-tibero-사용-시)
8. [애플리케이션 배포](#8-애플리케이션-배포)
9. [환경변수 설정 (.env)](#9-환경변수-설정-env)
10. [프론트엔드 빌드 및 Nginx 설정](#10-프론트엔드-빌드-및-nginx-설정)
11. [API 서버 실행 및 자동 시작 등록](#11-api-서버-실행-및-자동-시작-등록)
12. [내부 메일서버 연동](#12-내부-메일서버-연동)
13. [배포 후 점검 체크리스트](#13-배포-후-점검-체크리스트)
14. [트러블슈팅](#14-트러블슈팅)
15. [디렉터리 구조](#15-디렉터리-구조)

---

## 1. 시스템 아키텍처

```
[사용자 브라우저]
      │  HTTP 80 / HTTPS 443
      ▼
┌─────────────────────────────────┐
│         Nginx (웹서버)           │
│  /         → dist/ (정적 파일)   │  ← npm run build 결과물
│  /api/*    → localhost:4000     │  ← 리버스 프록시
└─────────────────────────────────┘
      │  HTTP 4000 (내부)
      ▼
┌─────────────────────────────────┐
│   Node.js API 서버               │
│   server/index.js               │  ← Express + JWT + 비밀번호 해싱
└─────────────────────────────────┘
      │  TCP (Oracle 1521 / Tibero 8629)
      ▼
┌─────────────────────────────────┐
│   Oracle / Tibero DB            │
│   KOSHA_EMPLOYEES               │
│   KOSHA_APPS                    │
│   KOSHA_SETTINGS                │
└─────────────────────────────────┘
      │  SMTP (25 / 465 / 587)     (선택)
      ▼
┌─────────────────────────────────┐
│   내부 메일서버                   │
└─────────────────────────────────┘
```

### 포트 정리

| 포트 | 용도 | 비고 |
|------|------|------|
| 80 / 443 | Nginx (사용자 접속) | 방화벽 허용 필요 |
| 4000 | Node.js API 서버 | 내부 전용, 외부 노출 불필요 |
| 1521 | Oracle DB | DB 서버 IP 허용 필요 |
| 8629 | Tibero DB | DB 서버 IP 허용 필요 |
| 25 / 587 | SMTP 메일 | 메일 기능 사용 시 |

---

## 2. 사전 요구사항

### 서버 환경

| 항목 | 최소 사양 | 권장 사양 |
|------|-----------|-----------|
| OS | RHEL / CentOS 7 이상, Rocky Linux 8 이상 | Rocky Linux 9 |
| CPU | 2코어 | 4코어 |
| RAM | 2GB | 4GB |
| 디스크 | 20GB | 50GB |

### 필요 소프트웨어 (서버에 사전 설치)

- **Node.js 20 LTS** 이상 (npm 포함)
- **Nginx 1.20** 이상
- **Oracle Instant Client 21c** (Oracle 사용 시)
- **Tibero ODBC 드라이버** (Tibero 사용 시, unixODBC 포함)

### 네트워크 조건

- 서버 → DB 서버: TCP 연결 가능
- 서버 → 메일서버: SMTP 포트 연결 가능 (선택)
- 사용자 PC → 서버 80/443: 접속 가능

---

## 3. 폐쇄망 파일 준비 (인터넷 PC → 서버 이관)

> 폐쇄망은 외부 인터넷이 차단되므로 **인터넷이 되는 PC에서 미리 파일을 준비**한 뒤 USB 또는 내부망 파일 전송으로 서버에 옮겨야 합니다.

### 3-1. 인터넷 PC에서 준비할 파일 목록

```
kosha-resort-deploy/
├── resort-app.tar.gz           ← 소스코드 전체 (node_modules 제외)
├── node-v20.xx.x-linux-x64.tar.gz   ← Node.js 바이너리
├── npm-packages/               ← npm 패키지 오프라인 캐시
│   ├── express-*.tgz
│   ├── dotenv-*.tgz
│   ├── jsonwebtoken-*.tgz
│   ├── helmet-*.tgz
│   ├── cors-*.tgz
│   ├── nodemailer-*.tgz
│   └── (DB 패키지: oracledb 또는 odbc)
├── nginx-*.rpm (또는 .deb)     ← Nginx 설치 파일
└── oracle-instantclient*.rpm   ← Oracle 사용 시
```

### 3-2. 소스코드 압축 (인터넷 PC)

```bash
# 프로젝트 루트에서 실행
# node_modules는 서버에서 재설치하므로 제외
tar --exclude='./node_modules' \
    --exclude='./.git' \
    --exclude='./.env' \
    -czf resort-app.tar.gz ./resort-app

# 또는 Windows에서 7-Zip 등으로 압축 후 이관
```

### 3-3. npm 패키지 오프라인 다운로드 (인터넷 PC)

```bash
# 방법 A: npm pack으로 개별 패키지 다운로드
mkdir npm-packages && cd npm-packages

npm pack express
npm pack dotenv
npm pack jsonwebtoken
npm pack helmet
npm pack cors
npm pack nodemailer

# DB 드라이버 (Oracle 또는 Tibero 중 하나만)
npm pack oracledb     # Oracle 사용 시
npm pack odbc         # Tibero 사용 시

# 방법 B: node_modules 폴더 전체를 압축하여 이관 (더 간단)
# 인터넷 PC에서 npm install 실행 후
cd resort-app
npm install
npm install oracledb   # Oracle 사용 시
npm install nodemailer
tar -czf node_modules.tar.gz node_modules/
# → 이 tar.gz 파일을 서버로 이관 후 압축 해제
```

> **팁**: 방법 B(node_modules 통째로 압축)가 가장 간단합니다.  
> OS가 다르면(Windows → Linux) 네이티브 모듈이 달라 오류 날 수 있으니  
> 가급적 **동일한 OS 환경**의 인터넷 PC에서 패키지를 준비하세요.

---

## 4. Node.js 설치 (오프라인)

```bash
# 다운로드 파일: node-v20.xx.x-linux-x64.tar.gz
# Node.js 공식 사이트: https://nodejs.org/en/download (인터넷 PC에서 다운로드)

# 서버에서 실행
tar -xzf node-v20.xx.x-linux-x64.tar.gz -C /usr/local/
ln -sf /usr/local/node-v20.xx.x-linux-x64/bin/node /usr/local/bin/node
ln -sf /usr/local/node-v20.xx.x-linux-x64/bin/npm  /usr/local/bin/npm

# 설치 확인
node --version   # v20.x.x
npm  --version   # 10.x.x
```

---

## 5. 데이터베이스 스키마 생성

> DB 서버 접속은 DB 담당자와 협의하여 진행하세요.

### 5-1. DB 사용자(계정) 생성 — DBA 계정으로 실행

```sql
-- Oracle / Tibero 공통
CREATE USER RESORT_APP IDENTIFIED BY "강력한비밀번호";

GRANT CONNECT, RESOURCE TO RESORT_APP;
GRANT CREATE SESSION TO RESORT_APP;

-- 테이블 생성 권한 (RESOURCE에 포함되어 있으나 명시적으로 부여)
GRANT CREATE TABLE TO RESORT_APP;
```

### 5-2. 테이블 생성 — server/schema.sql 실행

```bash
# Oracle: sqlplus로 실행
sqlplus RESORT_APP/비밀번호@192.168.1.100:1521/ORCL @server/schema.sql

# Tibero: tbsql로 실행
tbsql RESORT_APP/비밀번호@192.168.1.100:8629/TIBERO @server/schema.sql
```

> **Tibero 주의**: `schema.sql` 내 `IS JSON` 제약(101번째 줄)은 Tibero에서 지원하지 않을 수 있습니다.  
> 오류 발생 시 해당 줄을 주석 처리하고 재실행하세요.
>
> ```sql
> -- 이 줄을 주석 처리 (Tibero IS JSON 미지원 시)
> -- CONSTRAINT CHK_SETTINGS_JSON CHECK (SETTING_VAL IS JSON)
> ```

### 5-3. 스키마 생성 확인

```sql
-- 테이블 목록 확인
SELECT TABLE_NAME FROM USER_TABLES ORDER BY TABLE_NAME;
-- 결과: KOSHA_APPS / KOSHA_EMPLOYEES / KOSHA_SETTINGS

-- 초기 데이터 확인
SELECT SETTING_KEY FROM KOSHA_SETTINGS;
-- 결과: fundUsed / settings
```

---

## 6. Oracle Instant Client 설치 (Oracle 사용 시)

> Tibero 사용 시 이 단계를 건너뛰고 [7번](#7-tibero-odbc-드라이버-설치-tibero-사용-시)으로 이동하세요.

### 6-1. 설치 파일 준비

Oracle 공식 사이트(인터넷 PC)에서 Instant Client 다운로드:
- `oracle-instantclient-basiclite-21.x.x.x.x-1.x86_64.rpm`

### 6-2. 서버에 설치

```bash
# RPM 설치 (RHEL/CentOS/Rocky)
rpm -ivh oracle-instantclient-basiclite-21.x.x.x.x-1.x86_64.rpm

# 라이브러리 경로 등록
echo "/usr/lib/oracle/21/client64/lib" > /etc/ld.so.conf.d/oracle-instantclient.conf
ldconfig

# 환경변수 추가 (/etc/profile.d/oracle.sh 생성)
cat > /etc/profile.d/oracle.sh << 'EOF'
export LD_LIBRARY_PATH=/usr/lib/oracle/21/client64/lib:$LD_LIBRARY_PATH
export PATH=/usr/lib/oracle/21/client64/bin:$PATH
EOF

source /etc/profile.d/oracle.sh

# 설치 확인
sqlplus -V
```

### 6-3. Thin 모드 사용 (Instant Client 설치 불가 시)

Instant Client 설치가 어려운 경우 `server/db.js`에서 Thin 모드로 변경하세요 (Oracle 21c DB 이상 필요):

```js
// server/db.js 39번째 줄 근처
// 아래 줄을 주석 처리하고
// oracledb.initOracleClient()  ← 이 줄 주석 처리

// 이 줄을 활성화
oracledb.thin = true            // ← 이 줄 주석 해제
```

---

## 7. Tibero ODBC 드라이버 설치 (Tibero 사용 시)

> Oracle 사용 시 이 단계를 건너뛰고 [8번](#8-애플리케이션-배포)으로 이동하세요.

### 7-1. unixODBC 설치

```bash
# RHEL/CentOS/Rocky
yum install -y unixODBC unixODBC-devel

# 설치 확인
odbcinst --version
```

### 7-2. Tibero ODBC 드라이버 등록

Tibero 설치 패키지에 포함된 `libtbodbc.so` 파일을 서버로 복사한 후:

```bash
# 드라이버 파일 복사 (예시 경로)
cp libtbodbc.so /opt/tibero6/client/lib/

# /etc/odbcinst.ini 에 드라이버 등록
cat >> /etc/odbcinst.ini << 'EOF'
[Tibero6 ODBC Driver]
Description = Tibero6 ODBC Driver
Driver      = /opt/tibero6/client/lib/libtbodbc.so
Setup       = /opt/tibero6/client/lib/libtbodbc.so
FileUsage   = 1
EOF

# /etc/odbc.ini 에 DSN 등록
cat >> /etc/odbc.ini << 'EOF'
[TIBERO_DSN]
Description = Tibero6 Resort App
Driver      = Tibero6 ODBC Driver
Server      = 192.168.1.100
Port        = 8629
Database    = tibero
EOF

# 연결 테스트
isql -v TIBERO_DSN RESORT_APP 비밀번호
```

---

## 8. 애플리케이션 배포

### 8-1. 파일 이관 및 압축 해제

```bash
# 배포 디렉터리 생성
mkdir -p /opt/resort-app
cd /opt/resort-app

# 소스코드 압축 해제
tar -xzf /tmp/resort-app.tar.gz --strip-components=1

# 확인
ls
# 출력: index.html  package.json  server/  src/  vite.config.js ...
```

### 8-2. npm 패키지 설치

```bash
cd /opt/resort-app

# 방법 A: node_modules 통째로 이관한 경우
tar -xzf /tmp/node_modules.tar.gz
# → 추가 설치 불필요, 8-3으로 이동

# 방법 B: npm pack으로 개별 다운로드한 경우
npm install --offline /tmp/npm-packages/express-*.tgz
npm install --offline /tmp/npm-packages/dotenv-*.tgz
npm install --offline /tmp/npm-packages/jsonwebtoken-*.tgz
npm install --offline /tmp/npm-packages/helmet-*.tgz
npm install --offline /tmp/npm-packages/cors-*.tgz
npm install --offline /tmp/npm-packages/nodemailer-*.tgz

# DB 드라이버 (Oracle 또는 Tibero 중 하나만)
npm install --offline /tmp/npm-packages/oracledb-*.tgz   # Oracle
npm install --offline /tmp/npm-packages/odbc-*.tgz        # Tibero

# 프론트엔드 빌드 도구 (빌드 후에는 불필요하지만 서버에서 빌드 시 필요)
npm install --offline /tmp/npm-packages/vite-*.tgz
npm install --offline /tmp/npm-packages/@vitejs-plugin-react-*.tgz
```

---

## 9. 환경변수 설정 (.env)

```bash
cd /opt/resort-app

# .env.example을 복사하여 .env 생성
cp .env.example .env

# 편집
vi .env
```

### .env 설정 예시 (Oracle)

```dotenv
# ── 관리자 비밀번호 ─────────────────────────────────────────────────────────
VITE_ADMIN_PW=여기에_강력한_비밀번호_입력

# ── DB 설정 (Oracle) ────────────────────────────────────────────────────────
DB_TYPE=oracle
DB_HOST=192.168.1.100:1521/ORCL
DB_USER=RESORT_APP
DB_PASSWORD=강력한DB비밀번호

# ── JWT 서명 키 (32자 이상 랜덤 문자열 — 반드시 변경!) ──────────────────────
# 생성 명령: node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
JWT_SECRET=여기에_최소_32자_이상의_랜덤_문자열_입력

# ── 서버 설정 ────────────────────────────────────────────────────────────────
PORT=4000
NODE_ENV=production

# ── 메일 서버 (선택) ─────────────────────────────────────────────────────────
MAIL_ENABLED=true
MAIL_HOST=192.168.1.10
MAIL_PORT=25
MAIL_SECURE=false
MAIL_FROM=resort@kosha.or.kr
MAIL_ADMIN=admin@kosha.or.kr
```

### .env 설정 예시 (Tibero)

```dotenv
DB_TYPE=tibero
DB_HOST=192.168.1.100
DB_PORT=8629
DB_NAME=tibero
DB_USER=RESORT_APP
DB_PASSWORD=강력한DB비밀번호
# DSN 방식 사용 시 (7번에서 등록한 DSN 이름)
# DB_TIBERO_DSN=TIBERO_DSN
```

### JWT_SECRET 생성 방법

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
# 출력 예: a1b2c3d4e5f6... (96자 hex 문자열)
# 이 값을 JWT_SECRET=에 붙여넣기
```

### 파일 권한 보안 설정

```bash
# .env 파일은 서버 프로세스 소유자만 읽을 수 있도록 제한
chmod 600 /opt/resort-app/.env
chown resort:resort /opt/resort-app/.env
```

---

## 10. 프론트엔드 빌드 및 Nginx 설정

### 10-1. 프론트엔드 빌드

> `VITE_ADMIN_PW`가 .env에 설정된 상태에서 빌드해야 합니다.  
> (Vite는 빌드 시 `VITE_` 접두사 환경변수를 번들에 포함시킵니다.)

```bash
cd /opt/resort-app

# 빌드 실행
npm run build

# 결과 확인: dist/ 폴더가 생성됨
ls dist/
# 출력: index.html  assets/

# 정적 파일을 Nginx가 서비스할 위치로 복사
cp -r dist/ /var/www/resort-app/
```

> **주의**: `.env` 파일의 `VITE_ADMIN_PW` 값을 변경했다면 **반드시 재빌드**해야 합니다.  
> API 서버(server/index.js)를 수정했을 때는 재빌드 불필요 (서버 재시작만 필요).

### 10-2. Nginx 설치

```bash
# 온라인 설치 (Nginx 저장소 접근 가능 시)
yum install -y nginx

# 오프라인 설치 (RPM 파일 이관 후)
rpm -ivh nginx-*.rpm

# 버전 확인
nginx -v
```

### 10-3. Nginx 설정 파일 작성

```bash
vi /etc/nginx/conf.d/resort-app.conf
```

```nginx
server {
    listen 80;
    server_name resort.kosha.or.kr;  # ← 실제 서비스 도메인 또는 IP로 변경

    root /var/www/resort-app;
    index index.html;

    # ── 정적 파일 서비스 (React SPA) ──────────────────────────────────────
    location / {
        # SPA 라우팅: 파일이 없으면 index.html로 fallback
        try_files $uri $uri/ /index.html;
    }

    # ── API 리버스 프록시 ──────────────────────────────────────────────────
    # /api/* 요청을 Node.js 서버(4000)로 전달
    location /api/ {
        proxy_pass         http://127.0.0.1:4000/api/;
        proxy_http_version 1.1;

        # 연결 유지 (Keep-Alive) 설정
        proxy_set_header   Connection "";

        # 실제 클라이언트 정보 전달 (로그, 보안 목적)
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;

        # 타임아웃 설정 (추첨 등 시간이 걸리는 처리를 위해 여유 있게 설정)
        proxy_read_timeout 60s;
        proxy_send_timeout 60s;
    }

    # ── 보안 헤더 ──────────────────────────────────────────────────────────
    add_header X-Frame-Options       "SAMEORIGIN"   always;
    add_header X-Content-Type-Options "nosniff"     always;
    add_header X-XSS-Protection      "1; mode=block" always;

    # ── 로그 ───────────────────────────────────────────────────────────────
    access_log /var/log/nginx/resort-app-access.log;
    error_log  /var/log/nginx/resort-app-error.log;
}

# ── HTTPS 사용 시 아래 블록 추가 (내부 CA 인증서 사용 시) ─────────────────
# server {
#     listen 443 ssl;
#     server_name resort.kosha.or.kr;
#
#     ssl_certificate     /etc/nginx/ssl/resort.crt;   ← 내부 CA 발급 인증서
#     ssl_certificate_key /etc/nginx/ssl/resort.key;
#
#     ssl_protocols       TLSv1.2 TLSv1.3;
#     ssl_ciphers         HIGH:!aNULL:!MD5;
#
#     # 위 location 블록을 여기에 동일하게 복사
# }
#
# server {
#     listen 80;
#     server_name resort.kosha.or.kr;
#     return 301 https://$host$request_uri;  ← HTTP → HTTPS 리다이렉트
# }
```

### 10-4. Nginx 시작 및 자동 시작 등록

```bash
# 설정 파일 문법 검사
nginx -t
# 출력: nginx: configuration file ... syntax is ok

# Nginx 시작
systemctl start nginx
systemctl enable nginx

# 방화벽 열기 (firewalld 사용 시)
firewall-cmd --permanent --add-service=http
firewall-cmd --permanent --add-service=https
firewall-cmd --reload
```

---

## 11. API 서버 실행 및 자동 시작 등록

### 11-1. 테스트 실행 (정상 동작 확인 후 백그라운드 등록)

```bash
cd /opt/resort-app

# 직접 실행으로 로그 확인
node server/index.js

# 정상 출력 예시:
# [DB] Oracle 연결 풀 초기화 완료
# [MAIL] SMTP 서버 연결 성공: 192.168.1.10:25
# [SERVER] API 서버 기동: http://localhost:4000
# [SERVER] DB 타입: oracle

# Ctrl+C로 종료
```

### 11-2. systemd 서비스 등록 (자동 시작)

```bash
# 서비스 파일 생성
vi /etc/systemd/system/resort-app.service
```

```ini
[Unit]
Description=KOSHA Resort Reservation API Server
After=network.target

[Service]
Type=simple

# 실행 사용자 (root 실행 금지 — 전용 계정 사용)
User=resort
Group=resort

# 작업 디렉터리
WorkingDirectory=/opt/resort-app

# 환경변수 파일 (DB 비밀번호, JWT 키 등 민감 정보 포함)
EnvironmentFile=/opt/resort-app/.env

# 실행 명령
ExecStart=/usr/local/bin/node server/index.js

# 비정상 종료 시 5초 후 자동 재시작
Restart=on-failure
RestartSec=5

# 로그 출력 (journalctl로 확인 가능)
StandardOutput=journal
StandardError=journal
SyslogIdentifier=resort-app

[Install]
WantedBy=multi-user.target
```

```bash
# 서비스 등록 및 시작
systemctl daemon-reload
systemctl start  resort-app
systemctl enable resort-app     # 부팅 시 자동 시작

# 상태 확인
systemctl status resort-app

# 실시간 로그 확인
journalctl -u resort-app -f

# 최근 50줄 로그
journalctl -u resort-app -n 50
```

### 11-3. 전용 실행 계정 생성 (권장)

```bash
# 홈 디렉터리 없는 시스템 계정 생성
useradd -r -M -s /sbin/nologin resort

# 애플리케이션 디렉터리 소유권 변경
chown -R resort:resort /opt/resort-app
chown -R resort:resort /var/www/resort-app

# .env 파일 권한
chmod 600 /opt/resort-app/.env
```

---

## 12. 내부 메일서버 연동

> 메일 기능은 선택 사항입니다. 사용하지 않으면 `MAIL_ENABLED=false`로 두세요.

### 12-1. nodemailer 패키지 설치 확인

```bash
cd /opt/resort-app
node -e "import('nodemailer').then(m => console.log('nodemailer OK:', m.default.getTestMessageUrl))"
# 오류 없이 실행되면 설치 완료
```

### 12-2. SMTP 연결 테스트

```bash
# 간단한 연결 테스트 스크립트 실행
node - << 'EOF'
import nodemailer from 'nodemailer'
const t = nodemailer.createTransport({
  host: '192.168.1.10',   // 내부 SMTP 서버 IP
  port: 25,
  secure: false,
  tls: { rejectUnauthorized: false }
})
t.verify().then(() => console.log('SMTP 연결 성공!')).catch(e => console.error('실패:', e.message))
EOF
```

### 12-3. index.js에 메일 발송 연동

메일 발송 시점에 `server/mailer.js`의 함수를 호출해야 합니다.

**가입 신청 알림** (`server/index.js` 상단에 import 추가):

```js
// server/index.js 최상단 import 섹션에 추가
import {
    verifyMailer,
    mailNewRegister,
    mailAccountApproved,
    mailAccountRejected,
    mailLotteryResult,
    mailCancellation,
} from './mailer.js'
```

**start() 함수에 메일 연결 확인 추가**:

```js
// server/index.js — start() 함수
async function start() {
    try {
        await initDB()
        await initDefaults()
        await verifyMailer()    // ← 이 줄 추가

        app.listen(PORT, () => { ... })
    } catch (err) { ... }
}
```

**POST /api/employees/register — 가입 신청 알림**:

```js
// return res.status(201).json(...) 바로 위에 추가
await mailNewRegister({ empId: id, organization, department })
return res.status(201).json({ message: '가입 신청이 완료되었습니다.' })
```

**PUT /api/employees/:empId — 승인/거절 알림**:

```js
} else if (status !== undefined) {
    await execute(`UPDATE KOSHA_EMPLOYEES SET STATUS = :1, ...`, [status, empId])

    // 승인/거절 메일 발송 (empEmail 확보 방법은 mailer.js 상단 주석 참고)
    const empEmail = `e${empId.toLowerCase()}@kosha.or.kr`  // 방법 B 예시
    if (status === 'approved') {
        await mailAccountApproved({ empId, empEmail })
    } else if (status === 'rejected') {
        await mailAccountRejected({ empId, empEmail })
    }
}
```

---

## 13. 배포 후 점검 체크리스트

배포 완료 후 아래 항목을 순서대로 확인하세요.

### DB 연결 확인

```bash
# API 서버 로그에서 DB 연결 성공 메시지 확인
journalctl -u resort-app -n 20 | grep '\[DB\]'
# 기대 출력: [DB] Oracle 연결 풀 초기화 완료
```

### API 응답 확인

```bash
# 헬스체크 (서버 자체 응답 확인)
curl -s http://localhost:4000/api/settings \
     -H "Authorization: Bearer INVALID_TOKEN" \
     -w "\nHTTP Status: %{http_code}\n"
# 기대 출력: HTTP Status: 401 (토큰 없음 → 정상적인 인증 거부)

# Nginx 통해 확인
curl -s http://localhost/api/settings \
     -H "Authorization: Bearer INVALID_TOKEN" \
     -w "\nHTTP Status: %{http_code}\n"
# 기대 출력: HTTP Status: 401
```

### 프론트엔드 확인

```bash
# 정적 파일 서비스 확인
curl -s -o /dev/null -w "%{http_code}" http://localhost/
# 기대 출력: 200
```

### 전체 체크리스트

- [ ] DB 접속 로그 정상 (`[DB] ... 초기화 완료`)
- [ ] API 서버 기동 로그 정상 (`[SERVER] API 서버 기동`)
- [ ] 브라우저에서 로그인 화면 접속 가능
- [ ] 테스트 계정 가입 신청 → DB에 `KOSHA_EMPLOYEES` 행 생성 확인
- [ ] 관리자 로그인 후 계정 승인 처리 가능
- [ ] 메일 발송 테스트 (`MAIL_ENABLED=true` 설정 후 가입 신청 → 관리자 메일 수신 확인)
- [ ] 서버 재부팅 후 서비스 자동 시작 확인 (`systemctl is-enabled resort-app`)

---

## 14. 트러블슈팅

### Q1. `[DB] Oracle 풀이 초기화되지 않았습니다` 오류

```
원인: Oracle Instant Client가 설치되지 않았거나 라이브러리 경로가 잘못됨
해결:
  1. Instant Client 설치 여부 확인: ls /usr/lib/oracle/
  2. 환경변수 확인: echo $LD_LIBRARY_PATH
  3. ldconfig 재실행: ldconfig && ldconfig -p | grep libclntsh
  4. 또는 server/db.js에서 Thin 모드로 변경 (6-3번 참고)
```

### Q2. `ORA-12541: TNS: no listener` 오류

```
원인: DB 서버 IP/포트가 잘못되었거나 방화벽 차단
해결:
  1. DB 연결 정보 확인: cat .env | grep DB_
  2. 포트 연결 테스트: nc -zv 192.168.1.100 1521
     → 성공: Connection to 192.168.1.100 1521 port [tcp/*] succeeded
     → 실패: 방화벽 규칙 확인 (DB 서버 담당자에게 포트 허용 요청)
```

### Q3. `Error: ENOENT: no such file or directory, open '.env'`

```
원인: .env 파일이 없거나 서비스 WorkingDirectory가 틀림
해결:
  1. .env 파일 존재 확인: ls -la /opt/resort-app/.env
  2. .env.example을 복사하여 .env 생성: cp .env.example .env
  3. systemd 서비스의 WorkingDirectory 확인: /opt/resort-app 이어야 함
```

### Q4. Nginx 502 Bad Gateway

```
원인: Node.js API 서버(4000)가 실행되지 않음
해결:
  1. API 서버 상태 확인: systemctl status resort-app
  2. 포트 리스닝 확인: ss -tlnp | grep 4000
  3. 서버 로그 확인: journalctl -u resort-app -n 50
  4. 수동 실행으로 오류 메시지 확인: node /opt/resort-app/server/index.js
```

### Q5. `[MAIL] SMTP 서버 연결 실패`

```
원인: 메일서버 IP/포트 오류 또는 방화벽 차단
해결:
  1. SMTP 포트 테스트: nc -zv 192.168.1.10 25
  2. .env의 MAIL_HOST, MAIL_PORT 확인
  3. 메일 담당자에게 서버 IP의 릴레이 허용 요청
  4. 메일 기능이 불필요하면: MAIL_ENABLED=false 설정
```

### Q6. `Cannot find module 'oracledb'` 오류

```
원인: npm 패키지가 설치되지 않음
해결:
  cd /opt/resort-app
  node -e "import('oracledb')" 2>&1
  # 오류 시 재설치:
  npm install --offline /tmp/npm-packages/oracledb-*.tgz
```

### Q7. 빌드 후 로그인 시 관리자 비밀번호가 적용되지 않음

```
원인: .env의 VITE_ADMIN_PW 변경 후 재빌드를 하지 않음
     (Vite는 빌드 시점에 VITE_ 변수를 번들에 삽입)
해결:
  cd /opt/resort-app
  npm run build
  cp -r dist/ /var/www/resort-app/
```

---

## 15. 디렉터리 구조

```
/opt/resort-app/                 ← 애플리케이션 루트
├── .env                         ← 환경변수 (chmod 600 필수)
├── .env.example                 ← 환경변수 예시 (참고용)
├── package.json
├── vite.config.js               ← 프론트엔드 빌드 설정
├── index.html                   ← SPA 진입점
│
├── src/                         ← 프론트엔드 소스 (React)
│   ├── App.jsx                  ← 메인 앱 컴포넌트
│   ├── storage.js               ← localStorage 기반 데이터 저장
│   ├── api.js                   ← DB 연동 시 사용할 API 클라이언트
│   ├── constants.js             ← 전역 상수 (관리자 비밀번호 등)
│   ├── pages/                   ← 페이지 컴포넌트
│   ├── admin/                   ← 관리자 화면 컴포넌트
│   └── components/              ← 공통 UI 컴포넌트
│
├── server/                      ← 백엔드 소스 (Node.js)
│   ├── index.js                 ← Express API 서버 (메인)
│   ├── db.js                    ← Oracle/Tibero DB 연결 관리
│   ├── mailer.js                ← 내부 메일서버 연동
│   └── schema.sql               ← DB 테이블 생성 스크립트
│
└── dist/                        ← 빌드 결과물 (npm run build 후 생성)
    ├── index.html
    └── assets/

/var/www/resort-app/             ← Nginx 서비스 루트 (dist/ 복사 위치)
/etc/nginx/conf.d/resort-app.conf  ← Nginx 설정
/etc/systemd/system/resort-app.service  ← systemd 서비스 등록
```

---

## 빠른 시작 요약 (Quick Start)

```bash
# 1. 디렉터리 생성 및 소스 이관
mkdir -p /opt/resort-app && cd /opt/resort-app
tar -xzf /tmp/resort-app.tar.gz --strip-components=1

# 2. 패키지 설치 (방법 B: node_modules 이관 시)
tar -xzf /tmp/node_modules.tar.gz

# 3. 환경변수 설정
cp .env.example .env && vi .env    # DB, JWT, MAIL 설정 입력

# 4. DB 스키마 생성
sqlplus RESORT_APP/pw@host:1521/SID @server/schema.sql

# 5. 프론트엔드 빌드 및 배포
npm run build
cp -r dist/ /var/www/resort-app/

# 6. Nginx 설정 후 시작
cp /tmp/resort-app.conf /etc/nginx/conf.d/
nginx -t && systemctl start nginx && systemctl enable nginx

# 7. API 서버 서비스 등록 및 시작
cp /tmp/resort-app.service /etc/systemd/system/
systemctl daemon-reload
systemctl start resort-app && systemctl enable resort-app

# 8. 접속 확인
curl -I http://localhost/
```

---

*문의사항은 개발팀에 연락하세요.*
