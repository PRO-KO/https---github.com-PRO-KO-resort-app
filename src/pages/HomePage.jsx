import { getSeason, won, YEAR, MONTHS_KR, SEASON_STYLE, isPeriodOpen } from '../constants'
import { Card, Stat, SeasonBadge } from '../components/UI'

// fundUsed/settings.fundBudget 제거 — 관리자 전용
export default function HomePage({ settings, apps, setPage }) {
  const cm       = new Date().getMonth() + 1
  const season   = getSeason(cm)
  const pendingNow  = (apps || []).filter(a => a.month === cm && a.status === 'pending').length
  const periodOpen  = isPeriodOpen(settings || DEFAULT_SETTINGS, cm)

  return (
    <div>
      <Card style={{ marginBottom: 18 }}>
        <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginBottom: 6 }}>{YEAR} 임직원 복리후생 · 발전기금 휴양소</p>
        <h1 style={{ fontSize: 20, fontWeight: 500, marginBottom: 10 }}>직원 휴양소 예약 시스템</h1>
        <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.7, marginBottom: 18 }}>
          두 가지 객실 타입으로 운영되며 <strong style={{ fontWeight: 500 }}>월별 무작위 추첨</strong> 방식으로 배정됩니다.
          발전기금에서 숙박료 일부를 지원합니다.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={() => setPage('apply')}
            style={{ background: 'var(--color-background-info)', border: 'none', color: 'var(--color-text-info)',
                     padding: '10px 20px', borderRadius: 'var(--border-radius-md)', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
            예약 신청하기 →
          </button>
          <button onClick={() => setPage('status')}
            style={{ background: 'none', border: '0.5px solid var(--color-border-secondary)', color: 'var(--color-text-secondary)',
                     padding: '10px 20px', borderRadius: 'var(--border-radius-md)', fontSize: 14, cursor: 'pointer' }}>
            내 신청 현황
          </button>
        </div>
      </Card>

      {/* 신청 현황 요약 (발전기금 현황 제외) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 18 }}>
        <Stat label={`${MONTHS_KR[cm - 1]} 신청 현황`} value={pendingNow + '명'} sub="추첨 전" />
        <Stat label={`${MONTHS_KR[cm - 1]} 시즌`}      value={season} color={SEASON_STYLE[season].text} />
        <Stat label="신청 기간" value={periodOpen ? '신청 중' : '마감'} color={periodOpen ? 'var(--color-text-success)' : 'var(--color-text-danger)'} />
      </div>

      <h2 style={{ fontSize: 15, fontWeight: 500, marginBottom: 12 }}>객실 정보</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14, marginBottom: 20 }}>
        {(settings?.rooms || []).map(room => {
          const applicants = (apps || []).filter(a => a.month === cm && a.year === YEAR && a.roomId === room.id && a.status !== 'rejected').length
          const quota      = (settings?.quotas || {})[cm] ?? 20
          const ratio      = quota > 0 ? `${applicants} : ${quota}` : '-'
          return (
            <Card key={room.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                <h3 style={{ fontSize: 14, fontWeight: 500 }}>{room.name}</h3>
                <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 3, background: 'var(--color-background-secondary)', color: 'var(--color-text-secondary)' }}>정원 {room.capacity}인</span>
              </div>
              <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 10 }}>{room.desc}</p>

              {(room.availableFrom || room.availableTo) && (
                <p style={{ fontSize: 11, color: 'var(--color-text-info)', marginBottom: 10 }}>
                  예약 가능: {room.availableFrom || '?'} ~ {room.availableTo || '?'}
                </p>
              )}

              {/* 경쟁률 n:n 표시 */}
              <div style={{ background: 'var(--color-background-secondary)', borderRadius: 'var(--border-radius-md)', padding: '8px 12px', marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>이번달 경쟁률</span>
                <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-warning)' }}>{ratio}</span>
              </div>

              {['비수기', '준성수기', '성수기'].map(s => (
                <div key={s} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
                  <SeasonBadge season={s} />
                  <div style={{ textAlign: 'right' }}>
                    {/* 본인 결제금액만 표시 */}
                    <span style={{ fontSize: 13, fontWeight: 500 }}>
                      {Math.round(room.prices[s] * (1 - room.supportRate / 100)).toLocaleString('ko-KR')}원
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>/박 (최대 {room.maxNights}박)</span>
                  </div>
                </div>
              ))}
            </Card>
          )
        })}
      </div>
    </div>
  )
}
