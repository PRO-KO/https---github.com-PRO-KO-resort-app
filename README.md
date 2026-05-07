# 안전보건공단 발전기금 휴양소 예약 시스템

안전보건공단 임직원 복리후생 — 발전기금 휴양소 무작위 추첨 예약 시스템입니다.

---

## 프로젝트 구조

```
src/
├── constants.js          # 상수, 헬퍼 함수 (시즌, 요금, 이메일 주소 등)
├── storage.js            # localStorage 영속성 레이어
├── emailService.js       # 수동 메일 발송 화면용 본문/수신자 헬퍼
├── App.jsx               # 앱 루트 (라우팅, 전역 상태)
├── index.css             # 디자인 토큰 + 전역 스타일
│
├── components/
│   └── UI.jsx            # 공통 UI (Btn, Card, Alert, Badge 등)
│
├── pages/
│   ├── LoginPage.jsx     # 로그인 (로고 5회 클릭 → 관리자 패널)
│   ├── RegisterPage.jsx  # 가입 신청 (기관/부서/전화 포함)
│   ├── HomePage.jsx      # 홈 (객실 정보, 경쟁률, 지원금 현황)
│   ├── ApplyPage.jsx     # 예약 신청 (경쟁률 실시간, 비용 미리보기)
│   └── StatusPage.jsx    # 내 신청 현황
│
└── admin/
    ├── AdminLayout.jsx   # 관리자 탭 쉘
    ├── ApprovalTab.jsx   # 가입 승인 / 거절
    ├── LotteryTab.jsx    # 무작위 추첨 + 별도 배정
    ├── PeriodTab.jsx     # 월별 신청 기간 & 선발 인원 설정
    ├── FundTab.jsx       # 발전기금 배정액·집행·잔액 실시간 현황
    ├── RoomsTab.jsx      # 객실 정보 설정 (지원율%, 요금, 기간)
    ├── AppListTab.jsx    # 날짜별 신청인 현황 (기관/부서/사번/전화)
    ├── EmailTab.jsx      # 추첨 결과 내부 메일 발송/미리보기
    └── AccountsTab.jsx   # 계정 관리
```

---

## 빠른 시작

### 1. 패키지 설치

```bash
cd resort-app
npm install
```

### 2. 환경 변수 설정 (메일 발송 사용 시)

```bash
cp .env.example .env
# .env 파일을 열어 MAIL_* 내부 SMTP 설정을 입력
```

### 3. 개발 서버 실행

```bash
npm run dev
# → http://localhost:3000 에서 자동 실행
```

### 4. 빌드 (배포용)

```bash
npm run build
# → dist/ 폴더에 정적 파일 생성
```

---

## 주요 기능

| 구분 | 기능 |
|------|------|
| **직원** | 사번+비밀번호 로그인, 가입 신청 (기관·부서·전화 입력) |
| **예약 신청** | 월/객실/박수 선택, 경쟁률 실시간 표시, 비용 미리보기 |
| **관리자 접근** | 로그인 화면 로고 **5회 클릭** → 관리자 비밀번호 입력 |
| **가입 승인** | 신청자 정보 확인 후 승인/거절, 거절 사유 입력 |
| **추첨** | 무작위 난수 추첨 / 별도 배정 (수동 지정) 분리 |
| **신청 기간** | 월별 시작일~마감일 설정, 선발 인원 조정 |
| **발전기금** | 연간 배정액 수정, 집행액·잔액 실시간 확인, 월별 집행 현황 |
| **객실 설정** | 객실별 지원율(%), 예약 가능 기간, 시즌별 요금 설정 |
| **신청인 현황** | 기관·부서·사번·휴대폰·신청일 필터 조회 |
| **메일 발송** | 추첨 결과와 무관하게 모든 신청자에게 내부 메일 알림 발송 |

---

## 관리자 비밀번호

기본값: `resort2026`

`src/constants.js` 의 `ADMIN_PW` 상수를 수정하거나,
실운영 시 `import.meta.env.VITE_ADMIN_PW` 환경변수로 이전하세요.

---

## 데이터 저장

브라우저 **localStorage** 에 저장됩니다. (키 prefix: `kosha-resort::`)

| 키 | 내용 |
|----|------|
| `kosha-resort::employees` | 직원 계정 (사번, 비밀번호 해시, 기관, 부서, 전화) |
| `kosha-resort::apps` | 예약 신청 내역 |
| `kosha-resort::settings` | 객실 설정, 월별 쿼터·기간 |
| `kosha-resort::fundUsed` | 발전기금 집행 누계액 |

> 실운영 시 Node.js + DB(PostgreSQL / MySQL)로 전환을 권장합니다.
> Claude Code를 활용하면 백엔드 전환 작업을 빠르게 진행할 수 있습니다.

---

## 메일 발송 구조

```
관리자 추첨 실행 → PUT /api/apps
                → server/mailer.js
                → 내부 SMTP 서버
                → 신청자 내부 메일
```

- **추첨 결과 메일**: 당첨·별도배정·낙첨과 무관하게 모든 결과 확정 신청자에게 `{사번}@kosha-kms1.kosha.or.kr` 내부 메일로 발송
- 서버 DB/API 모드에서는 `PUT /api/apps`로 추첨 결과가 저장될 때 상태가 `selected`, `manual`, `rejected`로 변경된 신청자에게 자동 발송됩니다.
- 내부 메일 도메인이 다르면 `.env`에 `MAIL_INTERNAL_DOMAIN=내부메일도메인`을 설정하세요.
