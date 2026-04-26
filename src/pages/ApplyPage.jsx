import { useState } from 'react'
import { getSeason, won, YEAR, MONTHS_KR, isPeriodOpen, PEAK_MONTHS } from '../constants'
import { Btn, Card, Alert, SeasonBadge } from '../components/UI'

// 해당 연월의 실제 일수 반환 (예: 2026년 7월 → 31)
const daysInMonth = (year, month) => new Date(year, month, 0).getDate()

export default function ApplyPage({ currentUser, settings, apps, saveApps }) {
  const [f, setF]       = useState({ month: '', roomId: '', nights: 1, checkInDate: '' })
  const [done, setDone] = useState(null)
  const [err,  setErr]  = useState('')

  const upd = k => v => setF(p => ({ ...p, [k]: v }))

  // 월 변경 시 체크인 날짜 초기화
  const changeMonth = v => setF(p => ({ ...p, month: v, checkInDate: '' }))

  const empId    = currentUser?.empId ?? ''
  const sm       = parseInt(f.month)
  const isPeak   = PEAK_MONTHS.includes(sm)           // 7·8월 성수기 여부
  const room     = settings.rooms.find(r => r.id === f.roomId)
  const season   = sm && room ? getSeason(sm) : null
  const rate     = season ? room.prices[season] : 0
  const nights   = parseInt(f.nights) || 1
  const total    = rate * nights
  const subsidy  = room ? Math.round(total * room.supportRate / 100) : 0
  const selfPay  = total - subsidy

  // 월별 전체 신청 경쟁률 (성수기 포함 공통)
  const quota      = settings.quotas[sm] ?? 20
  const applicants = sm ? apps.filter(a => a.month === sm && a.year === YEAR && a.status !== 'rejected').length : 0

  // ── 성수기 일별 잔여석 계산 ───────────────────────────────────────────────
  const selDayNum   = f.checkInDate ? parseInt(f.checkInDate.split('-')[2]) : null
  const peakDayMax  = selDayNum ? (settings.peakDayQuotas?.[sm]?.[selDayNum] ?? 5) : 0
  const peakDayUsed = f.checkInDate
    ? apps.filter(a => a.checkInDate === f.checkInDate && a.status !== 'rejected').length
    : 0
  const peakDayLeft = peakDayMax - peakDayUsed

  // ── 체크인 날짜 선택지 생성 (성수기용) ──────────────────────────────────
  const checkInOptions = isPeak && sm
    ? [...Array(daysInMonth(YEAR, sm))].map((_, i) => {
        const day     = i + 1
        const dateStr = `${YEAR}-${String(sm).padStart(2,'0')}-${String(day).padStart(2,'0')}`
        const dayMax  = settings.peakDayQuotas?.[sm]?.[day] ?? 5
        const dayUsed = apps.filter(a => a.checkInDate === dateStr && a.status !== 'rejected').length
        const dayLeft = Math.max(0, dayMax - dayUsed)
        const holiday = (settings.peakHolidays?.[sm] ?? []).includes(day)
        return { day, dateStr, dayMax, dayLeft, full: dayLeft <= 0 || dayMax === 0, holiday }
      })
    : []

  const submit = async () => {
    if (!f.month || !f.roomId)  { setErr('희망 월과 객실을 선택해주세요.'); return }
    if (!isPeriodOpen(settings, sm)) { setErr('해당 월의 신청 기간이 아닙니다.'); return }
    if (isPeak && !f.checkInDate) { setErr('성수기(7·8월)는 체크인 날짜를 반드시 선택해야 합니다.'); return }
    if (isPeak && peakDayLeft <= 0) { setErr('선택한 날짜는 이미 신청이 마감되었습니다. 다른 날짜를 선택해주세요.'); return }

    const dup = apps.find(a => a.empId === empId && a.month === sm && a.year === YEAR && a.status !== 'rejected')
    if (dup) { setErr('이미 해당 월에 신청 내역이 있습니다.'); return }

    const app = {
      id: Date.now().toString(), empId, month: sm, year: YEAR,
      roomId: f.roomId, roomType: room.name, nights,
      checkInDate: isPeak ? f.checkInDate : undefined,
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
          ['사번',         done.empId],
          ['신청 월',      `${done.month}월 (${done.season})`],
          ...(done.checkInDate ? [['체크인 날짜', new Date(done.checkInDate + 'T00:00:00').toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })]] : []),
          ['객실',         done.roomType],
          ['숙박',         `${done.nights}박`],
          ['본인 결제금액', won(done.total - done.subsidy)],
        ].map(([k, v]) => (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
            <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{k}</span>
            <span style={{ fontSize: 13, fontWeight: 500 }}>{v}</span>
          </div>
        ))}
      </Card>
      <div style={{ marginTop: 14 }}>
        <Btn onClick={() => { setDone(null); setF({ month: '', roomId: '', nights: 1, checkInDate: '' }) }}>추가 신청하기</Btn>
      </div>
    </div>
  )

  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 500, marginBottom: 4 }}>예약 신청</h2>
      <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 18 }}>추첨 신청입니다. 당첨 후 담당자를 통해 예약이 확정됩니다.</p>
      {err && <Alert type="danger">{err}</Alert>}

      {/* 성수기 안내 배너 */}
      {isPeak && (
        <div style={{ background: 'var(--color-background-danger)', border: '0.5px solid var(--color-border-danger)', borderRadius: 'var(--border-radius-md)', padding: '10px 14px', marginBottom: 14, fontSize: 13, color: 'var(--color-text-danger)' }}>
          <strong>성수기 안내</strong> — {sm}월은 성수기입니다. 체크인 날짜를 반드시 선택해야 하며, 날짜별 인원 제한이 적용됩니다.
        </div>
      )}

      <div style={{ background: 'var(--color-background-secondary)', borderRadius: 'var(--border-radius-md)', padding: '10px 14px', marginBottom: 14, fontSize: 13, color: 'var(--color-text-secondary)' }}>
        신청자 사번: <strong style={{ fontWeight: 500, color: 'var(--color-text-primary)' }}>{empId}</strong>
      </div>

      <Card>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14, marginBottom: 14 }}>
          {/* 희망 월 */}
          <div>
            <label style={{ fontSize: 13, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 6 }}>희망 월</label>
            <select value={f.month} onChange={e => changeMonth(e.target.value)} style={{ width: '100%' }}>
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

          {/* 객실 타입 */}
          <div>
            <label style={{ fontSize: 13, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 6 }}>객실 타입</label>
            <select value={f.roomId} onChange={e => upd('roomId')(e.target.value)} style={{ width: '100%' }}>
              <option value="">-- 객실 선택 --</option>
              {settings.rooms.map(r => (
                <option key={r.id} value={r.id}>{r.name} (정원 {r.capacity}인, 최대 {r.maxNights}박)</option>
              ))}
            </select>
          </div>

          {/* 숙박 일수 */}
          <div>
            <label style={{ fontSize: 13, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 6 }}>숙박 일수</label>
            <select value={f.nights} onChange={e => upd('nights')(e.target.value)} style={{ width: '100%' }}>
              {room
                ? [...Array(room.maxNights)].map((_, i) => <option key={i + 1} value={i + 1}>{i + 1}박</option>)
                : <option value={1}>1박</option>}
            </select>
          </div>

          {/* 체크인 날짜 — 성수기(7·8월)에만 표시 */}
          {isPeak && (
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ fontSize: 13, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 6 }}>
                체크인 날짜 <span style={{ color: 'var(--color-text-danger)', fontWeight: 600 }}>*</span>
                <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', fontWeight: 400, marginLeft: 6 }}>날짜별 잔여 인원이 표시됩니다</span>
              </label>
              <select value={f.checkInDate} onChange={e => upd('checkInDate')(e.target.value)} style={{ width: '100%' }}>
                <option value="">-- 날짜 선택 --</option>
                {checkInOptions.map(({ day, dateStr, dayMax, dayLeft, full, holiday }) => (
                  <option key={day} value={dateStr} disabled={full}>
                    {sm}월 {day}일{holiday ? ' (공휴일)' : ''}
                    {full
                      ? ' — 마감'
                      : ` — 잔여 ${dayLeft}석 / ${dayMax}석`}
                  </option>
                ))}
              </select>

              {/* 선택된 날짜의 잔여석 상태 표시 */}
              {f.checkInDate && (
                <div style={{
                  marginTop: 6, padding: '6px 12px', borderRadius: 'var(--border-radius-sm)',
                  background: peakDayLeft <= 1 ? 'var(--color-background-danger)' : 'var(--color-background-success)',
                  border: `0.5px solid ${peakDayLeft <= 1 ? 'var(--color-border-danger)' : 'var(--color-border-success)'}`,
                  fontSize: 12,
                  color: peakDayLeft <= 1 ? 'var(--color-text-danger)' : 'var(--color-text-success)',
                }}>
                  {new Date(f.checkInDate + 'T00:00:00').toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })} 체크인 —
                  {peakDayLeft <= 0
                    ? ' 마감 (다른 날짜를 선택해주세요)'
                    : ` 잔여 ${peakDayLeft}석 / ${peakDayMax}석`}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 경쟁률 및 본인 결제금액 미리보기 */}
        {sm > 0 && (
          <div style={{ background: 'var(--color-background-secondary)', borderRadius: 'var(--border-radius-md)', padding: '12px 14px', marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: season ? 10 : 0 }}>
              <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
                {isPeak ? '월 전체 신청 현황' : '경쟁률'}
              </span>
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
