// PeriodTab — 신청 기간·공휴일·성수기 제한 캘린더 관리
import { useState, useEffect } from 'react'
import { MONTHS_KR, getSeason, PEAK_MONTHS, YEAR, isPeriodOpen, DEFAULT_SETTINGS } from '../constants'
import { Btn, Card, SeasonBadge } from '../components/UI'

// ── 헬퍼 ──────────────────────────────────────────────────────────────────────
const toDs = (y, m, d) =>
  `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`

const buildCells = (year, month) => {
  const firstDow = new Date(year, month - 1, 1).getDay()
  const offset   = (firstDow + 6) % 7
  const total    = new Date(year, month, 0).getDate()
  const cells    = Array(offset).fill(null)
  for (let d = 1; d <= total; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

const initHolidays = settings => {
  const s = settings || DEFAULT_SETTINGS
  if (s.holidays !== undefined) return JSON.parse(JSON.stringify(s.holidays))
  const result = []
  Object.entries(s.peakHolidays ?? {}).forEach(([month, days]) => {
    ;(days ?? []).forEach(day => {
      result.push({
        id:   `h_${month}_${day}`,
        date: toDs(YEAR, parseInt(month), day),
        name: '공휴일',
      })
    })
  })
  return result
}

const WEEK  = ['월', '화', '수', '목', '금', '토', '일']
const MODES = [
  { id: 'period',  label: '신청 기간' },
  { id: 'holiday', label: '공휴일'    },
  { id: 'quota',   label: '성수기 제한' },
]

// ── 컴포넌트 ──────────────────────────────────────────────────────────────────
export default function PeriodTab({ settings, apps, saveSettings }) {
  const s = settings || DEFAULT_SETTINGS
  const [viewMonth,     setViewMonth]     = useState(new Date().getMonth() + 1)
  const [mode,          setMode]          = useState('period')
  const [quotas,        setQuotas]        = useState({ ...s.quotas })
  const [periods,       setPeriods]       = useState(JSON.parse(JSON.stringify(s.applicationPeriods ?? {})))
  const [peakDayQuotas, setPeakDayQuotas] = useState(JSON.parse(JSON.stringify(s.peakDayQuotas ?? {})))
  const [holidays,      setHolidays]      = useState(() => initHolidays(settings))
  const [saved,         setSaved]         = useState(false)

  // settings가 뒤늦게 로드될 경우 대비
  useEffect(() => {
    if (settings) {
      setQuotas({ ...settings.quotas })
      setPeriods(JSON.parse(JSON.stringify(settings.applicationPeriods ?? {})))
      setPeakDayQuotas(JSON.parse(JSON.stringify(settings.peakDayQuotas ?? {})))
      setHolidays(initHolidays(settings))
    }
  }, [settings])

  // 드래그 선택
  const [drag, setDrag] = useState(null)    // { anchor, focus, active }
  const [sel,  setSel]  = useState(null)    // { from, to } day numbers

  // 액션 패널 입력값
  const [bulkQuota,   setBulkQuota]   = useState('5')
  const [bulkHolName, setBulkHolName] = useState('')

  // 드래그 중 텍스트 선택 방지
  useEffect(() => {
    document.body.style.userSelect = drag?.active ? 'none' : ''
  }, [drag?.active])

  // 윈도우 mouseup → 드래그 종료
  useEffect(() => {
    const up = () => setDrag(prev => prev?.active ? { ...prev, active: false } : prev)
    window.addEventListener('mouseup', up)
    return () => window.removeEventListener('mouseup', up)
  }, [])

  // 드래그 완료 후 선택 확정
  useEffect(() => {
    if (!drag || drag.active) return
    const { anchor, focus } = drag
    setDrag(null)
    setSel({ from: Math.min(anchor, focus), to: Math.max(anchor, focus) })
  }, [drag])

  // 월 이동 시 선택 초기화
  const goMonth = dir => {
    setViewMonth(m => {
      let next = m + dir
      if (next < 1) next = 12
      if (next > 12) next = 1
      return next
    })
    setSel(null); setDrag(null)
  }

  // ── 조회 헬퍼 ──
  const cells     = buildCells(YEAR, viewMonth)
  const totalDays = new Date(YEAR, viewMonth, 0).getDate()
  const isPeak    = PEAK_MONTHS.includes(viewMonth)

  const ds = day => toDs(YEAR, viewMonth, day)

  const inPeriod = day => {
    const p = periods[viewMonth]
    if (!p?.start || !p?.end) return false
    return ds(day) >= p.start && ds(day) <= p.end
  }

  const holOf = day => holidays.find(h => h.date === ds(day))

  const dayUsed = day => (apps || []).filter(
    a => a.checkInDate === ds(day) && a.status !== 'rejected'
  ).length

  const selMin = drag ? Math.min(drag.anchor, drag.focus) : sel?.from ?? null
  const selMax = drag ? Math.max(drag.anchor, drag.focus) : sel?.to   ?? null
  const inSel  = day  => selMin !== null && day >= selMin && day <= selMax

  // ── 셀 스타일 ──
  const cellStyle = day => {
    if (inSel(day)) return { bg: '#DBEAFE', bdc: '#3B82F6' }
    if (mode === 'period') {
      if (inPeriod(day)) {
        const p  = periods[viewMonth]
        const se = ds(day) === p.start || ds(day) === p.end
        return { bg: se ? '#DCFCE7' : '#F0FDF4', bdc: se ? '#4ADE80' : '#BBF7D0' }
      }
      return { bg: 'var(--color-background-primary)', bdc: 'var(--color-border-tertiary)' }
    }
    if (mode === 'holiday') {
      if (holOf(day)) return { bg: '#EEF2FF', bdc: '#A5B4FC' }
      return { bg: 'var(--color-background-primary)', bdc: 'var(--color-border-tertiary)' }
    }
    if (mode === 'quota') {
      const max  = peakDayQuotas[viewMonth]?.[day] ?? 5
      const full = dayUsed(day) >= max && max > 0
      if (holOf(day)) return { bg: '#EEF2FF', bdc: '#A5B4FC' }
      if (full)       return { bg: 'var(--color-background-danger)', bdc: 'var(--color-border-danger)' }
      return { bg: 'var(--color-background-primary)', bdc: 'var(--color-border-tertiary)' }
    }
    return { bg: 'var(--color-background-primary)', bdc: 'var(--color-border-tertiary)' }
  }

  // ── 액션 함수 ──
  const applyPeriod = () => {
    if (!sel) return
    setPeriods(p => ({ ...p, [viewMonth]: { start: ds(sel.from), end: ds(sel.to) } }))
    setSel(null)
  }

  const clearPeriod = () => {
    setPeriods(p => ({ ...p, [viewMonth]: { start: '', end: '' } }))
    setSel(null)
  }

  const applyHoliday = add => {
    setHolidays(prev => {
      let next = [...prev]
      for (let d = sel.from; d <= Math.min(sel.to, totalDays); d++) {
        const dateStr = ds(d)
        if (add) {
          if (!next.some(h => h.date === dateStr))
            next.push({ id: `h_${dateStr}`, date: dateStr, name: bulkHolName || `${viewMonth}월 ${d}일` })
        } else {
          next = next.filter(h => h.date !== dateStr)
        }
      }
      return next
    })
    setBulkHolName('')
    setSel(null)
  }

  const applyQuota = () => {
    const n = Math.max(0, parseInt(bulkQuota) || 0)
    setPeakDayQuotas(prev => {
      const mq = { ...prev[viewMonth] }
      for (let d = sel.from; d <= Math.min(sel.to, totalDays); d++) mq[d] = n
      return { ...prev, [viewMonth]: mq }
    })
    setSel(null)
  }

  const save = async () => {
    const peakHolidays = {}
    PEAK_MONTHS.forEach(m => {
      peakHolidays[m] = holidays
        .filter(h => {
          const d = new Date(h.date + 'T00:00:00')
          return d.getFullYear() === YEAR && d.getMonth() + 1 === m
        })
        .map(h => new Date(h.date + 'T00:00:00').getDate())
        .sort((a, b) => a - b)
    })
    await saveSettings({ ...s, quotas, applicationPeriods: periods, peakDayQuotas, peakHolidays, holidays })
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  // ── 렌더 ──────────────────────────────────────────────────────────────────
  const selLabel = sel
    ? sel.from === sel.to
      ? `${viewMonth}월 ${sel.from}일`
      : `${viewMonth}월 ${sel.from}일 ~ ${sel.to}일 (${sel.to - sel.from + 1}일)`
    : ''

  const curPeriod   = periods[viewMonth] ?? { start: '', end: '' }
  const hasPeriod   = !!(curPeriod.start && curPeriod.end)
  const monthHols   = holidays.filter(h => {
    const d = new Date(h.date + 'T00:00:00')
    return d.getFullYear() === YEAR && d.getMonth() + 1 === viewMonth
  }).sort((a, b) => a.date.localeCompare(b.date))

  return (
    <div>
      <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 16 }}>
        캘린더에서 날짜를 드래그하여 선택한 뒤, 하단 패널에서 신청 기간·공휴일·성수기 제한을 일괄 적용합니다.
      </p>

      {/* ── 모드 탭 ── */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {MODES.map(m => (
          <button key={m.id} onClick={() => { setMode(m.id); setSel(null) }}
            style={{
              padding: '7px 18px', fontSize: 13, cursor: 'pointer',
              border: '0.5px solid var(--color-border-secondary)',
              borderRadius: 'var(--border-radius-md)', fontFamily: 'var(--font-sans)',
              fontWeight: mode === m.id ? 600 : 400,
              background: mode === m.id ? 'var(--color-background-info)'     : 'var(--color-background-secondary)',
              color:      mode === m.id ? 'var(--color-text-info)'            : 'var(--color-text-secondary)',
              borderColor: mode === m.id ? 'var(--color-border-info)' : undefined,
            }}>
            {m.label}
            {m.id === 'quota' && !isPeak && (
              <span style={{ fontSize: 10, marginLeft: 5, opacity: 0.6 }}>(7·8월만)</span>
            )}
          </button>
        ))}
      </div>

      <Card style={{ marginBottom: 20 }}>
        {/* ── 월 내비게이션 ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <button onClick={() => goMonth(-1)}
            style={{ background: 'none', border: '0.5px solid var(--color-border-secondary)', borderRadius: 'var(--border-radius-sm)', padding: '5px 14px', fontSize: 18, cursor: 'pointer', color: 'var(--color-text-secondary)', lineHeight: 1 }}>
            ‹
          </button>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>
              {YEAR}년 {viewMonth}월
              <SeasonBadge season={getSeason(viewMonth)} style={{ marginLeft: 8, fontSize: 10 }} />
            </div>
            <div style={{ marginTop: 4, fontSize: 11, color: 'var(--color-text-tertiary)' }}>
              {hasPeriod
                ? `신청기간: ${curPeriod.start} ~ ${curPeriod.end}`
                : '신청기간 미설정'}
              {' · '}선발 {quotas[viewMonth] ?? 20}명
              {isPeak && <span style={{ color: 'var(--color-text-danger)', marginLeft: 6 }}>★ 성수기</span>}
            </div>
          </div>
          <button onClick={() => goMonth(1)}
            style={{ background: 'none', border: '0.5px solid var(--color-border-secondary)', borderRadius: 'var(--border-radius-sm)', padding: '5px 14px', fontSize: 18, cursor: 'pointer', color: 'var(--color-text-secondary)', lineHeight: 1 }}>
            ›
          </button>
        </div>

        {/* 모드별 범례 */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          {mode === 'period' && [
            { bg: '#DBEAFE', bdc: '#3B82F6', label: '선택 중' },
            { bg: '#DCFCE7', bdc: '#4ADE80', label: '기간 시작/종료' },
            { bg: '#F0FDF4', bdc: '#BBF7D0', label: '신청 기간 내' },
          ].map(({ bg, bdc, label }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 11, height: 11, borderRadius: 2, background: bg, border: `1px solid ${bdc}` }} />
              <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>{label}</span>
            </div>
          ))}
          {mode === 'holiday' && [
            { bg: '#DBEAFE', bdc: '#3B82F6', label: '선택 중' },
            { bg: '#EEF2FF', bdc: '#A5B4FC', label: '공휴일' },
          ].map(({ bg, bdc, label }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 11, height: 11, borderRadius: 2, background: bg, border: `1px solid ${bdc}` }} />
              <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>{label}</span>
            </div>
          ))}
          {mode === 'quota' && [
            { bg: '#DBEAFE', bdc: '#3B82F6',                              label: '선택 중' },
            { bg: '#EEF2FF', bdc: '#A5B4FC',                              label: '공휴일' },
            { bg: 'var(--color-background-danger)', bdc: 'var(--color-border-danger)', label: '마감' },
          ].map(({ bg, bdc, label }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 11, height: 11, borderRadius: 2, background: bg, border: `1px solid ${bdc}` }} />
              <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>{label}</span>
            </div>
          ))}
          <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginLeft: 'auto' }}>
            날짜를 드래그하여 기간 선택
          </span>
        </div>

        {/* ── 캘린더 그리드 ── */}
        <div>
          {/* 요일 헤더 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3, marginBottom: 3 }}>
            {WEEK.map((d, i) => (
              <div key={d} style={{
                textAlign: 'center', fontSize: 11, fontWeight: 600, padding: '4px 0',
                color: i >= 5 ? 'var(--color-text-danger)' : 'var(--color-text-tertiary)',
              }}>
                {d}
              </div>
            ))}
          </div>

          {/* 날짜 셀 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3 }}>
            {cells.map((day, idx) => {
              if (!day) return <div key={`e${idx}`} style={{ minHeight: 70 }} />

              const { bg, bdc } = cellStyle(day)
              const hol       = holOf(day)
              const colIdx    = idx % 7
              const isWkend   = colIdx >= 5
              const periodOk  = inPeriod(day)
              const isPeriodSE = periodOk && (ds(day) === (periods[viewMonth]?.start) || ds(day) === (periods[viewMonth]?.end))
              const selected  = inSel(day)
              const dayValid  = day <= totalDays

              // quota mode specific
              const qMax   = mode === 'quota' ? (peakDayQuotas[viewMonth]?.[day] ?? 5) : 0
              const qUsed  = mode === 'quota' ? dayUsed(day) : 0
              const qFull  = mode === 'quota' && qUsed >= qMax && qMax > 0

              return (
                <div
                  key={day}
                  onMouseDown={e => { e.preventDefault(); setDrag({ anchor: day, focus: day, active: true }); setSel(null) }}
                  onMouseEnter={() => { if (drag?.active) setDrag(p => ({ ...p, focus: day })) }}
                  style={{
                    border: `1px solid ${bdc}`,
                    borderRadius: 'var(--border-radius-sm)',
                    padding: '4px 5px',
                    minHeight: 70,
                    background: bg,
                    cursor: 'pointer',
                    display: 'flex', flexDirection: 'column', gap: 2,
                    userSelect: 'none',
                    transition: 'background 0.08s',
                    opacity: !dayValid ? 0 : 1,
                    pointerEvents: !dayValid ? 'none' : 'auto',
                  }}
                >
                  {/* 날짜 숫자 */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <span style={{
                      fontSize: 12, fontWeight: selected || isPeriodSE ? 700 : 500, lineHeight: 1,
                      color: selected        ? '#1D4ED8'
                           : hol            ? '#4338CA'
                           : isWkend        ? 'var(--color-text-danger)'
                           : qFull          ? 'var(--color-text-danger)'
                           :                  'var(--color-text-primary)',
                    }}>
                      {day}
                    </span>
                    {/* 선택 체크 */}
                    {selected && (
                      <span style={{ fontSize: 9, color: '#1D4ED8', fontWeight: 700, lineHeight: 1 }}>✓</span>
                    )}
                    {/* 기간 시작/종료 배지 */}
                    {isPeriodSE && !selected && (
                      <span style={{ fontSize: 8, color: '#16A34A', fontWeight: 700, lineHeight: 1 }}>
                        {ds(day) === periods[viewMonth]?.start ? '시작' : '종료'}
                      </span>
                    )}
                  </div>

                  {/* 모드별 컨텐츠 */}
                  {mode === 'holiday' && hol && (
                    <span style={{
                      fontSize: 9, color: '#4338CA', fontWeight: 500, lineHeight: 1.2,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {hol.name}
                    </span>
                  )}

                  {mode === 'quota' && (
                    <>
                      {hol && (
                        <span style={{ fontSize: 8, color: '#4338CA', fontWeight: 500, lineHeight: 1 }}>
                          {hol.name}
                        </span>
                      )}
                      <div style={{ marginTop: 'auto' }}>
                        <div style={{
                          fontSize: 10, fontWeight: 600, lineHeight: 1,
                          color: qFull ? 'var(--color-text-danger)' : 'var(--color-text-primary)',
                        }}>
                          {qUsed}/{qMax}명
                        </div>
                        {/* 사용률 바 */}
                        <div style={{ height: 3, background: 'var(--color-border-tertiary)', borderRadius: 99, marginTop: 2, overflow: 'hidden' }}>
                          <div style={{
                            height: '100%', borderRadius: 99,
                            width: `${qMax > 0 ? Math.min(100, Math.round(qUsed / qMax * 100)) : 0}%`,
                            background: qFull ? 'var(--color-text-danger)' : 'var(--color-text-success)',
                          }} />
                        </div>
                      </div>
                    </>
                  )}

                  {mode === 'period' && hol && (
                    <span style={{ fontSize: 9, color: '#4338CA', fontWeight: 500, lineHeight: 1.2 }}>
                      {hol.name}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* ── 공휴일 목록 (holiday 모드) ── */}
        {mode === 'holiday' && monthHols.length > 0 && (
          <div style={{ marginTop: 12, padding: '8px 12px', background: '#EEF2FF', borderRadius: 'var(--border-radius-sm)', border: '0.5px solid #A5B4FC' }}>
            <span style={{ fontSize: 12, color: '#4338CA', fontWeight: 500 }}>
              {viewMonth}월 공휴일:{' '}
              {monthHols.map(h => {
                const d = new Date(h.date + 'T00:00:00').getDate()
                return `${d}일${h.name ? ` (${h.name})` : ''}`
              }).join(', ')}
            </span>
          </div>
        )}
      </Card>

      {/* ── 액션 패널 ── */}
      {sel && (
        <div style={{
          position: 'sticky', bottom: 16, zIndex: 10,
          background: 'var(--color-background-primary)',
          border: '1px solid #3B82F6',
          borderRadius: 'var(--border-radius-lg)',
          padding: '16px 20px',
          boxShadow: '0 4px 24px rgba(59,130,246,0.18)',
          marginBottom: 20,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {/* 선택 정보 */}
            <div style={{ flex: '1 1 auto', minWidth: 0 }}>
              <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', margin: '0 0 4px' }}>선택된 기간</p>
              <p style={{ fontSize: 14, fontWeight: 600, margin: 0, color: '#1D4ED8' }}>
                {selLabel}
              </p>
            </div>

            {/* 신청 기간 모드 */}
            {mode === 'period' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
                  → {viewMonth}월 신청 기간으로 설정
                  <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                    선발 인원:&nbsp;
                    <input type="number" min={1} max={500} value={quotas[viewMonth] ?? 20}
                      onChange={e => setQuotas(q => ({ ...q, [viewMonth]: Math.max(1, parseInt(e.target.value) || 1) }))}
                      style={{ width: 60, fontSize: 12, textAlign: 'center', display: 'inline', padding: '2px 4px' }}
                    /> 명
                  </div>
                </div>
                <Btn variant="primary" onClick={applyPeriod} style={{ fontSize: 12, padding: '7px 18px' }}>
                  적용
                </Btn>
                {hasPeriod && (
                  <Btn variant="danger" onClick={clearPeriod} style={{ fontSize: 12, padding: '7px 14px' }}>
                    기간 삭제
                  </Btn>
                )}
                <Btn onClick={() => setSel(null)} style={{ fontSize: 12, padding: '7px 14px' }}>취소</Btn>
              </div>
            )}

            {/* 공휴일 모드 */}
            {mode === 'holiday' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <input
                  value={bulkHolName}
                  onChange={e => setBulkHolName(e.target.value)}
                  placeholder="공휴일 이름 (선택)"
                  style={{ fontSize: 12, width: 140, padding: '6px 8px' }}
                />
                <Btn variant="primary" onClick={() => applyHoliday(true)} style={{ fontSize: 12, padding: '7px 16px' }}>
                  공휴일 지정
                </Btn>
                <Btn variant="danger" onClick={() => applyHoliday(false)} style={{ fontSize: 12, padding: '7px 16px' }}>
                  공휴일 해제
                </Btn>
                <Btn onClick={() => setSel(null)} style={{ fontSize: 12, padding: '7px 14px' }}>취소</Btn>
              </div>
            )}

            {/* 성수기 제한 모드 */}
            {mode === 'quota' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                {isPeak ? (
                  <>
                    <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
                      체크인 제한 인원
                    </span>
                    <input type="number" min={0} max={99} value={bulkQuota}
                      onChange={e => setBulkQuota(e.target.value)}
                      style={{ width: 64, fontSize: 14, textAlign: 'center', fontWeight: 600 }}
                    />
                    <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>명</span>
                    <Btn variant="primary" onClick={applyQuota} style={{ fontSize: 12, padding: '7px 18px' }}>
                      일괄 적용
                    </Btn>
                  </>
                ) : (
                  <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
                    성수기 제한은 7·8월에만 적용됩니다.
                  </span>
                )}
                <Btn onClick={() => setSel(null)} style={{ fontSize: 12, padding: '7px 14px' }}>취소</Btn>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── 12개월 요약 테이블 ── */}
      <Card style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 14, fontWeight: 500, marginBottom: 12 }}>연간 신청 기간 요약</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '0.5px solid var(--color-border-secondary)' }}>
                {['월', '시즌', '신청 시작', '신청 마감', '선발 인원', '상태'].map(h => (
                  <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontSize: 11, color: 'var(--color-text-secondary)', fontWeight: 500, whiteSpace: 'nowrap' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...Array(12)].map((_, i) => {
                const m   = i + 1
                const p   = periods[m] ?? { start: '', end: '' }
                const open = isPeriodOpen({ applicationPeriods: periods }, m)
                return (
                  <tr
                    key={m}
                    onClick={() => { setViewMonth(m); setSel(null); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
                    style={{
                      borderBottom: '0.5px solid var(--color-border-tertiary)',
                      background: m === viewMonth ? 'var(--color-background-secondary)' : undefined,
                      cursor: 'pointer',
                    }}
                  >
                    <td style={{ padding: '7px 10px', fontWeight: m === viewMonth ? 600 : 400 }}>
                      {MONTHS_KR[i]}
                    </td>
                    <td style={{ padding: '7px 10px' }}>
                      <SeasonBadge season={getSeason(m)} />
                    </td>
                    <td style={{ padding: '7px 10px', color: p.start ? undefined : 'var(--color-text-tertiary)' }}>
                      {p.start || '—'}
                    </td>
                    <td style={{ padding: '7px 10px', color: p.end ? undefined : 'var(--color-text-tertiary)' }}>
                      {p.end || '—'}
                    </td>
                    <td style={{ padding: '7px 10px' }}>
                      <input type="number" min={1} max={500} value={quotas[m] ?? 20}
                        onClick={e => e.stopPropagation()}
                        onChange={e => setQuotas(q => ({ ...q, [m]: Math.max(1, parseInt(e.target.value) || 1) }))}
                        style={{ width: 56, fontSize: 12, textAlign: 'center' }}
                      />
                      <span style={{ marginLeft: 4, color: 'var(--color-text-secondary)' }}>명</span>
                    </td>
                    <td style={{ padding: '7px 10px' }}>
                      {!p.start ? (
                        <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>상시 신청</span>
                      ) : open ? (
                        <span style={{ fontSize: 11, color: 'var(--color-text-success)', fontWeight: 600 }}>● 신청중</span>
                      ) : (
                        <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>○ 마감</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ── 저장 ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Btn variant="primary" onClick={save}>
          {saved ? '저장됨 ✓' : '설정 저장'}
        </Btn>
        {saved && (
          <span style={{ fontSize: 12, color: 'var(--color-text-success)' }}>
            성공적으로 저장되었습니다.
          </span>
        )}
      </div>
    </div>
  )
}
