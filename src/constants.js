// ── 상수 & 헬퍼 ───────────────────────────────────────────────────────────────

/**
 * 관리자 비밀번호: .env 파일의 VITE_ADMIN_PW 환경변수에서 읽음
 * 설정 방법: .env 파일에 VITE_ADMIN_PW=비밀번호 추가
 * 미설정 시 기본값 사용 (운영 배포 시 반드시 환경변수로 설정할 것)
 */
export const ADMIN_PW = import.meta.env.VITE_ADMIN_PW ?? 'resort2026'
export const YEAR     = new Date().getFullYear()
export const SK       = 'kosha-resort'

// ※ simpleHash 제거 — src/security.js 의 hashPwd / verifyPwdCompat 사용

export const SEASON_MAP = {
  성수기:   [7, 8],
  준성수기: [1, 5, 6, 9, 10, 12],
  비수기:   [2, 3, 4, 11],
}

export const SEASON_STYLE = {
  성수기:   { bg: 'var(--color-background-danger)',  text: 'var(--color-text-danger)'  },
  준성수기: { bg: 'var(--color-background-warning)', text: 'var(--color-text-warning)' },
  비수기:   { bg: 'var(--color-background-success)', text: 'var(--color-text-success)' },
}

export const MONTHS_KR = [
  '1월','2월','3월','4월','5월','6월',
  '7월','8월','9월','10월','11월','12월',
]

export const DEFAULT_ROOMS = [
  {
    id: 'r1', name: '호텔형 스텐다드',
    desc: '호텔 수준의 편의시설, 2인 기준',
    capacity: 2, maxNights: 2, supportRate: 50,
    availableFrom: '', availableTo: '',
    prices: { 비수기: 80000, 준성수기: 120000, 성수기: 180000 },
  },
  {
    id: 'r2', name: '리조트형 트윈 오션',
    desc: '오션뷰 트윈 베드, 테라스 & 바다 전망',
    capacity: 2, maxNights: 2, supportRate: 50,
    availableFrom: '', availableTo: '',
    prices: { 비수기: 120000, 준성수기: 180000, 성수기: 250000 },
  },
]

export const DEFAULT_SETTINGS = {
  rooms:              DEFAULT_ROOMS,
  quotas:             Object.fromEntries([...Array(12)].map((_, i) => [i + 1, 20])),
  applicationPeriods: Object.fromEntries([...Array(12)].map((_, i) => [i + 1, { start: '', end: '' }])),
  fundBudget:         20_000_000,
}

export const getSeason = m =>
  Object.entries(SEASON_MAP).find(([, ms]) => ms.includes(m))?.[0] ?? '비수기'

export const won    = n  => Math.round(Number(n)).toLocaleString('ko-KR') + '원'
export const pctOf  = (n, t) => (t > 0 ? Math.min(100, Math.round((n / t) * 100)) : 0)
export const fmtDate = s => (s ? new Date(s).toLocaleDateString('ko-KR') : '-')
export const fmtDT   = s =>
  s ? new Date(s).toLocaleString('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  }) : '-'

export const extEmail = id => `${id}@kosha.or.kr`
export const intEmail = id => `${id}@kosha-kms1.kosha.or.kr`

export const isPeriodOpen = (settings, month) => {
  const p = settings.applicationPeriods?.[month]
  if (!p?.start || !p?.end) return true
  const now = Date.now()
  return now >= new Date(p.start).getTime() && now <= new Date(p.end).getTime() + 86_399_999
}
