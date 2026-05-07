import { useState } from 'react'
import * as XLSX from 'xlsx'
import { won, YEAR, MONTHS_KR, getSeason, fmtDT } from '../constants'
import { SeasonBadge, AppStatusBadge } from '../components/UI'

const EDITABLE_STATUSES = new Set(['selected', 'manual'])

export default function AppListTab({ apps, employees, saveApps, saveFundUsed }) {
  const [filterMonth,     setFilterMonth]     = useState('all')
  const [filterStatus,    setFilterStatus]    = useState('all')
  const [search,          setSearch]          = useState('')
  const [dateFrom,        setDateFrom]        = useState('')
  const [dateTo,          setDateTo]          = useState('')
  const [sortKey,         setSortKey]         = useState('appliedAt')
  const [sortDir,         setSortDir]         = useState('desc')
  const [editingSubsidy,  setEditingSubsidy]  = useState(null)  // { id, value }
  const [subsidyFlash,    setSubsidyFlash]    = useState('')

  const downloadExcel = () => {
    const STATUS_KR = { pending: '대기', selected: '당첨', manual: '별도배정', rejected: '낙첨' }
    const rows = filtered.map(a => {
      const emp = employees[a.empId]
      return {
        '사번':         a.empId,
        '기관':         emp?.organization || '',
        '부서':         emp?.department   || '',
        '휴대폰':       emp?.phone        || '',
        '신청일시':     fmtDT(a.appliedAt),
        '희망월':       `${a.month}월`,
        '시즌':         a.season          || '',
        '체크인날짜':   a.checkInDate
          ? new Date(a.checkInDate + 'T00:00:00').toLocaleDateString('ko-KR', { year: 'numeric', month: 'numeric', day: 'numeric' })
          : '',
        '객실':         a.roomType,
        '박수':         a.nights,
        '숙박료(원)':   a.total,
        '지원금(원)':   a.subsidy,
        '지원율(%)':    a.supportRate,
        '본인결제(원)': a.total - a.subsidy,
        '상태':         STATUS_KR[a.status] ?? a.status,
      }
    })

    const ws = XLSX.utils.json_to_sheet(rows)
    const colWidths = [
      { wch: 10 }, { wch: 16 }, { wch: 14 }, { wch: 14 },
      { wch: 18 }, { wch: 7  }, { wch: 8  }, { wch: 14 },
      { wch: 16 }, { wch: 5  }, { wch: 12 }, { wch: 12 },
      { wch: 8  }, { wch: 12 }, { wch: 8  },
    ]
    ws['!cols'] = colWidths
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '신청목록')
    const fileName = `리조트신청목록_${YEAR}_${new Date().toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' }).replace(/\. /g, '').replace('.', '')}.xlsx`
    XLSX.writeFile(wb, fileName)
  }

  const toggleSort = key => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }
  const si = key => sortKey === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''

  const startEditSubsidy = app => setEditingSubsidy({ id: app.id, value: String(app.subsidy) })

  const confirmSubsidyEdit = async () => {
    const newSubsidy = Math.max(0, parseInt(editingSubsidy.value.replace(/[^0-9]/g, '')) || 0)
    const newApps = apps.map(a => a.id === editingSubsidy.id ? { ...a, subsidy: newSubsidy } : a)
    const newFundUsed = newApps
      .filter(a => a.year === YEAR && EDITABLE_STATUSES.has(a.status))
      .reduce((sum, a) => sum + (a.subsidy || 0), 0)
    await saveApps(newApps)
    await saveFundUsed(newFundUsed)
    setSubsidyFlash('저장됨 ✓')
    setTimeout(() => setSubsidyFlash(''), 2500)
    setEditingSubsidy(null)
  }

  const filtered = apps
    .filter(a => {
      if (a.year !== YEAR) return false
      if (filterMonth  !== 'all' && a.month  !== parseInt(filterMonth))       return false
      if (filterStatus !== 'all' && a.status !== filterStatus)                return false
      if (dateFrom && new Date(a.appliedAt) < new Date(dateFrom))             return false
      if (dateTo   && new Date(a.appliedAt) > new Date(dateTo + 'T23:59:59')) return false
      if (search) {
        const q = search.toLowerCase()
        const emp = employees[a.empId]
        return a.empId.toLowerCase().includes(q) ||
               emp?.organization?.toLowerCase().includes(q) ||
               emp?.department?.toLowerCase().includes(q) ||
               emp?.phone?.includes(q)
      }
      return true
    })
    .sort((a, b) => {
      let av, bv
      if (sortKey === 'organization' || sortKey === 'department' || sortKey === 'phone') {
        av = employees[a.empId]?.[sortKey] ?? ''
        bv = employees[b.empId]?.[sortKey] ?? ''
      } else {
        av = a[sortKey] ?? ''
        bv = b[sortKey] ?? ''
      }
      return sortDir === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av))
    })

  const Th = ({ k, label }) => (
    <th onClick={() => toggleSort(k)}
      style={{ padding: '7px 9px', textAlign: 'left', color: sortKey===k?'var(--color-text-info)':'var(--color-text-secondary)',
               fontWeight: 500, cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
      {label}{si(k)}
    </th>
  )

  const IconBtn = ({ onClick, label, color }) => (
    <button onClick={onClick}
      style={{
        border: 'none', background: 'none', cursor: 'pointer', fontSize: 14,
        color: color ?? 'var(--color-text-secondary)', padding: '0 2px',
        fontFamily: 'var(--font-sans)', lineHeight: 1,
      }}>
      {label}
    </button>
  )

  return (
    <div>
      {/* 검색 필터 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 14 }}>
        <div>
          <label style={{ fontSize: 12, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 5 }}>통합 검색</label>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="사번 / 기관 / 부서 / 전화" style={{ width: '100%', fontSize: 13 }} />
        </div>
        <div>
          <label style={{ fontSize: 12, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 5 }}>월 필터</label>
          <select value={filterMonth} onChange={e => setFilterMonth(e.target.value)} style={{ width: '100%', fontSize: 13 }}>
            <option value="all">전체 월</option>
            {[...Array(12)].map((_, i) => <option key={i + 1} value={i + 1}>{MONTHS_KR[i]}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 12, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 5 }}>상태 필터</label>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ width: '100%', fontSize: 13 }}>
            <option value="all">전체</option>
            <option value="pending">대기</option>
            <option value="selected">당첨</option>
            <option value="manual">별도배정</option>
            <option value="rejected">낙첨</option>
          </select>
        </div>
        <div>
          <label style={{ fontSize: 12, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 5 }}>신청일 시작</label>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ width: '100%', fontSize: 13 }} />
        </div>
        <div>
          <label style={{ fontSize: 12, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 5 }}>신청일 종료</label>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ width: '100%', fontSize: 13 }} />
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
        <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', margin: 0 }}>
          총 {filtered.length}건 (헤더 클릭으로 정렬)
        </p>
        {subsidyFlash && (
          <span style={{ fontSize: 12, color: 'var(--color-text-success)', fontWeight: 500 }}>{subsidyFlash}</span>
        )}
        <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
          — 당첨·별도배정 행의 지원금(✎)을 클릭하면 수동 수정할 수 있습니다
        </span>
        <button
          onClick={downloadExcel}
          disabled={filtered.length === 0}
          style={{
            marginLeft: 'auto',
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '5px 12px', fontSize: 12, fontWeight: 500,
            border: '1px solid var(--color-border-secondary)',
            borderRadius: 'var(--border-radius-md)',
            background: filtered.length === 0 ? 'var(--color-background-secondary)' : '#16A34A',
            color: filtered.length === 0 ? 'var(--color-text-tertiary)' : '#fff',
            cursor: filtered.length === 0 ? 'not-allowed' : 'pointer',
            transition: 'opacity 0.15s',
          }}
        >
          ↓ 엑셀 다운로드 ({filtered.length}건)
        </button>
      </div>

      {filtered.length === 0
        ? <p style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>조건에 맞는 신청 내역이 없습니다.</p>
        : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', minWidth: 760 }}>
              <thead>
                <tr style={{ borderBottom: '0.5px solid var(--color-border-secondary)' }}>
                  <Th k="empId"        label="사번"     />
                  <Th k="organization" label="기관"     />
                  <Th k="department"   label="부서"     />
                  <Th k="phone"        label="휴대폰"   />
                  <Th k="appliedAt"    label="신청일시" />
                  <Th k="month"        label="희망월"   />
                  <Th k="checkInDate"  label="체크인"   />
                  <Th k="roomType"     label="객실"     />
                  <Th k="nights"       label="박수"     />
                  <Th k="total"        label="숙박료"   />
                  <Th k="subsidy"      label="지원금 ✎" />
                  <Th k="status"       label="상태"     />
                </tr>
              </thead>
              <tbody>
                {filtered.map(a => {
                  const emp      = employees[a.empId]
                  const canEdit  = EDITABLE_STATUSES.has(a.status)
                  const isEditing = editingSubsidy?.id === a.id
                  return (
                    <tr key={a.id} style={{ borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
                      <td style={{ padding: '7px 9px', fontWeight: 500 }}>{a.empId}</td>
                      <td style={{ padding: '7px 9px', color: 'var(--color-text-secondary)' }}>{emp?.organization || '-'}</td>
                      <td style={{ padding: '7px 9px', color: 'var(--color-text-secondary)' }}>{emp?.department  || '-'}</td>
                      <td style={{ padding: '7px 9px', color: 'var(--color-text-secondary)' }}>{emp?.phone       || '-'}</td>
                      <td style={{ padding: '7px 9px', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>{fmtDT(a.appliedAt)}</td>
                      <td style={{ padding: '7px 9px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          {a.month}월 <SeasonBadge season={a.season} />
                        </div>
                      </td>
                      <td style={{ padding: '7px 9px', whiteSpace: 'nowrap', color: a.checkInDate ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)' }}>
                        {a.checkInDate
                          ? new Date(a.checkInDate + 'T00:00:00').toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })
                          : '-'}
                      </td>
                      <td style={{ padding: '7px 9px' }}>{a.roomType}</td>
                      <td style={{ padding: '7px 9px' }}>{a.nights}박</td>
                      <td style={{ padding: '7px 9px' }}>{won(a.total)}</td>
                      <td style={{ padding: '7px 9px', color: 'var(--color-text-info)' }}>
                        {isEditing ? (
                          <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
                            <input
                              type="number" min={0}
                              value={editingSubsidy.value}
                              onChange={e => setEditingSubsidy(prev => ({ ...prev, value: e.target.value }))}
                              style={{ width: 80, fontSize: 12, padding: '2px 4px' }}
                              autoFocus
                              onKeyDown={e => {
                                if (e.key === 'Enter') confirmSubsidyEdit()
                                if (e.key === 'Escape') setEditingSubsidy(null)
                              }}
                            />
                            <IconBtn onClick={confirmSubsidyEdit}      label="✓" color="var(--color-text-success)" />
                            <IconBtn onClick={() => setEditingSubsidy(null)} label="✗" color="var(--color-text-danger)"  />
                          </div>
                        ) : (
                          <span
                            onClick={() => canEdit && startEditSubsidy(a)}
                            title={canEdit ? '클릭하여 지원금 수정' : undefined}
                            style={{
                              cursor: canEdit ? 'pointer' : 'default',
                              display: 'inline-flex', alignItems: 'center', gap: 3,
                            }}
                          >
                            {won(a.subsidy)}
                            <span style={{ fontSize: 10 }}>({a.supportRate}%)</span>
                            {canEdit && (
                              <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', opacity: 0.6 }}>✎</span>
                            )}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '7px 9px' }}><AppStatusBadge status={a.status} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      }
    </div>
  )
}
