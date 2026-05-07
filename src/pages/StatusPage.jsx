import { useState } from 'react'
import { won, YEAR, MONTHS_KR } from '../constants'
import { Card, SeasonBadge, AppStatusBadge, Btn } from '../components/UI'

export default function StatusPage({ currentUser, apps, saveApps }) {
  const empId  = currentUser?.empId ?? ''
  const myApps = apps
    .filter(a => a.empId === empId && a.year === YEAR)
    .sort((a, b) => {
      // 취소됨은 맨 뒤, 나머지는 월 오름차순
      if (a.status === 'cancelled' && b.status !== 'cancelled') return 1
      if (a.status !== 'cancelled' && b.status === 'cancelled') return -1
      return a.month - b.month
    })

  const [cancelTarget, setCancelTarget] = useState(null) // app.id

  const confirmCancel = id => {
    saveApps(apps.map(a => a.id === id ? { ...a, status: 'cancelled' } : a))
    setCancelTarget(null)
  }

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
            {myApps.map(app => {
              const isCancelled = app.status === 'cancelled'
              return (
                <Card key={app.id} style={{ opacity: isCancelled ? 0.6 : 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8, gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 15, fontWeight: 500 }}>{app.month}월</span>
                      <SeasonBadge season={app.season} />
                      <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{app.roomType}</span>
                    </div>
                    <AppStatusBadge status={app.status} />
                  </div>

                  {(app.checkInDate || app.checkOutDate) && (
                    <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 4 }}>
                      {app.checkInDate && new Date(app.checkInDate).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })}
                      {app.checkOutDate && ` → ${new Date(app.checkOutDate).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })}`}
                    </p>
                  )}

                  <p style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                    {app.nights}박 · 숙박료 {won(app.total)} · 지원금 {won(app.subsidy)} ({app.supportRate}%) · 본인부담 {won(app.total - app.subsidy)}
                  </p>

                  {(app.status === 'selected' || app.status === 'manual') && (
                    <div style={{ marginTop: 8, fontSize: 12, color: 'var(--color-text-success)', background: 'var(--color-background-success)', padding: '7px 10px', borderRadius: 'var(--border-radius-md)' }}>
                      추첨에 당첨되셨습니다! 담당자에게 문의하여 예약을 확정해주세요.
                    </div>
                  )}

                  {/* 취소 영역 — pending 상태만 노출 */}
                  {app.status === 'pending' && (
                    <div style={{ marginTop: 10, borderTop: '0.5px solid var(--color-border-tertiary)', paddingTop: 10 }}>
                      {cancelTarget === app.id
                        ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 12, color: 'var(--color-text-danger)' }}>정말 취소하시겠습니까?</span>
                            <Btn variant="danger" onClick={() => confirmCancel(app.id)} style={{ fontSize: 11, padding: '4px 12px' }}>확인</Btn>
                            <Btn onClick={() => setCancelTarget(null)} style={{ fontSize: 11, padding: '4px 12px' }}>아니오</Btn>
                          </div>
                        )
                        : (
                          <Btn onClick={() => setCancelTarget(app.id)} style={{ fontSize: 11, padding: '4px 12px', color: 'var(--color-text-danger)', borderColor: 'var(--color-border-danger)' }}>
                            신청 취소
                          </Btn>
                        )
                      }
                    </div>
                  )}
                </Card>
              )
            })}
          </div>
        )
      }
    </div>
  )
}
