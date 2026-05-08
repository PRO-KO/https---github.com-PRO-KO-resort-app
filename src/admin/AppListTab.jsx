import { useState } from 'react'
import * as XLSX from 'xlsx'
import { won, YEAR, MONTHS_KR, fmtDT } from '../constants'
import { SeasonBadge, AppStatusBadge } from '../components/UI'
import * as API from '../api'

const EDITABLE_STATUSES = new Set(['selected', 'manual', 'pending', 'rejected'])

export default function AppListTab({ apps, employees, saveApps, saveFundUsed }) {
  const [filterMonth,     setFilterMonth]     = useState('all')
  const [filterStatus,    setFilterStatus]    = useState('all')
  const [search,          setSearch]          = useState('')
  const [dateFrom,        setDateFrom]        = useState('')
  const [dateTo,          setDateTo]          = useState('')
  const [sortKey,         setSortKey]         = useState('appliedAt')
  const [sortDir,         setSortDir]         = useState('desc')
  const [editingId,       setEditingId]       = useState(null)
  const [editValue,       setEditValue]       = useState({ subsidy: '', remarks: '' })
  const [flash,           setFlash]           = useState('')

  const downloadExcel = () => {
    const STATUS_KR = { pending: '대기', selected: '당첨', manual: '별도배정', rejected: '낙첨', cancelled: '취소', cancel_requested: '취소요청' }
    const rows = filtered.map(a => {
      const emp = employees[a.empId]
      return {
        '사번':         a.empId,
        '기관':         emp?.organization || '',
        '부서':         emp?.department   || '',
        '휴대폰':       emp?.phone        || '',
        '신청일시':     fmtDT(a.appliedAt),
        '희망월':       `${a.month}월`,
        '객실':         a.roomType,
        '박수':         a.nights,
        '숙박료(원)':   a.total,
        '지원금(원)':   a.subsidy,
        '지원율(%)':    a.supportRate || 0,
        '본인결제(원)': a.total - a.subsidy,
        '비고':         a.remarks || '',
        '상태':         STATUS_KR[a.status] ?? a.status,
      }
    })

    const ws = XLSX.utils.json_to_sheet(rows)
    ws['!cols'] = [{ wch: 10 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 18 }, { wch: 7 }, { wch: 16 }, { wch: 5 }, { wch: 12 }, { wch: 12 }, { wch: 8 }, { wch: 12 }, { wch: 20 }, { wch: 10 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '신청목록')
    XLSX.writeFile(wb, `리조트신청목록_${YEAR}_${new Date().getTime()}.xlsx`)
  }

  const startEdit = app => {
    setEditingId(app.id)
    setEditValue({ subsidy: String(app.subsidy), remarks: app.remarks || '' })
  }

  const confirmEdit = async () => {
    try {
      const newSubsidy = Math.max(0, parseInt(editValue.subsidy.replace(/[^0-9]/g, '')) || 0)
      await API.updateApp(editingId, { subsidy: newSubsidy, remarks: editValue.remarks })
      
      // 로컬 상태 업데이트
      const newApps = apps.map(a => a.id === editingId ? { ...a, subsidy: newSubsidy, remarks: editValue.remarks } : a)
      saveApps(newApps)
      
      // 발전기금 재계산 (서버에서도 하지만 로컬 UI 즉시 반영용)
      const { value: newFundUsed } = await API.fetchFundUsed()
      saveFundUsed(newFundUsed)
      
      setFlash('저장됨 ✓')
      setTimeout(() => setFlash(''), 2500)
      setEditingId(null)
    } catch (e) {
      alert(e.message)
    }
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
    <th onClick={() => { if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortKey(k); setSortDir('asc'); } }}
      style={{ padding: '7px 9px', textAlign: 'left', color: sortKey===k?'var(--color-text-info)':'var(--color-text-secondary)',
               fontWeight: 500, cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
      {label}{sortKey === k ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
    </th>
  )

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 14 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="사번 / 기관 / 부서" style={{ fontSize: 13 }} />
        <select value={filterMonth} onChange={e => setFilterMonth(e.target.value)} style={{ fontSize: 13 }}>
          <option value="all">전체 월</option>
          {[...Array(12)].map((_, i) => <option key={i + 1} value={i + 1}>{MONTHS_KR[i]}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ fontSize: 13 }}>
          <option value="all">전체 상태</option>
          {['pending', 'selected', 'manual', 'rejected', 'cancelled', 'cancel_requested'].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
        <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', margin: 0 }}>총 {filtered.length}건</p>
        {flash && <span style={{ fontSize: 12, color: 'var(--color-text-success)', fontWeight: 500 }}>{flash}</span>}
        <button onClick={downloadExcel} style={{ marginLeft: 'auto', fontSize: 12, padding: '5px 12px', background: '#16A34A', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>엑셀 다운로드</button>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', minWidth: 900 }}>
          <thead>
            <tr style={{ borderBottom: '0.5px solid var(--color-border-secondary)' }}>
              <Th k="empId" label="사번" />
              <Th k="organization" label="기관" />
              <Th k="department" label="부서" />
              <Th k="month" label="희망월" />
              <Th k="roomType" label="객실" />
              <Th k="nights" label="박수" />
              <Th k="total" label="숙박료" />
              <Th k="subsidy" label="지원금 ✎" />
              <Th k="remarks" label="비고 ✎" />
              <Th k="status" label="상태" />
            </tr>
          </thead>
          <tbody>
            {filtered.map(a => {
              const emp = employees[a.empId]
              const isEditing = editingId === a.id
              return (
                <tr key={a.id} style={{ borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
                  <td style={{ padding: '7px 9px', fontWeight: 500 }}>{a.empId}</td>
                  <td style={{ padding: '7px 9px' }}>{emp?.organization || '-'}</td>
                  <td style={{ padding: '7px 9px' }}>{emp?.department || '-'}</td>
                  <td style={{ padding: '7px 9px' }}>{a.month}월</td>
                  <td style={{ padding: '7px 9px' }}>{a.roomType}</td>
                  <td style={{ padding: '7px 9px' }}>{a.nights}박</td>
                  <td style={{ padding: '7px 9px' }}>{won(a.total)}</td>
                  <td style={{ padding: '7px 9px' }}>
                    {isEditing ? (
                      <input type="number" value={editValue.subsidy} onChange={e => setEditValue({ ...editValue, subsidy: e.target.value })} style={{ width: 70 }} />
                    ) : (
                      <span onClick={() => startEdit(a)} style={{ cursor: 'pointer', color: 'var(--color-text-info)' }}>{won(a.subsidy)} ✎</span>
                    )}
                  </td>
                  <td style={{ padding: '7px 9px' }}>
                    {isEditing ? (
                      <div style={{ display: 'flex', gap: 5 }}>
                        <input value={editValue.remarks} onChange={e => setEditValue({ ...editValue, remarks: e.target.value })} placeholder="비고 입력" style={{ width: 120 }} />
                        <button onClick={confirmEdit} style={{ fontSize: 10 }}>저장</button>
                        <button onClick={() => setEditingId(null)} style={{ fontSize: 10 }}>취소</button>
                      </div>
                    ) : (
                      <span onClick={() => startEdit(a)} style={{ cursor: 'pointer', color: a.remarks ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)' }}>{a.remarks || '(없음)'} ✎</span>
                    )}
                  </td>
                  <td style={{ padding: '7px 9px' }}><AppStatusBadge status={a.status} /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
