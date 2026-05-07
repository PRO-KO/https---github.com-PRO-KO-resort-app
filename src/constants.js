// ── 상수 & 헬퍼 ───────────────────────────────────────────────────────────────

/**
 * 관리자 비밀번호: .env 파일의 VITE_ADMIN_PW 환경변수에서 읽음
 * 설정 방법: .env 파일에 VITE_ADMIN_PW=비밀번호 추가
 * 개발 환경에서만 기본값을 허용합니다.
 * 운영 빌드에서는 VITE_ADMIN_PW가 없으면 관리자 로그인을 비활성화합니다.
 */
export const ADMIN_PW = import.meta.env.VITE_ADMIN_PW ?? (import.meta.env.DEV ? 'resort2026' : '')
export const ADMIN_PW_CONFIGURED = ADMIN_PW.length >= 8
export const YEAR     = new Date().getFullYear()
export const SK       = 'kosha-resort'

// ※ simpleHash 제거 — src/security.js 의 hashPwd / verifyPwdCompat 사용

// 1회 신청당 최대 숙박 일수
export const MAX_NIGHTS = 2

// 성수기 월 (일별 체크인 제한 적용 대상)
export const PEAK_MONTHS = [7, 8]
// 성수기 일별 기본 제한 인원 (관리자가 개별 변경 가능)
export const DEFAULT_PEAK_DAY_QUOTA = 5

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
  // 성수기(7·8월) 일별 체크인 제한 인원: { 7: { 1: 5, 2: 5, ..., 31: 5 }, 8: {...} }
  peakDayQuotas: Object.fromEntries(
    PEAK_MONTHS.map(m => [m, Object.fromEntries([...Array(31)].map((_, i) => [i + 1, DEFAULT_PEAK_DAY_QUOTA]))])
  ),
  // 성수기 공휴일: holidays 배열에서 파생 (backward compat 유지용)
  peakHolidays: { 7: [], 8: [15] },
  datePrices: [],
  // 공휴일 목록 — { id, date: 'YYYY-MM-DD', name } 형식
  // 음력 공휴일(설날·추석·부처님오신날)은 해마다 날짜가 바뀌므로 관리자가 직접 추가
  holidays: [
    { id: 'dh_0101', date: `${YEAR}-01-01`, name: '신정' },
    { id: 'dh_0301', date: `${YEAR}-03-01`, name: '삼일절' },
    { id: 'dh_0505', date: `${YEAR}-05-05`, name: '어린이날' },
    { id: 'dh_0606', date: `${YEAR}-06-06`, name: '현충일' },
    { id: 'dh_0815', date: `${YEAR}-08-15`, name: '광복절' },
    { id: 'dh_1003', date: `${YEAR}-10-03`, name: '개천절' },
    { id: 'dh_1009', date: `${YEAR}-10-09`, name: '한글날' },
    { id: 'dh_1225', date: `${YEAR}-12-25`, name: '크리스마스' },
  ],
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
