import { won, YEAR, MONTHS_KR } from '../constants'
import { Card, SeasonBadge, AppStatusBadge } from '../components/UI'

export default function StatusPage({ currentUser, apps }) {
  const empId  = currentUser?.empId ?? ''
  const myApps = apps
    .filter(a => a.empId === empId && a.year === YEAR)
    .sort((a, b) => a.month - b.month)

  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 500, marginBottom: 4 }}>내 신청 현황</h2>
      <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 20 }}>
        사번 <strong style={{ fontWeight: 500 }}>{empId}</strong>의 {YEAR}년 예약 신청 내역입니다.
      </p>

      {myApps.length === 0
        ? <p style={{ color: 'var(--color-text-secondary)', fontSize: 14 }}>신청 내역이 없습니다.</p>
        : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {myApps.map(app => (
              <Card key={app.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 15, fontWeight: 500 }}>{app.month}월</span>
                    <SeasonBadge season={app.season} />
                    <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{app.roomType}</span>
                  </div>
                  <AppStatusBadge status={app.status} />
                </div>
                <p style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                  {app.nights}박 · 숙박료 {won(app.total)} · 지원금 {won(app.subsidy)} ({app.supportRate}%) · 본인부담 {won(app.total - app.subsidy)}
                </p>
                {(app.status === 'selected' || app.status === 'manual') && (
                  <div style={{ marginTop: 8, fontSize: 12, color: 'var(--color-text-success)', background: 'var(--color-background-success)', padding: '7px 10px', borderRadius: 'var(--border-radius-md)' }}>
                    추첨에 당첨되셨습니다! 담당자에게 문의하여 예약을 확정해주세요.
                  </div>
                )}
              </Card>
            ))}
          </div>
        )
      }
    </div>
  )
}
