import { useState } from 'react'
import { won, YEAR, MONTHS_KR, getSeason, fmtDT } from '../constants'
import { SeasonBadge, AppStatusBadge } from '../components/UI'

export default function AppListTab({ apps, employees }) {
  const [filterMonth,  setFilterMonth]  = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [search,       setSearch]       = useState('')
  const [dateFrom,     setDateFrom]     = useState('')
  const [dateTo,       setDateTo]       = useState('')
  const [sortKey,      setSortKey]      = useState('appliedAt')
  const [sortDir,      setSortDir]      = useState('desc')

  const toggleSort = key => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }
  const si = key => sortKey === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''

  const filtered = apps
    .filter(a => {
      if (a.year !== YEAR) return false
      if (filterMonth  !== 'all' && a.month   !== parseInt(filterMonth))   return false
      if (filterStatus !== 'all' && a.status  !== filterStatus)            return false
      if (dateFrom && new Date(a.appliedAt) < new Date(dateFrom))          return false
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

  return (
    <div>
      {/* 검색 필터 영역 */}
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

      <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 10 }}>
        총 {filtered.length}건 (헤더 클릭으로 정렬)
      </p>

      {filtered.length === 0
        ? <p style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>조건에 맞는 신청 내역이 없습니다.</p>
        : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', minWidth: 760 }}>
              <thead>
                <tr style={{ borderBottom: '0.5px solid var(--color-border-secondary)' }}>
                  <Th k="empId"        label="사번"   />
                  <Th k="organization" label="기관"   />
                  <Th k="department"   label="부서"   />
                  <Th k="phone"        label="휴대폰" />
                  <Th k="appliedAt"    label="신청일시" />
                  <Th k="month"        label="희망월" />
                  <Th k="checkInDate"  label="체크인" />
                  <Th k="roomType"     label="객실"   />
                  <Th k="nights"       label="박수"   />
                  <Th k="total"        label="숙박료" />
                  <Th k="subsidy"      label="지원금" />
                  <Th k="status"       label="상태"   />
                </tr>
              </thead>
              <tbody>
                {filtered.map(a => {
                  const emp = employees[a.empId]
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
                        {won(a.subsidy)}<span style={{ fontSize: 10, marginLeft: 2 }}>({a.supportRate}%)</span>
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
