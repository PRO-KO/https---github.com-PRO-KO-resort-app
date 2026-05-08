import { useState } from 'react'
import { won, fmtDT } from '../constants'
import { Btn, Card, Alert, AppStatusBadge } from '../components/UI'
import * as API from '../api'

export default function CancelApprovalTab({ apps, employees, saveApps, saveFundUsed }) {
  const [loading, setLoading] = useState(false)
  
  const requests = apps.filter(a => a.status === 'cancel_requested')

  const approve = async (app) => {
    if (!window.confirm(`${app.empId}님의 취소 요청을 승인하고 재추첨을 진행하시겠습니까?`)) return
    setLoading(true)
    try {
      await API.approveCancelApp(app.id)
      alert('취소 승인 및 재추첨이 완료되었습니다.')
      
      // 데이터 새로고침
      const refreshedApps = await API.fetchApps()
      saveApps(refreshedApps)
      const { value: newFundUsed } = await API.fetchFundUsed()
      saveFundUsed(newFundUsed)
    } catch (e) {
      alert(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <h3 style={{ fontSize: 16, fontWeight: 500, marginBottom: 14 }}>당첨자 취소 요청 승인</h3>
      <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 20 }}>
        당첨(또는 별도배정) 이후 취소 요청을 보낸 내역입니다. 승인 시 해당 건은 '취소'로 변경되며, 해당 월 낙첨자 중 1명이 자동으로 재추첨됩니다.
      </p>

      {requests.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>대기 중인 취소 요청이 없습니다.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {requests.map(a => {
            const emp = employees[a.empId]
            return (
              <Card key={a.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <strong style={{ fontSize: 14 }}>{a.empId}</strong>
                      <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>({emp?.organization} / {emp?.department})</span>
                    </div>
                    <div style={{ fontSize: 13 }}>
                      {a.month}월 · {a.roomType} · {a.nights}박 · {won(a.total)}
                    </div>
                  </div>
                  <AppStatusBadge status={a.status} />
                </div>
                
                <div style={{ background: 'var(--color-background-danger)', padding: '10px 12px', borderRadius: 'var(--border-radius-md)', marginBottom: 12 }}>
                  <p style={{ fontSize: 12, color: 'var(--color-text-danger)', fontWeight: 600, marginBottom: 4 }}>취소 사유</p>
                  <p style={{ fontSize: 13, margin: 0 }}>{a.cancelReason || '(사유 없음)'}</p>
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <Btn variant="danger" onClick={() => approve(a)} disabled={loading} style={{ fontSize: 12 }}>
                    {loading ? '처리 중...' : '취소 승인 및 재추첨'}
                  </Btn>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
