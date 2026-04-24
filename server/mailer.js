/**
 * server/mailer.js — 내부 메일서버 연동 모듈
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 개요
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * 이 파일은 폐쇄망 환경의 내부 메일서버(SMTP)와 연동하여 다음 메일을 발송합니다.
 *
 *   ① 가입 신청 알림       → 관리자에게 (새 계정 승인 요청)
 *   ② 계정 승인/거절 알림  → 해당 직원에게
 *   ③ 추첨 결과 알림       → 당첨/미당첨 직원에게
 *   ④ 예약 취소 확인       → 취소 처리된 직원에게
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 패키지 설치
 * ══════════════════════════════════════════════════════════════════════════════
 *
 *   npm install nodemailer
 *
 *   nodemailer는 SMTP 프로토콜을 지원하는 순수 Node.js 패키지입니다.
 *   외부 인터넷 연결 없이 내부 SMTP 서버에 직접 연결할 수 있어 폐쇄망에 적합합니다.
 *
 *   ┌─────────────────────────────────────────────────────────────────────┐
 *   │ 폐쇄망 오프라인 설치 방법                                             │
 *   │                                                                     │
 *   │ 1. 인터넷이 되는 PC에서 패키지를 로컬로 다운로드:                       │
 *   │      npm pack nodemailer                                            │
 *   │      → nodemailer-X.X.X.tgz 파일 생성                               │
 *   │                                                                     │
 *   │ 2. 생성된 .tgz 파일을 폐쇄망 서버로 복사 후 설치:                       │
 *   │      npm install ./nodemailer-X.X.X.tgz                            │
 *   └─────────────────────────────────────────────────────────────────────┘
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 환경변수 (.env 파일에 추가)
 * ══════════════════════════════════════════════════════════════════════════════
 *
 *   MAIL_ENABLED=true          # 메일 발송 기능 활성화 (false이면 콘솔 출력만)
 *   MAIL_HOST=192.168.1.10     # 내부 SMTP 서버 IP 또는 호스트명
 *   MAIL_PORT=25               # SMTP 포트 (일반: 25, SSL: 465, TLS: 587)
 *   MAIL_SECURE=false          # true이면 SSL/TLS 사용 (포트 465 시 true)
 *   MAIL_USER=resort@kosha.or.kr    # SMTP 인증 계정 (인증 불필요 시 생략)
 *   MAIL_PASS=메일비밀번호            # SMTP 인증 비밀번호 (인증 불필요 시 생략)
 *   MAIL_FROM=resort@kosha.or.kr    # 발신자 주소
 *   MAIL_ADMIN=admin@kosha.or.kr    # 가입 신청 알림 수신 관리자 이메일
 *
 *   ── 폐쇄망 SMTP 서버별 일반적인 설정 ────────────────────────────────────
 *
 *   [내부 메일 서버 (인증 없음, 릴레이 허용)]
 *     MAIL_HOST=192.168.1.10
 *     MAIL_PORT=25
 *     MAIL_SECURE=false
 *     # MAIL_USER, MAIL_PASS 생략 (인증 없음)
 *
 *   [Microsoft Exchange — SMTP 릴레이]
 *     MAIL_HOST=exchange.내부도메인.or.kr
 *     MAIL_PORT=587
 *     MAIL_SECURE=false          # STARTTLS는 false로 설정 (nodemailer가 자동 처리)
 *     MAIL_USER=resort@kosha.or.kr
 *     MAIL_PASS=Exchange_비밀번호
 *
 *   [GroupWare 내부 SMTP]
 *     MAIL_HOST=groupware.kosha.or.kr
 *     MAIL_PORT=25 (또는 465/587)
 *     MAIL_USER=resort_system@kosha.or.kr
 *     MAIL_PASS=그룹웨어_계정_비밀번호
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 직원 이메일 주소 확보 방법
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * 현재 KOSHA_EMPLOYEES 테이블에는 이메일 컬럼이 없습니다.
 * 메일 발송을 위해 다음 중 한 가지 방법으로 이메일 정보를 확보하세요.
 *
 * [방법 A] KOSHA_EMPLOYEES 테이블에 EMAIL 컬럼 추가 (권장)
 *
 *   -- Oracle / Tibero 모두 동일
 *   ALTER TABLE KOSHA_EMPLOYEES ADD (EMAIL VARCHAR2(200));
 *
 *   -- 가입 신청 시 이메일 입력 필드 추가 필요
 *   -- RegisterPage.jsx에 email 입력 필드 추가 → POST /api/employees/register body에 포함
 *
 * [방법 B] 사번으로 이메일 주소 생성 (사번 = 이메일 ID 규칙인 경우)
 *
 *   // 예: 사번 '20240001' → 'e20240001@kosha.or.kr'
 *   const empEmail = `e${empId.toLowerCase()}@kosha.or.kr`
 *
 * [방법 C] 별도 인사 DB 조회 (HR 시스템과 연동)
 *
 *   // 인사 DB에서 사번으로 이메일 조회
 *   const hrEmail = await getEmailFromHR(empId)
 *
 */

import 'dotenv/config'
import nodemailer from 'nodemailer'

// ──────────────────────────────────────────────────────────────────────────────
// 메일 기능 활성화 여부
// MAIL_ENABLED=false이면 실제 발송 없이 콘솔에 출력만 합니다 (개발/테스트 유용)
// ──────────────────────────────────────────────────────────────────────────────
const MAIL_ENABLED = process.env.MAIL_ENABLED === 'true'

// ──────────────────────────────────────────────────────────────────────────────
// Nodemailer Transporter 생성
// ──────────────────────────────────────────────────────────────────────────────

/**
 * SMTP 전송 객체 생성
 *
 * nodemailer.createTransport()는 SMTP 연결 설정을 받아 Transporter 객체를 반환합니다.
 * 이 객체의 sendMail() 메서드로 메일을 발송합니다.
 *
 * ── 주요 옵션 설명 ────────────────────────────────────────────────────────────
 *
 * host    : SMTP 서버 IP 또는 호스트명
 * port    : SMTP 포트 번호
 *           - 25   : 기본 SMTP (암호화 없음, 서버 간 릴레이에 주로 사용)
 *           - 465  : SMTPS (SSL/TLS 즉시 연결, secure: true 필요)
 *           - 587  : SUBMISSION (STARTTLS 업그레이드, secure: false + STARTTLS 자동)
 *
 * secure  : true이면 SSL/TLS 즉시 연결 (포트 465)
 *           false이면 평문 연결 후 STARTTLS로 업그레이드 (포트 587) 또는 평문 유지 (포트 25)
 *
 * auth    : 인증 정보 (내부 SMTP 릴레이에서 인증이 필요 없는 경우 이 블록 전체 제거)
 *   user  : 인증 계정 (이메일 주소 형태 또는 단순 계정명)
 *   pass  : 인증 비밀번호
 *
 * tls     : TLS 세부 옵션
 *   rejectUnauthorized: false → 자체 서명(Self-signed) 인증서를 허용합니다.
 *                               폐쇄망 내부 서버는 공인 CA 인증서가 없는 경우가 많으므로
 *                               이 옵션을 false로 설정해야 연결이 성공합니다.
 *                               ※ 보안 주의: 외부 인터넷 환경에서는 true로 유지하세요.
 *
 * connectionTimeout  : SMTP 서버 접속 대기 시간 (ms). 폐쇄망에서 서버가 응답 없으면
 *                       이 시간 후 에러를 발생시킵니다. (기본값: 2000ms)
 * greetingTimeout    : EHLO/HELO 응답 대기 시간 (ms)
 * socketTimeout      : 소켓 유휴 타임아웃 (ms)
 */
const transporter = nodemailer.createTransport({
    host:   process.env.MAIL_HOST || '192.168.1.10',
    port:   Number(process.env.MAIL_PORT) || 25,
    secure: process.env.MAIL_SECURE === 'true',  // 포트 465이면 true, 25/587이면 false

    // ── 인증이 필요한 경우만 활성화 ──────────────────────────────────────────
    // 내부 SMTP 릴레이가 인증 없이 허용되는 경우 auth 블록 전체를 주석 처리하세요.
    auth: process.env.MAIL_USER ? {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS,
    } : undefined,

    tls: {
        // 폐쇄망 내부 서버의 자체 서명 인증서 허용
        // 운영 환경에서 공인 인증서 사용 시 true로 변경하세요.
        rejectUnauthorized: false,
    },

    // ── 타임아웃 설정 ────────────────────────────────────────────────────────
    // 폐쇄망 환경에서 메일 서버가 느린 경우 값을 늘리세요.
    connectionTimeout: 5000,  // 5초 내 접속 실패 시 에러 (기본 2초)
    greetingTimeout:   3000,
    socketTimeout:    10000,
})


// ──────────────────────────────────────────────────────────────────────────────
// SMTP 연결 테스트 유틸리티
// ──────────────────────────────────────────────────────────────────────────────

/**
 * 서버 시작 시 SMTP 연결 상태를 확인합니다.
 * index.js의 start() 함수에서 호출하세요.
 *
 * 사용 예:
 *   import { verifyMailer } from './mailer.js'
 *   await verifyMailer()  // 연결 실패 시 경고만 출력 (서버는 계속 구동)
 */
export async function verifyMailer() {
    if (!MAIL_ENABLED) {
        console.log('[MAIL] 메일 기능 비활성화됨 (MAIL_ENABLED=false)')
        return
    }
    try {
        await transporter.verify()
        console.log(`[MAIL] SMTP 서버 연결 성공: ${process.env.MAIL_HOST}:${process.env.MAIL_PORT}`)
    } catch (err) {
        // 메일 서버 연결 실패 시 서버 전체를 멈추지 않고 경고만 출력합니다.
        // 메일 발송이 핵심 기능이 아닌 부가 기능이므로 이 방식이 적합합니다.
        // 메일이 필수 기능이라면 process.exit(1)로 바꾸어 강제 종료하세요.
        console.warn('[MAIL] SMTP 서버 연결 실패 — 메일 발송 불가:', err.message)
    }
}


// ──────────────────────────────────────────────────────────────────────────────
// 공통 발송 함수
// ──────────────────────────────────────────────────────────────────────────────

/**
 * 메일 발송 내부 함수
 *
 * @param {object} options
 * @param {string|string[]} options.to      - 수신자 이메일 (문자열 또는 배열)
 * @param {string}          options.subject - 제목
 * @param {string}          options.text    - 본문 (plain text)
 * @param {string}          [options.html]  - 본문 (HTML, 없으면 text 사용)
 *
 * ── 반환 ──────────────────────────────────────────────────────────────────────
 * 성공 시: { accepted: ['email@...'], messageId: '...' }
 * 실패 시: 에러를 throw하지 않고 console.error로 기록 (메일 실패가 업무 흐름을 막지 않도록)
 *
 * ── 폐쇄망 주의사항 ────────────────────────────────────────────────────────────
 * 수신자 주소 도메인이 내부 도메인(예: @kosha.or.kr)인지 확인하세요.
 * 외부 도메인(@gmail.com 등)으로 발송하면 내부 SMTP가 릴레이를 거부할 수 있습니다.
 */
async function send({ to, subject, text, html }) {
    if (!MAIL_ENABLED) {
        // 개발/테스트 환경에서는 콘솔에 출력만 합니다.
        console.log('[MAIL] (미발송 — MAIL_ENABLED=false)')
        console.log(`  TO     : ${Array.isArray(to) ? to.join(', ') : to}`)
        console.log(`  SUBJECT: ${subject}`)
        console.log(`  BODY   : ${text?.slice(0, 200)}`)
        return
    }

    try {
        const info = await transporter.sendMail({
            from:    process.env.MAIL_FROM || 'resort@kosha.or.kr',  // 발신자
            to:      Array.isArray(to) ? to.join(', ') : to,         // 수신자
            subject,
            text,          // 일반 텍스트 본문
            html: html || undefined,  // HTML 본문 (선택)
        })
        console.log(`[MAIL] 발송 완료 → ${to} | messageId: ${info.messageId}`)
        return info
    } catch (err) {
        // 메일 발송 실패는 로그만 남기고 API 응답에는 영향을 주지 않습니다.
        // 메일 실패로 인해 가입 신청, 승인 처리 등의 업무가 중단되지 않아야 합니다.
        console.error('[MAIL] 발송 실패:', err.message)
        // 필요하다면 DB에 실패 로그를 저장하거나 재시도 큐에 넣을 수 있습니다.
        // → 재시도 패턴: bull/bullmq(Redis 기반 큐) 또는 단순 setTimeout 재시도
    }
}


// ══════════════════════════════════════════════════════════════════════════════
// 비즈니스 이벤트별 메일 발송 함수
//
// 각 함수는 index.js의 API 핸들러에서 호출됩니다.
// 함수명 아래의 "호출 위치" 주석을 참고하여 index.js를 수정하세요.
// ══════════════════════════════════════════════════════════════════════════════


/**
 * ① 가입 신청 알림 → 관리자에게
 *
 * 호출 위치: index.js — POST /api/employees/register 성공 후
 *
 *   // 아래 코드를 return res.status(201).json(...) 직전에 추가
 *   import { mailNewRegister } from './mailer.js'
 *   await mailNewRegister({ empId: id, organization, department })
 *
 * @param {{ empId: string, organization: string, department: string }} info
 */
export async function mailNewRegister({ empId, organization, department }) {
    const adminEmail = process.env.MAIL_ADMIN || 'admin@kosha.or.kr'

    await send({
        to: adminEmail,
        subject: '[휴양소 예약] 신규 가입 신청 — 승인 요청',
        text: [
            '안녕하십니까.',
            '',
            '휴양소 예약 시스템에 신규 가입 신청이 접수되었습니다.',
            '관리자 페이지에서 확인 후 승인 또는 거절 처리 바랍니다.',
            '',
            `  사번     : ${empId}`,
            `  소속기관  : ${organization || '미기재'}`,
            `  부서     : ${department || '미기재'}`,
            '',
            '※ 이 메일은 자동 발송되었습니다.',
        ].join('\n'),

        // ── HTML 버전 (더 보기 좋은 형태로 표시하려면 아래 html 옵션 사용) ──
        // html: `
        //   <h3>신규 가입 신청</h3>
        //   <table border="1" cellpadding="6">
        //     <tr><th>사번</th><td>${empId}</td></tr>
        //     <tr><th>소속기관</th><td>${organization || '-'}</td></tr>
        //     <tr><th>부서</th><td>${department || '-'}</td></tr>
        //   </table>
        //   <p>관리자 페이지에서 승인 처리 바랍니다.</p>
        // `,
    })
}


/**
 * ② 계정 승인 알림 → 해당 직원에게
 *
 * 호출 위치: index.js — PUT /api/employees/:empId 에서 status='approved' 처리 후
 *
 *   // 아래 코드를 return res.json({ message: '수정 완료' }) 직전에 추가
 *   import { mailAccountApproved } from './mailer.js'
 *   if (status === 'approved') {
 *     // 직원 이메일 조회 필요 (방법 A/B/C 중 선택, 상단 주석 참고)
 *     const empEmail = `e${empId.toLowerCase()}@kosha.or.kr`  // 방법 B 예시
 *     await mailAccountApproved({ empId, empEmail })
 *   }
 *
 * @param {{ empId: string, empEmail: string }} info
 */
export async function mailAccountApproved({ empId, empEmail }) {
    await send({
        to: empEmail,
        subject: '[휴양소 예약] 계정 가입이 승인되었습니다',
        text: [
            `${empId} 님, 안녕하십니까.`,
            '',
            '휴양소 예약 시스템 계정 가입이 승인되었습니다.',
            '아래 주소로 접속하여 예약을 신청하실 수 있습니다.',
            '',
            // 실제 서비스 URL로 변경하세요.
            `  접속 주소: http://resort.kosha.or.kr (내부망)`,
            '',
            '감사합니다.',
            '안전보건공단 발전기금 사업팀 드림',
        ].join('\n'),
    })
}


/**
 * ③ 계정 거절 알림 → 해당 직원에게
 *
 * 호출 위치: index.js — PUT /api/employees/:empId 에서 status='rejected' 처리 후
 *
 *   import { mailAccountRejected } from './mailer.js'
 *   if (status === 'rejected') {
 *     const empEmail = `e${empId.toLowerCase()}@kosha.or.kr`
 *     await mailAccountRejected({ empId, empEmail })
 *   }
 *
 * @param {{ empId: string, empEmail: string, reason?: string }} info
 */
export async function mailAccountRejected({ empId, empEmail, reason }) {
    await send({
        to: empEmail,
        subject: '[휴양소 예약] 계정 가입 신청 결과 안내',
        text: [
            `${empId} 님, 안녕하십니까.`,
            '',
            '죄송합니다. 휴양소 예약 시스템 계정 가입 신청이 승인되지 않았습니다.',
            reason ? `\n  사유: ${reason}\n` : '',
            '문의사항은 담당 부서로 연락 바랍니다.',
            '',
            '안전보건공단 발전기금 사업팀 드림',
        ].join('\n'),
    })
}


/**
 * ④ 추첨 결과 알림 → 당첨자에게 (개별 발송)
 *
 * 호출 위치: index.js — PUT /api/apps (추첨 결과 일괄 업데이트) 완료 후
 *
 *   import { mailLotteryResult } from './mailer.js'
 *
 *   // 추첨 결과 저장 후 각 신청자에게 메일 발송
 *   // (apps 배열에 empEmail이 포함되어야 합니다 — GET /api/apps 응답에 추가 필요)
 *   const notifications = apps.map(app =>
 *     mailLotteryResult({
 *       empId:    app.empId,
 *       empEmail: `e${app.empId.toLowerCase()}@kosha.or.kr`,  // 방법 B 예시
 *       month:    app.month,
 *       roomType: app.roomType,
 *       nights:   app.nights,
 *       status:   app.status,  // 'selected' | 'rejected'
 *     })
 *   )
 *   // Promise.allSettled: 일부 메일 실패 시에도 나머지 계속 발송
 *   await Promise.allSettled(notifications)
 *
 * @param {{ empId, empEmail, month, roomType, nights, status }} info
 */
export async function mailLotteryResult({ empId, empEmail, month, roomType, nights, status }) {
    const isSelected = status === 'selected'

    const roomLabel = {
        standard:  '일반형',
        premium:   '우수형',
        family:    '가족형',
        // roomType 값이 추가될 경우 여기에 추가하세요.
    }[roomType] || roomType

    await send({
        to: empEmail,
        subject: isSelected
            ? `[휴양소 예약] 축하합니다! ${month}월 추첨 당첨 안내`
            : `[휴양소 예약] ${month}월 추첨 결과 안내`,
        text: isSelected
            ? [
                `${empId} 님, 안녕하십니까.`,
                '',
                `${month}월 휴양소 예약 추첨에 당첨되셨습니다. 축하드립니다!`,
                '',
                `  객실 유형  : ${roomLabel}`,
                `  숙박 일수  : ${nights}박`,
                '',
                '상세 일정은 담당 부서에서 별도 안내드릴 예정입니다.',
                '감사합니다.',
                '',
                '안전보건공단 발전기금 사업팀 드림',
            ].join('\n')
            : [
                `${empId} 님, 안녕하십니까.`,
                '',
                `${month}월 휴양소 예약 추첨 결과 다음 기회를 기약해 주시기 바랍니다.`,
                '다음 달 예약 신청도 많은 관심 부탁드립니다.',
                '',
                '감사합니다.',
                '안전보건공단 발전기금 사업팀 드림',
            ].join('\n'),
    })
}


/**
 * ⑤ 예약 취소 확인 알림 → 해당 직원에게
 *
 * 호출 위치: index.js — DELETE /api/apps/:id 완료 후
 *
 *   import { mailCancellation } from './mailer.js'
 *
 *   // 삭제 전 신청 정보를 먼저 조회해야 합니다.
 *   const { rows: appRows } = await execute(
 *     'SELECT EMP_ID, APP_MONTH, ROOM_TYPE, NIGHTS FROM KOSHA_APPS WHERE APP_ID = :1',
 *     [req.params.id]
 *   )
 *   if (appRows[0]) {
 *     const a = appRows[0]
 *     const empEmail = `e${a.EMP_ID.toLowerCase()}@kosha.or.kr`
 *     await mailCancellation({ empId: a.EMP_ID, empEmail, month: a.APP_MONTH, roomType: a.ROOM_TYPE })
 *   }
 *   // 그 후 DELETE 실행
 *
 * @param {{ empId, empEmail, month, roomType }} info
 */
export async function mailCancellation({ empId, empEmail, month, roomType }) {
    await send({
        to: empEmail,
        subject: `[휴양소 예약] ${month}월 예약 신청 취소 확인`,
        text: [
            `${empId} 님, 안녕하십니까.`,
            '',
            `${month}월 휴양소 예약 신청이 취소 처리되었습니다.`,
            '',
            '문의사항은 담당 부서로 연락 바랍니다.',
            '',
            '안전보건공단 발전기금 사업팀 드림',
        ].join('\n'),
    })
}


// ══════════════════════════════════════════════════════════════════════════════
// Microsoft Exchange EWS 연동 (대안 — SMTP 대신 Exchange Web Services 사용 시)
// ══════════════════════════════════════════════════════════════════════════════
//
// 조직에서 Exchange 서버를 사용하고 SMTP 릴레이 대신 EWS API로 메일을 보내야 한다면
// nodemailer 대신 아래 방법을 사용하세요.
//
// 패키지: npm install ews-javascript-api
//
// ┌──────────────────────────────────────────────────────────────────────────┐
// │ EWS 연동 예시 코드 (주석 상태, 필요 시 활성화)                              │
// │                                                                          │
// │ import { ExchangeService, Uri, WebCredentials,                           │
// │          EmailMessage, MessageBody } from 'ews-javascript-api'           │
// │                                                                          │
// │ async function sendViaEWS({ to, subject, body }) {                       │
// │   const svc = new ExchangeService()                                      │
// │   svc.Url = new Uri('https://exchange.kosha.or.kr/EWS/Exchange.asmx')   │
// │   svc.Credentials = new WebCredentials(                                  │
// │     process.env.EWS_USER,   // 예: KOSHA\\resort_system                  │
// │     process.env.EWS_PASS                                                 │
// │   )                                                                      │
// │   const msg = new EmailMessage(svc)                                      │
// │   msg.Subject = subject                                                  │
// │   msg.Body = new MessageBody(body)                                       │
// │   msg.ToRecipients.Add(to)                                               │
// │   await msg.SendAndSaveCopy()                                            │
// │ }                                                                        │
// └──────────────────────────────────────────────────────────────────────────┘
//
// EWS 관련 추가 환경변수:
//   EWS_USER=KOSHA\\resort_system
//   EWS_PASS=Exchange_비밀번호
//   EWS_URL=https://exchange.kosha.or.kr/EWS/Exchange.asmx
//
// ── EWS vs SMTP 선택 기준 ──────────────────────────────────────────────────
//   SMTP 릴레이: 단순하고 nodemailer 하나로 해결. 서버에서 릴레이 IP 허용 설정 필요.
//   EWS API:    Exchange 계정 자격증명 필요. 릴레이 설정 없이 직접 발송 가능.
//               기존 공유 메일함(resort@kosha.or.kr)으로 발송 시 적합.
