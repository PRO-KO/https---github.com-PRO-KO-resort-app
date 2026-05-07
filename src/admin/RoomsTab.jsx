import { useState, useEffect, useRef } from 'react'
import { getSeason, won, YEAR, MONTHS_KR } from '../constants'
import { Btn, Card, SeasonBadge } from '../components/UI'

// ── 캘린더 유틸 ──────────────────────────────────────────────────────────────
const WEEK_DAYS = ['월', '화', '수', '목', '금', '토', '일']

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

const resolveDP = (datePrices, roomId, ds) => {
  const hits = (datePrices ?? []).filter(
    p => p.roomId === roomId && p.from <= ds && p.to >= ds
  )
  if (!hits.length) return null
  return [...hits].sort(
    (a, b) => (new Date(a.to) - new Date(a.from)) - (new Date(b.to) - new Date(b.from))
  )[0]
}

const compact = n => n >= 10000 ? Math.round(n / 10000) + '만' : n.toLocaleString('ko-KR')

const newRoom = () => ({
  id: `r_${Date.now()}`,
  name: '', desc: '', capacity: 2, maxNights: 2,
  supportRate: 50, extraGuestFee: 0,
  availableFrom: '', availableTo: '',
  prices: { 비수기: 0, 준성수기: 0, 성수기: 0 },
})

// ── 스타일 상수 ───────────────────────────────────────────────────────────────
const labelSt = { fontSize: 12, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 5 }
const navBtnSt = {
  border: '0.5px solid var(--color-border-secondary)',
  borderRadius: 'var(--border-radius-sm)',
  background: 'var(--color-background-secondary)',
  cursor: 'pointer', padding: '4px 12px',
  fontSize: 15, color: 'var(--color-text-secondary)',
  fontFamily: 'var(--font-sans)',
}

// ── 컴포넌트 ─────────────────────────────────────────────────────────────────
export default function RoomsTab({ settings, saveSettings }) {
  const [rooms,         setRooms]         = useState(() => JSON.parse(JSON.stringify(settings.rooms)))
  const [datePrices,    setDatePrices]    = useState(() => JSON.parse(JSON.stringify(settings.datePrices ?? [])))
  const [saved,         setSaved]         = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [showRoomEdit,  setShowRoomEdit]  = useState(false)

  // 캘린더 네비게이션
  const [calYear,  setCalYear]  = useState(YEAR)
  const [calMonth, setCalMonth] = useState(new Date().getMonth() + 1)

  // 단일 날짜 모달
  const [modal,      setModal]      = useState(null)   // { ds, day, month, year }
  const [modalEdits, setModalEdits] = useState({})

  // 드래그 선택 — { anchor, focus, active }
  const [drag, setDrag] = useState(null)

  // 일괄 수정 모달
  const [bulkModal,      setBulkModal]      = useState(null)  // { fromDs, toDs, fromDay, toDay, month, year, days }
  const [bulkEdits,      setBulkEdits]      = useState({})
  const [bulkClearInner, setBulkClearInner] = useState(true)

  // 드래그 중 텍스트 선택 방지
  useEffect(() => {
    document.body.style.userSelect = drag?.active ? 'none' : ''
    return () => { document.body.style.userSelect = '' }
  }, [drag?.active])

  // window mouseup → 드래그 종료
  useEffect(() => {
    const up = () => setDrag(prev => prev?.active ? { ...prev, active: false } : prev)
    window.addEventListener('mouseup', up)
    return () => window.removeEventListener('mouseup', up)
  }, [])

  // 드래그 종료 감지 → 모달 열기
  useEffect(() => {
    if (!drag || drag.active) return
    const { anchor, focus } = drag
    setDrag(null)
    if (anchor == null || focus == null) return
    if (anchor === focus) {
      openSingleModal(anchor)
    } else {
      openBulkModal(Math.min(anchor, focus), Math.max(anchor, focus))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag])

  // 드래그 중 선택 범위 계산
  const selMin = drag?.active && drag.anchor != null && drag.focus != null
    ? Math.min(drag.anchor, drag.focus) : null
  const selMax = drag?.active && drag.anchor != null && drag.focus != null
    ? Math.max(drag.anchor, drag.focus) : null

  // ── 객실 편집 ────────────────────────────────────────────────────────────
  const updRoom  = (idx, k, v)      => setRooms(r => r.map((room, i) => i === idx ? { ...room, [k]: v } : room))
  const updPrice = (idx, season, v) => setRooms(r => r.map((room, i) => i === idx ? { ...room, prices: { ...room.prices, [season]: parseInt(v) || 0 } } : room))
  const addRoom  = ()               => setRooms(r => [...r, newRoom()])
  const removeRoom = idx            => setRooms(r => r.filter((_, i) => i !== idx))

  // ── 저장 ─────────────────────────────────────────────────────────────────
  const save = async () => {
    const normalized = rooms.map(r => ({ extraGuestFee: 0, ...r }))
    await saveSettings({ ...settings, rooms: normalized, datePrices })
    setSaved(true); setTimeout(() => setSaved(false), 2000)
  }

  // ── 캘린더 헬퍼 ──────────────────────────────────────────────────────────
  const cells   = buildCells(calYear, calMonth)
  const mSeason = getSeason(calMonth)
  const isPeak  = [7, 8].includes(calMonth)

  const getHol = (y, m, d) => {
    const ds = toDs(y, m, d)
    const h  = (settings.holidays ?? []).find(h => h.date === ds)
    if (h) return h
    if ([7, 8].includes(m) && (settings.peakHolidays?.[m] ?? []).includes(d)) return { name: '공휴일' }
    return null
  }

  const prevMonth = () => calMonth === 1
    ? (setCalMonth(12), setCalYear(y => y - 1))
    : setCalMonth(m => m - 1)
  const nextMonth = () => calMonth === 12
    ? (setCalMonth(1),  setCalYear(y => y + 1))
    : setCalMonth(m => m + 1)

  // ── 단일 날짜 모달 ────────────────────────────────────────────────────────
  const openSingleModal = day => {
    const ds     = toDs(calYear, calMonth, day)
    const season = getSeason(calMonth)
    const edits  = {}
    rooms.forEach(room => {
      const ex = resolveDP(datePrices, room.id, ds)
      edits[room.id] = ex
        ? { enabled: true,  price: ex.price, label: ex.label ?? '' }
        : { enabled: false, price: room.prices[season], label: '' }
    })
    setModalEdits(edits)
    setModal({ ds, day, month: calMonth, year: calYear })
  }

  const closeSingleModal = () => setModal(null)

  const saveSingleModal = () => {
    let newDP = datePrices.filter(p => !(p.from === modal.ds && p.to === modal.ds))
    rooms.forEach(room => {
      const edit = modalEdits[room.id]
      if (edit?.enabled) {
        newDP.push({ id: `dp_${Date.now()}_${room.id}`, roomId: room.id, from: modal.ds, to: modal.ds, price: parseInt(edit.price) || 0, label: edit.label || '' })
      }
    })
    setDatePrices(newDP)
    closeSingleModal()
  }

  const updSingleEdit = (roomId, k, v) =>
    setModalEdits(prev => ({ ...prev, [roomId]: { ...prev[roomId], [k]: v } }))

  // ── 일괄 수정 모달 ────────────────────────────────────────────────────────
  const openBulkModal = (mn, mx) => {
    const fromDs = toDs(calYear, calMonth, mn)
    const toDs_  = toDs(calYear, calMonth, mx)
    const season = getSeason(calMonth)
    const edits  = {}
    rooms.forEach(room => {
      edits[room.id] = { enabled: false, price: room.prices[season], label: '' }
    })
    setBulkEdits(edits)
    setBulkModal({ fromDs, toDs: toDs_, fromDay: mn, toDay: mx, month: calMonth, year: calYear, days: mx - mn + 1 })
  }

  const closeBulkModal = () => { setBulkModal(null); setBulkEdits({}) }

  const saveBulkModal = () => {
    let newDP = [...datePrices]
    rooms.forEach(room => {
      const edit = bulkEdits[room.id]
      if (!edit?.enabled) return
      if (bulkClearInner) {
        // 선택 기간 내부에 완전히 포함되는 기존 규칙 삭제
        newDP = newDP.filter(p => !(
          p.roomId === room.id &&
          p.from >= bulkModal.fromDs &&
          p.to   <= bulkModal.toDs
        ))
      }
      newDP.push({
        id:     `dp_${Date.now()}_${room.id}`,
        roomId: room.id,
        from:   bulkModal.fromDs,
        to:     bulkModal.toDs,
        price:  parseInt(edit.price) || 0,
        label:  edit.label || '',
      })
    })
    setDatePrices(newDP)
    closeBulkModal()
  }

  const updBulkEdit = (roomId, k, v) =>
    setBulkEdits(prev => ({ ...prev, [roomId]: { ...prev[roomId], [k]: v } }))

  // ── 모달 파생값 ───────────────────────────────────────────────────────────
  const modalSeason = modal ? getSeason(modal.month) : null
  const modalHol    = modal ? getHol(modal.year, modal.month, modal.day) : null
  const bulkSeason  = bulkModal ? getSeason(bulkModal.month) : null

  // ── 셀 배경색 ────────────────────────────────────────────────────────────
  const getCellBg = (hol, inSel) => {
    if (inSel) return '#DBEAFE'
    if (hol)   return '#EEF2FF'
    if (isPeak) return 'var(--color-background-danger)'
    if (mSeason === '준성수기') return 'var(--color-background-warning)'
    return 'var(--color-background-primary)'
  }

  // ── 렌더 ─────────────────────────────────────────────────────────────────
  return (
    <div>

      {/* ══════════════ 캘린더 뷰 ══════════════ */}
      <Card style={{ marginBottom: 20 }}>

        {/* 헤더 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={prevMonth} style={navBtnSt}>‹</button>
            <span style={{ fontSize: 15, fontWeight: 500, minWidth: 110, textAlign: 'center' }}>
              {calYear}년 {MONTHS_KR[calMonth - 1]}
            </span>
            <button onClick={nextMonth} style={navBtnSt}>›</button>
            <button
              onClick={() => { setCalYear(YEAR); setCalMonth(new Date().getMonth() + 1) }}
              style={{ ...navBtnSt, fontSize: 11, padding: '4px 10px' }}
            >
              오늘
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <SeasonBadge season={mSeason} />
            <span style={{ fontSize: 11, color: 'var(--color-text-info)', background: 'var(--color-background-info)', padding: '3px 8px', borderRadius: 99, fontWeight: 500 }}>
              드래그 → 일괄 수정 / 클릭 → 단일 수정
            </span>
          </div>
        </div>

        {/* 요일 헤더 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3, marginBottom: 3 }}>
          {WEEK_DAYS.map((d, i) => (
            <div key={d} style={{ textAlign: 'center', fontSize: 11, fontWeight: 600, padding: '4px 0', color: i >= 5 ? 'var(--color-text-danger)' : 'var(--color-text-tertiary)' }}>
              {d}
            </div>
          ))}
        </div>

        {/* 날짜 셀 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3 }}>
          {cells.map((day, idx) => {
            if (!day) return <div key={`e${idx}`} style={{ minHeight: 82 }} />

            const ds        = toDs(calYear, calMonth, day)
            const hol       = getHol(calYear, calMonth, day)
            const colIdx    = idx % 7
            const isWkend   = colIdx >= 5
            const hasCustom = rooms.some(r => resolveDP(datePrices, r.id, ds) != null)
            const inSel     = selMin != null && selMax != null && day >= selMin && day <= selMax
            const isRangeStart = inSel && day === selMin
            const isRangeEnd   = inSel && day === selMax

            return (
              <div
                key={day}
                onMouseDown={e => {
                  e.preventDefault()
                  setDrag({ anchor: day, focus: day, active: true })
                }}
                onMouseEnter={() => {
                  setDrag(prev => prev?.active ? { ...prev, focus: day } : prev)
                }}
                title={inSel ? `${selMin}일 ~ ${selMax}일 선택 중` : `${calMonth}월 ${day}일`}
                style={{
                  border: inSel
                    ? `2px solid #3B82F6`
                    : `1px solid ${hasCustom ? 'var(--color-border-info)' : 'var(--color-border-tertiary)'}`,
                  borderRadius: inSel
                    ? (isRangeStart ? '6px 2px 2px 6px' : isRangeEnd ? '2px 6px 6px 2px' : '2px')
                    : 'var(--border-radius-sm)',
                  padding: '5px 6px 4px',
                  minHeight: 82,
                  background: getCellBg(hol, inSel),
                  cursor: 'pointer',
                  display: 'flex', flexDirection: 'column', gap: 2,
                  transition: 'background 0.08s',
                  position: 'relative',
                }}
              >
                {/* 날짜 숫자 */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <span style={{
                    fontSize: 12, fontWeight: inSel ? 700 : 500, lineHeight: 1,
                    color: inSel ? '#1D4ED8'
                      : isWkend || hol ? 'var(--color-text-danger)'
                      : 'var(--color-text-primary)',
                  }}>
                    {day}
                  </span>
                  {!inSel && hasCustom && (
                    <span style={{ fontSize: 8, color: 'var(--color-text-info)', fontWeight: 700, lineHeight: 1 }}>특별</span>
                  )}
                  {inSel && (
                    <span style={{ fontSize: 8, color: '#2563EB', fontWeight: 700, lineHeight: 1 }}>✓</span>
                  )}
                </div>

                {/* 공휴일명 */}
                {hol && (
                  <span style={{ fontSize: 8, color: inSel ? '#1D4ED8' : '#4338CA', fontWeight: 600, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {hol.name}
                  </span>
                )}

                {/* 객실별 유효 요금 */}
                {rooms.map(room => {
                  const override = resolveDP(datePrices, room.id, ds)
                  const price    = override ? override.price : room.prices[mSeason]
                  const label    = room.name ? room.name.slice(0, 5) : room.id
                  return (
                    <span key={room.id} style={{
                      fontSize: 8, lineHeight: 1.4, marginTop: 1,
                      color: inSel ? '#2563EB'
                        : override ? 'var(--color-text-info)'
                        : 'var(--color-text-secondary)',
                      fontWeight: override ? 700 : 400,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {label}: {compact(price)}
                    </span>
                  )
                })}
              </div>
            )
          })}
        </div>

        {/* 범례 */}
        <div style={{ display: 'flex', gap: 12, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          {[
            { bg: 'var(--color-background-danger)',  label: '성수기' },
            { bg: 'var(--color-background-warning)', label: '준성수기' },
            { bg: 'var(--color-background-primary)', bdc: 'var(--color-border-tertiary)', label: '비수기' },
            { bg: '#EEF2FF', bdc: '#A5B4FC', label: '공휴일' },
            { bg: '#DBEAFE', bdc: '#3B82F6', label: '드래그 선택' },
          ].map(({ bg, bdc, label }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 12, height: 12, borderRadius: 2, background: bg, border: `1px solid ${bdc ?? 'transparent'}` }} />
              <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>{label}</span>
            </div>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 12, height: 12, borderRadius: 2, background: 'white', border: '1.5px solid var(--color-border-info)' }} />
            <span style={{ fontSize: 10, color: 'var(--color-text-info)' }}>특별 요금</span>
          </div>
        </div>
      </Card>

      {/* ══════════════ 단일 날짜 모달 ══════════════ */}
      {modal && (
        <ModalOverlay onClose={closeSingleModal}>
          <ModalHeader
            title={`${modal.year}년 ${modal.month}월 ${modal.day}일`}
            season={modalSeason}
            hol={modalHol}
            onClose={closeSingleModal}
            sub="이 날짜의 요금을 개별 설정합니다"
          />
          <div style={{ padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {rooms.map(room => {
              const edit         = modalEdits[room.id] ?? {}
              const defaultPrice = room.prices[modalSeason]
              const priceVal     = parseInt(edit.price) || 0
              return (
                <RoomEditCard
                  key={room.id} room={room} edit={edit} season={modalSeason}
                  defaultPrice={defaultPrice} priceVal={priceVal}
                  onToggle={v => updSingleEdit(room.id, 'enabled', v)}
                  onPrice={v => updSingleEdit(room.id, 'price', v)}
                  onLabel={v => updSingleEdit(room.id, 'label', v)}
                />
              )
            })}
          </div>
          <ModalFooter note="적용 후 하단 '저장' 버튼을 눌러야 최종 반영됩니다" onClose={closeSingleModal} onSave={saveSingleModal} />
        </ModalOverlay>
      )}

      {/* ══════════════ 일괄 수정 모달 ══════════════ */}
      {bulkModal && (
        <ModalOverlay onClose={closeBulkModal}>
          <ModalHeader
            title={`일괄 수정 — ${bulkModal.month}월 ${bulkModal.fromDay}일 ~ ${bulkModal.toDay}일`}
            season={bulkSeason}
            onClose={closeBulkModal}
            sub={`${bulkModal.days}일 선택됨 · ${bulkModal.fromDs} ~ ${bulkModal.toDs}`}
          />
          <div style={{ padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* 안내 배너 */}
            <div style={{ background: 'var(--color-background-info)', border: '0.5px solid var(--color-border-info)', borderRadius: 'var(--border-radius-md)', padding: '10px 14px', fontSize: 12, color: 'var(--color-text-info)', lineHeight: 1.6 }}>
              선택한 기간에 적용할 객실별 요금을 설정합니다. 기간 규칙이 추가되며, 이 범위 내 기존 단일일 규칙보다 긴 규칙이 적용됩니다.
              <br />기존 규칙을 완전히 덮어쓰려면 아래 '초기화 후 적용' 옵션을 사용하세요.
            </div>

            {rooms.map(room => {
              const edit         = bulkEdits[room.id] ?? {}
              const defaultPrice = room.prices[bulkSeason]
              const priceVal     = parseInt(edit.price) || 0
              return (
                <RoomEditCard
                  key={room.id} room={room} edit={edit} season={bulkSeason}
                  defaultPrice={defaultPrice} priceVal={priceVal}
                  onToggle={v => updBulkEdit(room.id, 'enabled', v)}
                  onPrice={v => updBulkEdit(room.id, 'price', v)}
                  onLabel={v => updBulkEdit(room.id, 'label', v)}
                />
              )
            })}

            {/* 기존 규칙 초기화 옵션 */}
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', padding: '10px 14px', background: 'var(--color-background-secondary)', borderRadius: 'var(--border-radius-md)' }}>
              <input
                type="checkbox"
                checked={bulkClearInner}
                onChange={e => setBulkClearInner(e.target.checked)}
                style={{ width: 14, height: 14, cursor: 'pointer', marginTop: 1 }}
              />
              <div>
                <span style={{ fontSize: 13, fontWeight: 500 }}>선택 기간 내 기존 특별 요금 규칙 초기화 후 적용</span>
                <p style={{ fontSize: 11, color: 'var(--color-text-tertiary)', margin: '3px 0 0', lineHeight: 1.5 }}>
                  체크 시: 이 기간에 완전히 포함된 기존 특별 요금 규칙이 삭제된 후 새 규칙이 추가됩니다.
                  <br />체크 해제 시: 기존 규칙은 유지되며, 더 짧은 기존 규칙이 우선 적용될 수 있습니다.
                </p>
              </div>
            </label>
          </div>
          <ModalFooter
            note="적용 후 하단 '저장' 버튼을 눌러야 최종 반영됩니다"
            onClose={closeBulkModal}
            onSave={saveBulkModal}
            saveLabel="일괄 적용"
          />
        </ModalOverlay>
      )}

      {/* ══════════════ 객실 기본 설정 아코디언 ══════════════ */}
      <button
        onClick={() => setShowRoomEdit(v => !v)}
        style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-secondary)', borderRadius: 'var(--border-radius-md)', padding: '11px 16px', cursor: 'pointer', marginBottom: showRoomEdit ? 14 : 20, fontFamily: 'var(--font-sans)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)' }}>객실 기본 설정</span>
          <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{rooms.length}개 객실 · 이름 · 정원 · 지원율 · 시즌 기본 요금</span>
        </div>
        <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{showRoomEdit ? '▲ 접기' : '▼ 펼치기'}</span>
      </button>

      {showRoomEdit && (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
            <Btn variant="primary" onClick={addRoom}>+ 객실 추가</Btn>
          </div>
          {rooms.length === 0 && (
            <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', textAlign: 'center', padding: '30px 0' }}>
              등록된 객실이 없습니다. 객실을 추가해 주세요.
            </p>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginBottom: 20 }}>
            {rooms.map((room, idx) => (
              <Card key={room.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <h4 style={{ fontSize: 14, fontWeight: 500, margin: 0 }}>{room.name || `새 객실 ${idx + 1}`}</h4>
                  {confirmDelete === idx ? (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ fontSize: 12, color: 'var(--color-text-danger)' }}>정말 삭제하시겠습니까?</span>
                      <Btn variant="danger" onClick={() => { removeRoom(idx); setConfirmDelete(null) }}>삭제</Btn>
                      <Btn onClick={() => setConfirmDelete(null)}>취소</Btn>
                    </div>
                  ) : (
                    <Btn variant="danger" onClick={() => setConfirmDelete(idx)}>삭제</Btn>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
                  <div><label style={labelSt}>객실명</label><input value={room.name} onChange={e => updRoom(idx, 'name', e.target.value)} style={{ width: '100%' }} placeholder="객실명 입력" /></div>
                  <div><label style={labelSt}>설명</label><input value={room.desc} onChange={e => updRoom(idx, 'desc', e.target.value)} style={{ width: '100%' }} placeholder="객실 설명" /></div>
                  <div><label style={labelSt}>정원 (인)</label><input type="number" min={1} value={room.capacity} onChange={e => updRoom(idx, 'capacity', parseInt(e.target.value) || 1)} style={{ width: '100%' }} /></div>
                  <div><label style={labelSt}>최대 숙박 (박)</label><input type="number" min={1} max={7} value={room.maxNights} onChange={e => updRoom(idx, 'maxNights', parseInt(e.target.value) || 1)} style={{ width: '100%' }} /></div>
                  <div>
                    <label style={labelSt}>발전기금 지원율 (%)</label>
                    <input type="number" min={0} max={100} value={room.supportRate} onChange={e => updRoom(idx, 'supportRate', parseInt(e.target.value) || 0)} style={{ width: '100%' }} />
                    <p style={{ fontSize: 11, color: 'var(--color-text-info)', marginTop: 4 }}>숙박료의 {room.supportRate}%를 발전기금에서 지원</p>
                  </div>
                  <div>
                    <label style={labelSt}>정원 초과 추가 요금 (원/인)</label>
                    <input type="number" min={0} value={room.extraGuestFee ?? 0} onChange={e => updRoom(idx, 'extraGuestFee', parseInt(e.target.value) || 0)} style={{ width: '100%' }} />
                    <p style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 4 }}>정원 초과 1인당 추가 요금</p>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
                  <div><label style={labelSt}>예약 가능 시작일</label><input type="date" value={room.availableFrom ?? ''} onChange={e => updRoom(idx, 'availableFrom', e.target.value)} style={{ width: '100%' }} /></div>
                  <div><label style={labelSt}>예약 가능 종료일</label><input type="date" value={room.availableTo ?? ''} onChange={e => updRoom(idx, 'availableTo', e.target.value)} style={{ width: '100%' }} /></div>
                </div>

                <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 10 }}>
                  시즌별 1박 기본 요금 <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>(날짜 특별 요금 미설정 시 적용)</span>
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
                  {['비수기', '준성수기', '성수기'].map(s => (
                    <div key={s}>
                      <div style={{ marginBottom: 6 }}><SeasonBadge season={s} /></div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <input type="number" value={room.prices[s]} onChange={e => updPrice(idx, s, e.target.value)} style={{ width: '100px' }} />
                        <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>원</span>
                      </div>
                      <p style={{ fontSize: 11, color: 'var(--color-text-info)', marginTop: 4 }}>
                        지원 {won(Math.round(room.prices[s] * room.supportRate / 100))}
                      </p>
                    </div>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* 저장 버튼 */}
      <div style={{ display: 'flex', gap: 10 }}>
        <Btn variant="primary" onClick={save}>{saved ? '저장됨 ✓' : '저장'}</Btn>
        {showRoomEdit && <Btn onClick={addRoom}>+ 객실 추가</Btn>}
      </div>
    </div>
  )
}

// ── 서브 컴포넌트: 모달 오버레이 ─────────────────────────────────────────────
function ModalOverlay({ children, onClose }) {
  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: 16 }}
    >
      <div style={{ background: 'var(--color-background-primary)', borderRadius: 'var(--border-radius-lg)', width: '100%', maxWidth: 560, maxHeight: '88vh', overflow: 'auto', boxShadow: '0 12px 40px rgba(0,0,0,0.24)', fontFamily: 'var(--font-sans)' }}>
        {children}
      </div>
    </div>
  )
}

// ── 서브 컴포넌트: 모달 헤더 ─────────────────────────────────────────────────
function ModalHeader({ title, season, hol, onClose, sub }) {
  return (
    <div style={{ padding: '16px 20px 12px', borderBottom: '0.5px solid var(--color-border-tertiary)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'sticky', top: 0, background: 'var(--color-background-primary)', zIndex: 1 }}>
      <div>
        <p style={{ fontSize: 16, fontWeight: 600, margin: '0 0 5px' }}>{title}</p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {season && <SeasonBadge season={season} />}
          {hol    && <span style={{ fontSize: 11, color: '#4338CA', fontWeight: 600 }}>{hol.name}</span>}
          {sub    && <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{sub}</span>}
        </div>
      </div>
      <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--color-text-tertiary)', lineHeight: 1 }}>×</button>
    </div>
  )
}

// ── 서브 컴포넌트: 모달 푸터 ─────────────────────────────────────────────────
function ModalFooter({ note, onClose, onSave, saveLabel = '적용' }) {
  return (
    <div style={{ padding: '12px 20px 16px', borderTop: '0.5px solid var(--color-border-tertiary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', bottom: 0, background: 'var(--color-background-primary)' }}>
      <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{note}</span>
      <div style={{ display: 'flex', gap: 8 }}>
        <Btn onClick={onClose}>취소</Btn>
        <Btn variant="primary" onClick={onSave}>{saveLabel}</Btn>
      </div>
    </div>
  )
}

// ── 서브 컴포넌트: 객실 요금 편집 카드 ───────────────────────────────────────
function RoomEditCard({ room, edit, season, defaultPrice, priceVal, onToggle, onPrice, onLabel }) {
  const subAmt = Math.round(priceVal * room.supportRate / 100)
  return (
    <div style={{ border: `1px solid ${edit.enabled ? 'var(--color-border-info)' : 'var(--color-border-secondary)'}`, borderRadius: 'var(--border-radius-md)', overflow: 'hidden', transition: 'border-color 0.15s' }}>
      <div style={{ padding: '9px 14px', background: edit.enabled ? 'var(--color-background-info)' : 'var(--color-background-secondary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6, transition: 'background 0.15s' }}>
        <span style={{ fontSize: 13, fontWeight: 500 }}>{room.name || room.id}</span>
        <div style={{ display: 'flex', gap: 10 }}>
          <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>정원 {room.capacity}인</span>
          <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>최대 {room.maxNights}박</span>
          {(room.extraGuestFee ?? 0) > 0 && (
            <span style={{ fontSize: 11, color: 'var(--color-text-warning)' }}>초과 +{won(room.extraGuestFee)}/인</span>
          )}
        </div>
      </div>
      <div style={{ padding: '12px 14px' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', marginBottom: edit.enabled ? 12 : 0, fontSize: 13 }}>
          <input type="checkbox" checked={!!edit.enabled} onChange={e => onToggle(e.target.checked)} style={{ width: 14, height: 14, cursor: 'pointer' }} />
          <span style={{ fontWeight: 500 }}>이 기간 특별 요금 적용</span>
          <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', fontWeight: 400 }}>
            (미적용 시 {season} 기본 {won(defaultPrice)})
          </span>
        </label>
        {edit.enabled && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }}>1박 요금 (원)</label>
              <input type="number" min={0} value={edit.price ?? defaultPrice} onChange={e => onPrice(e.target.value)} style={{ width: '100%' }} autoFocus />
              {priceVal > 0 && (
                <p style={{ fontSize: 11, color: 'var(--color-text-info)', margin: '4px 0 0' }}>
                  지원 {won(subAmt)} → 본인 {won(priceVal - subAmt)}
                </p>
              )}
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }}>메모 (내부용)</label>
              <input value={edit.label ?? ''} onChange={e => onLabel(e.target.value)} placeholder="예: 추석 연휴" style={{ width: '100%' }} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
