import { intEmail, won } from './constants'

// ── 메일 본문 생성 ─────────────────────────────────────────────────────────

export const buildEmailBody = (type, app, emp, month) => {
  const dept = emp ? `${emp.organization ?? ''} ${emp.department ?? ''}`.trim() : ''
  const deptStr = dept ? ` (${dept})` : ''

  if (type === 'winner') {
    return `안녕하세요. 안전보건공단 발전기금 휴양소 담당부서입니다.

사번 ${app.empId}${deptStr}님,
${month}월 직원 휴양소 예약 추첨 결과를 안내드립니다.

★ 당첨을 축하드립니다! ★

■ 예약 정보
  객실:      ${app.roomType}
  숙박:      ${app.nights}박
  총 숙박료: ${won(app.total)}
  지원금:    ${won(app.subsidy)} (발전기금 ${app.supportRate}%)
  본인부담:  ${won(app.total - app.subsidy)}

예약 확정을 위해 담당부서로 연락해주시기 바랍니다.

감사합니다.
안전보건공단 발전기금 휴양소 담당부서`.trim()
  }

  return `안녕하세요. 안전보건공단 발전기금 휴양소 담당부서입니다.

사번 ${app.empId}${deptStr}님,
${month}월 직원 휴양소 예약 추첨 결과를 안내드립니다.

아쉽게도 이번 추첨에서 선정되지 못하셨습니다.
다음 기회에 다시 신청해주시기 바랍니다.

감사합니다.
안전보건공단 발전기금 휴양소 담당부서`.trim()
}

// ── 수신자 이메일 주소 ─────────────────────────────────────────────────────
// 추첨 결과는 당첨/낙첨과 무관하게 내부 메일로 발송합니다.
export const getRecipient = empId => intEmail(empId)

// ── Anthropic API → Gmail MCP 발송 ────────────────────────────────────────
// 환경변수 VITE_ANTHROPIC_API_KEY 를 .env 파일에 설정하세요.
// 주의: 실운영 시 API 키는 반드시 서버 측에서 관리해야 합니다.

export const sendEmail = async (to, subject, body) => {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('VITE_ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다.')

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type':           'application/json',
      'x-api-key':              apiKey,
      'anthropic-version':      '2023-06-01',
      'anthropic-beta':         'mcp-client-2025-04-04',
    },
    body: JSON.stringify({
      model:      'claude-sonnet-4-20250514',
      max_tokens: 512,
      messages: [{
        role:    'user',
        content: `다음 이메일을 즉시 발송해주세요.\n받는 사람: ${to}\n제목: ${subject}\n본문:\n${body}`,
      }],
      mcp_servers: [{
        type: 'url',
        url:  'https://gmailmcp.googleapis.com/mcp/v1',
        name: 'gmail',
      }],
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message ?? `HTTP ${res.status}`)
  }

  const data = await res.json()
  if (data.type === 'error') throw new Error(data.error?.message ?? 'API 오류')
  return data
}
