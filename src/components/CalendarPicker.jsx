// CalendarPicker — 월별 캘린더 뷰 (날짜 범위 선택 + 우측 사이드바 요금 미리보기)
import { useState, useRef } from 'react'
import { getSeason, won, isPeriodOpen, MAX_NIGHTS } from '../constants'

const WEEK_DAYS = ['월', '화', '수', '목', '금', '토', '일']

const buildCells = (year, month) => {
  const firstDow = new Date(year, month - 1, 1).getDay()
  const offset   = (firstDow + 6) % 7
  const total    = new Date(year, month, 0).getDate()
  const cells    = Array(offset).fill(null)
  for (let d = 1; d <= total; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

const toDs = (year, month, day) =>
  `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`

const localToday = () => {
  const d = new Date()
  return toDs(d.getFullYear(), d.getMonth() + 1, d.getDate())
}

const compact = n => (n >= 10000 ? Math.round(n / 10000) + '만원' : n.toLocaleString('ko-KR') + '원')

const resolveDatePrice = (datePrices, roomId, ds) => {
  const matches = (datePrices ?? []).filter(p => p.roomId === roomId && p.from <= ds && p.to >= ds)
  if (matches.length === 0) return null
  const sorted = [...matches].sort(
    (a, b) => (new Date(a.to) - new Date(a.from)) - (new Date(b.to) - new Date(b.from))
  )
  return sorted[0].price
}

export default function CalendarPicker({
  year, month, settings, apps, room,
  checkIn, checkOut, onRangeChange, onMonthChange,
}) {
  const [hovered,  setHovered] = useState(null)
  const [warn,     setWarn]    = useState('')
  const warnTimer = useRef(null)

  const showWarn = msg => {
    setWarn(msg)
    if (warnTimer.current) clearTimeout(warnTimer.current)
    warnTimer.current = setTimeout(() => setWarn(''), 3500)
  }

  // MAX_NIGHTS를 초과하는 날짜를 체크인 기준 최대 박수로 자동 제한
  const clampToMax = (ci, ds) => {
    const nights = Math.round((new Date(ds + 'T00:00:00') - new Date(ci + 'T00:00:00')) / 86400000)
    if (nights <= MAX_NIGHTS) return ds
    const ms = new Date(ci + 'T00:00:00').getTime() + MAX_NIGHTS * 86400000
    const d  = new Date(ms)
    return toDs(d.getFullYear(), d.getMonth() + 1, d.getDate())
  }

  const cells       = buildCells(year, month)
  const season      = getSeason(month)
  const isPeak      = [7, 8].includes(month)
  const today       = localToday()
  const seasonPrice = room ? room.prices[season] : null

  const getEffectivePrice = day => {
    if (!room) return null
    const ds       = toDs(year, month, day)
    const override = resolveDatePrice(settings?.datePrices, room.id, ds)
    return override ?? seasonPrice
  }

  const getHoliday = day => {
    const ds = toDs(year, month, day)
    const h  = (settings?.holidays ?? []).find(h => h.date === ds)
    if (h) return h
    if (isPeak && ((settings?.peakHolidays || {})[month] ?? []).includes(day)) return { name: '공휴일' }
    return null
  }

  const getDayAvail = day => {
    if (!isPeak) return null
    const ds   = toDs(year, month, day)
    const max  = (settings?.peakDayQuotas || {})[month]?.[day] ?? 5
    const used = (apps || []).filter(a => a.checkInDate === ds && a.status !== 'rejected').length
    const left = Math.max(0, max - used)
    return { max, used, left, full: left <= 0 || max === 0 }
  }

  // 범위 보조 계산
  const hovDs = hovered ? toDs(year, month, hovered) : null
  // hover preview end: checkIn 이후 날짜 + MAX_NIGHTS 초과 시 자동 클램프
  const rawHovEnd    = hovDs && checkIn && hovDs > checkIn ? hovDs : null
  const effectiveEnd = checkOut || (rawHovEnd ? clampToMax(checkIn, rawHovEnd) : null)

  // 클릭 핸들러 — 시작 → 종료 순서 선택, 재클릭 시 리셋
  const handleDayClick = day => {
    const ds     = toDs(year, month, day)
    const isPast = ds < today
    const avail  = getDayAvail(day)
    if (isPast || avail?.full) return

    if (!checkIn || checkOut) {
      onRangeChange(ds, '')          // 첫 클릭 or 범위 완성 후 재클릭 → 새 시작
    } else if (ds <= checkIn) {
      onRangeChange(ds, '')          // 시작 이전/동일 → 새 시작
    } else {
      const nights = Math.round((new Date(ds + 'T00:00:00') - new Date(checkIn + 'T00:00:00')) / 86400000)
      if (nights > MAX_NIGHTS) {
        showWarn(`최대 ${MAX_NIGHTS}박까지만 신청 가능합니다.`)
        onRangeChange(checkIn, clampToMax(checkIn, ds))  // 최대 박수로 자동 제한
      } else {
        onRangeChange(checkIn, ds)   // 시작 이후 → 종료 확정
      }
    }
  }

  // 다박 요금 합산 (checkIn ~ checkOut 전날)
  const computeRangeTotal = (ci, co) => {
    if (!room || !ci || !co) return 0
    let total = 0
    const startMs = new Date(ci + 'T00:00:00').getTime()
    const endMs   = new Date(co + 'T00:00:00').getTime()
    for (let ms = startMs; ms < endMs; ms += 86400000) {
      const d       = new Date(ms)
      const nightDs = toDs(d.getFullYear(), d.getMonth() + 1, d.getDate())
      const override = resolveDatePrice(settings.datePrices, room.id, nightDs)
      total += override ?? (room.prices[getSeason(d.getMonth() + 1)] ?? 0)
    }
    return total
  }

  // 사이드바 — 범위 요약 (미리보기 or 확정) — effectiveEnd는 이미 MAX_NIGHTS로 클램프됨
  const sidebarEnd    = effectiveEnd
  const sidebarNights = checkIn && sidebarEnd
    ? Math.round((new Date(sidebarEnd + 'T00:00:00') - new Date(checkIn + 'T00:00:00')) / 86400000)
    : 0
  const sidebarTotal  = sidebarNights > 0 ? computeRangeTotal(checkIn, sidebarEnd) : 0
  const sidebarSub    = room && sidebarTotal ? Math.round(sidebarTotal * room.supportRate / 100) : 0
  const sidebarSelf   = sidebarTotal - sidebarSub
  const isPreview     = !checkOut && sidebarNights > 0

  // 사이드바 — 단일 날짜 hover (범위 없을 때)
  const focusDay  = hovered ?? (checkIn && !checkOut ? parseInt(checkIn.split('-')[2]) : null)
  const focusDs   = focusDay ? toDs(year, month, focusDay) : null
  const focusHol  = focusDay ? getHoliday(focusDay) : null
  const focusAvail = focusDay ? getDayAvail(focusDay) : null

  // 내비게이션 헤더용
  const periodOpen      = isPeriodOpen(settings || {}, month)
  const monthApplicants = (apps || []).filter(a => a.month === month && a.year === year && a.status !== 'rejected').length
  const monthQuota      = (settings?.quotas || {})[month] ?? 20

  return (
    <div>
      {/* ── 월 내비게이션 헤더 ── */}
      {onMonthChange && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <button
            onClick={() => onMonthChange(month === 1 ? 12 : month - 1)}
            style={{ background: 'none', border: '0.5px solid var(--color-border-secondary)', borderRadius: 'var(--border-radius-sm)', padding: '5px 14px', fontSize: 18, cursor: 'pointer', color: 'var(--color-text-secondary)', lineHeight: 1 }}
          >
            ‹
          </button>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)' }}>
              {year}년 {month}월
              <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--color-text-tertiary)', marginLeft: 6 }}>({season})</span>
            </div>
            <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              {periodOpen
                ? <span style={{ fontSize: 10, color: 'var(--color-text-success)', fontWeight: 600 }}>● 신청중</span>
                : <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>○ 마감</span>
              }
              <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>{monthApplicants}/{monthQuota}명</span>
            </div>
          </div>
          <button
            onClick={() => onMonthChange(month === 12 ? 1 : month + 1)}
            style={{ background: 'none', border: '0.5px solid var(--color-border-secondary)', borderRadius: 'var(--border-radius-sm)', padding: '5px 14px', fontSize: 18, cursor: 'pointer', color: 'var(--color-text-secondary)', lineHeight: 1 }}
          >
            ›
          </button>
        </div>
      )}

      {warn && (
        <div style={{
          marginBottom: 10, padding: '7px 12px',
          background: 'var(--color-background-warning)',
          border: '0.5px solid var(--color-border-warning)',
          borderRadius: 'var(--border-radius-sm)',
          fontSize: 12, color: 'var(--color-text-warning)', fontWeight: 500,
        }}>
          ⚠ {warn}
        </div>
      )}

      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>

        {/* ── 캘린더 그리드 ── */}
        <div style={{ flex: '1 1 280px', minWidth: 0 }}>

          {/* 요일 헤더 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 3 }}>
            {WEEK_DAYS.map((d, i) => (
              <div key={d} style={{
                textAlign: 'center', fontSize: 11, fontWeight: 600, padding: '4px 0',
                color: i >= 5 ? 'var(--color-text-danger)' : 'var(--color-text-tertiary)',
              }}>
                {d}
              </div>
            ))}
          </div>

          {/* 날짜 셀 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
            {cells.map((day, idx) => {
              if (!day) return <div key={`e${idx}`} style={{ minHeight: 62 }} />

              const ds             = toDs(year, month, day)
              const hol            = getHoliday(day)
              const avail          = getDayAvail(day)
              const isPast         = ds < today
              const isFull         = avail?.full
              const isLow          = avail && !isFull && avail.left <= 2
              const colIdx         = idx % 7
              const isWkend        = colIdx >= 5
              const effectivePrice = getEffectivePrice(day)
              const hasCustomPrice = room && resolveDatePrice(settings.datePrices, room.id, ds) != null

              // 범위 상태
              const isStart      = ds === checkIn
              const isEnd        = ds === checkOut
              const isPreviewEnd = !checkOut && effectiveEnd === ds && !!effectiveEnd
              const inRange      = !!(checkIn && effectiveEnd && ds > checkIn && ds < effectiveEnd)
              const anySelected  = isStart || isEnd || inRange || isPreviewEnd

              // 확정 범위(진한 파랑) vs 미리보기 범위(연한 파랑) 구분
              const isConfirmed = isStart || isEnd || (inRange && !!checkOut)
              const isLightSel  = isPreviewEnd || (inRange && !checkOut)

              // 배경색
              const bg = isStart || isEnd       ? '#1D4ED8'   // 진한 파랑 — 체크인·아웃
                       : inRange && checkOut    ? '#3B82F6'   // 중간 파랑 — 확정 연박 기간
                       : isPreviewEnd           ? '#60A5FA'   // 연한 파랑 — 미리보기 종료일
                       : inRange                ? '#BFDBFE'   // 가장 연한 — 미리보기 중간
                       : hol                   ? '#EEF2FF'
                       : isFull                ? 'var(--color-background-danger)'
                       : hovered === day        ? 'var(--color-background-secondary)'
                       :                          'var(--color-background-primary)'

              const bdc = isConfirmed           ? '#1E40AF'
                        : isPreviewEnd          ? '#3B82F6'
                        : inRange               ? '#93C5FD'
                        : hol                  ? '#A5B4FC'
                        : isFull               ? 'var(--color-border-danger)'
                        : hasCustomPrice && !isPast ? 'var(--color-border-info)'
                        :                         'var(--color-border-tertiary)'

              // 텍스트: 확정 범위는 흰색, 미리보기는 진한 파랑, 나머지 기존대로
              const dayColor = isConfirmed      ? '#ffffff'
                             : isLightSel       ? '#1E3A8A'
                             : hol              ? '#4338CA'
                             : isWkend          ? 'var(--color-text-danger)'
                             : isFull           ? 'var(--color-text-danger)'
                             :                    'var(--color-text-primary)'

              return (
                <div
                  key={day}
                  onClick={() => handleDayClick(day)}
                  onMouseEnter={() => { if (!isPast) setHovered(day) }}
                  onMouseLeave={() => setHovered(null)}
                  style={{
                    border: `1px solid ${bdc}`,
                    borderRadius: 'var(--border-radius-sm)',
                    padding: '5px 5px 4px',
                    minHeight: 62,
                    background: bg,
                    opacity: isPast ? 0.35 : 1,
                    cursor: isPast || isFull ? 'not-allowed' : 'pointer',
                    display: 'flex', flexDirection: 'column', gap: 1,
                    transition: 'border-color 0.1s, background 0.1s',
                  }}
                >
                  {/* 날짜 숫자 + 잔여석 */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <span style={{ fontSize: 12, fontWeight: anySelected ? 700 : 500, color: dayColor, lineHeight: 1 }}>
                      {day}
                    </span>
                    {avail && !isFull && (
                      <span style={{
                        fontSize: 8, lineHeight: 1.5, padding: '0 3px', borderRadius: 99,
                        background: isLow ? 'var(--color-background-warning)' : 'var(--color-background-success)',
                        color:      isLow ? 'var(--color-text-warning)'       : 'var(--color-text-success)',
                        fontWeight: 700,
                      }}>
                        {avail.left}
                      </span>
                    )}
                    {isFull && (
                      <span style={{ fontSize: 8, color: 'var(--color-text-danger)', fontWeight: 700 }}>마감</span>
                    )}
                  </div>

                  {/* 체크인/체크아웃 배지 */}
                  {isStart && <span style={{ fontSize: 8, color: '#ffffff', fontWeight: 700, lineHeight: 1.2 }}>체크인</span>}
                  {isEnd   && <span style={{ fontSize: 8, color: '#ffffff', fontWeight: 700, lineHeight: 1.2 }}>체크아웃</span>}
                  {isPreviewEnd && <span style={{ fontSize: 8, color: '#1E3A8A', fontWeight: 600, lineHeight: 1.2 }}>체크아웃?</span>}

                  {/* 공휴일명 */}
                  {hol && (
                    <span style={{
                      fontSize: 9, fontWeight: 500, lineHeight: 1.2,
                      color: isConfirmed ? 'rgba(255,255,255,0.85)' : '#4338CA',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {hol.name}
                    </span>
                  )}

                  {/* 1박 요금 */}
                  {effectivePrice != null && !isPast && (
                    <span style={{
                      fontSize: 9, marginTop: 'auto',
                      color: isConfirmed
                        ? 'rgba(255,255,255,0.80)'
                        : hasCustomPrice ? 'var(--color-text-info)' : 'var(--color-text-tertiary)',
                      fontWeight: isConfirmed || hasCustomPrice ? 600 : 400,
                    }}>
                      {compact(effectivePrice)}
                    </span>
                  )}
                </div>
              )
            })}
          </div>

          {/* 범례 */}
          <div style={{ display: 'flex', gap: 10, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {[
              { bg: '#EEF2FF', bdc: '#A5B4FC', label: '공휴일' },
              { bg: '#1D4ED8', bdc: '#1E40AF', label: '체크인·아웃' },
              { bg: '#3B82F6', bdc: '#1E40AF', label: '확정 연박' },
              { bg: '#BFDBFE', bdc: '#93C5FD', label: '미리보기' },
              ...(isPeak ? [
                { bg: 'var(--color-background-success)', label: '여유 있음' },
                { bg: 'var(--color-background-warning)', label: '잔여 부족' },
                { bg: 'var(--color-background-danger)',  label: '마감' },
              ] : []),
            ].map(({ bg, bdc, label }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <div style={{ width: 10, height: 10, borderRadius: 2, flexShrink: 0, background: bg, border: `1px solid ${bdc ?? 'transparent'}` }} />
                <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>{label}</span>
              </div>
            ))}
            {isPeak && <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>우상단 숫자 = 잔여석</span>}
            <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, flexShrink: 0, background: 'var(--color-background-primary)', border: '1px solid var(--color-border-info)' }} />
              <span style={{ fontSize: 10, color: 'var(--color-text-info)' }}>특별 요금</span>
            </div>
          </div>
        </div>

        {/* ── 우측 사이드바 ── */}
        <div style={{ flex: '0 0 186px' }}>
          {sidebarNights > 0 ? (
            /* 범위 미리보기 or 확정 요약 */
            <div style={{
              border: `0.5px solid ${isPreview ? 'var(--color-border-secondary)' : '#3B82F6'}`,
              borderRadius: 'var(--border-radius-md)',
              overflow: 'hidden',
              background: 'var(--color-background-primary)',
            }}>
              <div style={{
                padding: '10px 14px',
                background: isPreview ? 'var(--color-background-secondary)' : '#1D4ED8',
                borderBottom: '0.5px solid var(--color-border-tertiary)',
              }}>
                <p style={{ fontSize: 13, fontWeight: 700, margin: 0, color: isPreview ? 'var(--color-text-primary)' : '#ffffff' }}>
                  {sidebarNights}박{isPreview ? ' (미리보기)' : ' 선택 완료'}
                </p>
                <p style={{ fontSize: 11, margin: '4px 0 0', color: isPreview ? 'var(--color-text-secondary)' : 'rgba(255,255,255,0.80)' }}>
                  {checkIn} → {sidebarEnd}
                </p>
                {isPreview && (
                  <p style={{ fontSize: 10, color: 'var(--color-text-tertiary)', margin: '3px 0 0' }}>
                    클릭하여 체크아웃 확정
                  </p>
                )}
              </div>
              <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {focusAvail && (
                  <div>
                    <p style={{ fontSize: 11, color: 'var(--color-text-secondary)', margin: '0 0 3px' }}>체크인일 잔여석</p>
                    <p style={{
                      fontSize: 14, fontWeight: 700, margin: 0,
                      color: focusAvail.full
                        ? 'var(--color-text-danger)'
                        : focusAvail.left <= 2 ? 'var(--color-text-warning)' : 'var(--color-text-success)',
                    }}>
                      {focusAvail.full ? '마감' : `${focusAvail.left} / ${focusAvail.max}석`}
                    </p>
                  </div>
                )}
                {sidebarTotal > 0 && room ? (
                  <>
                    <div>
                      <p style={{ fontSize: 11, color: 'var(--color-text-secondary)', margin: '0 0 3px' }}>{sidebarNights}박 합계</p>
                      <p style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>{won(sidebarTotal)}</p>
                    </div>
                    <div>
                      <p style={{ fontSize: 11, color: 'var(--color-text-secondary)', margin: '0 0 3px' }}>
                        발전기금 지원 ({room.supportRate}%)
                      </p>
                      <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-info)', margin: 0 }}>
                        − {won(sidebarSub)}
                      </p>
                    </div>
                    <div style={{ borderTop: '0.5px solid var(--color-border-secondary)', paddingTop: 10 }}>
                      <p style={{ fontSize: 11, color: 'var(--color-text-secondary)', margin: '0 0 4px' }}>본인 결제</p>
                      <p style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-text-primary)', margin: 0 }}>
                        {won(sidebarSelf)}
                      </p>
                    </div>
                  </>
                ) : (
                  <p style={{ fontSize: 11, color: 'var(--color-text-tertiary)', margin: 0 }}>
                    객실을 선택하면<br />요금이 표시됩니다.
                  </p>
                )}
              </div>
            </div>
          ) : focusDay ? (
            /* 단일 날짜 hover / checkIn만 선택 */
            <div style={{
              border: '0.5px solid var(--color-border-secondary)',
              borderRadius: 'var(--border-radius-md)',
              overflow: 'hidden',
              background: 'var(--color-background-primary)',
            }}>
              <div style={{
                padding: '10px 14px',
                background: checkIn && focusDs === checkIn ? '#DBEAFE' : 'var(--color-background-secondary)',  /* 체크인 단일 선택은 연한 파랑 유지 */
                borderBottom: '0.5px solid var(--color-border-tertiary)',
              }}>
                <p style={{ fontSize: 15, fontWeight: 700, margin: 0, color: 'var(--color-text-primary)' }}>
                  {month}월 {focusDay}일
                </p>
                {focusHol?.name && (
                  <p style={{ fontSize: 11, color: '#4338CA', margin: '3px 0 0', fontWeight: 500 }}>
                    {focusHol.name}
                  </p>
                )}
                {checkIn && focusDs === checkIn && !checkOut && (
                  <p style={{ fontSize: 10, color: '#2563EB', margin: '4px 0 0', fontWeight: 600 }}>
                    ✓ 체크인 — 체크아웃을 선택해주세요
                  </p>
                )}
              </div>
              <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {focusAvail && (
                  <div>
                    <p style={{ fontSize: 11, color: 'var(--color-text-secondary)', margin: '0 0 3px' }}>잔여석</p>
                    <p style={{
                      fontSize: 17, fontWeight: 700, margin: 0,
                      color: focusAvail.full
                        ? 'var(--color-text-danger)'
                        : focusAvail.left <= 2 ? 'var(--color-text-warning)' : 'var(--color-text-success)',
                    }}>
                      {focusAvail.full ? '마감' : `${focusAvail.left} / ${focusAvail.max}석`}
                    </p>
                  </div>
                )}
                {(() => {
                  const focusOverride = room ? resolveDatePrice(settings.datePrices, room.id, focusDs) : null
                  const focusPrice    = focusOverride ?? seasonPrice
                  const focusCustom   = focusOverride != null
                  return focusPrice != null ? (
                    <div style={{ borderTop: focusAvail ? '0.5px solid var(--color-border-tertiary)' : undefined, paddingTop: focusAvail ? 10 : 0 }}>
                      <p style={{ fontSize: 11, color: 'var(--color-text-secondary)', margin: '0 0 3px' }}>
                        1박 요금{' '}
                        {focusCustom
                          ? <span style={{ fontSize: 10, color: 'var(--color-text-info)', fontWeight: 600 }}>특별 요금</span>
                          : <span style={{ fontSize: 10 }}>({season})</span>
                        }
                      </p>
                      <p style={{ fontSize: 16, fontWeight: 600, margin: 0, color: focusCustom ? 'var(--color-text-info)' : undefined }}>
                        {won(focusPrice)}
                      </p>
                    </div>
                  ) : (
                    <p style={{ fontSize: 11, color: 'var(--color-text-tertiary)', margin: 0 }}>
                      객실을 선택하면<br />요금이 표시됩니다.
                    </p>
                  )
                })()}
              </div>
            </div>
          ) : (
            /* 날짜 미선택 상태 */
            <div style={{
              border: '0.5px dashed var(--color-border-secondary)',
              borderRadius: 'var(--border-radius-md)',
              padding: '16px 14px',
              background: 'var(--color-background-secondary)',
            }}>
              {seasonPrice != null ? (
                <>
                  <p style={{ fontSize: 11, color: 'var(--color-text-secondary)', margin: '0 0 6px' }}>
                    {season} 기준 · 1박
                  </p>
                  <p style={{ fontSize: 20, fontWeight: 700, margin: '0 0 8px' }}>{won(seasonPrice)}</p>
                  <p style={{ fontSize: 10, color: 'var(--color-text-tertiary)', margin: 0, lineHeight: 1.5 }}>
                    시작일 클릭 후<br />종료일을 클릭하면<br />합계 금액이 표시됩니다.
                  </p>
                </>
              ) : (
                <p style={{ fontSize: 11, color: 'var(--color-text-tertiary)', textAlign: 'center', margin: 0, lineHeight: 1.6 }}>
                  객실 선택 후<br />날짜를 클릭하면<br />요금을 확인할 수 있습니다.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
