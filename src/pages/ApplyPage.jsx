import { useState } from 'react'
import { getSeason, won, YEAR, MONTHS_KR, isPeriodOpen } from '../constants'
import { Btn, Card, Alert, SeasonBadge } from '../components/UI'

export default function ApplyPage({ currentUser, settings, apps, saveApps }) {
  const [f, setF]     = useState({ month: '', roomId: '', nights: 1 })
  const [done, setDone] = useState(null)
  const [err, setErr]   = useState('')
  const upd = k => v => setF(p => ({ ...p, [k]: v }))

  const empId  = currentUser?.empId ?? ''
  const sm     = parseInt(f.month)
  const room   = settings.rooms.find(r => r.id === f.roomId)
  const season = sm && room ? getSeason(sm) : null
  const rate   = season ? room.prices[season] : 0
  const nights = parseInt(f.nights) || 1
  const total  = rate * nights
  const subsidy   = room ? Math.round(total * room.supportRate / 100) : 0
  const selfPay   = total - subsidy

  const quota      = settings.quotas[sm] ?? 20
  const applicants = sm ? apps.filter(a => a.month === sm && a.year === YEAR && a.status !== 'rejected').length : 0

  const submit = async () => {
    if (!f.month || !f.roomId) { setErr('희망 월과 객실을 선택해주세요.'); return }
    if (!isPeriodOpen(settings, sm)) { setErr('해당 월의 신청 기간이 아닙니다.'); return }
    const dup = apps.find(a => a.empId === empId && a.month === sm && a.year === YEAR && a.status !== 'rejected')
    if (dup) { setErr('이미 해당 월에 신청 내역이 있습니다.'); return }
    const app = {
      id: Date.now().toString(), empId, month: sm, year: YEAR,
      roomId: f.roomId, roomType: room.name, nights,
      appliedAt: new Date().toISOString(), status: 'pending',
      season, rate, total, supportRate: room.supportRate, subsidy,
    }
    await saveApps([...apps, app])
    setDone(app); setErr('')
  }

  if (done) return (
    <div>
      <Alert type="success">신청이 완료되었습니다. 추첨 후 결과를 확인해주세요.</Alert>
      <Card>
        {[
          ['사번',     done.empId],
          ['신청 월',  `${done.month}월 (${done.season})`],
          ['객실',     done.roomType],
          ['숙박',     `${done.nights}박`],
          ['본인 결제금액', won(done.total - done.subsidy)],
        ].map(([k, v]) => (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
            <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{k}</span>
            <span style={{ fontSize: 13, fontWeight: 500 }}>{v}</span>
          </div>
        ))}
      </Card>
      <div style={{ marginTop: 14 }}>
        <Btn onClick={() => { setDone(null); setF({ month: '', roomId: '', nights: 1 }) }}>추가 신청하기</Btn>
      </div>
    </div>
  )

  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 500, marginBottom: 4 }}>예약 신청</h2>
      <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 18 }}>추첨 신청입니다. 당첨 후 담당자를 통해 예약이 확정됩니다.</p>
      {err && <Alert type="danger">{err}</Alert>}

      <div style={{ background: 'var(--color-background-secondary)', borderRadius: 'var(--border-radius-md)', padding: '10px 14px', marginBottom: 14, fontSize: 13, color: 'var(--color-text-secondary)' }}>
        신청자 사번: <strong style={{ fontWeight: 500, color: 'var(--color-text-primary)' }}>{empId}</strong>
      </div>

      <Card>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14, marginBottom: 14 }}>
          <div>
            <label style={{ fontSize: 13, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 6 }}>희망 월</label>
            <select value={f.month} onChange={e => upd('month')(e.target.value)} style={{ width: '100%' }}>
              <option value="">-- 월 선택 --</option>
              {[...Array(12)].map((_, i) => {
                const m    = i + 1
                const open = isPeriodOpen(settings, m)
                const cnt  = apps.filter(a => a.month === m && a.year === YEAR && a.status !== 'rejected').length
                return (
                  <option key={m} value={m}>
                    {MONTHS_KR[i]} ({getSeason(m)}) — {open ? '신청중' : '마감'} {cnt}/{settings.quotas[m] ?? 20}명
                  </option>
                )
              })}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 13, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 6 }}>객실 타입</label>
            <select value={f.roomId} onChange={e => upd('roomId')(e.target.value)} style={{ width: '100%' }}>
              <option value="">-- 객실 선택 --</option>
              {settings.rooms.map(r => (
                <option key={r.id} value={r.id}>{r.name} (정원 {r.capacity}인, 최대 {r.maxNights}박)</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 13, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 6 }}>숙박 일수</label>
            <select value={f.nights} onChange={e => upd('nights')(e.target.value)} style={{ width: '100%' }}>
              {room
                ? [...Array(room.maxNights)].map((_, i) => <option key={i + 1} value={i + 1}>{i + 1}박</option>)
                : <option value={1}>1박</option>}
            </select>
          </div>
        </div>

        {/* 경쟁률 및 본인 결제금액 미리보기 */}
        {sm > 0 && (
          <div style={{ background: 'var(--color-background-secondary)', borderRadius: 'var(--border-radius-md)', padding: '12px 14px', marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: season ? 10 : 0 }}>
              <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>경쟁률</span>
              <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-warning)' }}>
                {applicants} : {quota}
              </span>
            </div>
            {season && room && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10, borderTop: '0.5px solid var(--color-border-tertiary)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <SeasonBadge season={season} />
                  <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{nights}박</span>
                </div>
                {/* 본인 결제금액만 표시 */}
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 15, fontWeight: 500 }}>본인 결제 {won(selfPay)}</div>
                </div>
              </div>
            )}
          </div>
        )}

        <Btn variant="primary" onClick={submit} fullWidth>추첨 신청하기</Btn>
      </Card>
    </div>
  )
}
