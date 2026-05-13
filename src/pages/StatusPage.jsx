import { useState } from 'react'
import { won, YEAR, getSeason } from '../constants'
import { Card, SeasonBadge, AppStatusBadge, Btn } from '../components/UI'
import * as API from '../api'

export default function StatusPage({ currentUser, apps, saveApps }) {
  const empId  = currentUser?.empId ?? ''
  const myApps = (apps || [])
    .filter(a => a.empId === empId && a.year === YEAR)
    .sort((a, b) => {
      const order = { cancel_requested: 0, pending: 1, selected: 2, manual: 3, rejected: 4, cancelled: 5 }
      return (order[a.status] ?? 9) - (order[b.status] ?? 9) || a.month - b.month
    })

  const [cancelTarget, setCancelTarget] = useState(null)
  const [cancelReason, setCancelReason] = useState('')

  const handleCancel = async (id, status) => {
    try {
      if (status === 'pending') {
        await API.cancelApp(id)
        alert('취소되었습니다.')
      } else {
        if (!cancelReason.trim()) { alert('취소 사유를 입력해주세요.'); return }
        await API.cancelApp(id, cancelReason)
        alert('취소 요청이 접수되었습니다. 관리자 승인 후 최종 취소됩니다.')
      }
      // 로컬 상태 갱신을 위해 상위 컴포넌트 데이터 새로고침 유도 (여기서는 수동 업데이트)
      const refreshedApps = await API.fetchApps()
      saveApps(refreshedApps)
      setCancelTarget(null); setCancelReason('')
    } catch (e) {
      alert(e.message)
    }
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
              const canCancelInstantly = app.status === 'pending'
              const canRequestCancel = app.status === 'selected' || app.status === 'manual'
              const season = app.season || getSeason(app.month)
              
              return (
                <Card key={app.id} style={{ opacity: isCancelled ? 0.6 : 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8, gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 15, fontWeight: 500 }}>{app.month}월</span>
                      <SeasonBadge season={season} />
                      <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{app.roomType}</span>
                    </div>
                    <AppStatusBadge status={app.status} />
                  </div>

                  <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 4 }}>
                    {app.nights}박 · 숙박료 {won(app.total)} · 지원금 {won(app.subsidy)} ({app.supportRate}%)
                  </p>

                  {app.remarks && (
                    <div style={{ fontSize: 12, color: 'var(--color-text-info)', background: 'var(--color-background-info)', padding: '7px 10px', borderRadius: 'var(--border-radius-md)', marginBottom: 8 }}>
                      <strong>관리자 비고:</strong> {app.remarks}
                    </div>
                  )}

                  {app.status === 'cancel_requested' && (
                    <div style={{ fontSize: 12, color: 'var(--color-text-warning)', background: 'var(--color-background-warning)', padding: '7px 10px', borderRadius: 'var(--border-radius-md)', marginBottom: 8 }}>
                      취소 요청 중입니다. 관리자 승인을 기다려주세요. (사유: {app.cancelReason})
                    </div>
                  )}

                  {(app.status === 'selected' || app.status === 'manual') && (
                    <div style={{ marginTop: 8, fontSize: 12, color: 'var(--color-text-success)', background: 'var(--color-background-success)', padding: '7px 10px', borderRadius: 'var(--border-radius-md)' }}>
                      추첨에 당첨되셨습니다! 담당자에게 문의하여 예약을 확정해주세요.
                    </div>
                  )}

                  {(canCancelInstantly || canRequestCancel) && (
                    <div style={{ marginTop: 10, borderTop: '0.5px solid var(--color-border-tertiary)', paddingTop: 10 }}>
                      {cancelTarget === app.id
                        ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {canRequestCancel && (
                              <input 
                                value={cancelReason} 
                                onChange={e => setCancelReason(e.target.value)} 
                                placeholder="취소 사유를 입력해주세요 (예: 개인 일정 변경)"
                                style={{ fontSize: 12, width: '100%' }}
                              />
                            )}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontSize: 12, color: 'var(--color-text-danger)' }}>{canRequestCancel ? '취소 요청하시겠습니까?' : '정말 취소하시겠습니까?'}</span>
                              <Btn variant="danger" onClick={() => handleCancel(app.id, app.status)} style={{ fontSize: 11, padding: '4px 12px' }}>확인</Btn>
                              <Btn onClick={() => { setCancelTarget(null); setCancelReason('') }} style={{ fontSize: 11, padding: '4px 12px' }}>아니오</Btn>
                            </div>
                          </div>
                        )
                        : (
                          <Btn onClick={() => setCancelTarget(app.id)} style={{ fontSize: 11, padding: '4px 12px', color: 'var(--color-text-danger)', borderColor: 'var(--color-border-danger)' }}>
                            {canRequestCancel ? '취소 요청' : '신청 취소'}
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
