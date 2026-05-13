import { SEASON_STYLE } from '../constants'

// ── 버튼 ─────────────────────────────────────────────────────────────────

const VARIANT_STYLES = {
  default: { background: 'none', border: '0.5px solid var(--color-border-secondary)', color: 'var(--color-text-secondary)' },
  primary: { background: 'var(--color-background-info)',    border: 'none', color: 'var(--color-text-info)'    },
  danger:  { background: 'var(--color-background-danger)',  border: 'none', color: 'var(--color-text-danger)'  },
  success: { background: 'var(--color-background-success)', border: 'none', color: 'var(--color-text-success)' },
  warn:    { background: 'var(--color-background-warning)', border: 'none', color: 'var(--color-text-warning)' },
}

export function Btn({ children, onClick, variant = 'default', style: s = {}, disabled, fullWidth }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        ...VARIANT_STYLES[variant],
        padding: '10px 20px',
        borderRadius: 'var(--border-radius-md)',
        fontSize: 14,
        fontWeight: 500,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        width: fullWidth ? '100%' : undefined,
        fontFamily: 'var(--font-sans)',
        ...s,
      }}
    >
      {children}
    </button>
  )
}

// ── 카드 ─────────────────────────────────────────────────────────────────

export function Card({ children, style: s = {} }) {
  return (
    <div style={{
      background: 'var(--color-background-primary)',
      borderRadius: 'var(--border-radius-lg)',
      border: '0.5px solid var(--color-border-tertiary)',
      padding: '20px 22px',
      ...s,
    }}>
      {children}
    </div>
  )
}

// ── 알림 ─────────────────────────────────────────────────────────────────

const ALERT_TYPE_MAP = { info: 'info', danger: 'danger', success: 'success', warn: 'warning' }

export function Alert({ type = 'info', children, style: s = {} }) {
  const t = ALERT_TYPE_MAP[type]
  return (
    <div style={{
      background: `var(--color-background-${t})`,
      border: `0.5px solid var(--color-border-${t})`,
      borderRadius: 'var(--border-radius-md)',
      padding: '10px 14px',
      fontSize: 13,
      color: `var(--color-text-${t})`,
      marginBottom: 14,
      lineHeight: 1.5,
      ...s,
    }}>
      {children}
    </div>
  )
}

// ── 입력 필드 ─────────────────────────────────────────────────────────────

export function Field({ label, value, onChange, placeholder, type = 'text', hint, required, onKeyDown }) {
  return (
    <div>
      <label style={{ fontSize: 13, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 6 }}>
        {label}
        {required && <span style={{ color: 'var(--color-text-danger)', marginLeft: 3 }}>*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        style={{ width: '100%' }}
      />
      {hint && <p style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 4 }}>{hint}</p>}
    </div>
  )
}

// ── 시즌 배지 ────────────────────────────────────────────────────────────

export function SeasonBadge({ season }) {
  const ss = SEASON_STYLE[season] || SEASON_STYLE['비수기']
  return (
    <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 3, background: ss.bg, color: ss.text, fontWeight: 500 }}>
      {season || '비수기'}
    </span>
  )
}

// ── 계정 상태 배지 ────────────────────────────────────────────────────────

const EMP_STATUS = {
  pending:  { label: '승인 대기', bg: 'var(--color-background-warning)', text: 'var(--color-text-warning)'  },
  approved: { label: '승인됨',    bg: 'var(--color-background-success)', text: 'var(--color-text-success)'  },
  rejected: { label: '거절됨',    bg: 'var(--color-background-danger)',  text: 'var(--color-text-danger)'   },
}

export function EmpStatusBadge({ status }) {
  const m = EMP_STATUS[status] ?? EMP_STATUS.pending
  return <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 3, background: m.bg, color: m.text, fontWeight: 500 }}>{m.label}</span>
}

// ── 신청 상태 배지 ────────────────────────────────────────────────────────

const APP_STATUS = {
  pending:          { label: '대기',     bg: 'var(--color-background-warning)',  text: 'var(--color-text-warning)'  },
  selected:         { label: '당첨 🎉',  bg: 'var(--color-background-success)',  text: 'var(--color-text-success)'  },
  rejected:         { label: '낙첨',     bg: 'var(--color-background-secondary)',text: 'var(--color-text-tertiary)' },
  manual:           { label: '별도배정', bg: 'var(--color-background-info)',     text: 'var(--color-text-info)'     },
  cancelled:        { label: '취소됨',   bg: 'var(--color-background-secondary)',text: 'var(--color-text-tertiary)' },
  cancel_requested: { label: '취소요청', bg: 'var(--color-background-warning)',  text: 'var(--color-text-warning)'  },
}

export function AppStatusBadge({ status }) {
  const m = APP_STATUS[status]
  if (!m) return null
  return <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 3, background: m.bg, color: m.text, fontWeight: 500 }}>{m.label}</span>
}

// ── 통계 카드 ─────────────────────────────────────────────────────────────

export function Stat({ label, value, sub, color }) {
  return (
    <div style={{ background: 'var(--color-background-secondary)', borderRadius: 'var(--border-radius-md)', padding: '14px' }}>
      <p style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 5 }}>{label}</p>
      <p style={{ fontSize: 19, fontWeight: 500, color: color ?? 'var(--color-text-primary)' }}>{value}</p>
      {sub && <p style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 3 }}>{sub}</p>}
    </div>
  )
}

// ── 진행률 바 ─────────────────────────────────────────────────────────────

export function ProgressBar({ value, max }) {
  const p = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  const barColor = p > 80 ? 'var(--color-text-danger)' : p > 50 ? 'var(--color-text-warning)' : 'var(--color-text-info)'
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 5 }}>
        <span>집행 {Math.round(value).toLocaleString('ko-KR')}원</span>
        <span>잔여 {Math.round(max - value).toLocaleString('ko-KR')}원</span>
      </div>
      <div style={{ background: 'var(--color-background-secondary)', borderRadius: 4, height: 8, overflow: 'hidden' }}>
        <div style={{ width: p + '%', height: '100%', borderRadius: 4, background: barColor, transition: 'width 0.3s' }} />
      </div>
    </div>
  )
}

// ── KOSHA 로고 ────────────────────────────────────────────────────────────

export function KoshaLogo({ compact = false, onClick, style: s = {} }) {
  // 파란색(세로) + 녹색(가로) 두 리본이 교차하는 KOSHA 실제 CI 로고
  // 교차 부분: 상단은 파란색이 앞, 하단은 녹색이 앞 (인터위브 효과)
  const sym = (
    <svg width={compact ? 26 : 46} height={compact ? 26 : 46} viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
      <defs>
        {/* 파란색 그라디언트: 위-밝은 하늘색 → 아래-진한 파란색 */}
        <linearGradient id="kosha-bg" x1="0.3" y1="0" x2="0.7" y2="1">
          <stop offset="0%" stopColor="#6DD5F8" />
          <stop offset="100%" stopColor="#0B91C8" />
        </linearGradient>
        {/* 녹색 그라디언트: 왼쪽-라임 → 오른쪽-진한 녹색 */}
        <linearGradient id="kosha-gg" x1="0" y1="0.3" x2="1" y2="0.7">
          <stop offset="0%" stopColor="#BBDA20" />
          <stop offset="100%" stopColor="#3AAB3B" />
        </linearGradient>
        {/* 파란색 상단 절반만 표시하는 클립 (녹색 영역 내부에 경계가 숨겨짐) */}
        <clipPath id="kosha-top">
          <rect x="0" y="0" width="60" height="33" />
        </clipPath>
      </defs>
      {/* Layer 1: 파란색 세로 리본 (뒤) */}
      <rect x="19" y="3" width="22" height="54" rx="11" fill="url(#kosha-bg)" />
      {/* Layer 2: 녹색 가로 리본 (중간) */}
      <rect x="3" y="19" width="54" height="22" rx="11" fill="url(#kosha-gg)" />
      {/* Layer 3: 파란색 세로 리본 상단 (앞 - 인터위브) */}
      <g clipPath="url(#kosha-top)">
        <rect x="19" y="3" width="22" height="54" rx="11" fill="url(#kosha-bg)" />
      </g>
    </svg>
  )
  if (compact) return (
    <div onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: onClick ? 'pointer' : 'default', userSelect: 'none', ...s }}>
      {sym}
      <div>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#00A94F', lineHeight: 1.1 }}>안전보건공단</div>
        <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)', letterSpacing: '0.5px' }}>KOSHA</div>
      </div>
    </div>
  )
  return (
    <div onClick={onClick} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, cursor: onClick ? 'pointer' : 'default', userSelect: 'none', ...s }}>
      {sym}
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#00A94F', letterSpacing: '-0.5px' }}>안전보건공단</div>
        <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', letterSpacing: '2px', marginTop: 2 }}>KOSHA</div>
      </div>
    </div>
  )
}
