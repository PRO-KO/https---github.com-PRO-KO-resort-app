// PeriodTab — 신청 기간 & 월별 선발 인원 설정 + 성수기 일별 체크인 제한 & 공휴일 관리
import { useState } from 'react'
import { MONTHS_KR, getSeason, PEAK_MONTHS, YEAR } from '../constants'
import { Btn, Card, SeasonBadge } from '../components/UI'

export default function PeriodTab({ settings, apps, saveSettings }) {
  const [quotas,        setQuotas]        = useState({ ...settings.quotas })
  const [periods,       setPeriods]       = useState(JSON.parse(JSON.stringify(settings.applicationPeriods ?? {})))
  const [peakDayQuotas, setPeakDayQuotas] = useState(JSON.parse(JSON.stringify(settings.peakDayQuotas ?? {})))
  // 공휴일: { 7: [day, ...], 8: [day, ...] }
  const [peakHolidays,  setPeakHolidays]  = useState(JSON.parse(JSON.stringify(settings.peakHolidays ?? { 7: [], 8: [15] })))
  const [peakTab,       setPeakTab]       = useState(7)
  const [bulkVal,       setBulkVal]       = useState('5')
  const [saved,         setSaved]         = useState(false)

  const updPeriod = (m, k, v) => setPeriods(p => ({ ...p, [m]: { ...p[m], [k]: v } }))

  // 특정 일의 제한 인원 변경
  const updPeakDay = (month, day, val) => {
    const n = Math.max(0, parseInt(val) || 0)
    setPeakDayQuotas(prev => ({ ...prev, [month]: { ...prev[month], [day]: n } }))
  }

  // 선택된 성수기 월 전체 일괄 적용
  const applyBulk = () => {
    const n = Math.max(0, parseInt(bulkVal) || 0)
    const filled = {}
    for (let d = 1; d <= 31; d++) filled[d] = n
    setPeakDayQuotas(prev => ({ ...prev, [peakTab]: filled }))
  }

  // 공휴일 여부 확인
  const isHoliday = (month, day) => (peakHolidays[month] ?? []).includes(day)

  // 공휴일 토글 (지정 ↔ 해제)
  const toggleHoliday = (month, day) => {
    setPeakHolidays(prev => {
      const days = prev[month] ?? []
      const next = days.includes(day)
        ? days.filter(d => d !== day)
        : [...days, day].sort((a, b) => a - b)
      return { ...prev, [month]: next }
    })
  }

  // 전체 저장
  const save = async () => {
    await saveSettings({ ...settings, quotas, applicationPeriods: periods, peakDayQuotas, peakHolidays })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  // 특정 날짜의 현재 신청 수
  const dayUsed = (month, day) => {
    const dateStr = `${YEAR}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return apps.filter(a => a.checkInDate === dateStr && a.status !== 'rejected').length
  }

  return (
    <div>
      <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 18 }}>
        월별 신청 기간과 최대 선발 인원을 설정합니다. 신청 기간을 비워두면 상시 신청 가능합니다.
      </p>

      {/* ── 월별 신청 기간 & 선발 인원 ────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(270px, 1fr))', gap: 12, marginBottom: 28 }}>
        {[...Array(12)].map((_, i) => {
          const m      = i + 1
          const p      = periods[m] ?? { start: '', end: '' }
          const isPeak = PEAK_MONTHS.includes(m)
          return (
            <Card key={m} style={{ padding: '14px', border: isPeak ? '1px solid var(--color-border-danger)' : undefined }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 14, fontWeight: 500 }}>{MONTHS_KR[i]}</span>
                  {isPeak && (
                    <span style={{ fontSize: 10, background: 'var(--color-background-danger)', color: 'var(--color-text-danger)', padding: '1px 6px', borderRadius: 99, fontWeight: 600 }}>
                      일별제한
                    </span>
                  )}
                </div>
                <SeasonBadge season={getSeason(m)} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }}>신청 시작일</label>
                  <input type="date" value={p.start ?? ''} onChange={e => updPeriod(m, 'start', e.target.value)} style={{ width: '100%', fontSize: 12 }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }}>신청 마감일</label>
                  <input type="date" value={p.end ?? ''} onChange={e => updPeriod(m, 'end', e.target.value)} style={{ width: '100%', fontSize: 12 }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <label style={{ fontSize: 11, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>월 선발 인원</label>
                  <input type="number" min={1} max={500} value={quotas[m] ?? 20}
                    onChange={e => setQuotas({ ...quotas, [m]: Math.max(1, parseInt(e.target.value) || 1) })}
                    style={{ width: '70px' }} />
                  <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>명</span>
                </div>
              </div>
            </Card>
          )
        })}
      </div>

      {/* ── 성수기 일별 체크인 제한 & 공휴일 ─────────────────────────────────── */}
      <Card style={{ marginBottom: 24, border: '1px solid var(--color-border-danger)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <h3 style={{ fontSize: 14, fontWeight: 500 }}>성수기 일별 체크인 제한 & 공휴일</h3>
          <span style={{ fontSize: 11, background: 'var(--color-background-danger)', color: 'var(--color-text-danger)', padding: '2px 8px', borderRadius: 99, fontWeight: 600 }}>
            성수기 전용
          </span>
        </div>
        <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 16 }}>
          날짜별 최대 체크인 인원을 설정하고, 공휴일을 지정합니다. 공휴일은 사용자 날짜 선택 화면에 표시됩니다.
        </p>

        {/* 범례 */}
        <div style={{ display: 'flex', gap: 14, marginBottom: 14, flexWrap: 'wrap' }}>
          {[
            { bg: 'var(--color-background-secondary)', label: '일반일' },
            { bg: '#EEF2FF', border: '#A5B4FC', label: '공휴일', color: '#4338CA' },
            { bg: 'var(--color-background-danger)',    label: '마감 (신청 ≥ 제한)' },
          ].map(({ bg, border, label, color }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 14, height: 14, borderRadius: 3, background: bg, border: `1px solid ${border ?? 'var(--color-border-secondary)'}` }} />
              <span style={{ fontSize: 11, color: color ?? 'var(--color-text-secondary)' }}>{label}</span>
            </div>
          ))}
          <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
            — 날짜 아래의 <strong>휴</strong> 버튼으로 공휴일 지정/해제
          </span>
        </div>

        {/* 월 탭 */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
          {PEAK_MONTHS.map(m => {
            const holCount = (peakHolidays[m] ?? []).length
            return (
              <button key={m} onClick={() => setPeakTab(m)}
                style={{
                  padding: '6px 18px', fontSize: 13, fontWeight: peakTab === m ? 600 : 400,
                  border: '0.5px solid var(--color-border-secondary)', borderRadius: 'var(--border-radius-md)',
                  background: peakTab === m ? 'var(--color-background-danger)' : 'var(--color-background-secondary)',
                  color:      peakTab === m ? 'var(--color-text-danger)'       : 'var(--color-text-secondary)',
                  cursor: 'pointer', fontFamily: 'var(--font-sans)',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                {m}월
                {holCount > 0 && (
                  <span style={{ fontSize: 10, background: '#EEF2FF', color: '#4338CA', padding: '1px 5px', borderRadius: 99, fontWeight: 700 }}>
                    공휴일 {holCount}일
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* 일괄 적용 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>전체 일괄 설정</span>
          <input type="number" min={0} max={99} value={bulkVal}
            onChange={e => setBulkVal(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && applyBulk()}
            style={{ width: 60, fontSize: 13, textAlign: 'center' }} />
          <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>명</span>
          <Btn onClick={applyBulk} style={{ fontSize: 12, padding: '5px 14px' }}>적용</Btn>
          <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{peakTab}월 전체 날짜에 동일하게 적용</span>
        </div>

        {/* 일별 그리드 — 7열 */}
        <div style={{ overflowX: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(56px, 1fr))', gap: 4, minWidth: 400 }}>
            {[...Array(31)].map((_, i) => {
              const day   = i + 1
              const max   = peakDayQuotas[peakTab]?.[day] ?? 5
              const used  = dayUsed(peakTab, day)
              const full  = used >= max && max > 0
              const hol   = isHoliday(peakTab, day)

              // 셀 배경: 공휴일 > 마감 > 일반
              const cellBg = hol  ? '#EEF2FF'
                           : full ? 'var(--color-background-danger)'
                           : undefined
              const cellBorder = hol  ? '#A5B4FC'
                               : full ? 'var(--color-border-danger)'
                               : 'var(--color-border-tertiary)'

              return (
                <div key={day} style={{
                  border: `0.5px solid ${cellBorder}`,
                  borderRadius: 'var(--border-radius-sm)',
                  padding: '5px 4px', textAlign: 'center',
                  background: cellBg,
                }}>
                  {/* 날짜 + 공휴일 토글 버튼 */}
                  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 2, marginBottom: 3 }}>
                    <span style={{ fontSize: 10, fontWeight: 500, color: hol ? '#4338CA' : full ? 'var(--color-text-danger)' : 'var(--color-text-tertiary)' }}>
                      {day}일
                    </span>
                    <button
                      title={hol ? '공휴일 해제' : '공휴일로 지정'}
                      onClick={() => toggleHoliday(peakTab, day)}
                      style={{
                        fontSize: 8, padding: '1px 3px', lineHeight: 1,
                        borderRadius: 3, cursor: 'pointer', fontFamily: 'var(--font-sans)',
                        border: hol ? '1px solid #A5B4FC' : '1px solid var(--color-border-secondary)',
                        background: hol ? '#C7D2FE' : 'var(--color-background-secondary)',
                        color: hol ? '#3730A3' : 'var(--color-text-tertiary)',
                        fontWeight: hol ? 700 : 400,
                      }}
                    >
                      휴
                    </button>
                  </div>

                  {/* 제한 인원 입력 */}
                  <input
                    type="number" min={0} max={99}
                    value={max}
                    onChange={e => updPeakDay(peakTab, day, e.target.value)}
                    style={{
                      width: '100%', fontSize: 12, textAlign: 'center', padding: '2px 0',
                      border: '0.5px solid var(--color-border-tertiary)', borderRadius: 3,
                    }}
                  />

                  {/* 현재 신청 수 */}
                  <div style={{ fontSize: 9, color: full ? 'var(--color-text-danger)' : 'var(--color-text-tertiary)', marginTop: 2 }}>
                    신청 {used}명
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* 현재 지정된 공휴일 요약 */}
        {(peakHolidays[peakTab] ?? []).length > 0 && (
          <div style={{ marginTop: 12, padding: '8px 12px', background: '#EEF2FF', borderRadius: 'var(--border-radius-sm)', border: '0.5px solid #A5B4FC' }}>
            <span style={{ fontSize: 12, color: '#4338CA', fontWeight: 500 }}>
              {peakTab}월 공휴일 지정: {(peakHolidays[peakTab]).map(d => `${d}일`).join(', ')}
            </span>
          </div>
        )}

        <p style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 10 }}>
          빨간색 셀 = 신청이 제한 인원에 도달 / 파란색 셀 = 공휴일 / 0 설정 시 해당 날짜 신청 불가
        </p>
      </Card>

      <Btn variant="primary" onClick={save}>{saved ? '저장됨 ✓' : '저장'}</Btn>
    </div>
  )
}
