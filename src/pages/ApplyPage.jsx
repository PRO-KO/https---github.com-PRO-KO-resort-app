import { useState } from 'react'
import { getSeason, won, YEAR, isPeriodOpen, PEAK_MONTHS, MAX_NIGHTS } from '../constants'
import { Btn, Card, Alert } from '../components/UI'
import CalendarPicker from '../components/CalendarPicker'

const toDs = d => {
  const dt = new Date(d)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

export default function ApplyPage({ currentUser, settings, apps, saveApps }) {
  const [f,    setF]    = useState({ month: String(new Date().getMonth() + 1), roomId: '', checkInDate: '', checkOutDate: '' })
  const [done, setDone] = useState(null)
  const [err,  setErr]  = useState('')

  // 월 변경 시 날짜 초기화
  const changeMonth = v => setF(p => ({ ...p, month: v, checkInDate: '', checkOutDate: '' }))

  const empId  = currentUser?.empId ?? ''
  const sm     = parseInt(f.month)
  const isPeak = PEAK_MONTHS.includes(sm)
  const room   = settings.rooms.find(r => r.id === f.roomId)
  const season = sm && room ? getSeason(sm) : null

  // 박수: 날짜 범위에서 자동 계산
  const nights = f.checkInDate && f.checkOutDate
    ? Math.round((new Date(f.checkOutDate + 'T00:00:00') - new Date(f.checkInDate + 'T00:00:00')) / 86400000)
    : 0

  // 선택 날짜 잔여석 (성수기 체크인 날짜 기준)
  const selDay      = f.checkInDate ? parseInt(f.checkInDate.split('-')[2]) : null
  const peakDayMax  = selDay ? (settings.peakDayQuotas?.[sm]?.[selDay] ?? 5) : 0
  const peakDayUsed = f.checkInDate
    ? apps.filter(a => a.checkInDate === f.checkInDate && a.status !== 'rejected').length
    : 0
  const peakDayLeft = peakDayMax - peakDayUsed

  // 날짜별 1박 요금 (특별 요금 > 시즌 기본 요금)
  const resolveNightPrice = ds => {
    if (!room) return 0
    const overrides = (settings.datePrices ?? [])
      .filter(p => p.roomId === f.roomId && p.from <= ds && p.to >= ds)
    if (overrides.length === 0) return room.prices[getSeason(parseInt(ds.split('-')[1]))] ?? 0
    const sorted = [...overrides].sort(
      (a, b) => (new Date(a.to) - new Date(a.from)) - (new Date(b.to) - new Date(b.from))
    )
    return sorted[0].price
  }

  // 체크인 ~ 체크아웃 전날까지 1박씩 합산
  const computeTotal = () => {
    if (!f.checkInDate || !f.checkOutDate || !room) return 0
    let total = 0
    const startMs = new Date(f.checkInDate + 'T00:00:00').getTime()
    const endMs   = new Date(f.checkOutDate + 'T00:00:00').getTime()
    for (let ms = startMs; ms < endMs; ms += 86400000) total += resolveNightPrice(toDs(new Date(ms)))
    return total
  }

  const submit = async () => {
    if (!f.roomId)                        { setErr('객실을 선택해주세요.'); return }
    if (!isPeriodOpen(settings, sm))      { setErr('해당 월의 신청 기간이 아닙니다.'); return }
    if (!f.checkInDate || !f.checkOutDate){ setErr('체크인·체크아웃 날짜를 선택해주세요.'); return }
    if (nights <= 0)                      { setErr('체크아웃은 체크인 다음 날 이후여야 합니다.'); return }
    if (nights > MAX_NIGHTS)             { setErr(`최대 ${MAX_NIGHTS}박까지만 신청 가능합니다.`); return }
    if (room && nights > room.maxNights)  { setErr(`최대 ${room.maxNights}박까지 신청 가능합니다.`); return }
    if (isPeak && peakDayLeft <= 0)       { setErr('선택한 날짜는 이미 신청이 마감되었습니다. 다른 날짜를 선택해주세요.'); return }

    const dup = apps.find(a => a.empId === empId && a.month === sm && a.year === YEAR && a.status !== 'rejected' && a.status !== 'cancelled')
    if (dup) { setErr('이미 해당 월에 신청 내역이 있습니다.'); return }

    const total   = computeTotal()
    const rate    = nights > 0 ? Math.round(total / nights) : 0
    const subsidy = room ? Math.round(total * room.supportRate / 100) : 0

    const app = {
      id: Date.now().toString(), empId, month: sm, year: YEAR,
      roomId: f.roomId, roomType: room.name, nights,
      checkInDate: f.checkInDate, checkOutDate: f.checkOutDate,
      appliedAt: new Date().toISOString(), status: 'pending',
      season, rate, total, supportRate: room.supportRate, subsidy,
    }
    await saveApps([...apps, app])
    setDone(app); setErr('')
  }

  const fmtDate = ds => new Date(ds + 'T00:00:00').toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })

  // ── 신청 완료 화면 ───────────────────────────────────────────────────────
  if (done) {
    const doneSelfPay = done.total - done.subsidy
    return (
      <div>
        <Alert type="success">신청이 완료되었습니다. 추첨 후 결과를 확인해주세요.</Alert>
        <Card>
          {[
            ['사번',          done.empId],
            ['신청 월',       `${done.month}월 (${done.season})`],
            ['체크인',        fmtDate(done.checkInDate)],
            ['체크아웃',      fmtDate(done.checkOutDate)],
            ['숙박',          `${done.nights}박`],
            ['평균 1박 요금', won(done.rate)],
            ['발전기금 지원', won(done.subsidy)],
            ['본인 결제금액', won(doneSelfPay)],
          ].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
              <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{k}</span>
              <span style={{ fontSize: 13, fontWeight: 500 }}>{v}</span>
            </div>
          ))}
        </Card>
        <div style={{ marginTop: 14 }}>
          <Btn onClick={() => { setDone(null); setF({ month: String(new Date().getMonth() + 1), roomId: '', checkInDate: '', checkOutDate: '' }) }}>
            추가 신청하기
          </Btn>
        </div>
      </div>
    )
  }

  // 날짜 범위 레이블
  const rangeLabel = () => {
    if (!f.checkInDate) return null
    const ci = new Date(f.checkInDate + 'T00:00:00').toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })
    if (!f.checkOutDate) return `${ci} 선택됨 — 체크아웃 날짜를 클릭해주세요`
    const co = new Date(f.checkOutDate + 'T00:00:00').toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })
    return `${ci} → ${co}  (${nights}박)`
  }

  // ── 신청 폼 ─────────────────────────────────────────────────────────────
  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 500, marginBottom: 4 }}>예약 신청</h2>
      <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 18 }}>
        추첨 신청입니다. 당첨 후 담당자를 통해 예약이 확정됩니다.
      </p>

      {err && <Alert type="danger">{err}</Alert>}

      {/* 신청자 사번 */}
      <div style={{ background: 'var(--color-background-secondary)', borderRadius: 'var(--border-radius-md)', padding: '10px 14px', marginBottom: 14, fontSize: 13, color: 'var(--color-text-secondary)' }}>
        신청자 사번: <strong style={{ fontWeight: 500, color: 'var(--color-text-primary)' }}>{empId}</strong>
      </div>

      <Card>
        {/* ── 객실 선택 ── */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 13, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 6 }}>객실 타입</label>
          <select value={f.roomId} onChange={e => setF(p => ({ ...p, roomId: e.target.value }))} style={{ width: '100%' }}>
            <option value="">-- 객실 선택 --</option>
            {settings.rooms.map(r => (
              <option key={r.id} value={r.id}>{r.name} (정원 {r.capacity}인, 최대 {r.maxNights}박)</option>
            ))}
          </select>
        </div>

        {/* ── 캘린더 뷰 ── */}
        <div style={{ borderTop: '0.5px solid var(--color-border-tertiary)', paddingTop: 16, marginBottom: 16 }}>
          {/* 섹션 레이블 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, color: 'var(--color-text-secondary)', fontWeight: 500 }}>
              체크인·체크아웃 선택
            </span>
            {isPeak
              ? <span style={{ fontSize: 11, color: 'var(--color-text-danger)', fontWeight: 600 }}>★ 성수기 필수</span>
              : <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>시작일 → 종료일 순서로 클릭</span>
            }
            {rangeLabel() && (
              <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 500, color: f.checkOutDate ? 'var(--color-text-info)' : 'var(--color-text-warning)' }}>
                {rangeLabel()}
                <button
                  onClick={() => setF(p => ({ ...p, checkInDate: '', checkOutDate: '' }))}
                  style={{ marginLeft: 6, fontSize: 11, border: 'none', background: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', padding: 0 }}
                >
                  ✕
                </button>
              </span>
            )}
          </div>

          {/* 성수기 안내 배너 */}
          {isPeak && (
            <div style={{
              background: 'var(--color-background-danger)', border: '0.5px solid var(--color-border-danger)',
              borderRadius: 'var(--border-radius-md)', padding: '8px 12px', marginBottom: 12,
              fontSize: 12, color: 'var(--color-text-danger)',
            }}>
              {sm}월은 성수기입니다. 날짜별 체크인 인원 제한이 적용되며, 잔여석이 표시됩니다.
            </div>
          )}

          <CalendarPicker
            key={sm}
            year={YEAR}
            month={sm}
            settings={settings}
            apps={apps}
            room={room}
            checkIn={f.checkInDate}
            checkOut={f.checkOutDate}
            onRangeChange={(ci, co) => setF(p => ({ ...p, checkInDate: ci, checkOutDate: co }))}
            onMonthChange={m => changeMonth(String(m))}
          />
        </div>

        <Btn variant="primary" onClick={submit} fullWidth>추첨 신청하기</Btn>
      </Card>
    </div>
  )
}
